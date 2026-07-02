import { describe, it, expect } from 'vitest'
import { generateCardDrafts, reconcileResolvedIds } from './generate'
import type { GenerateInput } from './generate'
import type { PreparedItem } from '@/types/prepared-item.types'

const baseInput = (over: Partial<GenerateInput> = {}): GenerateInput => ({
  workspaceId: 'ws1', invoices: [], todos: [], followUps: [],
  accounts: [{ id: 'acc1', name: 'Meyer GmbH' }], leads: [], payments: [],
  fees: [0, 5, 10], suppressedRuleIds: [], todayIso: '2026-07-02', ...over,
})

const overdueInvoice = {
  id: 'inv1', workspaceId: 'ws1', accountId: 'acc1', number: 'R-100',
  date: '2026-06-01', dueDate: '2026-06-15', status: 'overdue',
  total: 1190, subtotal: 1000, taxAmount: 190, taxMode: 'standard',
  bankInfo: '', isSuggestion: false, pendingSync: false, createdBy: 'u1',
  createdAt: '', updatedAt: '',
} as never

describe('generateCardDrafts', () => {
  it('ueberfaellige Rechnung → Mahnungs-Karte mit Template-Entwurf und Stufe im sourceId', () => {
    const cards = generateCardDrafts(baseInput({ invoices: [overdueInvoice] }))
    const m = cards.find(c => c.type === 'mahnung')
    expect(m).toBeDefined()
    expect(m!.sourceKind).toBe('invoice_reminder')
    expect(m!.sourceId).toBe('inv1:0')
    expect(m!.ruleId).toBe('mahnung-l0')
    expect(m!.payload.level).toBe(0)
    expect(m!.payload.draftBody).toContain('R-100')
    expect(m!.payload.why).toContain('Tage')
  })

  it('faelliges Follow-up → Karte; unterdrueckte ruleIds werden uebersprungen', () => {
    const fu = { id: 'fu1', customerId: 'acc1', title: 'Angebot nachfassen', dueDate: '2026-07-01', status: 'offen', priority: 'normal', createdAt: '' } as never
    expect(generateCardDrafts(baseInput({ followUps: [fu] })).some(c => c.type === 'followup')).toBe(true)
    expect(generateCardDrafts(baseInput({ followUps: [fu], suppressedRuleIds: ['followup-due'] })).some(c => c.type === 'followup')).toBe(false)
  })

  it('Suggestion-Rechnung → Rechnungsentwurf-Karte; normale Drafts NICHT', () => {
    const suggestion = { ...(overdueInvoice as object), id: 'inv2', status: 'draft', isSuggestion: true, dueDate: '2026-08-01' } as never
    const plainDraft = { ...(overdueInvoice as object), id: 'inv3', status: 'draft', isSuggestion: false, dueDate: '2026-08-01' } as never
    const cards = generateCardDrafts(baseInput({ invoices: [suggestion, plainDraft] }))
    expect(cards.filter(c => c.type === 'rechnungsentwurf').map(c => c.sourceId)).toEqual(['inv2'])
  })

  it('heute faelliges Todo → Aufgabe-Karte; Mahnungen scoren hoeher als Aufgaben', () => {
    const todo = { id: 't1', title: 'Anrufen', status: 'open', priority: 'p2', bucket: 'today', checklist: [], tags: [], createdAt: '', updatedAt: '' } as never
    const cards = generateCardDrafts(baseInput({ invoices: [overdueInvoice], todos: [todo] }))
    const m = cards.find(c => c.type === 'mahnung')!
    const a = cards.find(c => c.type === 'aufgabe')!
    expect(a.sourceId).toBe('t1')
    expect(m.score).toBeGreaterThan(a.score)
  })
})

describe('reconcileResolvedIds', () => {
  const card = (over: Partial<PreparedItem>): PreparedItem => ({
    id: 'p1', workspaceId: 'ws1', type: 'mahnung', sourceKind: 'invoice_reminder',
    sourceId: 'inv1:0', assignee: null, payload: { title: '', why: '' }, score: 0,
    status: 'pending', snoozeUntil: null, ruleId: 'mahnung-l0',
    createdAt: '', updatedAt: '', approvedAt: null, ...over,
  })

  it('bezahlte Rechnung loest die Mahnungs-Karte auf', () => {
    const paid = { ...(overdueInvoice as object), status: 'paid' } as never
    expect(reconcileResolvedIds([card({})], baseInput({ invoices: [paid] }))).toEqual(['p1'])
  })

  it('offene Quelle bleibt bestehen', () => {
    expect(reconcileResolvedIds([card({})], baseInput({ invoices: [overdueInvoice] }))).toEqual([])
  })

  it('erledigtes Follow-up und erledigtes Todo loesen ihre Karten auf', () => {
    const fuCard = card({ id: 'p2', type: 'followup', sourceKind: 'crm_follow_up', sourceId: 'fu1' })
    const todoCard = card({ id: 'p3', type: 'aufgabe', sourceKind: 'todo', sourceId: 't1' })
    const input = baseInput({
      followUps: [{ id: 'fu1', customerId: 'acc1', title: 'x', dueDate: '2026-07-01', status: 'erledigt', priority: 'normal', createdAt: '' } as never],
      todos: [{ id: 't1', title: 'x', status: 'done', priority: 'p2', bucket: 'done', checklist: [], tags: [], createdAt: '', updatedAt: '' } as never],
    })
    expect(reconcileResolvedIds([fuCard, todoCard], input).sort()).toEqual(['p2', 'p3'])
  })
})
