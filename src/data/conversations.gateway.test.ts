import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: any[]) => rpc(...a) } }))
vi.mock('@/store/workspace.store', () => ({ useWorkspaceStore: { getState: () => ({ isActiveWorkspaceShared: () => true }) } }))

import { ConversationsGateway } from './conversations.gateway'

beforeEach(() => { rpc.mockReset() })

describe('ConversationsGateway', () => {
  it('getOrCreateDm calls rpc and returns the id', async () => {
    rpc.mockResolvedValue({ data: 'conv-1', error: null })
    const id = await ConversationsGateway.getOrCreateDm('ws1', 'peer1')
    expect(rpc).toHaveBeenCalledWith('get_or_create_dm', { p_workspace: 'ws1', p_peer: 'peer1' })
    expect(id).toBe('conv-1')
  })
  it('overview maps the rpc jsonb', async () => {
    rpc.mockResolvedValue({ data: { teamUnread: 2, conversations: [{ conversationId: 'c1', peerId: 'p1', lastMessageAt: 't', unread: 3 }] }, error: null })
    const ov = await ConversationsGateway.overview('ws1')
    expect(ov.teamUnread).toBe(2)
    expect(ov.conversations[0]).toEqual({ conversationId: 'c1', peerId: 'p1', lastMessageAt: 't', unreadCount: 3 })
  })
})
