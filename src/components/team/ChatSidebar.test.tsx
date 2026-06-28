import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { ChatSidebar } from './ChatSidebar'
import { useChatOverlayStore } from '@/store/chat-overlay.store'
import { useMessagesStore } from '@/store/messages.store'
import { useMembersStore } from '@/store/members.store'
import { useAuthStore } from '@/store/auth.store'
import { useWorkspaceStore } from '@/store/workspace.store'

beforeEach(() => {
  useChatOverlayStore.setState({ open: true, selected: 'team' })
  useMembersStore.setState({ profiles: { me: { id: 'me', displayName: 'Ich', email: null }, p1: { id: 'p1', displayName: 'Anna Vogel', email: null } }, memberIds: ['me','p1'] })
  useAuthStore.setState({ user: { id: 'me' } as any })
  useWorkspaceStore.setState({ activeWorkspaceId: 'ws1' } as any)
  useMessagesStore.setState({ threads: {}, conversations: [{ conversationId: 'c1', peerId: 'p1', lastMessageAt: null, unreadCount: 2 }], unreadTeam: 0, getOrCreateDm: vi.fn().mockResolvedValue('c1') } as any)
})
afterEach(cleanup)

describe('ChatSidebar DMs', () => {
  it('zeigt Team + Mitglieder (ohne mich), kein "bald"', () => {
    render(<ChatSidebar />)
    expect(screen.getByText('Team')).toBeTruthy()
    expect(screen.getByText('Anna Vogel')).toBeTruthy()
    expect(screen.queryByText('Ich')).toBeNull()
    expect(screen.queryByText('bald')).toBeNull()
  })
  it('zeigt Ungelesen-Badge am Mitglied', () => {
    render(<ChatSidebar />)
    expect(screen.getByText('2')).toBeTruthy()
  })
  it('Klick auf Mitglied öffnet DM (getOrCreateDm + select)', async () => {
    const select = vi.fn(); useChatOverlayStore.setState({ select })
    render(<ChatSidebar />)
    fireEvent.click(screen.getByText('Anna Vogel'))
    await waitFor(() => expect(select).toHaveBeenCalledWith({ conversationId: 'c1', peerId: 'p1' }))
  })
})
