import type { Todo } from '@/types/todo.types'
import type { Invoice, Payment } from '@/types/finance.types'
import { paidAmount, remaining, isOverdue } from '@/lib/invoice-status'
import { getDunningState } from '@/hooks/useOverdueTaskSync'

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

/** Offener Gesamtbetrag inkl. der Gebühr der gerade fälligen Stufe (Euro). */
export function outstandingWithPendingFee(
  invoice: Invoice, payments: Payment[], todos: Todo[], level: number,
  fees: number[] = DEFAULT_DUNNING_FEES,
): number {
  const paid = paidAmount(payments, invoice.id)
  const base = remaining(invoice, paid)
  return Math.round((base + accruedFees(todos, invoice.id) + dunningFee(level, fees)) * 100) / 100
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

function daysOverdueOf(dueDate: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(dueDate).getTime()) / 86_400_000))
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
    .filter(i => isOverdue(i) && !i.isSuggestion && getDunningState(i, todos).phase === 'due')
    .map(invoice => {
      const level = getDunningState(invoice, todos).level
      return {
        invoice,
        customerName: nameOf(accounts, invoice.accountId),
        level,
        daysOverdue: daysOverdueOf(invoice.dueDate),
        amountDue: outstandingWithPendingFee(invoice, payments, todos, level, fees),
      }
    })
    .sort((a, b) => b.level - a.level || a.invoice.dueDate.localeCompare(b.invoice.dueDate))
}

/** Rechnungen, die nach der 2. Mahnung eine manuelle Entscheidung brauchen. */
export function escalatedInvoices(
  invoices: Invoice[], todos: Todo[], accounts: AccountLite[],
): EscalatedItem[] {
  return invoices
    .filter(i => isOverdue(i) && !i.isSuggestion && getDunningState(i, todos).phase === 'escalated')
    .map(invoice => ({
      invoice,
      customerName: nameOf(accounts, invoice.accountId),
      level: getDunningState(invoice, todos).level,
      daysOverdue: daysOverdueOf(invoice.dueDate),
    }))
}
