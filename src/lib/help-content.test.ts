import { describe, it, expect } from 'vitest'
import { HELP_CONTENT } from './help-content'

const VALID_VIEWS = new Set([
  'dashboard','profile','clients','akquise','invoices','settings','integrations',
  'posteingang','zeitmanagement','pipeline','calendar','mail','followups','leads',
  'journal','focus','corra','notes','sales',
  'leverage_inbox','leverage_leads','leverage_pipeline','leverage_mail','leverage_lead_detail',
])

describe('help-content', () => {
  it('has at least 8 categories, each with entries', () => {
    expect(HELP_CONTENT.length).toBeGreaterThanOrEqual(8)
    for (const cat of HELP_CONTENT) {
      expect(cat.label.length).toBeGreaterThan(0)
      expect(cat.entries.length).toBeGreaterThan(0)
    }
  })

  it('every entry has title + body, and any view ref is a valid AppView', () => {
    for (const cat of HELP_CONTENT) {
      for (const e of cat.entries) {
        expect(e.title.length).toBeGreaterThan(0)
        expect(e.body.length).toBeGreaterThan(0)
        if (e.view) expect(VALID_VIEWS.has(e.view)).toBe(true)
      }
    }
  })

  it('category ids are unique', () => {
    const ids = HELP_CONTENT.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
