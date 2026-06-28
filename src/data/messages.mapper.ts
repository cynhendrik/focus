import type { Message } from '@/types/message.types'

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[]
  if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : [] } catch { return [] } }
  return []
}

/** Supabase-`messages`-Zeile (mentions = jsonb) → Message. */
export function messageRowToMessage(r: any): Message {
  return {
    id:          r.id,
    workspaceId: r.workspace_id,
    createdBy:   r.created_by,
    kind:        r.kind,
    body:        r.body ?? '',
    systemEvent: r.system_event ?? null,
    refType:     r.ref_type ?? null,
    refId:       r.ref_id ?? null,
    visibility:  r.visibility ?? 'internal',
    mentions:    asStringArray(r.mentions),
    conversationId: r.conversation_id ?? null,
    createdAt:   r.created_at,
    updatedAt:   r.updated_at,
    deletedAt:   r.deleted_at ?? null,
  }
}
