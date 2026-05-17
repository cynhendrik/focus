import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { FocusTodo, FocusBucket } from '@/types/focus.types'

const SAMPLE: FocusTodo[] = [
  { id: 'f1', title: 'Angebot finalisieren',       customer: 'TechCorp',    notes: 'Preisanpassung besprechen',     when: 'today' },
  { id: 'f2', title: 'Onboarding-Call vorbereiten', customer: 'Muster GmbH', notes: 'Agenda + Unterlagen bereit',    when: 'today' },
  { id: 'f3', title: 'Rechnung Q1 prüfen',          customer: 'WebAgency',   notes: 'Alle Posten kontrollieren',     when: 'tomorrow' },
  { id: 'f4', title: 'Produktdemo erstellen',        customer: 'StartupXY',   notes: '',                             when: 'this_week' },
  { id: 'f5', title: 'Newsletter schreiben',         customer: '',            notes: 'Fokus auf neues Feature',      when: 'this_week' },
  { id: 'f6', title: 'Vertrag verlängern',           customer: 'BigCo',       notes: 'Vor Ablauf kontaktieren',      when: 'later' },
  { id: 'f7', title: 'Team-Retrospektive planen',    customer: '',            notes: '',                             when: 'later' },
]

interface FocusState {
  todos: FocusTodo[]
  add:  (todo: Omit<FocusTodo, 'id'>) => void
  move: (id: string, when: FocusBucket) => void
  remove: (id: string) => void
}

export const useFocusStore = create<FocusState>()(
  persist(
    (set) => ({
      todos: SAMPLE,

      add: (todo) =>
        set(s => ({ todos: [...s.todos, { ...todo, id: crypto.randomUUID() }] })),

      move: (id, when) =>
        set(s => ({ todos: s.todos.map(t => t.id === id ? { ...t, when } : t) })),

      remove: (id) =>
        set(s => ({ todos: s.todos.filter(t => t.id !== id) })),
    }),
    { name: 'focus-todos-v1' }
  )
)
