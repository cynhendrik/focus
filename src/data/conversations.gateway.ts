import { supabase } from '@/lib/supabase'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { TEAM_KEY } from '@/lib/chat/threads'
import type { ChatOverview, ConversationSummary } from '@/types/conversation.types'

function shared(): boolean { return useWorkspaceStore.getState().isActiveWorkspaceShared() }
function fail(error: { message: string }): never { throw new Error(error.message) }

export const ConversationsGateway = {
  /** Findet/legt die 1:1-Unterhaltung mit peer an; gibt conversationId zurück. */
  async getOrCreateDm(workspaceId: string, peerId: string): Promise<string> {
    const { data, error } = await supabase.rpc('get_or_create_dm', { p_workspace: workspaceId, p_peer: peerId })
    if (error) fail(error)
    return data as string
  },

  /** Team-Ungelesen + DM-Liste (Peer, letzter Zeitstempel, Ungelesen). Cloud-only. */
  async overview(workspaceId: string): Promise<ChatOverview> {
    if (!shared()) return { teamUnread: 0, conversations: [] }
    const { data, error } = await supabase.rpc('chat_overview', { p_workspace: workspaceId })
    if (error) fail(error)
    const raw = (data ?? { teamUnread: 0, conversations: [] }) as any
    const conversations: ConversationSummary[] = (raw.conversations ?? []).map((c: any) => ({
      conversationId: c.conversationId,
      peerId:         c.peerId,
      lastMessageAt:  c.lastMessageAt ?? null,
      unreadCount:    c.unread ?? 0,
    }))
    return { teamUnread: raw.teamUnread ?? 0, conversations }
  },

  /** Markiert eine Unterhaltung (oder Team) als gelesen (last_read = jetzt). */
  async markRead(workspaceId: string, key: string): Promise<void> {
    if (!shared()) return
    const now = new Date().toISOString()
    if (key === TEAM_KEY) {
      const userId = useAuthStore.getState().user?.id
      if (!userId) return
      const { error } = await supabase.from('user_workspace_prefs')
        .upsert({ user_id: userId, workspace_id: workspaceId, team_last_read_at: now }, { onConflict: 'user_id,workspace_id' })
      if (error) fail(error)
    } else {
      const userId = useAuthStore.getState().user?.id
      if (!userId) return
      const { error } = await supabase.from('conversation_participants')
        .update({ last_read_at: now }).eq('conversation_id', key).eq('user_id', userId)
      if (error) fail(error)
    }
  },
}
