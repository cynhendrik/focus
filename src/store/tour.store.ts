import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Anzahl der Tour-Stopps (Dashboard → Kunde → Finanzen → Leads → KORA). */
export const TOUR_STEP_COUNT = 5

interface TourState {
  active: boolean
  step: number
  seen: boolean
  offer: () => void
  start: () => void
  next: () => void
  prev: () => void
  skip: () => void
  finish: () => void
}

export const useTourStore = create<TourState>()(
  persist(
    (set, get) => ({
      active: false,
      step: 0,
      seen: false,
      offer: () => { /* Anzeige steuert TourOfferCard über `seen`; no-op-Platzhalter für künftige Trigger */ },
      start: () => set({ active: true, step: 0 }),
      next: () => set({ step: Math.min(TOUR_STEP_COUNT - 1, get().step + 1) }),
      prev: () => set({ step: Math.max(0, get().step - 1) }),
      skip: () => set({ active: false, seen: true }),
      finish: () => set({ active: false, seen: true }),
    }),
    { name: 'focus-tour-v1', partialize: (s) => ({ seen: s.seen }) },
  ),
)
