import { describe, it, expect } from 'vitest'
import { shouldCreateReminderTask } from './useOverdueTaskSync'
import type { Todo } from '@/types/todo.types'
import type { Invoice } from '@/types/finance.types'

function makeInvoice(p: Partial<Invoice> & { id: string }): Invoice {
  return {
    id: p.id,
    workspaceId: 'ws1',
    createdBy: 'u1',
    accountId: p.accountId ?? 'acc1',
    date: '2026-01-01',
    dueDate: p.dueDate ?? '2026-04-01',
    status: p.status ?? 'overdue',
    taxMode: 'standard',
    subtotal: 1000,
    taxAmount: 190,
    total: p.total ?? 1190,
    bankInfo: '',
    isSuggestion: false,
    pendingSync: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...p,
  }
}

function makeTodo(p: Partial<Todo> & { id: string }): Todo {
  return {
    id: p.id,
    title: 'x',
    status: p.status ?? 'open',
    priority: 'p1',
    bucket: 'today',
    checklist: [],
    tags: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...p,
  }
}

describe('shouldCreateReminderTask', () => {
  it('returns true when no existing task for that invoice', () => {
    const invoice = makeInvoice({ id: 'inv1' })
    expect(shouldCreateReminderTask(invoice, [])).toBe(true)
  })

  it('returns false when an open task already references the invoice', () => {
    const invoice = makeInvoice({ id: 'inv1' })
    const task = makeTodo({ id: 't1', sourceRef: 'inv1', status: 'open' })
    expect(shouldCreateReminderTask(invoice, [task])).toBe(false)
  })

  it('returns true when existing task is done (reminder can be re-sent)', () => {
    const invoice = makeInvoice({ id: 'inv1' })
    const doneTask = makeTodo({ id: 't1', sourceRef: 'inv1', status: 'done' })
    expect(shouldCreateReminderTask(invoice, [doneTask])).toBe(true)
  })

  it('returns false for non-overdue invoice', () => {
    const invoice = makeInvoice({ id: 'inv1', status: 'open' })
    expect(shouldCreateReminderTask(invoice, [])).toBe(false)
  })
})
