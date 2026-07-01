import { todayLocalIso, isTodoForToday } from '@/lib/heute/due'
import type { CorraContextInput } from './corra-intelligence'
import type { Invoice } from '@/types/finance.types'
import type { Todo } from '@/types/todo.types'
import type { EmailHeader } from '@/types/mail.types'
import type { FollowUp } from '@/types/crm.types'

/**
 * `followup`      — Todo mit actionType 'followup' (id = Todo-Id).
 * `lead_followup` — echtes Lead/Kunden-Follow-Up aus dem CRM (id = FollowUp-Id).
 */
export type HeuteItemType = 'invoice_reminder' | 'mail_reply' | 'todo' | 'followup' | 'lead_followup'

export interface HeuteQueueItem {
  type: HeuteItemType
  id: string
  reason: string
}

export function staticHeuteQueue(input: CorraContextInput): HeuteQueueItem[] {
  const items: HeuteQueueItem[] = []

  // 1. Überfällige Rechnungen — status='overdue' ODER Fälligkeitsdatum vergangen + nicht bezahlt/storniert
  const today = Date.now()
  const overdueInvoices = input.invoices
    .filter((i: Invoice) => {
      if (i.status === 'paid' || i.status === 'cancelled' || i.status === 'draft') return false
      const isPastDue = new Date(i.dueDate).getTime() < today
      return i.status === 'overdue' || isPastDue
    })
    .map((i: Invoice) => {
      const days = Math.max(0, Math.floor((today - new Date(i.dueDate).getTime()) / 86_400_000))
      return { invoice: i, score: i.total * days, days }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)

  for (const { invoice, days } of overdueInvoices) {
    items.push({
      type: 'invoice_reminder',
      id: invoice.id,
      reason: `Rechnung seit ${days} Tagen überfällig — ${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(invoice.total)}.`,
    })
  }

  // 2. Fällige Lead-Follow-Ups — heute oder überfällig, älteste zuerst.
  const todayStr = todayLocalIso()
  const leadName = (id: string) => input.leads.find(l => l.id === id)?.name
    ?? input.accounts.find(a => a.id === id)?.name ?? 'Kontakt'
  const dueFollowUps = input.followUps
    .filter((f: FollowUp) => f.status === 'offen' && f.dueDate && f.dueDate.slice(0, 10) <= todayStr)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 4)

  for (const f of dueFollowUps) {
    const days = Math.max(0, Math.floor((today - new Date(f.dueDate).getTime()) / 86_400_000))
    items.push({
      type: 'lead_followup',
      id: f.id,
      reason: days > 0
        ? `${leadName(f.customerId)} wartet seit ${days} Tagen — „${f.title}".`
        : `Heute fällig: „${f.title}" für ${leadName(f.customerId)}.`,
    })
  }

  // 3. Unread customer mails — oldest first
  const unreadMails = input.emails
    .filter((e: EmailHeader) => !e.isRead && e.customerId != null)
    .sort((a, b) => a.sentAt.localeCompare(b.sentAt))
    .slice(0, 3)

  for (const mail of unreadMails) {
    items.push({
      type: 'mail_reply',
      id: mail.id,
      reason: `Unbeantwortet seit ${new Date(mail.sentAt).toLocaleDateString('de-DE')}.`,
    })
  }

  // 4. Today's todos — p1 first, then p2+. Gemeinsames Prädikat mit der KPI
  //    „Heute fällig" (schließt den scheduledAt-vs-bucket-Capture-Bug).
  const todayTodos = input.todos
    .filter((t: Todo) => isTodoForToday(t, todayStr))
    .sort((a, b) => {
      const prio = { p1: 0, p2: 1, p3: 2, p4: 3 }
      return (prio[a.priority] ?? 9) - (prio[b.priority] ?? 9)
    })
    .slice(0, 5)

  for (const todo of todayTodos) {
    const type: HeuteItemType =
      todo.actionType === 'reply_mail' || todo.actionType === 'write_email' ? 'mail_reply' :
      todo.actionType === 'followup' ? 'followup' :
      'todo'
    items.push({
      type,
      id: todo.id,
      reason: todo.aiSummary ?? `Priorität ${todo.priority.toUpperCase()} — heute fällig.`,
    })
  }

  return items.slice(0, 10)
}
