import { describe, it, expect } from 'vitest'
import { groupNotifications, loudUnreadCount } from './inbox-grouping'
import type { Notification } from '@/types/notification.types'

const mk = (id: string, type: Notification['type'], refId: string, readAt: string | null = null): Notification => ({
  id, workspaceId: 'ws1', userId: 'u2', type, actorId: 'u1',
  refType: type === 'assigned' || type === 'completed' ? 'task' : 'message',
  refId, messageId: 'm-' + id, readAt, createdAt: 'T' + id,
})

describe('groupNotifications', () => {
  it('groups comment/mention by refId; priority order assigned→mention→comment→completed', () => {
    const { byType, order } = groupNotifications([
      mk('1', 'comment', 'taskA'), mk('2', 'comment', 'taskA'),
      mk('3', 'assigned', 'taskB'), mk('4', 'mention', 'msgC'),
    ])
    expect(order).toEqual(['assigned', 'mention', 'comment', 'completed'])
    expect(byType.comment).toHaveLength(1)        // taskA zusammengefasst
    expect(byType.comment[0].items).toHaveLength(2)
    expect(byType.assigned[0].items).toHaveLength(1)
  })
})

describe('loudUnreadCount', () => {
  it('counts only unread assigned + mention', () => {
    const list = [mk('1', 'assigned', 'a'), mk('2', 'mention', 'b'), mk('3', 'comment', 'c'), mk('4', 'completed', 'd'), mk('5', 'assigned', 'e', 'TX')]
    expect(loudUnreadCount(list)).toBe(2)
  })
})
