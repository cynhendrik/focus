import { describe, it, expect, beforeEach } from 'vitest'
import { useNotificationsStore } from './notifications.store'
import type { Notification } from '@/types/notification.types'

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
