import { describe, it, expect } from 'vitest'
import { rawToPreparedItem, rowToPreparedItem, preparedItemToRow } from './prepared-items.mapper'

describe('prepared-items mapper', () => {
  it('parst das payload-JSON aus dem Tauri-Raw-Item', () => {
    const raw = {
      id: 'p1', workspaceId: 'ws', type: 'mahnung', sourceKind: 'invoice_reminder',
      sourceId: 'inv1:0', assignee: null, payload: '{"title":"T","why":"W","amount":100}',
      score: 1000, status: 'pending', snoozeUntil: null, ruleId: 'mahnung-l0',
      createdAt: 'a', updatedAt: 'b', approvedAt: null,
    }
    const item = rawToPreparedItem(raw as never)
    expect(item.payload.title).toBe('T')
    expect(item.payload.amount).toBe(100)
  })

  it('kaputtes payload-JSON faellt auf leeren Titel zurueck statt zu werfen', () => {
    const raw = { id: 'p1', workspaceId: 'ws', type: 'aufgabe', sourceKind: 'todo', sourceId: 't1',
      assignee: null, payload: '{broken', score: 0, status: 'pending', snoozeUntil: null,
      ruleId: 'r', createdAt: 'a', updatedAt: 'b', approvedAt: null }
    expect(rawToPreparedItem(raw as never).payload).toEqual({ title: '', why: '' })
  })

  it('Supabase-Row roundtrip (snake_case + jsonb)', () => {
    const row = {
      id: 'p1', workspace_id: 'ws', type: 'followup', source_kind: 'crm_follow_up',
      source_id: 'fu1', assignee: 'u1', payload: { title: 'T', why: 'W' },
      score: 800, status: 'pending', snooze_until: null, rule_id: 'followup-due',
      created_at: 'a', updated_at: 'b', approved_at: null,
    }
    const item = rowToPreparedItem(row as never)
    expect(item.workspaceId).toBe('ws')
    expect(item.payload.title).toBe('T')
    const back = preparedItemToRow(item)
    expect(back.source_kind).toBe('crm_follow_up')
    expect(back.payload).toEqual({ title: 'T', why: 'W' })
  })
})
