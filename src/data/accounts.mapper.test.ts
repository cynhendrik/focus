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
})
