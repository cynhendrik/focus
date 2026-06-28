import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/data/messages.gateway', () => ({ MessagesGateway: {
  listRecent: vi.fn().mockResolvedValue([]), listBefore: vi.fn().mockResolvedValue([]),
  create: vi.fn(), softDelete: vi.fn(),
}}))
vi.mock('@/data/conversations.gateway', () => ({ ConversationsGateway: {
  getOrCreateDm: vi.fn(), overview: vi.fn().mockResolvedValue({ teamUnread: 0, conversations: [] }), markRead: vi.fn(),
}}))
vi.mock('@/store/chat-overlay.store', () => ({ useChatOverlayStore: { getState: () => ({ open: false, selected: 'team' }) } }))
vi.mock('@/store/auth.store', () => ({ useAuthStore: { getState: () => ({ user: { id: 'me' } }) } }))

import { useMessagesStore } from './messages.store'
import { MessagesGateway } from '@/data/messages.gateway'
import { ConversationsGateway } from '@/data/conversations.gateway'
import { TEAM_KEY } from '@/lib/chat/threads'

const msg = (id: string, over: any = {}) => ({ id, workspaceId: 'ws1', createdBy: 'peer', conversationId: null, createdAt: '2026-01-01 00:00:00+00', mentions: [], ...over })

beforeEach(() => {
  useMessagesStore.setState({ threads: {}, conversations: [], unreadTeam: 0 })
  vi.clearAllMocks()
})

describe('useMessagesStore threads', () => {
  it('loadThread fills the right key', async () => {
    ;(MessagesGateway.listRecent as any).mockResolvedValue([msg('m1')])
    await useMessagesStore.getState().loadThread('ws1', TEAM_KEY)
    expect(useMessagesStore.getState().threads[TEAM_KEY].messages.map(m => m.id)).toEqual(['m1'])
    expect(MessagesGateway.listRecent).toHaveBeenCalledWith('ws1', null, expect.any(Number))
  })

  it('loadThread for a dm passes the conversationId', async () => {
    await useMessagesStore.getState().loadThread('ws1', 'c1')
    expect(MessagesGateway.listRecent).toHaveBeenCalledWith('ws1', 'c1', expect.any(Number))
  })

  it('appendRealtime routes team vs dm', () => {
    useMessagesStore.getState().appendRealtime(msg('t1', { conversationId: null }))
    useMessagesStore.getState().appendRealtime(msg('d1', { conversationId: 'c1' }))
    expect(useMessagesStore.getState().threads[TEAM_KEY]?.messages.map(m => m.id)).toEqual(['t1'])
    expect(useMessagesStore.getState().threads['c1']?.messages.map(m => m.id)).toEqual(['d1'])
  })

  it('appendRealtime on an unviewed dm increments its unread + adds a conversation entry', () => {
    useMessagesStore.getState().appendRealtime(msg('d1', { conversationId: 'c1', createdBy: 'peer' }))
    const conv = useMessagesStore.getState().conversations.find(c => c.conversationId === 'c1')
    expect(conv?.unreadCount).toBe(1)
    expect(conv?.peerId).toBe('peer')
  })

  it('appendRealtime on the team stream (unviewed) increments unreadTeam', () => {
    useMessagesStore.getState().appendRealtime(msg('t1', { conversationId: null, createdBy: 'peer' }))
    expect(useMessagesStore.getState().unreadTeam).toBe(1)
  })

  it('own messages never count as unread', () => {
    useMessagesStore.getState().appendRealtime(msg('t1', { conversationId: null, createdBy: 'me' }))
    expect(useMessagesStore.getState().unreadTeam).toBe(0)
  })

  it('markRead zeroes the counter and calls the gateway', async () => {
    useMessagesStore.setState({ unreadTeam: 5 })
    await useMessagesStore.getState().markRead('ws1', TEAM_KEY)
    expect(useMessagesStore.getState().unreadTeam).toBe(0)
    expect(ConversationsGateway.markRead).toHaveBeenCalledWith('ws1', TEAM_KEY)
  })

  it('send writes conversationId and appends', async () => {
    ;(MessagesGateway.create as any).mockResolvedValue(msg('s1', { conversationId: 'c1', createdBy: 'me' }))
    await useMessagesStore.getState().send({ workspaceId: 'ws1', createdBy: 'me', body: 'hi', conversationId: 'c1' })
    expect(MessagesGateway.create).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'c1' }))
    expect(useMessagesStore.getState().threads['c1'].messages.map(m => m.id)).toEqual(['s1'])
  })

  it('loadOverview sets conversations + unreadTeam', async () => {
    ;(ConversationsGateway.overview as any).mockResolvedValue({ teamUnread: 4, conversations: [{ conversationId: 'c1', peerId: 'p1', lastMessageAt: 't', unreadCount: 2 }] })
    await useMessagesStore.getState().loadOverview('ws1')
    expect(useMessagesStore.getState().unreadTeam).toBe(4)
    expect(useMessagesStore.getState().conversations[0].conversationId).toBe('c1')
  })
})
