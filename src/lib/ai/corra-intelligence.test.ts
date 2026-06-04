import { describe, it, expect } from 'vitest'
import { buildCorraIntelligenceContext, parseCorraResponse } from './corra-intelligence'
import type { Invoice } from '@/types/finance.types'
import type { Account } from '@/types/account.types'

// Minimal mocks — use type assertions to avoid filling every required field
const baseAccount = { id: 'acc-1', name: 'Müller GmbH' } as Account

const baseInvoice = {
  id: 'inv-1', accountId: 'acc-1', number: 'RE-001',
  dueDate: '2026-05-01', status: 'overdue', total: 1190,
} as Invoice

describe('parseCorraResponse', () => {
  it('returns plain text unchanged when no JSON', () => {
    const result = parseCorraResponse('Heute hast du 5 Todos.')
    expect(result.text).toBe('Heute hast du 5 Todos.')
    expect(result.actions).toBeUndefined()
    expect(result.focusCta).toBeUndefined()
  })

  it('parses valid JSON with actions', () => {
    const payload = {
      text: 'Du hast 2 überfällige Rechnungen.',
      actions: [{ type: 'invoice', id: 'inv-1', label: 'Müller GmbH', detail: '€1.190', urgency: '14 Tage' }],
      focusCta: 'Jetzt in Fokus',
    }
    const result = parseCorraResponse(JSON.stringify(payload))
    expect(result.text).toBe('Du hast 2 überfällige Rechnungen.')
    expect(result.actions).toHaveLength(1)
    expect(result.actions![0].id).toBe('inv-1')
    expect(result.focusCta).toBe('Jetzt in Fokus')
  })

  it('handles JSON wrapped in markdown code fences', () => {
    const raw = '```json\n{"text":"Test","actions":[],"focusCta":"Go"}\n```'
    const result = parseCorraResponse(raw)
    expect(result.text).toBe('Test')
  })

  it('falls back to plain text for malformed JSON', () => {
    const result = parseCorraResponse('{ "text": 42 }')
    expect(result.text).toBe('{ "text": 42 }')
    expect(result.actions).toBeUndefined()
  })
})

describe('buildCorraIntelligenceContext', () => {
  it('includes overdue invoice with customer name and ID', () => {
    const ctx = buildCorraIntelligenceContext({
      todos: [], invoices: [baseInvoice], emails: [],
      deals: [], calendarEvents: [], accounts: [baseAccount],
    })
    expect(ctx).toContain('Müller GmbH')
    expect(ctx).toContain('RE-001')
    expect(ctx).toContain('ID:inv-1')
    expect(ctx).toContain('RECHNUNGEN ÜBERFÄLLIG')
  })

  it('shows empty state message when all data is empty', () => {
    const ctx = buildCorraIntelligenceContext({
      todos: [], invoices: [], emails: [],
      deals: [], calendarEvents: [], accounts: [],
    })
    expect(ctx).toContain('Keine offenen')
  })

  it('filters out paid invoices', () => {
    const paid = { ...baseInvoice, status: 'paid' as const }
    const ctx = buildCorraIntelligenceContext({
      todos: [], invoices: [paid], emails: [],
      deals: [], calendarEvents: [], accounts: [baseAccount],
    })
    expect(ctx).not.toContain('RECHNUNGEN ÜBERFÄLLIG')
  })
})

describe('parseCorraResponse — widget field', () => {
  it('extracts valid widget type', () => {
    const raw = JSON.stringify({ text: 'Dein Umsatz:', widget: 'revenue' })
    expect(parseCorraResponse(raw).widget).toBe('revenue')
  })

  it('rejects unknown widget value', () => {
    const raw = JSON.stringify({ text: 'Hallo', widget: 'unknown' })
    expect(parseCorraResponse(raw).widget).toBeUndefined()
  })

  it('handles missing widget field gracefully', () => {
    const raw = JSON.stringify({ text: 'Hallo' })
    expect(parseCorraResponse(raw).widget).toBeUndefined()
  })

  it('still parses text when widget present', () => {
    const raw = JSON.stringify({ text: 'Umsatz diese Woche', widget: 'revenue' })
    const result = parseCorraResponse(raw)
    expect(result.text).toBe('Umsatz diese Woche')
    expect(result.widget).toBe('revenue')
  })

  it('accepts all valid widget types', () => {
    const types = ['revenue', 'todos', 'mails', 'week', 'heute'] as const
    for (const type of types) {
      const raw = JSON.stringify({ text: 'x', widget: type })
      expect(parseCorraResponse(raw).widget).toBe(type)
    }
  })
})
