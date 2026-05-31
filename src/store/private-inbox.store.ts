// ─────────────────────────────────────────────────────────────────────────────
// Privat-Inbox / Quick Capture.
// "Alles, was dir durch den Kopf geht, landet hier — ungeordnet."
// Spaeter sortiert der User von hier in Todos oder Notizen.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface PrivateInboxItem {
  id:        string
  text:      string
  createdAt: string  // ISO
}

interface State {
  items: PrivateInboxItem[]
  add:    (text: string) => string
  remove: (id: string) => void
  clear:  () => void
}

const uid = () => `inb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

export const usePrivateInboxStore = create<State>()(
  persist(
    (set) => ({
      items: [],
      add: (text) => {
        const item: PrivateInboxItem = {
          id: uid(),
          text: text.trim(),
          createdAt: new Date().toISOString(),
        }
        set(s => ({ items: [item, ...s.items] }))
        return item.id
      },
      remove: (id) => set(s => ({ items: s.items.filter(i => i.id !== id) })),
      clear:  ()   => set({ items: [] }),
    }),
    { name: 'cynera-private-inbox-v1' },
  )
)
