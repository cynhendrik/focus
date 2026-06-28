import { describe, it, expect } from 'vitest'
import { messageRowToMessage } from './messages.mapper'

const row = {
  id: 'm1', workspace_id: 'ws1', created_by: 'u1', kind: 'user',
  body: 'hallo', system_event: null, ref_type: 'task', ref_id: 't1',
  visibility: 'internal', mentions: ['u2'], created_at: 'T1', updated_at: 'T1', deleted_at: null,
}

describe('messageRowToMessage', () => {
  it('maps snake_case to camelCase', () => {
    const m = messageRowToMessage(row)
    expect(m.id).toBe('m1')
    expect(m.workspaceId).toBe('ws1')
    expect(m.createdBy).toBe('u1')
    expect(m.refType).toBe('task')
    expect(m.refId).toBe('t1')
  })
  it('mentions as jsonb array stays array', () => {
    expect(messageRowToMessage(row).mentions).toEqual(['u2'])
  })
  it('mentions as JSON string parses to array', () => {
    expect(messageRowToMessage({ ...row, mentions: '["u2","u3"]' }).mentions).toEqual(['u2', 'u3'])
  })
  it('null-ish fields default safely', () => {
    const m = messageRowToMessage({ ...row, system_event: null, ref_type: null, ref_id: null, visibility: null, deleted_at: null, body: null })
    expect(m.systemEvent).toBeNull()
    expect(m.refType).toBeNull()
    expect(m.visibility).toBe('internal')
    expect(m.body).toBe('')
  })
})

describe('messageRowToMessage conversationId', () => {
  it('maps conversation_id', () => {
    expect(messageRowToMessage({ id: 'm1', conversation_id: 'c1', mentions: [] }).conversationId).toBe('c1')
  })
  it('null when absent (team)', () => {
    expect(messageRowToMessage({ id: 'm1', mentions: [] }).conversationId).toBeNull()
  })
})
