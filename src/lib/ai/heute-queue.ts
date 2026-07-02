import { todayLocalIso, isTodoForToday } from '@/lib/heute/due'
import type { CorraContextInput } from './corra-intelligence'
import type { Invoice } from '@/types/finance.types'
import type { Todo } from '@/types/todo.types'
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

/**
 * Baut die HEUTE-Queue. Reihenfolge: Geld (überfällige Rechnungen) und Beziehung
 * (fällige Follow-ups) werden im WECHSEL verschränkt (Geld beginnt), danach die
 * heutigen To-dos. So kann Geld die Follow-ups nicht unter sich begraben — ein
 * Follow-up steht immer direkt hinter der ersten Rechnung. Mails sind NICHT Teil
 * der Queue (eigener „Neueste Mails"-Bereich). Es wird NICHT hart gekappt — die
 * volle Liste kommt zurück, damit das Dashboard einen ehrlichen Voll-Count zeigt.
 */
export function staticHeuteQueue(input: CorraContextInput): HeuteQueueItem[] {
  const today = Date.now()
  const todayStr = todayLocalIso()
  const eur = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
  const leadName = (id: string) => input.leads.find(l => l.id === id)?.name
    ?? input.accounts.find(a => a.id === id)?.name ?? 'Kontakt'

  // GELD — überfällige Rechnungen, größter Betrag×Tage zuerst.
  const money: HeuteQueueItem[] = input.invoices
    .filter((i: Invoice) => {
      if (i.status === 'paid' || i.status === 'cancelled' || i.status === 'draft') return false
      return i.status === 'overdue' || new Date(i.dueDate).getTime() < today
    })
    .map((i: Invoice) => ({ i, days: Math.max(0, Math.floor((today - new Date(i.dueDate).getTime()) / 86_400_000)) }))
    .sort((a, b) => (b.i.total * b.days) - (a.i.total * a.days))
    .map(({ i, days }) => ({
      type: 'invoice_reminder' as const,
      id: i.id,
      reason: `Rechnung seit ${days} Tagen überfällig — ${eur(i.total)}.`,
    }))

  // BEZIEHUNG — fällige/überfällige Follow-ups, älteste zuerst.
  const rel: HeuteQueueItem[] = input.followUps
    .filter((f: FollowUp) => f.status === 'offen' && f.dueDate && f.dueDate.slice(0, 10) <= todayStr)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .map((f) => {
      const days = Math.max(0, Math.floor((today - new Date(f.dueDate).getTime()) / 86_400_000))
      return {
        type: 'lead_followup' as const,
        id: f.id,
        reason: days > 0
          ? `${leadName(f.customerId)} wartet seit ${days} Tagen — „${f.title}".`
          : `Heute fällig: „${f.title}" für ${leadName(f.customerId)}.`,
      }
    })

  // TO-DOS — heute, Priorität p1→p4.
  const todos: HeuteQueueItem[] = input.todos
    .filter((t: Todo) => isTodoForToday(t, todayStr))
    .sort((a, b) => {
      const prio = { p1: 0, p2: 1, p3: 2, p4: 3 }
      return (prio[a.priority] ?? 9) - (prio[b.priority] ?? 9)
    })
    .map((t) => ({
      type: (t.actionType === 'reply_mail' || t.actionType === 'write_email' ? 'mail_reply'
        : t.actionType === 'followup' ? 'followup'
        : 'todo') as HeuteItemType,
      id: t.id,
      reason: t.aiSummary ?? `Priorität ${t.priority.toUpperCase()} — heute fällig.`,
    }))

  // Verschränken: Geld, Beziehung, Geld, Beziehung, … dann Reste, dann To-dos.
  const items: HeuteQueueItem[] = []
  const n = Math.max(money.length, rel.length)
  for (let i = 0; i < n; i++) {
    if (money[i]) items.push(money[i])
    if (rel[i]) items.push(rel[i])
  }
  items.push(...todos)
  return items
}
