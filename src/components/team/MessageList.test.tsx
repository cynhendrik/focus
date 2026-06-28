import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { useMessagesStore, emptyThread } from '@/store/messages.store'
import { useAuthStore } from '@/store/auth.store'
import { useMembersStore } from '@/store/members.store'
import { MessageList } from './MessageList'

beforeEach(() => {
  // jsdom does not implement scrollIntoView
  Element.prototype.scrollIntoView = vi.fn()
  useAuthStore.setState({ user: { id: 'me' } as any })
  useMembersStore.setState({ profiles: { me: { id: 'me', displayName: 'Ich', email: null }, p1: { id: 'p1', displayName: 'Peer', email: null } }, memberIds: ['me','p1'] })
  useMessagesStore.setState({ threads: {
    team: { ...emptyThread(), messages: [{ id: 't1', workspaceId: 'ws1', createdBy: 'p1', conversationId: null, body: 'team-hi', kind: 'user', mentions: [], systemEvent: null, refType: null, refId: null, visibility: 'internal', createdAt: '2026-01-01 00:00:00+00', updatedAt: '2026-01-01 00:00:00+00', deletedAt: null }] },
    c1:   { ...emptyThread(), messages: [{ id: 'd1', workspaceId: 'ws1', createdBy: 'p1', conversationId: 'c1', body: 'dm-hi', kind: 'user', mentions: [], systemEvent: null, refType: null, refId: null, visibility: 'internal', createdAt: '2026-01-01 00:00:00+00', updatedAt: '2026-01-01 00:00:00+00', deletedAt: null }] },
  }, conversations: [], unreadTeam: 0 })
})
afterEach(cleanup)

describe('MessageList thread-scoping', () => {
  it('renders the team thread by default', () => {
    render(<MessageList />)
    expect(screen.getByText('team-hi')).toBeTruthy()
    expect(screen.queryByText('dm-hi')).toBeNull()
  })
  it('renders the dm thread when threadKey is set', () => {
    render(<MessageList threadKey="c1" />)
    expect(screen.getByText('dm-hi')).toBeTruthy()
    expect(screen.queryByText('team-hi')).toBeNull()
  })
})
