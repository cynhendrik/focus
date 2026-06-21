import { create } from 'zustand'
import { ActivitiesGateway } from '@/data/activities.gateway'
import { activityToNote, notePayloadToActivityPayload } from '@/data/notes.mapper'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { log } from '@/lib/logger'
import type { Note, UpsertNotePayload } from '@/types/note.types'
import type { AppError } from '@/types/error.types'
import { isAppError, formatError } from '@/types/error.types'

interface NotesState {
  notes: Note[]
  currentCustomerId: string | null
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
  currentCustomerId: null,
  isLoading: false,
  error: null,

  loadForCustomer: async (customerId) => {
    set({ currentCustomerId: customerId, isLoading: true, error: null })
    try {
      const acts = await ActivitiesGateway.getByAccount(customerId)
      set({ notes: acts.filter(a => a.type === 'note').map(activityToNote), isLoading: false })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
      log.error('Failed to load notes', { error })
    }
  },

  upsert: async (payload) => {
    try {
      let updated: Note
      if (payload.id) {
        const activity = await ActivitiesGateway.update(payload.id, {
          title: payload.title,
          body: payload.content ?? undefined,
          payload: JSON.stringify({
            note_type: payload.noteType ?? 'gespraech',
            waiting_reply: payload.waitingReply ?? false,
            pinned: payload.pinned ?? false,
          }),
        })
        updated = activityToNote(activity)
      } else {
        const workspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? ''
        const createdBy = useAuthStore.getState().user?.id ?? ''
        const activity = await ActivitiesGateway.create(
          notePayloadToActivityPayload(payload, { workspaceId, createdBy }),
        )
        updated = activityToNote(activity)
      }
      set(s => ({ notes: upsertById(s.notes, updated) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  remove: async (id) => {
    try {
      await ActivitiesGateway.delete(id)
      set(s => ({ notes: s.notes.filter(n => n.id !== id) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },
}))
