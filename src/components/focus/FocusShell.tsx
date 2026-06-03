import { useEffect, useState } from 'react'
import { useFinanceStore } from '@/store/finance.store'
import { useMailStore } from '@/store/mail.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useFocusStack } from '@/hooks/useFocusStack'
import { useOverdueTaskSync } from '@/hooks/useOverdueTaskSync'
import { useInvoiceSuggestionSync } from '@/hooks/useInvoiceSuggestionSync'
import { FocusCustomerSelect } from './FocusCustomerSelect'
import { FocusSessionView } from './FocusSessionView'

export function FocusShell() {
  const loadFinance       = useFinanceStore(s => s.loadAll)
  const invoices          = useFinanceStore(s => s.invoices)
  const loadMailAccounts  = useMailStore(s => s.loadAccounts)
  const activeWorkspaceId = useWorkspaceStore(s => s.activeWorkspaceId)
  const focusApi          = useFocusStack()

  // null  = show Kunden-Auswahl
  // string = in session for that customerId
  // 'none' = in session for tasks without a customer
  const [activeCustomerId, setActiveCustomerId] = useState<string | null>(null)

  useEffect(() => {
    if (!activeWorkspaceId) return
    if (invoices.length === 0) loadFinance(activeWorkspaceId)
  }, [activeWorkspaceId, invoices.length, loadFinance])

  useEffect(() => { loadMailAccounts() }, [loadMailAccounts])

  useOverdueTaskSync()
  useInvoiceSuggestionSync()

  return (
    <div className="focus-backdrop">
      <div className="focus-aurora" aria-hidden />
      {activeCustomerId === null ? (
        <FocusCustomerSelect
          stack={focusApi.stack}
          onSelectCustomer={setActiveCustomerId}
        />
      ) : (
        <FocusSessionView
          customerId={activeCustomerId === 'none' ? undefined : activeCustomerId}
          onBack={() => setActiveCustomerId(null)}
        />
      )}
    </div>
  )
}
