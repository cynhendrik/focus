import { describe, it, expect } from 'vitest'
import { notificationRowToNotification } from './notifications.mapper'

describe('notificationRowToNotification conversationId', () => {
  it('maps conversation_id + dm type', () => {
    const n = notificationRowToNotification({ id: 'n1', type: 'dm', conversation_id: 'c1', ref_type: 'message', ref_id: 'm1' })
    expect(n.conversationId).toBe('c1'); expect(n.type).toBe('dm')
  })
  it('null conversationId when absent', () => {
    expect(notificationRowToNotification({ id: 'n1', type: 'mention', ref_type: 'message', ref_id: 'm1' }).conversationId).toBeNull()
  })
})
