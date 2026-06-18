import type { Lead, UpsertLeadPayload } from '@/types/lead.types'

/** Supabase-`accounts`-Zeile (account_type='lead') → Lead-Domänentyp. */
export function accountRowToLead(r: any): Lead {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    email: r.email ?? null,
    phone: r.phone ?? null,
    accountType: 'lead',
    pipelineStage: r.pipeline_stage ?? 'inbox',
    leadStatus: r.lead_status ?? 'neu',
    leadSource: r.lead_source,
    leadSourceDetail: r.lead_source_detail ?? null,
    companyName: r.company_name ?? null,
    linkedinUrl: r.linkedin_url ?? null,
    lastActivityAt: r.last_activity_at ?? null,
    nextFollowUpAt: r.next_follow_up_at ?? null,
    engagementScore: r.engagement_score ?? 0,
    reEngageDate: r.re_engage_date ?? null,
    convertedAt: r.converted_at ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

/** UpsertLeadPayload → `accounts`-Row für `supabase.from('accounts').upsert(...)`. */
export function leadPayloadToAccountRow(
  p: UpsertLeadPayload,
  ctx: { id: string; createdBy: string; now: string },
): Record<string, unknown> {
  return {
    id: ctx.id,
    workspace_id: p.workspaceId,
    created_by: ctx.createdBy,
    name: p.name,
    email: p.email ?? null,
    phone: p.phone ?? null,
    account_type: 'lead',
    lead_status: p.leadStatus ?? 'neu',
    lead_source: p.leadSource,
    lead_source_detail: p.leadSourceDetail ?? null,
    pipeline_stage: p.pipelineStage ?? 'inbox',
    company_name: p.companyName ?? null,
    linkedin_url: p.linkedinUrl ?? null,
    re_engage_date: p.reEngageDate ?? null,
    updated_at: ctx.now,
  }
}
