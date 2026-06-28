import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

const closeMock = vi.fn()
const openTaskMock = vi.fn()
const openChatMock = vi.fn()
vi.mock('@/store/chat-overlay.store', () => ({ useChatOverlayStore: Object.assign(
  (sel: any) => sel({ close: closeMock }), { getState: () => ({ close: closeMock }) }) }))
vi.mock('@/lib/chat/useOpenTask', () => ({ useOpenTask: () => openTaskMock }))
vi.mock('@/lib/open-chat', () => ({ openChat: (o: any) => openChatMock(o) }))

import { InboxPanel } from './InboxPanel'
import { useNotificationsStore } from '@/store/notifications.store'
import { useAuthStore } from '@/store/auth.store'
import { useMembersStore } from '@/store/members.store'

const notif = (over: any) => ({ id: 'n1', workspaceId: 'ws1', userId: 'me', type: 'dm', actorId: 'p1', refType: 'message', refId: 'm1', messageId: 'm1', conversationId: 'c1', readAt: null, createdAt: 't', ...over })

beforeEach(() => {
  closeMock.mockReset(); openTaskMock.mockReset(); openChatMock.mockReset()
  useAuthStore.setState({ user: { id: 'me' } as any })
  useMembersStore.setState({ profiles: { p1: { id: 'p1', displayName: 'Anna', email: null } }, memberIds: ['p1'] })
  useNotificationsStore.setState({ notifications: [], load: vi.fn(), markRead: vi.fn() } as any)
})
afterEach(cleanup)

describe('InboxPanel', () => {
  it('zeigt Inbox-Zero bei keinen ungelesenen', () => {
    render(<InboxPanel />)
    expect(screen.getByText(/Inbox Zero/)).toBeTruthy()
  })
  it('Task-Benachrichtigung: Klick → openTask + Kachel schließen', () => {
    useNotificationsStore.setState({ notifications: [notif({ type: 'assigned', refType: 'task', refId: 'task-7' })], load: vi.fn(), markRead: vi.fn() } as any)
    render(<InboxPanel />)
    fireEvent.click(screen.getByText('Anna'))
    expect(openTaskMock).toHaveBeenCalledWith('task-7')
    expect(closeMock).toHaveBeenCalled()
    expect(openChatMock).not.toHaveBeenCalled()
  })
  it('Nachrichten-Benachrichtigung: Klick → openChat (DM), Kachel bleibt offen', () => {
    useNotificationsStore.setState({ notifications: [notif({ type: 'dm', refType: 'message', conversationId: 'c1', actorId: 'p1', messageId: 'm1' })], load: vi.fn(), markRead: vi.fn() } as any)
    render(<InboxPanel />)
    fireEvent.click(screen.getByText('Anna'))
    expect(openChatMock).toHaveBeenCalledWith({ messageId: 'm1', conversationId: 'c1', peerId: 'p1' })
    expect(closeMock).not.toHaveBeenCalled()
  })
})
