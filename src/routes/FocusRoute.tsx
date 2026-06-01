import { useEffect } from 'react'
import { useFinanceStore } from '@/store/finance.store'
import { useMailStore } from '@/store/mail.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useOverdueTaskSync } from '@/hooks/useOverdueTaskSync'
import { FocusWorkspace } from '@/components/focus/FocusWorkspace'

export function FocusRoute() {
  const loadFinance       = useFinanceStore(s => s.loadAll)
  const invoices          = useFinanceStore(s => s.invoices)
  const loadMailAccounts  = useMailStore(s => s.loadAccounts)
  const activeWorkspaceId = useWorkspaceStore(s => s.activeWorkspaceId)

  // Load finance data if not yet loaded
  useEffect(() => {
    if (!activeWorkspaceId) return
    if (invoices.length === 0) {
      loadFinance(activeWorkspaceId)
    }
  }, [activeWorkspaceId, invoices.length, loadFinance])

  // Load mail accounts for send functionality
  useEffect(() => {
    loadMailAccounts()
  }, [loadMailAccounts])

  // Auto-create tasks from overdue invoices
  useOverdueTaskSync()

  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <FocusWorkspace />
    </div>
  )
}
