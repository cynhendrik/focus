import { describe, it, expect } from 'vitest'
import { computeOpenCount } from './useCustomerOpenCount'
import type { Todo } from '@/types/todo.types'
import type { EmailHeader } from '@/types/mail.types'
import type { FollowUp } from '@/types/crm.types'
import type { Invoice } from '@/types/finance.types'

function makeTodo(p: Partial<Todo> & { id: string }): Todo {
  return {
    id: p.id, title: 'x', status: p.status ?? 'open',
    priority: 'p2', bucket: 'today', checklist: [], tags: [],
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    ...p,
  }
}

function makeEmail(p: Partial<EmailHeader> & { id: string }): EmailHeader {
  return {
    id: p.id, accountId: 'acc1', uid: 1, folder: 'INBOX',
    subject: 'Test', fromAddr: 'a@b.com', fromName: 'A',
    toAddrs: [], sentAt: '2026-01-01T00:00:00Z',
    isRead: p.isRead ?? false,
    customerId: p.customerId !== undefined ? p.customerId : 'c1',
    notALead: p.notALead ?? false,
  }
}

function makeFollowUp(p: Partial<FollowUp> & { id: string }): FollowUp {
  return {
    id: p.id, customerId: p.customerId ?? 'c1',
    title: 'Nachfassen', dueDate: '2026-06-15',
    status: p.status ?? 'offen', priority: 'normal',
    createdAt: '2026-01-01T00:00:00Z',
  }
}

function makeInvoice(p: Partial<Invoice> & { id: string }): Invoice {
  return {
    id: p.id, workspaceId: 'ws1', createdBy: 'u1',
    accountId: p.accountId ?? 'c1',
    date: '2026-01-01', dueDate: '2026-06-01',
    status: p.status ?? 'open', taxMode: 'standard',
    subtotal: 1000, taxAmount: 190, total: 1190,
    bankInfo: '', isSuggestion: false, pendingSync: false,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    ...p,
  }
}

describe('computeOpenCount', () => {
  it('returns 0 when all arrays are empty', () => {
    expect(computeOpenCount('c1', [], [], [], [])).toBe(0)
  })

  it('counts open and in_progress todos, excludes done', () => {
    const todos = [
      makeTodo({ id: 't1', customerId: 'c1', status: 'open' }),
      makeTodo({ id: 't2', customerId: 'c1', status: 'in_progress' }),
      makeTodo({ id: 't3', customerId: 'c1', status: 'done' }),
      makeTodo({ id: 't4', customerId: 'c2', status: 'open' }),
    ]
    expect(computeOpenCount('c1', todos, [], [], [])).toBe(2)
  })

  it('counts unread emails for the customer, excludes read and other customers', () => {
    const emails = [
      makeEmail({ id: 'e1', customerId: 'c1', isRead: false }),
      makeEmail({ id: 'e2', customerId: 'c1', isRead: true }),
      makeEmail({ id: 'e3', customerId: 'c2', isRead: false }),
    ]
    expect(computeOpenCount('c1', [], emails, [], [])).toBe(1)
  })

  it('counts only offen follow-ups, excludes erledigt', () => {
    const followUps = [
      makeFollowUp({ id: 'f1', customerId: 'c1', status: 'offen' }),
      makeFollowUp({ id: 'f2', customerId: 'c1', status: 'erledigt' }),
      makeFollowUp({ id: 'f3', customerId: 'c2', status: 'offen' }),
    ]
    expect(computeOpenCount('c1', [], [], followUps, [])).toBe(1)
  })

  it('counts open and overdue invoices, excludes paid/draft/cancelled', () => {
    const invoices = [
      makeInvoice({ id: 'i1', accountId: 'c1', status: 'open' }),
      makeInvoice({ id: 'i2', accountId: 'c1', status: 'overdue' }),
      makeInvoice({ id: 'i3', accountId: 'c1', status: 'paid' }),
      makeInvoice({ id: 'i4', accountId: 'c1', status: 'draft' }),
      makeInvoice({ id: 'i5', accountId: 'c2', status: 'open' }),
    ]
    expect(computeOpenCount('c1', [], [], [], invoices)).toBe(2)
  })

  it('sums all four sources together', () => {
    const todos     = [makeTodo({ id: 't1', customerId: 'c1' })]
    const emails    = [makeEmail({ id: 'e1', customerId: 'c1', isRead: false })]
    const followUps = [makeFollowUp({ id: 'f1', customerId: 'c1' })]
    const invoices  = [makeInvoice({ id: 'i1', accountId: 'c1', status: 'overdue' })]
    expect(computeOpenCount('c1', todos, emails, followUps, invoices)).toBe(4)
  })
})
