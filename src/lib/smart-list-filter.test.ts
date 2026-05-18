import { describe, it, expect } from 'vitest'
import { applySmartListFilter } from './smart-list-filter'
import type { Customer } from '@/types/customer.types'

const base: Customer = {
  id: '1', name: 'Test', status: 'aktiv', priority: 'normal',
  tags: [], leadScore: 50, goals: [], isPrivate: false,
  workspaceId: 'ws1', socialLinks: '{}',
  createdAt: '2024-01-01', updatedAt: '2024-01-01',
  scoreFactors: {},
}

describe('applySmartListFilter', () => {
  it('returns all customers for empty filter', () => {
    expect(applySmartListFilter([base], {}, new Map())).toHaveLength(1)
  })

  it('filters by status', () => {
    const lead: Customer = { ...base, id: '2', status: 'lead' }
    const result = applySmartListFilter([base, lead], { status: ['lead'] }, new Map())
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('2')
  })

  it('filters by priority', () => {
    const high: Customer = { ...base, id: '2', priority: 'high' }
    const result = applySmartListFilter([base, high], { priority: ['high'] }, new Map())
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('2')
  })

  it('filters by scoreMin', () => {
    const low: Customer = { ...base, id: '2', leadScore: 30 }
    const result = applySmartListFilter([base, low], { scoreMin: 50 }, new Map())
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('1')
  })

  it('filters by scoreMax', () => {
    const high: Customer = { ...base, id: '2', leadScore: 90 }
    const result = applySmartListFilter([base, high], { scoreMax: 60 }, new Map())
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('1')
  })

  it('scoreMax boundary is inclusive', () => {
    const exact: Customer = { ...base, id: '2', leadScore: 50 }
    const over:  Customer = { ...base, id: '3', leadScore: 51 }
    const result = applySmartListFilter([exact, over], { scoreMax: 50 }, new Map())
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('2')
  })

  it('filters by tags — all listed tags must match', () => {
    const tagged: Customer = { ...base, id: '2', tags: ['webinar', 'newsletter'] }
    const result = applySmartListFilter([base, tagged], { tags: ['webinar'] }, new Map())
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('2')
  })

  it('filters by industry', () => {
    const tech: Customer = { ...base, id: '2', industry: 'SaaS' }
    const result = applySmartListFilter([base, tech], { industry: ['SaaS'] }, new Map())
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('2')
  })

  it('treats no activity as inactive (inactiveDays)', () => {
    const noActivity = new Map<string, string | null>([['1', null]])
    const result = applySmartListFilter([base], { inactiveDays: 14 }, noActivity)
    expect(result).toHaveLength(1)
  })

  it('excludes customer with recent activity from inactiveDays filter', () => {
    const recent = new Map<string, string | null>([['1', new Date().toISOString()]])
    const result = applySmartListFilter([base], { inactiveDays: 14 }, recent)
    expect(result).toHaveLength(0)
  })

  it('combines multiple criteria with AND logic', () => {
    const match: Customer  = { ...base, id: '2', status: 'lead', leadScore: 80 }
    const noMatch: Customer = { ...base, id: '3', status: 'lead', leadScore: 30 }
    const result = applySmartListFilter([base, match, noMatch], { status: ['lead'], scoreMin: 50 }, new Map())
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('2')
  })
})
