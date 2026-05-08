import { create } from 'zustand'
import { NoteService } from '@/services/note.service'
import { log } from '@/lib/logger'
import type { Note, UpsertNotePayload } from '@/types/note.types'
import type { AppError } from '@/types/error.types'
import { isAppError, formatError } from '@/types/error.types'

interface NotesState {
  notes: Note[]
  isLoading: boolean
  error: AppError | null
  loadForCustomer: (customerId: string) => Promise<void>
  upsert: (payload: UpsertNotePayload) => Promise<void>
  remove: (id: string) => Promise<void>
}

function upsertById(list: Note[], updated: Note): Note[] {
  const idx = list.findIndex(n => n.id === updated.id)
  if (idx >= 0) { const next = [...list]; next[idx] = updated; return next }
  return [...list, updated]
}

export const useNotesStore = create<NotesState>()((set) => ({
  notes: [],
  isLoading: false,
  error: null,

  loadForCustomer: async (customerId) => {
    set({ isLoading: true, error: null })
    try {
      const notes = await NoteService.getByCustomer(customerId)
      set({ notes, isLoading: false })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
      log.error('Failed to load notes', { error })
    }
  },

  upsert: async (payload) => {
    try {
      const updated = await NoteService.upsert(payload)
      set(s => ({ notes: upsertById(s.notes, updated) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  remove: async (id) => {
    try {
      await NoteService.delete(id)
      set(s => ({ notes: s.notes.filter(n => n.id !== id) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },
}))
