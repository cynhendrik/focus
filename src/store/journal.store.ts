// ─────────────────────────────────────────────────────────────────────────────
// Journal-Store — datierte Eintraege fuer den "Mein Raum"-Modus.
// MVP: localStorage-basiert ueber zustand/persist; keine SQLite-Migration
// noetig, um den Modus erstmal in der Praxis zu testen. Wenn das Feature
// greift, migrieren wir spaeter in die DB (z.B. journal_entries-Tabelle).
//
// Datenmodell: ein Eintrag = ein Stueck Text mit Datum. Mehrere Eintraege
// pro Tag sind erlaubt (z.B. Morgen-Reflexion + Abend-Eintrag). Dadurch
// braucht der UI keinen "Tages-Slot"-Edge-Case.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface JournalEntry {
  id:        string
  /** Lokaler Kalendertag im YYYY-MM-DD Format. Sortier- und Gruppierschluessel. */
  date:      string
  title:     string
  /** HTML aus dem TipTap-Editor (oder Plain-Text als Fallback). */
  body:      string
  createdAt: string  // ISO
  updatedAt: string  // ISO
}

interface JournalState {
  entries:    JournalEntry[]
  /** Welcher Eintrag gerade rechts editiert wird. null = leerer Editor-Zustand. */
  selectedId: string | null

  create:        (date?: string) => string  // gibt neue ID zurueck
  update:        (id: string, patch: { title?: string; body?: string }) => void
  remove:        (id: string) => void
  setSelected:   (id: string | null) => void
}

function todayIso(): string {
  // Lokale Zeit (nicht UTC) — gleiche Logik wie clients-overview.todayIso
  return new Date().toLocaleDateString('sv')
}

function uid(): string {
  return `j_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export const useJournalStore = create<JournalState>()(
  persist(
    (set) => ({
      entries:    [],
      selectedId: null,

      create: (date) => {
        const id  = uid()
        const now = new Date().toISOString()
        const entry: JournalEntry = {
          id,
          date:      date ?? todayIso(),
          title:     '',
          body:      '',
          createdAt: now,
          updatedAt: now,
        }
        set(s => ({ entries: [entry, ...s.entries], selectedId: id }))
        return id
      },

      update: (id, patch) =>
        set(s => ({
          entries: s.entries.map(e =>
            e.id === id
              ? { ...e, ...patch, updatedAt: new Date().toISOString() }
              : e
          ),
        })),

      remove: (id) =>
        set(s => ({
          entries:    s.entries.filter(e => e.id !== id),
          selectedId: s.selectedId === id ? null : s.selectedId,
        })),

      setSelected: (id) =>
        set({ selectedId: id }),
    }),
    {
      name: 'focus-journal-v1',
      partialize: (s) => ({ entries: s.entries }),
    }
  )
)

// ── Hilfsfunktionen fuer die Route (nicht im Store, damit Selektoren stabil bleiben) ─

export function groupEntriesByDate(entries: JournalEntry[]): { date: string; entries: JournalEntry[] }[] {
  const byDate = new Map<string, JournalEntry[]>()
  for (const e of entries) {
    const list = byDate.get(e.date) ?? []
    list.push(e)
    byDate.set(e.date, list)
  }
  return Array.from(byDate.entries())
    .map(([date, list]) => ({
      date,
      entries: list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    }))
    .sort((a, b) => b.date.localeCompare(a.date))
}

export function relativeDateLabel(iso: string): string {
  const today = new Date().toLocaleDateString('sv')
  if (iso === today) return 'Heute'
  const yest = new Date(); yest.setDate(yest.getDate() - 1)
  if (iso === yest.toLocaleDateString('sv')) return 'Gestern'
  const date = new Date(iso + 'T00:00:00')
  const diff = Math.floor((Date.now() - date.getTime()) / 86_400_000)
  if (diff < 7) {
    return date.toLocaleDateString('de-DE', { weekday: 'long' })
  }
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: diff > 365 ? '2-digit' : undefined })
}
