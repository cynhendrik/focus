import { describe, it, expect } from 'vitest'
import { notificationRowToNotification } from './notifications.mapper'

const row = {
  id: 'n1', workspace_id: 'ws1', user_id: 'u2', type: 'assigned',
  actor_id: 'u1', ref_type: 'task', ref_id: 't1', message_id: 'm1',
  read_at: null, created_at: 'T1',
}

describe('notificationRowToNotification', () => {
  it('maps snake_case to camelCase', () => {
    const n = notificationRowToNotification(row)
    expect(n.id).toBe('n1')
    expect(n.userId).toBe('u2')
    expect(n.actorId).toBe('u1')
    expect(n.type).toBe('assigned')
    expect(n.messageId).toBe('m1')
  })
  it('unread when read_at null', () => {
    expect(notificationRowToNotification(row).readAt).toBeNull()
  })
  it('null message_id defaults to null', () => {
    expect(notificationRowToNotification({ ...row, message_id: null }).messageId).toBeNull()
  })
})

describe('notificationRowToNotification conversationId', () => {
  it('maps conversation_id + dm type', () => {
    const n = notificationRowToNotification({ id: 'n1', type: 'dm', conversation_id: 'c1', ref_type: 'message', ref_id: 'm1' })
    expect(n.conversationId).toBe('c1'); expect(n.type).toBe('dm')
  })
  it('null conversationId when absent', () => {
    expect(notificationRowToNotification({ id: 'n1', type: 'mention', ref_type: 'message', ref_id: 'm1' }).conversationId).toBeNull()
  })
})
