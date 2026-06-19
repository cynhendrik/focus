import { create } from 'zustand'

export type UpdatePhase = 'idle' | 'available' | 'downloading' | 'ready' | 'error'

/** Strukturelle Minimal-Form des Tauri-`Update`-Objekts — entkoppelt Store/Service
 *  vom Plugin, damit der Store ohne Plugin-Mock testbar bleibt. Das echte
 *  `Update` aus `@tauri-apps/plugin-updater` ist hierauf zuweisbar. */
export interface PendingUpdate {
  version: string
  downloadAndInstall: (onEvent?: (event: unknown) => void) => Promise<void>
}

interface UpdateState {
  phase: UpdatePhase
  version: string
  progress: number          // 0–100
  errorMsg: string
  dismissedVersion: string | null
  update: PendingUpdate | null

  setAvailable: (update: PendingUpdate) => void
  setDownloading: () => void
  setProgress: (pct: number) => void
  setReady: () => void
  setError: (msg: string) => void
  dismiss: () => void
  reset: () => void
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  phase: 'idle',
  version: '',
  progress: 0,
  errorMsg: '',
  dismissedVersion: null,
  update: null,

  setAvailable: (update) => set({ phase: 'available', version: update.version, update, progress: 0 }),
  setDownloading: () => set({ phase: 'downloading', progress: 0 }),
  setProgress: (pct) => set({ progress: pct }),
  setReady: () => set({ phase: 'ready', progress: 100 }),
  setError: (msg) => set({ phase: 'error', errorMsg: msg }),
  dismiss: () => set({ phase: 'idle', dismissedVersion: get().version || get().dismissedVersion }),
  reset: () => set({ phase: 'idle', version: '', progress: 0, errorMsg: '', update: null }),
}))
