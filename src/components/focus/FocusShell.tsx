import { useEffect } from 'react'
import { useFinanceStore } from '@/store/finance.store'
import { useMailStore } from '@/store/mail.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useFocusStack } from '@/hooks/useFocusStack'
import { useOverdueTaskSync } from '@/hooks/useOverdueTaskSync'
import { FocusTopBar } from './FocusTopBar'
import { FocusWorkspace } from './FocusWorkspace'

export function FocusShell() {
  const loadFinance       = useFinanceStore(s => s.loadAll)
  const invoices          = useFinanceStore(s => s.invoices)
  const loadMailAccounts  = useMailStore(s => s.loadAccounts)
  const activeWorkspaceId = useWorkspaceStore(s => s.activeWorkspaceId)
  const focusApi          = useFocusStack()

  useEffect(() => {
    if (!activeWorkspaceId) return
    if (invoices.length === 0) loadFinance(activeWorkspaceId)
  }, [activeWorkspaceId, invoices.length, loadFinance])

  useEffect(() => {
    loadMailAccounts()
  }, [loadMailAccounts])

  useOverdueTaskSync()

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg)',
    }}>
      <FocusTopBar
        currentIndex={focusApi.currentIndex}
        total={focusApi.total}
      />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <FocusWorkspace focusApi={focusApi} />
      </div>
    </div>
  )
}
