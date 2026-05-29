import { create } from 'zustand'

type Phase = 'generating' | 'saving' | 'done' | 'error'

interface DownloadToastState {
  phase:    Phase | null
  filename: string
  savedTo:  string
  progress: number   // 0–100 for batch
  isBatch:  boolean

  start:    (filename: string, batch?: boolean) => void
  setSaving: () => void
  setProgress: (pct: number) => void
  setDone:  (savedTo: string) => void
  setError: (msg: string) => void
  reset:    () => void
}

export const useDownloadToastStore = create<DownloadToastState>((set) => ({
  phase:    null,
  filename: '',
  savedTo:  '',
  progress: 0,
  isBatch:  false,

  start:    (filename, batch = false) => set({ phase: 'generating', filename, savedTo: '', progress: 0, isBatch: batch }),
  setSaving: ()         => set({ phase: 'saving' }),
  setProgress: (pct)   => set({ progress: pct }),
  setDone:  (savedTo)  => set({ phase: 'done', savedTo }),
  setError: (_msg)     => set({ phase: 'error' }),
  reset:    ()         => set({ phase: null, filename: '', savedTo: '', progress: 0 }),
}))
