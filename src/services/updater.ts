import { isTauri } from '@tauri-apps/api/core'
import { useUpdateStore } from '@/store/update.store'

/** Prüft auf ein Update. No-op außerhalb von Tauri (Dev/Web) und wenn die
 *  gefundene Version in dieser Session bereits weggeklickt wurde. */
export async function checkForUpdate(): Promise<void> {
  if (!isTauri()) return
  try {
    const { check } = await import('@tauri-apps/plugin-updater')
    const update = await check()
    if (!update) return
    if (update.version === useUpdateStore.getState().dismissedVersion) return
    useUpdateStore.getState().setAvailable(update)
  } catch (err) {
    // Stiller Fehlschlag beim Check — kein Banner, App läuft normal weiter.
    console.error('[updater] check fehlgeschlagen:', err)
  }
}

/** Lädt das verfügbare Update und installiert es (Progress → Store). */
export async function startDownload(): Promise<void> {
  const update = useUpdateStore.getState().update
  if (!update) return
  useUpdateStore.getState().setDownloading()
  let total = 0
  let downloaded = 0
  try {
    await update.downloadAndInstall((event: any) => {
      switch (event?.event) {
        case 'Started':
          total = event.data?.contentLength ?? 0
          break
        case 'Progress':
          downloaded += event.data?.chunkLength ?? 0
          useUpdateStore.getState().setProgress(total ? Math.round((downloaded / total) * 100) : 0)
          break
        case 'Finished':
          useUpdateStore.getState().setProgress(100)
          break
      }
    })
    useUpdateStore.getState().setReady()
  } catch (err) {
    useUpdateStore.getState().setError(err instanceof Error ? err.message : String(err))
  }
}

/** Startet die App neu (übernimmt das installierte Update). */
export async function restartApp(): Promise<void> {
  const { relaunch } = await import('@tauri-apps/plugin-process')
  await relaunch()
}
