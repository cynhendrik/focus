import type { Customer } from '@/types/customer.types'
import type { Todo } from '@/types/todo.types'
import type { CalendarEvent } from '@/types/calendar.types'
import type { Invoice } from '@/types/finance.types'
import type { FollowUp } from '@/types/crm.types'

export type PriorityKind =
  | 'meeting'        // Calendar event today
  | 'overdue_task'   // Task overdue
  | 'today_task'    // Task due today
  | 'overdue_invoice'
  | 'followup_due'   // CRM follow-up due
  | 'tomorrow_task'

export interface PriorityItem {
  id: string
  kind: PriorityKind
  /** Higher score → more urgent. */
  score: number
  /** Headline shown in the priority card. */
  title: string
  /** Optional secondary line (customer name, time, etc.). */
  meta?: string
  /** Optional action hint shown as small text under meta. */
  hint?: string
  /** Customer linked to this item, if any. Click → open customer. */
  customerId?: string
  /** ISO timestamp the item references (start time, due date). */
  whenIso?: string
}

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function customerById(customers: Customer[], id?: string): Customer | undefined {
  if (!id) return undefined
  return customers.find(c => c.id === id)
}

function daysOverdue(iso: string): number {
  const due = startOfDay(new Date(iso))
  const today = startOfDay(new Date())
  return Math.floor((today.getTime() - due.getTime()) / 86_400_000)
}

function minutesFromNow(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / 60_000)
}

/**
 * Ranks the user's situation into a prioritised list. The first few items are
 * the "things you absolutely need to handle today". Lower-priority items
 * follow but the consumer usually only renders the top 3.
 */
export function computePriorities(input: {
  customers: Customer[]
  todos: Todo[]
  events: CalendarEvent[]
  invoices: Invoice[]
  followups: FollowUp[]
}): PriorityItem[] {
  const items: PriorityItem[] = []
  const today = startOfDay(new Date())
  const todayIso = today.toISOString().slice(0, 10)
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowIso = tomorrow.toISOString().slice(0, 10)

  // ── Meetings today ────────────────────────────────────────────────────────
  for (const ev of input.events) {
    const startDate = new Date(ev.startAt)
    if (startOfDay(startDate).getTime() !== today.getTime()) continue
    if (new Date(ev.endAt) < new Date()) continue  // past events skip

    const mins = minutesFromNow(ev.startAt)
    // Sooner meetings rank higher. Anything within 2h gets a big boost.
    const proximityBoost = mins <= 0 ? 100 : mins <= 120 ? 80 - (mins / 2) : Math.max(0, 40 - mins / 60)
    items.push({
      id: `meeting:${ev.id}`,
      kind: 'meeting',
      score: 80 + proximityBoost,
      title: ev.title,
      meta: ev.location ? `${fmtTime(ev.startAt)} · ${ev.location}` : fmtTime(ev.startAt),
      hint: mins <= 0 ? 'läuft jetzt' : mins <= 60 ? `in ${mins} Min.` : undefined,
      whenIso: ev.startAt,
    })
  }

  // ── Overdue invoices ─────────────────────────────────────────────────────
  for (const inv of input.invoices) {
    if (inv.status !== 'overdue') continue
    const overdue = daysOverdue(inv.dueDate)
    const cust = customerById(input.customers, inv.accountId)
    items.push({
      id: `inv:${inv.id}`,
      kind: 'overdue_invoice',
      score: 70 + Math.min(overdue, 30),
      title: cust ? `Rechnung an ${cust.name}` : 'Überfällige Rechnung',
      meta: inv.number ? `Nr. ${inv.number}` : undefined,
      hint: `${overdue} Tag${overdue === 1 ? '' : 'e'} überfällig`,
      customerId: inv.accountId,
      whenIso: inv.dueDate,
    })
  }

  // ── Overdue tasks ────────────────────────────────────────────────────────
  for (const t of input.todos) {
    if (t.status === 'done' || !t.dueDate) continue
    const overdue = daysOverdue(t.dueDate)
    if (overdue <= 0) continue
    const cust = customerById(input.customers, t.customerId)
    const priorityBoost = t.priority === 'high' ? 20 : t.priority === 'low' ? -5 : 5
    items.push({
      id: `task:${t.id}`,
      kind: 'overdue_task',
      score: 60 + Math.min(overdue * 4, 30) + priorityBoost,
      title: t.title,
      meta: cust?.name,
      hint: `${overdue} Tag${overdue === 1 ? '' : 'e'} überfällig`,
      customerId: t.customerId,
      whenIso: t.dueDate,
    })
  }

  // ── Today's tasks ────────────────────────────────────────────────────────
  for (const t of input.todos) {
    if (t.status === 'done' || !t.dueDate) continue
    if (!t.dueDate.startsWith(todayIso)) continue
    const cust = customerById(input.customers, t.customerId)
    const priorityBoost = t.priority === 'high' ? 25 : t.priority === 'low' ? -5 : 8
    items.push({
      id: `task:${t.id}`,
      kind: 'today_task',
      score: 50 + priorityBoost,
      title: t.title,
      meta: cust?.name,
      hint: 'heute fällig',
      customerId: t.customerId,
      whenIso: t.dueDate,
    })
  }

  // ── Follow-ups due today or overdue ──────────────────────────────────────
  for (const fu of input.followups) {
    if (fu.status === 'erledigt') continue
    if (fu.dueDate > todayIso) continue
    const overdue = daysOverdue(fu.dueDate)
    const cust = customerById(input.customers, fu.customerId)
    items.push({
      id: `fu:${fu.id}`,
      kind: 'followup_due',
      score: 55 + (overdue > 0 ? Math.min(overdue * 3, 20) : 0),
      title: fu.title,
      meta: cust?.name,
      hint: overdue > 0 ? `${overdue} Tag${overdue === 1 ? '' : 'e'} überfällig` : 'heute fällig',
      customerId: fu.customerId,
      whenIso: fu.dueDate,
    })
  }

  // ── Tomorrow's high-priority tasks ───────────────────────────────────────
  for (const t of input.todos) {
    if (t.status === 'done' || !t.dueDate || t.priority !== 'high') continue
    if (!t.dueDate.startsWith(tomorrowIso)) continue
    const cust = customerById(input.customers, t.customerId)
    items.push({
      id: `task:${t.id}`,
      kind: 'tomorrow_task',
      score: 35,
      title: t.title,
      meta: cust?.name,
      hint: 'morgen fällig · high',
      customerId: t.customerId,
      whenIso: t.dueDate,
    })
  }

  // Dedupe by id (a task can appear from multiple buckets), keep highest score.
  const dedup = new Map<string, PriorityItem>()
  for (const it of items) {
    const prev = dedup.get(it.id)
    if (!prev || prev.score < it.score) dedup.set(it.id, it)
  }

  return Array.from(dedup.values()).sort((a, b) => b.score - a.score)
}

/**
 * Tasks due in the next 7 days, excluding ones already in the top priorities
 * (we don't want the same item appearing twice on the dashboard).
 */
export function upcomingTasks(
  todos: Todo[],
  customers: Customer[],
  excludeIds: Set<string>,
  limit = 5,
): { todo: Todo; customerName?: string }[] {
  const today = startOfDay(new Date())
  const horizon = new Date(today); horizon.setDate(horizon.getDate() + 7)

  return todos
    .filter(t => t.status !== 'done')
    .filter(t => t.dueDate && new Date(t.dueDate) <= horizon)
    .filter(t => !excludeIds.has(`task:${t.id}`))
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
    .slice(0, limit)
    .map(t => ({ todo: t, customerName: customerById(customers, t.customerId)?.name }))
}
