import { create } from 'zustand'

interface GlobalComposerState {
  open: boolean
  prefill: string | null
  toggle: () => void
  close: () => void
  openPanel: () => void
  openWith: (text: string) => void
  consumePrefill: () => string | null
}

export const useGlobalComposerStore = create<GlobalComposerState>()((set, get) => ({
  open: false,
  prefill: null,
  toggle: () => set(s => ({ open: !s.open })),
  close: () => set({ open: false }),
  openPanel: () => set({ open: true }),
  openWith: (text) => set({ open: true, prefill: text }),
  consumePrefill: () => { const p = get().prefill; if (p !== null) set({ prefill: null }); return p },
}))
