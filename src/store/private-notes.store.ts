// ─────────────────────────────────────────────────────────────────────────────
// Privat-Notizen — frei strukturierte persoenliche Notizen, getrennt von den
// kunden-zugeordneten Notebooks (notebook.store). Eine Note = Titel + Body.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface PrivateNote {
  id:        string
  title:     string
  body:      string  // HTML aus TipTap oder plain text
  createdAt: string
  updatedAt: string
}

interface State {
  notes: PrivateNote[]
  selectedId: string | null
  create:      () => string
  update:      (id: string, patch: { title?: string; body?: string }) => void
  remove:      (id: string) => void
  setSelected: (id: string | null) => void
}

const uid = () => `pn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

export const usePrivateNotesStore = create<State>()(
  persist(
    (set) => ({
      notes: [],
      selectedId: null,
      create: () => {
        const now = new Date().toISOString()
        const n: PrivateNote = { id: uid(), title: '', body: '', createdAt: now, updatedAt: now }
        set(s => ({ notes: [n, ...s.notes], selectedId: n.id }))
        return n.id
      },
      update: (id, patch) =>
        set(s => ({
          notes: s.notes.map(n =>
            n.id === id
              ? { ...n, ...patch, updatedAt: new Date().toISOString() }
              : n,
          ),
        })),
      remove: (id) =>
        set(s => ({
          notes: s.notes.filter(n => n.id !== id),
          selectedId: s.selectedId === id ? null : s.selectedId,
        })),
      setSelected: (id) => set({ selectedId: id }),
    }),
    { name: 'cynera-private-notes-v1' },
  )
)
