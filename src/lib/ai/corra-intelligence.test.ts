import { describe, it, expect } from 'vitest'
import { buildCorraIntelligenceContext, parseCorraResponse } from './corra-intelligence'
import type { Invoice } from '@/types/finance.types'
import type { Account } from '@/types/account.types'
import type { FollowUp } from '@/types/crm.types'
import type { Lead } from '@/types/lead.types'

// Minimal mocks — use type assertions to avoid filling every required field
const baseAccount = { id: 'acc-1', name: 'Müller GmbH' } as Account

const baseInvoice = {
  id: 'inv-1', accountId: 'acc-1', number: 'RE-001',
  dueDate: '2026-05-01', status: 'overdue', total: 1190,
} as Invoice

const todayStr = new Date().toISOString().slice(0, 10)

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
      followUps: [], leads: [],
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
      followUps: [], leads: [],
    })
    expect(ctx).toContain('Keine offenen')
  })

  it('filters out paid invoices', () => {
    const paid = { ...baseInvoice, status: 'paid' as const }
    const ctx = buildCorraIntelligenceContext({
      todos: [], invoices: [paid], emails: [],
      deals: [], calendarEvents: [], accounts: [baseAccount],
      followUps: [], leads: [],
    })
    expect(ctx).not.toContain('RECHNUNGEN ÜBERFÄLLIG')
  })

  it('surfaces a due lead follow-up with lead name and ID', () => {
    const lead = { id: 'lead-1', name: 'Sven Klar' } as Lead
    const fu = {
      id: 'fu-1', customerId: 'lead-1', title: 'Angebot nachfassen',
      dueDate: todayStr, status: 'offen', priority: 'normal', createdAt: '',
    } as FollowUp
    const ctx = buildCorraIntelligenceContext({
      todos: [], invoices: [], emails: [],
      deals: [], calendarEvents: [], accounts: [],
      followUps: [fu], leads: [lead],
    })
    expect(ctx).toContain('FOLLOW-UPS FÄLLIG')
    expect(ctx).toContain('Sven Klar')
    expect(ctx).toContain('Angebot nachfassen')
    expect(ctx).toContain('ID:fu-1')
  })

  it('flags a cold lead with no open follow-up', () => {
    const lead = {
      id: 'lead-cold', name: 'Alte Spur',
      lastActivityAt: '2026-01-01T00:00:00.000Z',
    } as Lead
    const ctx = buildCorraIntelligenceContext({
      todos: [], invoices: [], emails: [],
      deals: [], calendarEvents: [], accounts: [],
      followUps: [], leads: [lead],
    })
    expect(ctx).toContain('LEADS OHNE FOLLOW-UP')
    expect(ctx).toContain('Alte Spur')
    expect(ctx).toContain('ID:lead-cold')
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
