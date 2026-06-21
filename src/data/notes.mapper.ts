import type { Activity, CreateActivityPayload } from '@/types/pipeline.types'
import type { Note, UpsertNotePayload } from '@/types/note.types'

/** Activity (type='note') → Note-View. */
export function activityToNote(a: Activity): Note {
  let noteType: Note['noteType'] = 'gespraech'
  let waitingReply = false
  let pinned = false
  try {
    const p = JSON.parse(a.payload ?? '{}')
    noteType = p.note_type ?? 'gespraech'
    waitingReply = p.waiting_reply ?? false
    pinned = p.pinned ?? false
  } catch { /* defaults */ }
  return {
    id: a.id, customerId: a.accountId ?? '', title: a.title ?? '', content: a.body ?? '',
    pinned, noteType, waitingReply, createdAt: a.createdAt, updatedAt: a.updatedAt,
  }
}

/** UpsertNotePayload → CreateActivityPayload (type='note'). */
export function notePayloadToActivityPayload(
  p: UpsertNotePayload, ctx: { workspaceId: string; createdBy: string },
): CreateActivityPayload {
  return {
    workspaceId: ctx.workspaceId, createdBy: ctx.createdBy, accountId: p.customerId,
    type: 'note', title: p.title, body: p.content ?? undefined,
    payload: JSON.stringify({
      note_type: p.noteType ?? 'gespraech',
      waiting_reply: p.waitingReply ?? false,
      pinned: p.pinned ?? false,
    }),
  }
}
