// ─────────────────────────────────────────────────────────────────────────────
// Wochen-Review — Freitag-Ritual mit drei Fragen + Wochen-Mood (1-5).
// Ein Eintrag pro Kalenderwoche (ISO week, identifiziert ueber Montags-ISO).
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type WeekMood = 1 | 2 | 3 | 4 | 5

export interface WeeklyReview {
  id:        string
  /** Montag der Woche im ISO-Format YYYY-MM-DD (Eindeutigkeits-Key). */
  weekStart: string
  q1:        string  // "Was lief diese Woche gut?"
  q2:        string  // "Was hat mich aufgehalten?"
  q3:        string  // "Fokus fuer naechste Woche"
  mood:      WeekMood | null
  createdAt: string
  updatedAt: string
}

interface State {
  reviews: WeeklyReview[]
  /** Holt das Review fuer eine Woche, legt es bei Bedarf an. */
  ensure: (weekStart: string) => WeeklyReview
  update: (id: string, patch: Partial<Omit<WeeklyReview, 'id' | 'createdAt'>>) => void
  remove: (id: string) => void
}

const uid = () => `rv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

/** Liefert den Montags-Datums-String der Woche von `iso` im lokalen Kalender. */
export function mondayOfWeek(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  const dow = d.getDay() // 0 = So, 1 = Mo, ... 6 = Sa
  const diff = (dow === 0 ? -6 : 1 - dow)
  const mon = new Date(d)
  mon.setDate(d.getDate() + diff)
  return mon.toLocaleDateString('sv')
}

/** ISO-Wochennummer im deutschen Kalender. */
export function isoWeekNumber(iso: string): number {
  const d = new Date(iso + 'T00:00:00')
  const target = new Date(d.valueOf())
  const dayNr = (d.getDay() + 6) % 7
  target.setDate(target.getDate() - dayNr + 3)
  const firstThursday = new Date(target.getFullYear(), 0, 4)
  const diff = (target.getTime() - firstThursday.getTime()) / 86_400_000
  return 1 + Math.round((diff - 3 + ((firstThursday.getDay() + 6) % 7)) / 7)
}

export const usePrivateReviewsStore = create<State>()(
  persist(
    (set, get) => ({
      reviews: [],
      ensure: (weekStart) => {
        const existing = get().reviews.find(r => r.weekStart === weekStart)
        if (existing) return existing
        const now = new Date().toISOString()
        const rv: WeeklyReview = {
          id: uid(),
          weekStart,
          q1: '', q2: '', q3: '',
          mood: null,
          createdAt: now,
          updatedAt: now,
        }
        set(s => ({ reviews: [rv, ...s.reviews] }))
        return rv
      },
      update: (id, patch) =>
        set(s => ({
          reviews: s.reviews.map(r =>
            r.id === id ? { ...r, ...patch, updatedAt: new Date().toISOString() } : r,
          ),
        })),
      remove: (id) => set(s => ({ reviews: s.reviews.filter(r => r.id !== id) })),
    }),
    { name: 'cynera-private-reviews-v1' },
  )
)
