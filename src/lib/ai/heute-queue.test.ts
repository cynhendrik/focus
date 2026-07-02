import { describe, it, expect } from 'vitest'
import { staticHeuteQueue } from './heute-queue'
import { todayLocalIso } from '@/lib/heute/due'
import type { CorraContextInput } from './corra-intelligence'

const emptyInput: CorraContextInput = {
  todos: [], invoices: [], emails: [], deals: [], calendarEvents: [], accounts: [],
  followUps: [], leads: [],
}

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

  it('verschränkt Geld und Beziehung (Rechnung, Follow-up, Rechnung, Follow-up)', () => {
    const todayStr = todayLocalIso()
    const inv = (id: string, total: number): CorraContextInput['invoices'][number] =>
      ({ id, status: 'overdue', total, dueDate: '2026-05-01', accountId: 'a', workspaceId: 'w', createdBy: 'u', date: '2026-04-01', taxMode: 'standard', subtotal: total, taxAmount: 0, bankInfo: '', isSuggestion: false, pendingSync: false, createdAt: '', updatedAt: '' })
    const input: CorraContextInput = {
      ...emptyInput,
      invoices: [inv('inv-big', 5000), inv('inv-small', 500)],
      followUps: [
        { id: 'fu-1', customerId: 'l', title: 'A', dueDate: todayStr, status: 'offen', priority: 'normal', createdAt: '' },
        { id: 'fu-2', customerId: 'l', title: 'B', dueDate: todayStr, status: 'offen', priority: 'normal', createdAt: '' },
      ],
    }
    const q = staticHeuteQueue(input)
    expect(q.map(x => x.type)).toEqual(['invoice_reminder', 'lead_followup', 'invoice_reminder', 'lead_followup'])
    expect(q[0].id).toBe('inv-big') // größte Rechnung als #1
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

  it('includes a todo scheduled for today even if its bucket is backlog (capture-bug)', () => {
    const scheduledToday = `${todayLocalIso()}T09:00:00.000Z`
    const input: CorraContextInput = {
      ...emptyInput,
      todos: [
        { id: 'todo-sched', title: 'Getippt, heute eingeplant', status: 'open', priority: 'p2', bucket: 'backlog', scheduledAt: scheduledToday, checklist: [], tags: [], createdAt: '', updatedAt: '' },
      ],
    }
    const queue = staticHeuteQueue(input)
    expect(queue.find(q => q.id === 'todo-sched')).toBeDefined()
  })

  it('surfaces a due lead follow-up as lead_followup', () => {
    const todayStr = todayLocalIso()
    const input: CorraContextInput = {
      ...emptyInput,
      followUps: [
        { id: 'fu-1', customerId: 'lead-1', title: 'Angebot nachfassen', dueDate: todayStr, status: 'offen', priority: 'normal', createdAt: '' },
      ],
      leads: [
        { id: 'lead-1', name: 'Sven Klar' } as CorraContextInput['leads'][number],
      ],
    }
    const queue = staticHeuteQueue(input)
    const fu = queue.find(q => q.type === 'lead_followup')
    expect(fu).toBeDefined()
    expect(fu!.id).toBe('fu-1')
    expect(fu!.reason).toContain('Sven Klar')
  })

  it('ignores erledigte and future follow-ups', () => {
    const future = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
    const input: CorraContextInput = {
      ...emptyInput,
      followUps: [
        { id: 'fu-done', customerId: 'l', title: 'x', dueDate: '2026-01-01', status: 'erledigt', priority: 'normal', createdAt: '' },
        { id: 'fu-future', customerId: 'l', title: 'y', dueDate: future, status: 'offen', priority: 'normal', createdAt: '' },
      ],
    }
    expect(staticHeuteQueue(input).filter(q => q.type === 'lead_followup')).toHaveLength(0)
  })
})
