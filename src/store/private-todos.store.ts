// ─────────────────────────────────────────────────────────────────────────────
// Privat-Todos — drei Buckets: Heute / Diese Woche / Irgendwann.
// Strikt getrennt von Business-Tasks (kein customerId, kein Deal).
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type PrivateTodoBucket = 'heute' | 'diese_woche' | 'irgendwann'

export const BUCKET_LABEL: Record<PrivateTodoBucket, string> = {
  heute:       'Heute',
  diese_woche: 'Diese Woche',
  irgendwann:  'Irgendwann',
}

export interface PrivateTodo {
  id:        string
  bucket:    PrivateTodoBucket
  text:      string
  done:      boolean
  createdAt: string
  doneAt?:   string
}

interface State {
  todos: PrivateTodo[]
  add:      (bucket: PrivateTodoBucket, text: string) => string
  toggle:   (id: string) => void
  remove:   (id: string) => void
  move:     (id: string, bucket: PrivateTodoBucket) => void
  rename:   (id: string, text: string) => void
}

const uid = () => `pt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

export const usePrivateTodosStore = create<State>()(
  persist(
    (set) => ({
      todos: [],
      add: (bucket, text) => {
        const todo: PrivateTodo = {
          id: uid(),
          bucket,
          text: text.trim(),
          done: false,
          createdAt: new Date().toISOString(),
        }
        set(s => ({ todos: [...s.todos, todo] }))
        return todo.id
      },
      toggle: (id) =>
        set(s => ({
          todos: s.todos.map(t =>
            t.id === id
              ? { ...t, done: !t.done, doneAt: !t.done ? new Date().toISOString() : undefined }
              : t,
          ),
        })),
      remove: (id) => set(s => ({ todos: s.todos.filter(t => t.id !== id) })),
      move: (id, bucket) =>
        set(s => ({ todos: s.todos.map(t => t.id === id ? { ...t, bucket } : t) })),
      rename: (id, text) =>
        set(s => ({ todos: s.todos.map(t => t.id === id ? { ...t, text } : t) })),
    }),
    { name: 'cynera-private-todos-v1' },
  )
)
