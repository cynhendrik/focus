import { invoke } from '@tauri-apps/api/core'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import type { Note, UpsertNotePayload } from '@/types/note.types'
import type { Activity } from '@/types/activity.types'

function activityToNote(a: Activity): Note {
  let noteType: Note['noteType'] = 'gespraech'
  let waitingReply = false
  let pinned = false
  try {
    const p = JSON.parse(a.payload)
    noteType = p.note_type ?? 'gespraech'
    waitingReply = p.waiting_reply ?? false
    pinned = p.pinned ?? false
  } catch {}
  return {
    id: a.id,
    customerId: a.accountId ?? '',
    title: a.title ?? '',
    content: a.body ?? '',
    pinned,
    noteType,
    waitingReply,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  }
}

export const NoteService = {
  async getByCustomer(customerId: string): Promise<Note[]> {
    const activities = await invoke<Activity[]>('get_activities_by_account', { accountId: customerId })
    return activities.filter(a => a.type === 'note').map(activityToNote)
  },

  async upsert(payload: UpsertNotePayload): Promise<Note> {
    const activityPayload = JSON.stringify({
      note_type: payload.noteType ?? 'gespraech',
      waiting_reply: payload.waitingReply ?? false,
      pinned: payload.pinned ?? false,
    })
    if (payload.id) {
      const updated = await invoke<Activity>('update_activity', {
        id: payload.id,
        payload: {
          title: payload.title,
          body: payload.content ?? null,
          payload: activityPayload,
        },
      })
      return activityToNote(updated)
    }
    const workspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? ''
    const createdBy = useAuthStore.getState().user?.id ?? ''
    const created = await invoke<Activity>('create_activity', {
      payload: {
        accountId: payload.customerId,
        workspaceId,
        createdBy,
        type: 'note',
        title: payload.title,
        body: payload.content ?? null,
        payload: activityPayload,
      },
    })
    return activityToNote(created)
  },

  delete(id: string): Promise<void> {
    return invoke<void>('delete_activity', { id })
  },
}
