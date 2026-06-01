import { useEffect } from 'react'
import { useFinanceStore } from '@/store/finance.store'
import { useTodosStore } from '@/store/todos.store'
import { useAccountsStore } from '@/store/accounts.store'
import type { Invoice } from '@/types/finance.types'
import type { Todo } from '@/types/todo.types'

/** Pure function — exported for testing. */
export function shouldCreateReminderTask(invoice: Invoice, todos: Todo[]): boolean {
  if (invoice.status !== 'overdue') return false
  return !todos.some(t => t.sourceRef === invoice.id && t.status !== 'done')
}

export function useOverdueTaskSync() {
  const invoices  = useFinanceStore(s => s.invoices)
  const allTodos  = useTodosStore(s => s.allTodos)
  const upsert    = useTodosStore(s => s.upsert)
  const accounts  = useAccountsStore(s => s.accounts)

  useEffect(() => {
    if (invoices.length === 0) return

    for (const invoice of invoices) {
      if (!shouldCreateReminderTask(invoice, allTodos)) continue

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
      }).catch(() => {})
    }
  }, [invoices, allTodos, upsert, accounts])
}
