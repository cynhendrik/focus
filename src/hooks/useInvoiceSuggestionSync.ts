import { useEffect } from 'react'
import { useFinanceStore } from '@/store/finance.store'
import { useTodosStore } from '@/store/todos.store'
import { useAccountsStore } from '@/store/accounts.store'
import { log } from '@/lib/logger'
import type { Invoice } from '@/types/finance.types'
import type { Todo } from '@/types/todo.types'

/** Pure function — exported for testing. */
export function shouldCreateInvoiceTask(invoice: Invoice, todos: Todo[]): boolean {
  if (!invoice.isSuggestion) return false
  if (invoice.approvedBy) return false  // already approved
  return !todos.some(t => t.sourceRef === invoice.id && t.status !== 'done')
}

export function useInvoiceSuggestionSync() {
  const invoices = useFinanceStore(s => s.invoices)
  const allTodos = useTodosStore(s => s.allTodos)
  const upsert   = useTodosStore(s => s.upsert)
  const accounts = useAccountsStore(s => s.accounts)

  useEffect(() => {
    if (invoices.length === 0 || accounts.length === 0) return

    const processed = new Set<string>()
    for (const invoice of invoices) {
      if (processed.has(invoice.id)) continue
      if (!shouldCreateInvoiceTask(invoice, allTodos)) continue
      processed.add(invoice.id)

      const account = accounts.find(a => a.id === invoice.accountId)
      const customerName = account?.name ?? 'Kunde'
      const amountStr = invoice.total.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

      upsert({
        customerId:  invoice.accountId,
        title:       `Rechnung für ${customerName} erstellen & senden`,
        status:      'open',
        priority:    'p2',
        bucket:      'today',
        source:      'finance',
        actionType:  'create_invoice',
        sourceRef:   invoice.id,
        checklist:   [],
        tags:        [],
        notes:       `${amountStr} € · Entwurf liegt bereit`,
      }).catch((err: unknown) => log.warn('Failed to create invoice task', { invoiceId: invoice.id, err }))
    }
  }, [invoices, allTodos, upsert, accounts])
}
