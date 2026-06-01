import { useEffect } from 'react'
import { useFinanceStore } from '@/store/finance.store'
import { useTodosStore } from '@/store/todos.store'
import { useAccountsStore } from '@/store/accounts.store'
import { log } from '@/lib/logger'
import type { Invoice } from '@/types/finance.types'
import type { Todo } from '@/types/todo.types'

/** Pure function — exported for testing. */
export function shouldCreateReminderTask(invoice: Invoice, todos: Todo[]): boolean {
  if (invoice.status !== 'overdue') return false
  // Block if there's an open (non-done) task for this invoice
  if (todos.some(t => t.sourceRef === invoice.id && t.status !== 'done')) return false
  // Block if a task for this invoice was completed today (cooldown: 1 day)
  const today = new Date().toISOString().slice(0, 10)
  const completedToday = todos.some(
    t => t.sourceRef === invoice.id &&
         t.status === 'done' &&
         t.updatedAt.slice(0, 10) === today
  )
  return !completedToday
}

export function useOverdueTaskSync() {
  const invoices  = useFinanceStore(s => s.invoices)
  const allTodos  = useTodosStore(s => s.allTodos)
  const upsert    = useTodosStore(s => s.upsert)
  const accounts  = useAccountsStore(s => s.accounts)

  useEffect(() => {
    if (invoices.length === 0 || accounts.length === 0) return

    const processed = new Set<string>()
    for (const invoice of invoices) {
      if (processed.has(invoice.id)) continue
      if (!shouldCreateReminderTask(invoice, allTodos)) continue
      processed.add(invoice.id)

      const account = accounts.find(a => a.id === invoice.accountId)
      const customerName = account?.name ?? 'Kunde'

      upsert({
        customerId:  invoice.accountId,
        title:       `Zahlungserinnerung an ${customerName} schicken`,
        status:      'open',
        priority:    'p1',
        bucket:      'today',
        source:      'finance',
        actionType:  'send_reminder',
        sourceRef:   invoice.id,
        checklist:   [],
        tags:        [],
      }).catch((err: unknown) => log.warn('Failed to create overdue task reminder', { invoiceId: invoice.id, err }))
    }
  }, [invoices, allTodos, upsert, accounts])
}
