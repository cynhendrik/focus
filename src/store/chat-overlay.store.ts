import { create } from 'zustand'

/** Spec 2 erweitert dies auf: 'team' | { conversationId: string; peerId: string } (Direktnachrichten). */
export type ChatOverlaySelection = 'team' | { conversationId: string; peerId: string }

interface ChatOverlayState {
  open: boolean
  selected: ChatOverlaySelection
  toggle: () => void
  openPanel: () => void
  close: () => void
  select: (s: ChatOverlaySelection) => void
}

export const useChatOverlayStore = create<ChatOverlayState>()((set) => ({
  open: false,
  selected: 'team',
  toggle: () => set(s => ({ open: !s.open })),
  openPanel: () => set({ open: true }),
  close: () => set({ open: false }),
  select: (selected) => set({ selected }),
}))
