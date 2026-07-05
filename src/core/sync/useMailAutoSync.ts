import { useEffect } from 'react'
import { useMailStore } from '@/store/mail.store'
import { useCustomersStore } from '@/store/customers.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { toastError } from '@/store/toast.store'

// Mails alle 5 Minuten automatisch holen, solange die App offen ist. Voller
// Sync (INBOX + Sent) MIT Kundenliste — damit das Kunden-Matching immer läuft.
const SYNC_INTERVAL_MS = 5 * 60 * 1000

/** Kundenliste als JSON für das Backend-Matching ({ id, email }). */
export function mailCustomerRefsJson(): string {
  return JSON.stringify(
    useCustomersStore.getState().customers.map(c => ({ id: c.id, email: c.email ?? null })),
  )
}

/**
 * App-weiter automatischer Mail-Sync. Lädt beim Start die Konten, synct einmal
 * sofort und danach alle 5 Minuten. Der bestehende isSyncing-Guard verhindert,
 * dass sich ein Auto-Sync mit einem manuellen überlappt.
 */
export function useMailAutoSync() {
  const activeWorkspaceId = useWorkspaceStore(s => s.activeWorkspaceId)

  useEffect(() => {
    if (!activeWorkspaceId) return
    let cancelled = false

    let lastToastedError = ''
    const runSync = () => {
      const { selectedAccountId, isSyncing, sync } = useMailStore.getState()
      if (!selectedAccountId || isSyncing) return
      void sync(mailCustomerRefsJson())
        .then(() => { lastToastedError = '' })
        .catch((err: unknown) => {
          // Einmal pro Fehlerursache melden statt still schlucken (oder 5-Minuten-Spam).
          const msg = err instanceof Error ? err.message : String(err)
          if (msg !== lastToastedError) {
            lastToastedError = msg
            toastError('Mail-Abruf fehlgeschlagen — neue Mails fehlen möglicherweise.')
          }
        })
    }

    // Konten sicherstellen, dann initial syncen.
    void useMailStore.getState().loadAccounts().then(() => {
      if (!cancelled) runSync()
    })

    const id = setInterval(runSync, SYNC_INTERVAL_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [activeWorkspaceId])
}
