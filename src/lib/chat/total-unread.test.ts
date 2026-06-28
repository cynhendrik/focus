import { describe, it, expect } from 'vitest'
import { totalUnread } from './total-unread'

describe('totalUnread', () => {
  it('sums team + conversation unread', () => {
    expect(totalUnread(2, [{ conversationId: 'c1', peerId: 'p', lastMessageAt: null, unreadCount: 3 }, { conversationId: 'c2', peerId: 'q', lastMessageAt: null, unreadCount: 1 }])).toBe(6)
  })
  it('zero when nothing unread', () => { expect(totalUnread(0, [])).toBe(0) })
})
