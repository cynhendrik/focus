import { create } from 'zustand'

export type ChatOverlaySelection = 'inbox' | 'team' | { conversationId: string; peerId: string }

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
  selected: 'inbox',
  toggle: () => set(s => ({ open: !s.open })),
  openPanel: () => set({ open: true }),
  close: () => set({ open: false }),
  select: (selected) => set({ selected }),
}))
