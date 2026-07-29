import { useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useFinanceStore } from '@/store/finance.store'
import { useMailStore } from '@/store/mail.store'
import { useTodosStore } from '@/store/todos.store'
import { invoiceCategory } from '@/lib/finance/invoice-filters'
import { computeOpenCount } from '@/lib/heute/due'

/**
 * Haelt den Tray-Tooltip synchron mit der Anzahl offener Punkte
 * (dieselbe Zahl wie das Sidebar-Badge). Reine Verdrahtung, kein
 * eigener State — cmd_update_tray_status existierte bereits, wurde
 * bisher nie aufgerufen.
 */
export function useTrayBadge() {
  const overdueCount = useFinanceStore(s =>
    s.invoices.filter(i => !i.isSuggestion && invoiceCategory(i) === 'overdue').length
  )
  const unreadMails = useMailStore(s => s.emails.filter(e => !e.isRead).length)
  const todayTodos = useTodosStore(s =>
    s.allTodos.filter(t => t.status !== 'done' && (t.bucket === 'today' || t.bucket === 'in_progress')).length
  )

  useEffect(() => {
    const openCount = computeOpenCount(overdueCount, unreadMails, todayTodos)
    void invoke('cmd_update_tray_status', { openCount }).catch(() => {})
  }, [overdueCount, unreadMails, todayTodos])
}
