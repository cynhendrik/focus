import { isOverdue } from '@/lib/invoice-status'
import type { Invoice } from '@/types/finance.types'
import type { Todo } from '@/types/todo.types'

/** Days to wait after completing a reminder at each level before creating the next. */
const DUNNING_COOLDOWN_DAYS: Record<number, number> = {
  0: 7,   // after Zahlungserinnerung: 7 days
  1: 14,  // after 1. Mahnung: 14 days
  2: 21,  // after 2. Mahnung: 21 days
}

/** Max levels we auto-create. After 2. Mahnung the user must decide manually. */
const MAX_AUTO_LEVEL = 2

export interface DunningState {
  level: number
  canCreate: boolean
  phase: 'due' | 'cooldown' | 'escalated'
  label: string
  priority: 'p1' | 'p2'
}

export function getDunningState(invoice: Invoice, todos: Todo[]): DunningState {
  if (!isOverdue(invoice)) return { level: 0, canCreate: false, phase: 'cooldown', label: '', priority: 'p2' }

  const related = todos.filter(
    t => t.sourceRef === invoice.id && t.actionType === 'send_reminder',
  )
  const completed = related
    .filter(t => t.status === 'done')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  const level = completed.length
  const labels = ['Zahlungserinnerung', '1. Mahnung', '2. Mahnung']
  const label = labels[level] ?? `${level}. Mahnung`

  // Already at max level — don't auto-create
  if (level >= MAX_AUTO_LEVEL + 1) {
    return { level, canCreate: false, phase: 'escalated', label, priority: 'p1' }
  }

  // Block if there's an open reminder already
  if (related.some(t => t.status !== 'done')) {
    return { level, canCreate: false, phase: 'cooldown', label, priority: level >= 1 ? 'p1' : 'p2' }
  }

  // Check cooldown since last completed reminder
  if (completed.length > 0) {
    const daysSince = Math.floor(
      (Date.now() - new Date(completed[0].updatedAt).getTime()) / 86_400_000,
    )
    const cooldown = DUNNING_COOLDOWN_DAYS[level - 1] ?? 21
    if (daysSince < cooldown) {
      return { level, canCreate: false, phase: 'cooldown', label, priority: level >= 1 ? 'p1' : 'p2' }
    }
  }

  return {
    level,
    canCreate: true,
    phase: 'due',
    label,
    priority: level >= 1 ? 'p1' : 'p2',
  }
}

/** Exported for tests — determines whether to create a task (wraps getDunningState). */
export function shouldCreateReminderTask(invoice: Invoice, todos: Todo[]): boolean {
  return getDunningState(invoice, todos).canCreate
}
