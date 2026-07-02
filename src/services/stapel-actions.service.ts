/**
 * Freigabe-Aktionen des Stapels — pro Kartentyp genau eine Wirkung (Spec §6).
 * Wirft nie: Result-Objekt, verständliche deutsche Fehler.
 */
import type { PreparedItem } from '@/types/prepared-item.types'
import { sendReminder } from '@/services/dunning.service'
import { MailService } from '@/services/mail.service'
import { ActivitiesGateway } from '@/data/activities.gateway'
import { useFinanceStore } from '@/store/finance.store'
import { useTodosStore } from '@/store/todos.store'
import { useCrmStore } from '@/store/crm.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useLeadsStore } from '@/store/leads.store'
import { useMailStore } from '@/store/mail.store'
import { useAuthStore } from '@/store/auth.store'
import { log } from '@/lib/logger'

export interface ApproveResult { ok: boolean; error?: string }

export async function approvePreparedItem(item: PreparedItem): Promise<ApproveResult> {
  try {
    switch (item.type) {
      case 'mahnung': return await approveMahnung(item)
      case 'followup': return await approveFollowup(item)
      case 'rechnungsentwurf': return await approveRechnungsentwurf(item)
      case 'aufgabe': return await approveAufgabe(item)
      default: return { ok: false, error: 'Unbekannter Kartentyp.' }
    }
  } catch (err) {
    log.error('approvePreparedItem failed', { id: item.id, type: item.type, err })
    return { ok: false, error: 'Freigabe fehlgeschlagen — bitte erneut versuchen.' }
  }
}

async function approveMahnung(item: PreparedItem): Promise<ApproveResult> {
  const invoiceId = item.sourceId.split(':')[0]
  const invoice = useFinanceStore.getState().invoices.find(i => i.id === invoiceId)
  if (!invoice) return { ok: false, error: 'Rechnung nicht mehr vorhanden — Karte wird beim nächsten Abgleich geschlossen.' }
  const level = item.payload.level ?? 0
  const result = await sendReminder(invoice, level, item.payload.draftBody ? { bodyOverride: item.payload.draftBody } : undefined)
  if (!result.ok) return { ok: false, error: result.error ?? 'Versand fehlgeschlagen.' }
  return { ok: true }
}

async function approveFollowup(item: PreparedItem): Promise<ApproveResult> {
  const fu = useCrmStore.getState().allFollowUps.find(f => f.id === item.sourceId)
  if (!fu) return { ok: false, error: 'Follow-up nicht mehr vorhanden.' }
  const mailAccount = useMailStore.getState().accounts[0]
  if (!mailAccount) return { ok: false, error: 'Kein E-Mail-Konto konfiguriert.' }
  const lead = useLeadsStore.getState().leads.find(l => l.id === fu.customerId)
  const account = useAccountsStore.getState().accounts.find(a => a.id === fu.customerId)
  const email = (lead as { email?: string } | undefined)?.email ?? account?.email
  if (!email) return { ok: false, error: 'Keine E-Mail-Adresse für diesen Kontakt — bitte anpassen oder verwerfen.' }

  await MailService.sendEmail({
    accountId: mailAccount.id,
    to: [email],
    subject: item.payload.draftSubject ?? `Kurze Rückfrage: ${fu.title}`,
    bodyText: item.payload.draftBody ?? '',
  })
  // Mail ist raus = Erfolg. Scheitert nur die Nachbuchung, darf ein Retry NICHT erneut mailen.
  try {
    await useCrmStore.getState().upsert({
      id: fu.id, customerId: fu.customerId, title: fu.title,
      dueDate: fu.dueDate, status: 'erledigt', priority: fu.priority,
    })
  } catch (upsertErr) {
    log.error('followup sent but marking erledigt failed', { id: item.id, err: upsertErr })
  }
  // Protokollbuch (Spec §10.4): nachlesbar am Kunden.
  try {
    await ActivitiesGateway.create({
      workspaceId: item.workspaceId,
      createdBy: useAuthStore.getState().user?.id ?? '',
      accountId: fu.customerId,
      type: 'note',
      title: `Follow-up versendet: ${fu.title}`,
      body: `Per E-Mail an ${email}.`,
    })
  } catch (protoErr) {
    log.warn('followup protocol activity failed', { id: item.id, protoErr })
  }
  return { ok: true }
}

async function approveRechnungsentwurf(item: PreparedItem): Promise<ApproveResult> {
  const inv = useFinanceStore.getState().invoices.find(i => i.id === item.sourceId)
  if (!inv) return { ok: false, error: 'Rechnungsvorschlag nicht mehr vorhanden.' }
  if (!inv.isSuggestion) return { ok: false, error: 'Rechnung wurde bereits freigegeben.' }
  await useFinanceStore.getState().approveInvoiceSuggestion(
    inv.id, useAuthStore.getState().user?.id ?? '', item.workspaceId,
  )
  return { ok: true }
}

async function approveAufgabe(item: PreparedItem): Promise<ApproveResult> {
  const t = useTodosStore.getState().allTodos.find(x => x.id === item.sourceId)
  if (!t) return { ok: false, error: 'Aufgabe nicht mehr vorhanden.' }
  await useTodosStore.getState().upsert({
    id: t.id, title: t.title, status: 'done', bucket: 'done',
  })
  return { ok: true }
}
