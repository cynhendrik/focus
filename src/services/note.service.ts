import { invoke } from '@tauri-apps/api/core'
import type { Note, UpsertNotePayload } from '@/types/note.types'

export const NoteService = {
  getByCustomer(customerId: string): Promise<Note[]> {
    return invoke<Note[]>('get_notes', { customerId })
  },
  upsert(payload: UpsertNotePayload): Promise<Note> {
    return invoke<Note>('upsert_note', { payload })
  },
  delete(id: string): Promise<void> {
    return invoke<void>('delete_note', { id })
  },
}
