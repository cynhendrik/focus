import { useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useFinanceStore } from '@/store/finance.store'
import { useTodosStore } from '@/store/todos.store'
import { useMailStore } from '@/store/mail.store'
import { useNotificationSettingsStore } from '@/store/notification-settings.store'

/**
 * Verbindet Frontend-Zustand mit der Rust-Präsenz-Schicht:
 * 1. wendet die persistierte Close-to-Tray-Einstellung beim Start an,
 * 2. hält den Tray-Tooltip auf dem Stand der offenen Punkte
 *    (gleiche Zählung wie das KORA-Badge in der NavSidebar).
 */
export function usePresenceBridge() {
  const closeToTray = useNotificationSettingsStore(s => s.closeToTray)

  const overdueCount = useFinanceStore(s =>
    s.invoices.filter(i => {
      if (i.status === 'paid' || i.status === 'cancelled' || i.status === 'draft') return false
      return i.status === 'overdue' || new Date(i.dueDate) < new Date()
    }).length)
  const todayTodos = useTodosStore(s =>
    s.allTodos.filter(t => t.status !== 'done' && (t.bucket === 'today' || t.bucket === 'in_progress')).length)
  const unreadMails = useMailStore(s => s.emails.filter(e => !e.isRead).length)

  useEffect(() => {
    void invoke('cmd_set_close_to_tray', { enabled: closeToTray }).catch(() => {})
  }, [closeToTray])

  useEffect(() => {
    const openCount = overdueCount + todayTodos + unreadMails
    void invoke('cmd_update_tray_status', { openCount }).catch(() => {})
  }, [overdueCount, todayTodos, unreadMails])
}
