import { describe, it, expect } from 'vitest'
import { countLeadsInFirstOpenStage } from './nav-badge'
import type { Lead, LeadStage } from '@/types/lead.types'

function stage(overrides: Partial<LeadStage> = {}): LeadStage {
  return {
    id: 's1', workspaceId: 'ws1', name: 'neu', label: 'Neu', orderIndex: 0,
    color: '#000', isQualified: false, isDisqualified: false, createdAt: '',
    ...overrides,
  }
}

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'l1', workspaceId: 'ws1', name: 'Test', email: null, phone: null,
    accountType: 'lead', leadStatus: 'neu', leadSource: 'manual',
    leadSourceDetail: null, companyName: null, linkedinUrl: null,
    lastActivityAt: null, nextFollowUpAt: null, engagementScore: 0,
    reEngageDate: null, convertedAt: null, createdAt: '', updatedAt: '',
    ...overrides,
  }
}

describe('countLeadsInFirstOpenStage', () => {
  it('counts leads whose leadStatus matches the first open stage', () => {
    const stages = [
      stage({ name: 'neu', orderIndex: 0 }),
      stage({ id: 's2', name: 'kontaktiert', orderIndex: 1 }),
    ]
    const leads = [
      lead({ id: 'l1', leadStatus: 'neu' }),
      lead({ id: 'l2', leadStatus: 'neu' }),
      lead({ id: 'l3', leadStatus: 'kontaktiert' }),
    ]
    expect(countLeadsInFirstOpenStage(leads, stages)).toBe(2)
  })

  it('skips qualified/disqualified stages when finding the first open one', () => {
    const stages = [
      stage({ id: 's0', name: 'qualifiziert', orderIndex: 0, isQualified: true }),
      stage({ id: 's1', name: 'neu', orderIndex: 1 }),
    ]
    const leads = [
      lead({ id: 'l1', leadStatus: 'qualifiziert' }),
      lead({ id: 'l2', leadStatus: 'neu' }),
    ]
    expect(countLeadsInFirstOpenStage(leads, stages)).toBe(1)
  })

  it('returns 0 when no open stages exist', () => {
    const stages = [stage({ isQualified: true })]
    expect(countLeadsInFirstOpenStage([lead()], stages)).toBe(0)
  })

  it('returns 0 when there are no leads', () => {
    expect(countLeadsInFirstOpenStage([], [stage()])).toBe(0)
  })

  it('returns 0 when no stages are configured at all', () => {
    expect(countLeadsInFirstOpenStage([lead()], [])).toBe(0)
  })
})
