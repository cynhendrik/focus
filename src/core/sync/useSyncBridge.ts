import { useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { supabase } from '@/lib/supabase'
import { useWorkspaceStore } from '@/store/workspace.store'

export function useSyncBridge() {
  const setOnline = useWorkspaceStore(s => s.setOnline)
  const setPendingCount = useWorkspaceStore(s => s.setPendingCount)
  const setFailedCount = useWorkspaceStore(s => s.setFailedCount)

  useEffect(() => {
    // 1. Auth-Token bei Änderung an Rust übergeben
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.access_token) {
          invoke('set_auth_token', { token: session.access_token }).catch(console.error)
        }
      }
    )

    // 2. Connectivity-Events empfangen
    const unlistenConnectivity = listen<boolean>(
      'cultera://connectivity-changed',
      (event) => setOnline(event.payload)
    )

    // 3. Pending-Count-Events empfangen
    const unlistenPending = listen<number>(
      'cultera://pending-count',
      (event) => setPendingCount(event.payload)
    )

    // 4. Fehlgeschlagene Sync-Einträge (Server-Ablehnungen) empfangen
    const unlistenFailed = listen<number>(
      'cultera://sync-failed-count',
      (event) => setFailedCount(event.payload)
    )

    return () => {
      subscription.unsubscribe()
      unlistenConnectivity.then(fn => fn())
      unlistenPending.then(fn => fn())
      unlistenFailed.then(fn => fn())
    }
  }, [setOnline, setPendingCount, setFailedCount])
}
