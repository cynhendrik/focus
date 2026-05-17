import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface NoteBook {
  id: string
  customerId: string
  name: string
  createdAt: string
}

export interface NoteEntry {
  id: string
  bookId: string
  customerId: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
}

interface NotebookState {
  books: NoteBook[]
  entries: NoteEntry[]
  addBook: (customerId: string, name: string) => string
  renameBook: (id: string, name: string) => void
  removeBook: (id: string) => void
  addEntry: (bookId: string, customerId: string, title: string) => string
  updateEntry: (id: string, changes: Partial<Pick<NoteEntry, 'title' | 'content'>>) => void
  removeEntry: (id: string) => void
}

export const useNotebookStore = create<NotebookState>()(
  persist(
    (set) => ({
      books: [],
      entries: [],

      addBook: (customerId, name) => {
        const id = crypto.randomUUID()
        set(s => ({ books: [...s.books, { id, customerId, name, createdAt: new Date().toISOString() }] }))
        return id
      },

      renameBook: (id, name) =>
        set(s => ({ books: s.books.map(b => b.id === id ? { ...b, name } : b) })),

      removeBook: (id) =>
        set(s => ({
          books: s.books.filter(b => b.id !== id),
          entries: s.entries.filter(e => e.bookId !== id),
        })),

      addEntry: (bookId, customerId, title) => {
        const id = crypto.randomUUID()
        const now = new Date().toISOString()
        set(s => ({ entries: [...s.entries, { id, bookId, customerId, title, content: '', createdAt: now, updatedAt: now }] }))
        return id
      },

      updateEntry: (id, changes) => {
        const now = new Date().toISOString()
        set(s => ({ entries: s.entries.map(e => e.id === id ? { ...e, ...changes, updatedAt: now } : e) }))
      },

      removeEntry: (id) =>
        set(s => ({ entries: s.entries.filter(e => e.id !== id) })),
    }),
    { name: 'notebook-v1' }
  )
)
