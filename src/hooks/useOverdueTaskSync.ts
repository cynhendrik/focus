import { useEffect } from 'react'
import { useFinanceStore } from '@/store/finance.store'
import { useTodosStore } from '@/store/todos.store'
import { useAccountsStore } from '@/store/accounts.store'
import { log } from '@/lib/logger'
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
  label: string
  priority: 'p1' | 'p2'
}

export function getDunningState(invoice: Invoice, todos: Todo[]): DunningState {
  if (invoice.status !== 'overdue') return { level: 0, canCreate: false, label: '', priority: 'p2' }

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
    return { level, canCreate: false, label, priority: 'p1' }
  }

  // Block if there's an open reminder already
  if (related.some(t => t.status !== 'done')) {
    return { level, canCreate: false, label, priority: level >= 1 ? 'p1' : 'p2' }
  }

  // Check cooldown since last completed reminder
  if (completed.length > 0) {
    const daysSince = Math.floor(
      (Date.now() - new Date(completed[0].updatedAt).getTime()) / 86_400_000,
    )
    const cooldown = DUNNING_COOLDOWN_DAYS[level - 1] ?? 21
    if (daysSince < cooldown) {
      return { level, canCreate: false, label, priority: level >= 1 ? 'p1' : 'p2' }
    }
  }

  return {
    level,
    canCreate: true,
    label,
    priority: level >= 1 ? 'p1' : 'p2',
  }
}

/** Exported for tests — determines whether to create a task (wraps getDunningState). */
export function shouldCreateReminderTask(invoice: Invoice, todos: Todo[]): boolean {
  return getDunningState(invoice, todos).canCreate
}

export function useOverdueTaskSync() {
  const invoices = useFinanceStore(s => s.invoices)
  const allTodos = useTodosStore(s => s.allTodos)
  const upsert   = useTodosStore(s => s.upsert)
  const accounts = useAccountsStore(s => s.accounts)

  useEffect(() => {
    if (invoices.length === 0 || accounts.length === 0) return

    const processed = new Set<string>()
    for (const invoice of invoices) {
      if (processed.has(invoice.id)) continue
      const state = getDunningState(invoice, allTodos)
      if (!state.canCreate) continue
      processed.add(invoice.id)

      const account = accounts.find(a => a.id === invoice.accountId)
      const customerName = account?.name ?? 'Kunde'
      const daysOverdue = Math.max(
        0,
        Math.floor((Date.now() - new Date(invoice.dueDate).getTime()) / 86_400_000),
      )

      upsert({
        customerId:  invoice.accountId,
        title:       `${state.label} an ${customerName} senden`,
        status:      'open',
        priority:    state.priority,
        bucket:      'today',
        source:      'finance',
        actionType:  'send_reminder',
        sourceRef:   invoice.id,
        checklist:   [],
        tags:        [],
        notes:       `${daysOverdue} Tag${daysOverdue !== 1 ? 'e' : ''} überfällig · ${state.label} (Stufe ${state.level + 1})`,
      }).catch((err: unknown) =>
        log.warn('Failed to create reminder task', { invoiceId: invoice.id, level: state.level, err }),
      )
    }
  }, [invoices, allTodos, upsert, accounts])
}
