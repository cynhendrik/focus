import { create } from 'zustand'

const PINS_KEY = 'cynera-pinned-clients-v1'

function readPins(): string[] {
  try { return JSON.parse(localStorage.getItem(PINS_KEY) ?? '[]') } catch { return [] }
}

interface ClientPickerState {
  isOpen:    boolean
  pinnedIds: string[]
  open:       () => void
  close:      () => void
  togglePin:  (id: string) => void
}

export const useClientPickerStore = create<ClientPickerState>((set) => ({
  isOpen:    false,
  pinnedIds: readPins(),

  open:  () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),

  togglePin: (id) => set(s => {
    const next = s.pinnedIds.includes(id)
      ? s.pinnedIds.filter(p => p !== id)
      : [...s.pinnedIds, id]
    try { localStorage.setItem(PINS_KEY, JSON.stringify(next)) } catch {}
    return { pinnedIds: next }
  }),
}))
