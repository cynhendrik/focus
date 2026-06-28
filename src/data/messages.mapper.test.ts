import { describe, it, expect } from 'vitest'
import { messageRowToMessage } from './messages.mapper'

describe('messageRowToMessage conversationId', () => {
  it('maps conversation_id', () => {
    expect(messageRowToMessage({ id: 'm1', conversation_id: 'c1', mentions: [] }).conversationId).toBe('c1')
  })
  it('null when absent (team)', () => {
    expect(messageRowToMessage({ id: 'm1', mentions: [] }).conversationId).toBeNull()
  })
})
