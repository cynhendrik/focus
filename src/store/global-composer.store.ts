import { create } from 'zustand'

interface GlobalComposerState {
  open: boolean
  toggle: () => void
  close: () => void
  openPanel: () => void
}

export const useGlobalComposerStore = create<GlobalComposerState>()((set) => ({
  open: false,
  toggle: () => set(s => ({ open: !s.open })),
  close: () => set({ open: false }),
  openPanel: () => set({ open: true }),
}))
