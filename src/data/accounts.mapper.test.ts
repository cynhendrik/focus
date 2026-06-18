import { describe, it, expect } from 'vitest'
import { accountRowToLead, leadPayloadToAccountRow } from './accounts.mapper'

const row = {
  id: 'l1', workspace_id: 'ws1', created_by: 'u1', name: 'Max',
  email: 'max@x.de', phone: null, account_type: 'lead',
  lead_status: 'neu', lead_source: 'manual', lead_source_detail: null,
  engagement_score: 0, re_engage_date: null, converted_at: null,
  pipeline_stage: 'inbox', company_name: null, linkedin_url: null,
  last_activity_at: null, next_follow_up_at: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z',
}

describe('accounts.mapper', () => {
  it('accountRowToLead mappt snake_case → camelCase', () => {
    const lead = accountRowToLead(row)
    expect(lead.workspaceId).toBe('ws1')
    expect(lead.accountType).toBe('lead')
    expect(lead.pipelineStage).toBe('inbox')
    expect(lead.leadSourceDetail).toBeNull()
    expect(lead.engagementScore).toBe(0)
    expect(lead.updatedAt).toBe('2026-01-02T00:00:00Z')
  })

  it('accountRowToLead mappt ALLE 19 Felder vollständig', () => {
    expect(accountRowToLead(row)).toEqual({
      id: 'l1',
      workspaceId: 'ws1',
      name: 'Max',
      email: 'max@x.de',
      phone: null,
      accountType: 'lead',
      pipelineStage: 'inbox',
      leadStatus: 'neu',
      leadSource: 'manual',
      leadSourceDetail: null,
      companyName: null,
      linkedinUrl: null,
      lastActivityAt: null,
      nextFollowUpAt: null,
      engagementScore: 0,
      reEngageDate: null,
      convertedAt: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
    })
  })

  it('leadPayloadToAccountRow setzt account_type=lead, created_by und defaults', () => {
    const r = leadPayloadToAccountRow(
      { workspaceId: 'ws1', name: 'Max', leadSource: 'manual' },
      { id: 'l1', createdBy: 'u1', now: '2026-01-03T00:00:00Z' },
    )
    expect(r.id).toBe('l1')
    expect(r.account_type).toBe('lead')
    expect(r.created_by).toBe('u1')
    expect(r.workspace_id).toBe('ws1')
    expect(r.lead_status).toBe('neu')        // default
    expect(r.pipeline_stage).toBe('inbox')   // default
    expect(r.updated_at).toBe('2026-01-03T00:00:00Z')
  })

  it('leadPayloadToAccountRow reicht EXPLIZITE Werte durch (nicht die Defaults)', () => {
    const r = leadPayloadToAccountRow(
      {
        workspaceId: 'ws1',
        name: 'Max',
        leadSource: 'manual',
        pipelineStage: 'won',
        leadStatus: 'qualifiziert',
        email: 'x@y.de',
        phone: '123',
        leadSourceDetail: 'Messe',
        companyName: 'ACME',
        linkedinUrl: 'https://l/x',
        reEngageDate: '2026-02-01T00:00:00Z',
      },
      { id: 'l1', createdBy: 'u1', now: '2026-01-03T00:00:00Z' },
    )
    expect(r.pipeline_stage).toBe('won')
    expect(r.lead_status).toBe('qualifiziert')
    expect(r.email).toBe('x@y.de')
    expect(r.phone).toBe('123')
    expect(r.lead_source_detail).toBe('Messe')
    expect(r.company_name).toBe('ACME')
    expect(r.linkedin_url).toBe('https://l/x')
    expect(r.re_engage_date).toBe('2026-02-01T00:00:00Z')
  })

  it('leadPayloadToAccountRow enthält keine DB-verwalteten Felder', () => {
    const r = leadPayloadToAccountRow(
      { workspaceId: 'ws1', name: 'Max', leadSource: 'manual' },
      { id: 'l1', createdBy: 'u1', now: '2026-01-03T00:00:00Z' },
    )
    expect(r).not.toHaveProperty('engagement_score')
    expect(r).not.toHaveProperty('converted_at')
    expect(r).not.toHaveProperty('last_activity_at')
    expect(r).not.toHaveProperty('next_follow_up_at')
    expect(r).not.toHaveProperty('created_at')
  })
})
