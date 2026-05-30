import { describe, it, expect } from 'vitest'
import { sortFocus, isToday } from './useFocusStack'
import type { Todo } from '@/types/todo.types'

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
