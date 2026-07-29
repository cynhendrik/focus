import { describe, it, expect } from 'vitest'
import { isTodoForToday, computeOpenCount } from './due'
import type { Todo } from '@/types/todo.types'

const base: Todo = {
  id: 't', title: 'x', status: 'open', priority: 'p2', bucket: 'backlog',
  checklist: [], tags: [], createdAt: '', updatedAt: '',
}
const TODAY = '2026-07-01'

describe('isTodoForToday', () => {
  it('true for bucket today / in_progress', () => {
    expect(isTodoForToday({ ...base, bucket: 'today' }, TODAY)).toBe(true)
    expect(isTodoForToday({ ...base, bucket: 'in_progress' }, TODAY)).toBe(true)
  })

  it('true when dueDate is today even if bucket is backlog', () => {
    expect(isTodoForToday({ ...base, bucket: 'backlog', dueDate: TODAY }, TODAY)).toBe(true)
  })

  it('true when scheduledAt is today even if bucket is backlog (capture-bug)', () => {
    expect(isTodoForToday({ ...base, bucket: 'backlog', scheduledAt: `${TODAY}T09:00:00.000Z` }, TODAY)).toBe(true)
  })

  it('false when done', () => {
    expect(isTodoForToday({ ...base, bucket: 'today', status: 'done' }, TODAY)).toBe(false)
  })

  it('false for a backlog todo scheduled on another day', () => {
    expect(isTodoForToday({ ...base, bucket: 'backlog', scheduledAt: '2026-06-20T09:00:00.000Z' }, TODAY)).toBe(false)
  })
})

describe('computeOpenCount', () => {
  it('summiert ueberfaellige Rechnungen, ungelesene Mails und Heute-Todos', () => {
    expect(computeOpenCount(2, 3, 1)).toBe(6)
  })
  it('ist 0 wenn alles leer ist', () => {
    expect(computeOpenCount(0, 0, 0)).toBe(0)
  })
})
