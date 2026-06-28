import { supabase } from '@/lib/supabase'
import { useWorkspaceStore } from '@/store/workspace.store'
import { messageRowToMessage } from './messages.mapper'
import type { Message, CreateMessagePayload } from '@/types/message.types'

// Team-/Cloud-Modus-Guard — identisch zu notes-module.gateway.ts (lokaler Helper, nicht exportiert).
function shared(): boolean { return useWorkspaceStore.getState().isActiveWorkspaceShared() }

function fail(error: { message: string }): never { throw new Error(error.message) }

const PAGE = 50

export const MessagesGateway = {
  /** Neueste Nachrichten, chronologisch aufsteigend zurückgegeben. Cloud-only. */
  async listRecent(workspaceId: string, conversationId: string | null = null, limit = PAGE): Promise<Message[]> {
    if (!shared()) return []
    let q = supabase.from('messages').select('*').eq('workspace_id', workspaceId).is('deleted_at', null)
    q = conversationId === null ? q.is('conversation_id', null) : q.eq('conversation_id', conversationId)
    const { data, error } = await q.order('created_at', { ascending: false }).limit(limit)
    if (error) fail(error)
    return (data ?? []).map(messageRowToMessage).reverse()
  },

  /** Ältere Seite (Keyset) vor einem created_at; chronologisch aufsteigend. */
  async listBefore(workspaceId: string, beforeCreatedAt: string, conversationId: string | null = null, limit = PAGE): Promise<Message[]> {
    if (!shared()) return []
    let q = supabase.from('messages').select('*').eq('workspace_id', workspaceId).is('deleted_at', null).lt('created_at', beforeCreatedAt)
    q = conversationId === null ? q.is('conversation_id', null) : q.eq('conversation_id', conversationId)
    const { data, error } = await q.order('created_at', { ascending: false }).limit(limit)
    if (error) fail(error)
    return (data ?? []).map(messageRowToMessage).reverse()
  },

  /** User-Nachricht senden. Trigger fächert Notifications auf. */
  async create(payload: CreateMessagePayload): Promise<Message> {
    const row = {
      id: crypto.randomUUID(),
      workspace_id:    payload.workspaceId,
      created_by:      payload.createdBy,
      kind:            'user' as const,
      body:            payload.body,
      ref_type:        payload.refType ?? null,
      ref_id:          payload.refId ?? null,
      mentions:        payload.mentions ?? [],
      conversation_id: payload.conversationId ?? null,
    }
    const { data, error } = await supabase.from('messages').insert(row).select('*').single()
    if (error) fail(error)
    return messageRowToMessage(data)
  },

  async softDelete(id: string): Promise<void> {
    const { error } = await supabase
      .from('messages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    if (error) fail(error)
  },
}
