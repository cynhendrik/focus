import type { Todo } from '@/types/todo.types'
import type { Invoice, Payment } from '@/types/finance.types'
import { paidAmount, remaining, isOverdue, todayLocalISO } from '@/lib/invoice-status'
import { getDunningState } from '@/hooks/useOverdueTaskSync'
import { invoke } from '@tauri-apps/api/core'
import { ContactsGateway } from '@/data/contacts.gateway'
import { useTodosStore } from '@/store/todos.store'
import { useFinanceStore } from '@/store/finance.store'
import { useMailStore } from '@/store/mail.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useCompanyStore } from '@/store/company.store'
import { MailService } from '@/services/mail.service'
import { FinanceGateway } from '@/data/finance.gateway'
import { generateCorraDraft } from '@/lib/ai/corra'
import { log } from '@/lib/logger'
import type { Contact } from '@/types/contact.types'

/** Default-Mahngebühr je Stufe in Euro: [Zahlungserinnerung, 1. Mahnung, 2. Mahnung]. */
export const DEFAULT_DUNNING_FEES = [0, 5, 10]

/** Gebühr der Stufe (Euro). Stufen jenseits der Config werden auf die letzte geklemmt. */
export function dunningFee(level: number, fees: number[] = DEFAULT_DUNNING_FEES): number {
  if (fees.length === 0) return 0
  return fees[level] ?? fees[fees.length - 1] ?? 0
}

/** 'fee:<cent>' → Euro; alles andere → 0. */
export function parseFeeTag(tag: string): number {
  if (!tag.startsWith('fee:')) return 0
  const cent = Number(tag.slice(4))
  return Number.isFinite(cent) ? cent / 100 : 0
}

/** Snapshot-Tags, die beim Versand am abgeschlossenen To-do hängen. */
export function reminderFeeTags(level: number, fees: number[] = DEFAULT_DUNNING_FEES): string[] {
  return [`fee:${Math.round(dunningFee(level, fees) * 100)}`]
}

/** Summe der bereits berechneten Gebühren (Euro) aus abgeschlossenen Reminder-To-dos. */
export function accruedFees(todos: Todo[], invoiceId: string): number {
  return todos
    .filter(t => t.sourceRef === invoiceId && t.actionType === 'send_reminder' && t.status === 'done')
    .flatMap(t => t.tags)
    .reduce((sum, tag) => sum + parseFeeTag(tag), 0)
}

export interface ReminderBreakdown { base: number; fee: number; total: number }

/** Rechnungsrest (base) vs. Gebühren (bereits berechnet + aktuelle Stufe), und Summe. */
export function reminderBreakdown(
  invoice: Invoice, payments: Payment[], todos: Todo[], level: number,
  fees: number[] = DEFAULT_DUNNING_FEES,
): ReminderBreakdown {
  const paid = paidAmount(payments, invoice.id)
  const base = remaining(invoice, paid)
  const fee  = Math.round((accruedFees(todos, invoice.id) + dunningFee(level, fees)) * 100) / 100
  const total = Math.round((base + fee) * 100) / 100
  return { base, fee, total }
}

/** Offener Gesamtbetrag inkl. der Gebühr der gerade fälligen Stufe (Euro). */
export function outstandingWithPendingFee(
  invoice: Invoice, payments: Payment[], todos: Todo[], level: number,
  fees: number[] = DEFAULT_DUNNING_FEES,
): number {
  return reminderBreakdown(invoice, payments, todos, level, fees).total
}

export interface AccountLite { id: string; name: string }

export interface DueReminder {
  invoice: Invoice
  customerName: string
  level: number
  daysOverdue: number
  amountDue: number   // remaining + accrued fees + pending level fee (Euro)
}

export interface EscalatedItem {
  invoice: Invoice
  customerName: string
  level: number
  daysOverdue: number
}

/** Ganze Tage überfällig, TZ-sicher über lokale Datums-Strings (Mittag-Anker gegen DST/UTC-Drift). */
function daysOverdueOf(dueDate: string): number {
  const today = todayLocalISO()
  if (!dueDate || dueDate >= today) return 0
  const ms = new Date(today + 'T12:00:00').getTime() - new Date(dueDate + 'T12:00:00').getTime()
  return Math.max(0, Math.floor(ms / 86_400_000))
}

function nameOf(accounts: AccountLite[], accountId: string): string {
  return accounts.find(a => a.id === accountId)?.name ?? '—'
}

/** Jetzt fällige Mahnungen (phase 'due'), höchste Stufe zuerst, dann älteste. */
export function dueReminders(
  invoices: Invoice[], todos: Todo[], accounts: AccountLite[],
  fees: number[] = DEFAULT_DUNNING_FEES, payments: Payment[] = [],
): DueReminder[] {
  return invoices
    .map(invoice => ({ invoice, state: getDunningState(invoice, todos) }))
    .filter(({ invoice, state }) => isOverdue(invoice) && !invoice.isSuggestion && state.phase === 'due')
    .map(({ invoice, state }) => ({
      invoice,
      customerName: nameOf(accounts, invoice.accountId),
      level: state.level,
      daysOverdue: daysOverdueOf(invoice.dueDate),
      amountDue: outstandingWithPendingFee(invoice, payments, todos, state.level, fees),
    }))
    .sort((a, b) => b.level - a.level || a.invoice.dueDate.localeCompare(b.invoice.dueDate))
}

/** Rechnungen, die nach der 2. Mahnung eine manuelle Entscheidung brauchen. */
export function escalatedInvoices(
  invoices: Invoice[], todos: Todo[], accounts: AccountLite[],
): EscalatedItem[] {
  return invoices
    .map(invoice => ({ invoice, state: getDunningState(invoice, todos) }))
    .filter(({ invoice, state }) => isOverdue(invoice) && !invoice.isSuggestion && state.phase === 'escalated')
    .map(({ invoice, state }) => ({
      invoice,
      customerName: nameOf(accounts, invoice.accountId),
      level: state.level,
      daysOverdue: daysOverdueOf(invoice.dueDate),
    }))
}

const LEVEL_LABEL = ['Zahlungserinnerung', '1. Mahnung', '2. Mahnung']
function levelLabel(level: number): string { return LEVEL_LABEL[level] ?? '2. Mahnung' }
function fmtEur(n: number): string {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Protokolliert einen gesendeten Mahnschritt als abgeschlossenes To-do (treibt die Stufe). */
export async function recordReminderSent(
  invoice: Invoice, level: number, fees: number[] = DEFAULT_DUNNING_FEES,
): Promise<void> {
  await useTodosStore.getState().upsert({
    customerId: invoice.accountId,
    title: `${levelLabel(level)} · Rechnung ${invoice.number ?? invoice.id.slice(0, 8)}`,
    status: 'done',
    bucket: 'done',
    priority: level >= 1 ? 'p1' : 'p2',
    source: 'finance',
    actionType: 'send_reminder',
    sourceRef: invoice.id,
    checklist: [],
    tags: reminderFeeTags(level, fees),
  })
}

export interface DunningSendResult { invoiceId: string; ok: boolean; error?: string; warning?: string }

export interface PreparedReminder {
  invoiceId: string
  level: number
  mailAccountId: string
  to: string[]
  subject: string
  body: string
  attachmentPaths: string[]
}

/**
 * Bereitet eine Mahnung vor (Empfänger, Betreff, KORA-Text, PDF-Anhang) OHNE zu senden.
 * Für den Einzel-Versand, der die Mail im Editor öffnet. Wirft nie.
 */
export async function prepareReminder(
  invoice: Invoice, level: number,
): Promise<{ ok: true; data: PreparedReminder } | { ok: false; error: string }> {
  try {
    const mailAccount = useMailStore.getState().accounts[0]
    if (!mailAccount) return { ok: false, error: 'Kein E-Mail-Konto konfiguriert.' }

    const contacts = await ContactsGateway.getByAccount(invoice.accountId).catch(() => [])
    const recipient = contacts.find(c => c.email)?.email
    if (!recipient) return { ok: false, error: 'Keine E-Mail-Adresse für diesen Kunden.' }

    const account = useAccountsStore.getState().accounts.find(a => a.id === invoice.accountId)
    const profile = useCompanyStore.getState().profile
    const fees = profile.dunningFees ?? DEFAULT_DUNNING_FEES
    const customerName = account?.name ?? 'Kunde'
    const days = daysOverdueOf(invoice.dueDate)
    const payments = useFinanceStore.getState().payments
    const todos = useTodosStore.getState().allTodos
    const bd = reminderBreakdown(invoice, payments, todos, level, fees)

    const body = await generateCorraDraft({
      kind: 'reminder', customerName,
      invoiceNumber: invoice.number ?? invoice.id.slice(0, 8),
      amount: bd.total, baseAmount: bd.base, feeAmount: bd.fee,
      dueDate: invoice.dueDate, daysOverdue: days, dunningLevel: level,
    }).catch(() =>
      bd.fee > 0
        ? `Guten Tag,\n\nwir möchten an die offene Rechnung ${invoice.number ?? ''} erinnern.\n`
          + `Rechnungsbetrag ${fmtEur(bd.base)} € + Mahngebühr ${fmtEur(bd.fee)} € = zu zahlen ${fmtEur(bd.total)} €.\n\n`
          + `Bitte gleichen Sie den Betrag zeitnah aus.\n\nMit freundlichen Grüßen`
        : `Guten Tag,\n\nwir möchten an die offene Rechnung ${invoice.number ?? ''} über ${fmtEur(bd.total)} € erinnern.\n\n`
          + `Bitte gleichen Sie den Betrag zeitnah aus.\n\nMit freundlichen Grüßen`,
    )

    let attachmentPaths: string[] = []
    if (account) {
      try {
        const full = await FinanceGateway.getInvoice(invoice.id)
        const { getInvoicePdfBytes } = await import('@/components/finance/InvoicePDF')
        const bytes = await getInvoicePdfBytes(full, profile, account)
        const safe = account.name.replace(/[/\\:*?"<>|]/g, '_').slice(0, 40)
        const filename = `${levelLabel(level)}_${invoice.number ?? invoice.id.slice(0, 8)}_${safe}.pdf`
        const path = await invoke<string>('save_pdf', { bytes: Array.from(bytes), suggestedName: filename })
        attachmentPaths = [path]
      } catch { /* PDF optional */ }
    }

    return {
      ok: true,
      data: {
        invoiceId: invoice.id, level, mailAccountId: mailAccount.id,
        to: [recipient],
        subject: `${levelLabel(level)} · Rechnung ${invoice.number ?? ''} · zu zahlen ${fmtEur(bd.total)} €`,
        body, attachmentPaths,
      },
    }
  } catch (err) {
    log.warn('prepareReminder failed', { invoiceId: invoice.id, err })
    return { ok: false, error: 'Vorbereitung fehlgeschlagen.' }
  }
}

/**
 * Versendet eine Mahnung: Kontakt-Mail → KORA-Text → PDF (optional) → SMTP →
 * bei Erfolg recordReminderSent (Stufe zählt hoch). Wirft nie — gibt ein Result zurück
 * (für isolierten Batch-Versand).
 */
export async function sendReminder(invoice: Invoice, level: number): Promise<DunningSendResult> {
  const prep = await prepareReminder(invoice, level)
  if (!prep.ok) return { invoiceId: invoice.id, ok: false, error: prep.error }
  const fees = useCompanyStore.getState().profile.dunningFees ?? DEFAULT_DUNNING_FEES
  try {
    await MailService.sendEmail({
      accountId: prep.data.mailAccountId,
      to: prep.data.to,
      subject: prep.data.subject,
      bodyText: prep.data.body,
      ...(prep.data.attachmentPaths.length ? { attachmentPaths: prep.data.attachmentPaths } : {}),
    })
  } catch (err) {
    log.warn('sendReminder failed', { invoiceId: invoice.id, err })
    return { invoiceId: invoice.id, ok: false, error: `Versand fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}` }
  }
  try {
    await recordReminderSent(invoice, level, fees)
  } catch (recErr) {
    log.error('reminder sent but recording the dunning step failed', { invoiceId: invoice.id, recErr })
    return { invoiceId: invoice.id, ok: true, warning: 'Mahnung gesendet, aber der Mahnschritt konnte nicht protokolliert werden — die Stufe wurde evtl. nicht hochgezählt.' }
  }
  return { invoiceId: invoice.id, ok: true }
}
