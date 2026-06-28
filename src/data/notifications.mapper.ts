import type { Notification } from '@/types/notification.types'

/** Supabase-`notifications`-Zeile → Notification. */
export function notificationRowToNotification(r: any): Notification {
  return {
    id:          r.id,
    workspaceId: r.workspace_id,
    userId:      r.user_id,
    type:        r.type,
    actorId:     r.actor_id,
    refType:     r.ref_type,
    refId:       r.ref_id,
    messageId:   r.message_id ?? null,
    conversationId: r.conversation_id ?? null,
    readAt:      r.read_at ?? null,
    createdAt:   r.created_at,
  }
}
