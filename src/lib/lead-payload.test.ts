import { describe, it, expect } from 'vitest'
import { leadToUpsertPayload } from './lead-payload'
import type { Lead } from '@/types/lead.types'

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1',
    workspaceId: 'ws-1',
    name: 'Max Mustermann',
    email: 'max@example.com',
    phone: null,
    accountType: 'lead',
    leadStatus: 'warm',
    leadSource: 'zoom',
    leadSourceDetail: 'Marketing Webinar',
    companyName: 'ACME GmbH',
    linkedinUrl: 'https://linkedin.com/in/max',
    lastActivityAt: null,
    nextFollowUpAt: null,
    engagementScore: 7,
    reEngageDate: '2026-09-01',
    convertedAt: null,
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-10T00:00:00Z',
    ...overrides,
  }
}

describe('leadToUpsertPayload', () => {
  it('round-trips every column the backend overwrites on upsert', () => {
    const payload = leadToUpsertPayload(makeLead())
    // Without these, the Rust upsert would reset them to defaults / NULL.
    expect(payload.id).toBe('lead-1')
    expect(payload.leadStatus).toBe('warm')
    expect(payload.reEngageDate).toBe('2026-09-01')
    expect(payload.leadSource).toBe('zoom')
    expect(payload.leadSourceDetail).toBe('Marketing Webinar')
    expect(payload.companyName).toBe('ACME GmbH')
    expect(payload.linkedinUrl).toBe('https://linkedin.com/in/max')
    expect(payload.name).toBe('Max Mustermann')
    expect(payload.email).toBe('max@example.com')
  })

  it('converts null fields to undefined so they are not sent as empty', () => {
    const payload = leadToUpsertPayload(makeLead({ email: null, companyName: null, reEngageDate: null }))
    expect(payload.email).toBeUndefined()
    expect(payload.companyName).toBeUndefined()
    expect(payload.reEngageDate).toBeUndefined()
  })

  it('applies overrides on top of the preserved fields', () => {
    const payload = leadToUpsertPayload(makeLead(), { phone: '+49 151 1234567' })
    expect(payload.phone).toBe('+49 151 1234567')
    // Override must not disturb the rest.
    expect(payload.leadStatus).toBe('warm')
    expect(payload.reEngageDate).toBe('2026-09-01')
  })

  it('lets an override clear the phone back to undefined', () => {
    const payload = leadToUpsertPayload(makeLead({ phone: '+49 151 1234567' }), { phone: undefined })
    expect(payload.phone).toBeUndefined()
  })
})
