import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { CloudOff, RefreshCw } from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useToastStore } from '@/store/toast.store'

interface SyncNowResult { pending_count: number; failed_count: number; last_synced_at: string; is_online: boolean }

/**
 * Sichtbarer Zustand für hängende Sync-Einträge (Server-Ablehnungen).
 * Vorher: stiller Endlos-Retry — der Nutzer erfuhr nie, dass Daten klemmen.
 */
export function SyncStatusChip() {
  const failedCount = useWorkspaceStore(s => s.failedCount)
  const isShared = useWorkspaceStore(s => s.isActiveWorkspaceShared())
  const [busy, setBusy] = useState(false)

  if (!isShared || failedCount === 0) return null

  const retry = async () => {
    if (busy) return
    setBusy(true)
    try {
      const st = await invoke<SyncNowResult>('sync_now')
      useWorkspaceStore.getState().setPendingCount(st.pending_count)
      useWorkspaceStore.getState().setFailedCount(st.failed_count)
      if (st.failed_count === 0) {
        useToastStore.getState().show({ message: 'Alle Änderungen synchronisiert.', variant: 'success' })
      } else {
        useToastStore.getState().show({
          message: `${st.failed_count} Änderungen weiterhin abgelehnt — bitte erneut anmelden oder Support kontaktieren.`,
          variant: 'error', durationMs: 8000,
        })
      }
    } catch {
      useToastStore.getState().show({ message: 'Synchronisation fehlgeschlagen — bitte Verbindung prüfen.', variant: 'error', durationMs: 8000 })
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      className="nav-item"
      data-active="false"
      data-label="Sync-Fehler"
      onClick={retry}
      title={`${failedCount} Änderungen konnten nicht synchronisiert werden — klicken für erneuten Versuch`}
    >
      {busy ? <RefreshCw size={18} strokeWidth={1.75} /> : <CloudOff size={18} strokeWidth={1.75} />}
      <span className="nav-item__label">Sync-Fehler</span>
      <span className="nav-badge nav-badge--a">{failedCount}</span>
    </button>
  )
}
