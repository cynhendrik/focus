import { describe, it, expect } from 'vitest'
import { sortFocus, isToday, groupFocusByCustomer } from './useFocusStack'
import type { Todo } from '@/types/todo.types'
import type { Account } from '@/types/account.types'

function makeTodo(p: Partial<Todo> & { id: string }): Todo {
  return {
    id: p.id,
    title: 'x',
    status: 'open',
    priority: 'p3',
    bucket: 'today',
    checklist: [],
    tags: [],
    createdAt: '2026-05-30T00:00:00',
    updatedAt: '2026-05-30T00:00:00',
    ...p,
  }
}

describe('sortFocus', () => {
  it('sorts p1 before p2', () => {
    const a = makeTodo({ id: 'a', priority: 'p2' })
    const b = makeTodo({ id: 'b', priority: 'p1' })
    expect([a, b].sort(sortFocus).map(t => t.id)).toEqual(['b', 'a'])
  })

  it('sorts within same priority by scheduledAt asc', () => {
    const a = makeTodo({ id: 'a', priority: 'p2', scheduledAt: '2026-05-30T15:00' })
    const b = makeTodo({ id: 'b', priority: 'p2', scheduledAt: '2026-05-30T09:00' })
    expect([a, b].sort(sortFocus).map(t => t.id)).toEqual(['b', 'a'])
  })

  it('falls back to createdAt when scheduledAt equal', () => {
    const a = makeTodo({ id: 'a', priority: 'p2', createdAt: '2026-05-30T10:00' })
    const b = makeTodo({ id: 'b', priority: 'p2', createdAt: '2026-05-30T09:00' })
    expect([a, b].sort(sortFocus).map(t => t.id)).toEqual(['b', 'a'])
  })
})

describe('isToday', () => {
  it('returns true when bucket is today', () => {
    expect(isToday(makeTodo({ id: 'a', bucket: 'today' }))).toBe(true)
  })

  it('returns true when bucket is in_progress', () => {
    expect(isToday(makeTodo({ id: 'a', bucket: 'in_progress' }))).toBe(true)
  })

  it('returns true when scheduledAt is today', () => {
    const todayIso = new Date().toISOString()
    expect(isToday(makeTodo({ id: 'a', bucket: 'backlog', scheduledAt: todayIso }))).toBe(true)
  })

  it('returns false when bucket is backlog without scheduledAt today', () => {
    expect(isToday(makeTodo({ id: 'a', bucket: 'backlog' }))).toBe(false)
  })
})

function makeAccount(id: string, name: string): Account {
  return {
    id, name, workspaceId: 'w1', createdBy: 'u1',
    kind: 'company', status: 'aktiv', priority: 'normal',
    tags: [], goals: [], isPrivate: false,
    socialLinks: '', leadScore: 0, scoreFactors: {},
    createdAt: '2026-01-01T00:00:00', updatedAt: '2026-01-01T00:00:00',
  }
}

describe('groupFocusByCustomer', () => {
  it('groups tasks by customerId', () => {
    const tasks = [
      makeTodo({ id: 'a', customerId: 'c1' }),
      makeTodo({ id: 'b', customerId: 'c2' }),
      makeTodo({ id: 'c', customerId: 'c1' }),
    ]
    const accounts = [makeAccount('c1', 'Acme'), makeAccount('c2', 'Beta')]
    const groups = groupFocusByCustomer(tasks, accounts)
    expect(groups.map(g => g.customerId)).toContain('c1')
    expect(groups.find(g => g.customerId === 'c1')?.tasks).toHaveLength(2)
    expect(groups.find(g => g.customerId === 'c2')?.tasks).toHaveLength(1)
  })

  it('puts send_reminder tasks as critical urgency', () => {
    const tasks = [makeTodo({ id: 'a', customerId: 'c1', actionType: 'send_reminder' })]
    const groups = groupFocusByCustomer(tasks, [makeAccount('c1', 'Acme')])
    expect(groups[0].urgency).toBe('critical')
  })

  it('sorts critical before normal', () => {
    const tasks = [
      makeTodo({ id: 'a', customerId: 'c1', priority: 'p3' }),
      makeTodo({ id: 'b', customerId: 'c2', actionType: 'send_reminder' }),
    ]
    const accounts = [makeAccount('c1', 'Acme'), makeAccount('c2', 'Beta')]
    const groups = groupFocusByCustomer(tasks, accounts)
    expect(groups[0].customerId).toBe('c2')
  })

  it('uses "Allgemein" for tasks without customerId', () => {
    const tasks = [makeTodo({ id: 'a' })]
    const groups = groupFocusByCustomer(tasks, [])
    expect(groups[0].customerId).toBeNull()
    expect(groups[0].customerName).toBe('Allgemein')
  })
})
