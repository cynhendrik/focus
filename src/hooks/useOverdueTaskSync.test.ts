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

  it('returns false when an open send_reminder task already references the invoice', () => {
    const invoice = makeInvoice({ id: 'inv1' })
    const task = makeTodo({ id: 't1', sourceRef: 'inv1', status: 'open', actionType: 'send_reminder' })
    expect(shouldCreateReminderTask(invoice, [task])).toBe(false)
  })

  it('returns false when reminder was completed today (within 7-day cooldown)', () => {
    const invoice = makeInvoice({ id: 'inv1' })
    const todayIso = new Date().toISOString()
    const doneToday = makeTodo({ id: 't1', sourceRef: 'inv1', status: 'done', updatedAt: todayIso, actionType: 'send_reminder' })
    expect(shouldCreateReminderTask(invoice, [doneToday])).toBe(false)
  })

  it('returns false when reminder was completed yesterday (within 7-day cooldown)', () => {
    const invoice = makeInvoice({ id: 'inv1' })
    const yesterday = new Date(Date.now() - 86_400_000).toISOString()
    const doneYesterday = makeTodo({ id: 't1', sourceRef: 'inv1', status: 'done', updatedAt: yesterday, actionType: 'send_reminder' })
    // 1 day since first reminder — cooldown is 7 days, not yet ready
    expect(shouldCreateReminderTask(invoice, [doneYesterday])).toBe(false)
  })

  it('returns true when 8 days have passed after first reminder (cooldown expired)', () => {
    const invoice = makeInvoice({ id: 'inv1' })
    const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000).toISOString()
    const doneOld = makeTodo({ id: 't1', sourceRef: 'inv1', status: 'done', updatedAt: eightDaysAgo, actionType: 'send_reminder' })
    expect(shouldCreateReminderTask(invoice, [doneOld])).toBe(true)
  })

  it('returns false for non-overdue invoice', () => {
    const invoice = makeInvoice({ id: 'inv1', status: 'open' })
    expect(shouldCreateReminderTask(invoice, [])).toBe(false)
  })
})
