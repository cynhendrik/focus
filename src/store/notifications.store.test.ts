import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useNotificationsStore } from './notifications.store'
import type { Notification } from '@/types/notification.types'

vi.mock('@/services/notify.service', () => ({ notify: vi.fn() }))

const mk = (id: string, readAt: string | null = null): Notification => ({
  id, workspaceId: 'ws1', userId: 'u2', type: 'mention', actorId: 'u1',
  refType: 'message', refId: 'm1', messageId: 'm1', readAt, createdAt: 'T1',
})

describe('notifications.store', () => {
  beforeEach(() => useNotificationsStore.setState({ notifications: [] }))

  it('unreadCount counts only unread', () => {
    useNotificationsStore.setState({ notifications: [mk('a'), mk('b', 'T2'), mk('c')] })
    expect(useNotificationsStore.getState().unreadCount()).toBe(2)
  })

  it('upsertRealtime prepends new, replaces by id', () => {
    useNotificationsStore.setState({ notifications: [mk('a')] })
    useNotificationsStore.getState().upsertRealtime(mk('b'))
    expect(useNotificationsStore.getState().notifications.map(n => n.id)).toEqual(['b', 'a'])
    useNotificationsStore.getState().upsertRealtime(mk('a', 'T9'))
    expect(useNotificationsStore.getState().notifications.find(n => n.id === 'a')?.readAt).toBe('T9')
  })
})

describe('upsertRealtime → OS-Notification', () => {
  it('meldet ungelesene Team-Events an den Notify-Service', async () => {
    const { notify } = await import('@/services/notify.service')
    const { useNotificationsStore } = await import('./notifications.store')
    useNotificationsStore.getState().upsertRealtime({
      id: 'n1', workspaceId: 'ws', userId: 'u1', type: 'mention', actorId: 'u2',
      refType: 'task', refId: 't1', messageId: null, conversationId: null,
      readAt: null, createdAt: '2026-07-02T10:00:00Z',
    } as never)
    await Promise.resolve() // dynamischer Import auflösen
    await Promise.resolve()
    expect(vi.mocked(notify)).toHaveBeenCalledWith('team', 'Du wurdest erwähnt', 'In Cultera OS ansehen.')
  })

  it('meldet bereits gelesene Events NICHT', async () => {
    const { notify } = await import('@/services/notify.service')
    vi.mocked(notify).mockClear()
    const { useNotificationsStore } = await import('./notifications.store')
    useNotificationsStore.getState().upsertRealtime({
      id: 'n2', workspaceId: 'ws', userId: 'u1', type: 'dm', actorId: 'u2',
      refType: 'task', refId: 't1', messageId: null, conversationId: null,
      readAt: '2026-07-02T10:00:00Z', createdAt: '2026-07-02T10:00:00Z',
    } as never)
    await Promise.resolve()
    await Promise.resolve()
    expect(vi.mocked(notify)).not.toHaveBeenCalled()
  })
})
