import { describe, it, expect } from 'vitest'
import { parseHeuteQueue, staticHeuteQueue } from './heute-queue'
import type { CorraContextInput } from './corra-intelligence'

const emptyInput: CorraContextInput = {
  todos: [], invoices: [], emails: [], deals: [], calendarEvents: [], accounts: [],
}

describe('parseHeuteQueue', () => {
  it('parses valid JSON array', () => {
    const raw = JSON.stringify([
      { type: 'invoice_reminder', id: 'inv-1', reason: 'Überfällig' },
      { type: 'todo', id: 'todo-1', reason: 'P1' },
    ])
    const result = parseHeuteQueue(raw)
    expect(result).toHaveLength(2)
    expect(result[0].type).toBe('invoice_reminder')
    expect(result[0].id).toBe('inv-1')
  })

  it('handles fenced code block', () => {
    const raw = '```json\n[{"type":"todo","id":"t1","reason":"ok"}]\n```'
    expect(parseHeuteQueue(raw)).toHaveLength(1)
  })

  it('returns empty array on garbage input', () => {
    expect(parseHeuteQueue('not json at all')).toEqual([])
    expect(parseHeuteQueue('')).toEqual([])
    expect(parseHeuteQueue('"just a string"')).toEqual([])
  })

  it('filters items missing required fields', () => {
    const raw = JSON.stringify([
      { type: 'todo', id: 'ok', reason: 'fine' },
      { type: 'todo', id: 'missing-reason' },
      { id: 'missing-type', reason: 'x' },
    ])
    expect(parseHeuteQueue(raw)).toHaveLength(1)
  })

  it('caps at 10 items', () => {
    const raw = JSON.stringify(
      Array.from({ length: 15 }, (_, i) => ({ type: 'todo', id: `t${i}`, reason: 'x' }))
    )
    expect(parseHeuteQueue(raw)).toHaveLength(10)
  })
})

describe('staticHeuteQueue', () => {
  it('returns empty array for empty input', () => {
    expect(staticHeuteQueue(emptyInput)).toEqual([])
  })

  it('puts overdue invoices first', () => {
    const input: CorraContextInput = {
      ...emptyInput,
      invoices: [
        { id: 'inv-1', status: 'overdue', total: 1000, dueDate: '2026-05-01', accountId: 'a1', workspaceId: 'w', createdBy: 'u', date: '2026-04-01', taxMode: 'standard', subtotal: 1000, taxAmount: 0, bankInfo: '', isSuggestion: false, pendingSync: false, createdAt: '', updatedAt: '' },
      ],
      todos: [
        { id: 'todo-1', title: 'Task', status: 'open', priority: 'p1', bucket: 'today', checklist: [], tags: [], createdAt: '', updatedAt: '' },
      ],
    }
    const queue = staticHeuteQueue(input)
    expect(queue[0].type).toBe('invoice_reminder')
    expect(queue[0].id).toBe('inv-1')
  })

  it('maps todo actionType reply_mail to mail_reply', () => {
    const input: CorraContextInput = {
      ...emptyInput,
      todos: [
        { id: 'todo-mail', title: 'Mail beantworten', status: 'open', priority: 'p1', bucket: 'today', actionType: 'reply_mail', checklist: [], tags: [], createdAt: '', updatedAt: '' },
      ],
    }
    const queue = staticHeuteQueue(input)
    expect(queue[0].type).toBe('mail_reply')
  })
})
