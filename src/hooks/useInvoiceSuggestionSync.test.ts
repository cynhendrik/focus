import { describe, it, expect } from 'vitest'
import { shouldCreateInvoiceTask } from './useInvoiceSuggestionSync'
import type { Todo } from '@/types/todo.types'
import type { Invoice } from '@/types/finance.types'

function makeInvoice(p: Partial<Invoice> & { id: string }): Invoice {
  return {
    id: p.id, workspaceId: 'ws1', createdBy: 'u1',
    accountId: p.accountId ?? 'acc1', date: '2026-01-01',
    dueDate: '2026-02-01', status: 'draft', taxMode: 'standard',
    subtotal: 1000, taxAmount: 190, total: p.total ?? 1190,
    bankInfo: '', isSuggestion: p.isSuggestion ?? true,
    approvedBy: p.approvedBy, pendingSync: false,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    ...p,
  }
}

function makeTodo(p: Partial<Todo> & { id: string }): Todo {
  return {
    id: p.id, title: 'x', status: p.status ?? 'open',
    priority: 'p2', bucket: 'today', checklist: [], tags: [],
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    ...p,
  }
}

describe('shouldCreateInvoiceTask', () => {
  it('returns true for unapproved suggestion with no existing task', () => {
    expect(shouldCreateInvoiceTask(makeInvoice({ id: 'inv1' }), [])).toBe(true)
  })

  it('returns false when not a suggestion', () => {
    expect(shouldCreateInvoiceTask(makeInvoice({ id: 'inv1', isSuggestion: false }), [])).toBe(false)
  })

  it('returns false when already approved', () => {
    expect(shouldCreateInvoiceTask(makeInvoice({ id: 'inv1', approvedBy: 'user1' }), [])).toBe(false)
  })

  it('returns false when open task already exists', () => {
    const task = makeTodo({ id: 't1', sourceRef: 'inv1', status: 'open' })
    expect(shouldCreateInvoiceTask(makeInvoice({ id: 'inv1' }), [task])).toBe(false)
  })

  it('returns true when existing task is done', () => {
    const doneTask = makeTodo({ id: 't1', sourceRef: 'inv1', status: 'done' })
    expect(shouldCreateInvoiceTask(makeInvoice({ id: 'inv1' }), [doneTask])).toBe(true)
  })
})
