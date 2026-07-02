import { useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { usePreparedItemsStore } from '@/store/prepared-items.store'
import { useNotificationSettingsStore } from '@/store/notification-settings.store'

/**
 * Verbindet Frontend-Zustand mit der Rust-Präsenz-Schicht:
 * 1. wendet die persistierte Close-to-Tray-Einstellung beim Start an,
 * 2. hält den Tray-Tooltip auf dem Stand der sichtbaren Stapel-Karten.
 */
export function usePresenceBridge() {
  const closeToTray = useNotificationSettingsStore(s => s.closeToTray)

  const openCount = usePreparedItemsStore(s => {
    const now = new Date().toISOString()
    return s.items.filter(i => i.status === 'pending' || (i.status === 'snoozed' && i.snoozeUntil != null && i.snoozeUntil <= now)).length
  })

  useEffect(() => {
    void invoke('cmd_set_close_to_tray', { enabled: closeToTray }).catch(() => {})
  }, [closeToTray])

  useEffect(() => {
    void invoke('cmd_update_tray_status', { openCount }).catch(() => {})
  }, [openCount])
}
