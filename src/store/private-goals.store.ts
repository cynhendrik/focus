// ─────────────────────────────────────────────────────────────────────────────
// Privat-Ziele — Goals mit Kategorie, Zielwert, aktuellem Wert und
// optionalem Untertitel (z.B. "20 km - noch 16 Wochen"). Progress wird
// im UI berechnet (current / target * 100).
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type GoalCategory = 'gesundheit' | 'lernen' | 'finanzen' | 'persoenlich'

export const CATEGORY_LABEL: Record<GoalCategory, string> = {
  gesundheit:  'Gesundheit',
  lernen:      'Lernen',
  finanzen:    'Finanzen',
  persoenlich: 'Persönlich',
}

export interface PrivateGoal {
  id:         string
  category:   GoalCategory
  title:      string
  subtitle?:  string  // freier Text, z.B. "20 km - noch 16 Wochen"
  current:    number
  target:     number
  unit?:      string  // e.g. "km", "€", "Bücher", "%"
  step?:      number  // Inkrement fuer -/+ Buttons (default 1)
  createdAt:  string
  updatedAt:  string
}

interface State {
  goals: PrivateGoal[]
  create:    (payload: Omit<PrivateGoal, 'id' | 'createdAt' | 'updatedAt'>) => string
  update:    (id: string, patch: Partial<PrivateGoal>) => void
  remove:    (id: string) => void
  increment: (id: string) => void
  decrement: (id: string) => void
}

const uid = () => `pg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

export const usePrivateGoalsStore = create<State>()(
  persist(
    (set) => ({
      goals: [],
      create: (payload) => {
        const now = new Date().toISOString()
        const g: PrivateGoal = { ...payload, id: uid(), createdAt: now, updatedAt: now }
        set(s => ({ goals: [...s.goals, g] }))
        return g.id
      },
      update: (id, patch) =>
        set(s => ({
          goals: s.goals.map(g =>
            g.id === id ? { ...g, ...patch, updatedAt: new Date().toISOString() } : g,
          ),
        })),
      remove: (id) => set(s => ({ goals: s.goals.filter(g => g.id !== id) })),
      increment: (id) =>
        set(s => ({
          goals: s.goals.map(g =>
            g.id === id
              ? { ...g, current: Math.min(g.target, g.current + (g.step ?? 1)), updatedAt: new Date().toISOString() }
              : g,
          ),
        })),
      decrement: (id) =>
        set(s => ({
          goals: s.goals.map(g =>
            g.id === id
              ? { ...g, current: Math.max(0, g.current - (g.step ?? 1)), updatedAt: new Date().toISOString() }
              : g,
          ),
        })),
    }),
    { name: 'cynera-private-goals-v1' },
  )
)
