import type { Lead, UpsertLeadPayload } from '@/types/lead.types'
import type { Account, UpsertAccountPayload, AccountKind, AccountStatus, AccountPriority } from '@/types/account.types'

/** Supabase-`accounts`-Zeile (account_type='lead') → Lead-Domänentyp. */
export function accountRowToLead(r: any): Lead {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    email: r.email ?? null,
    phone: r.phone ?? null,
    accountType: 'lead',
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
    company_name: p.companyName ?? null,
    linkedin_url: p.linkedinUrl ?? null,
    re_engage_date: p.reEngageDate ?? null,
    updated_at: ctx.now,
  }
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[]
  if (typeof v === 'string') {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : [] } catch { return [] }
  }
  return []
}

function asNumberRecord(v: unknown): Record<string, number> {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, number>
  if (typeof v === 'string') {
    try { const p = JSON.parse(v); return p && typeof p === 'object' ? p : {} } catch { return {} }
  }
  return {}
}

/** Domänen-`socialLinks` (JSON-String) → Objekt für die jsonb-Spalte `social_links`. */
function asJsonObject(v: unknown): Record<string, unknown> {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
  if (typeof v === 'string') {
    try { const p = JSON.parse(v); return p && typeof p === 'object' && !Array.isArray(p) ? p : {} } catch { return {} }
  }
  return {}
}

/** Supabase-`accounts`-Zeile (account_type != 'lead') → Account-Domänentyp. */
export function accountRowToAccount(r: any): Account {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    createdBy: r.created_by,
    name: r.name,
    kind: (r.kind ?? 'company') as AccountKind,
    industry: r.industry ?? undefined,
    website: r.website ?? undefined,
    status: (r.status ?? 'aktiv') as AccountStatus,
    priority: (r.priority ?? 'normal') as AccountPriority,
    tags: asStringArray(r.tags),
    goals: asStringArray(r.goals),
    healthScore: r.health_score ?? undefined,
    internalNotes: r.internal_notes ?? undefined,
    isPrivate: r.is_private === true || r.is_private === 1,
    socialLinks: typeof r.social_links === 'string' ? r.social_links : JSON.stringify(r.social_links ?? {}),
    primaryDealId: r.primary_deal_id ?? undefined,
    leadScore: r.lead_score ?? 0,
    scoreFactors: asNumberRecord(r.score_factors),
    street: r.street ?? undefined,
    zip: r.zip ?? undefined,
    city: r.city ?? undefined,
    country: r.country ?? undefined,
    pipelinePhase: undefined,
    pipelinePhaseLabel: undefined,
    email: r.email ?? undefined,
    phone: r.phone ?? undefined,
    vatId: r.vat_id ?? undefined,
    archivedAt: r.archived_at ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

/** UpsertAccountPayload → `accounts`-Row; setzt account_type='client'. */
export function accountPayloadToRow(
  p: UpsertAccountPayload,
  ctx: { id: string; now: string },
): Record<string, unknown> {
  return {
    id: ctx.id,
    workspace_id: p.workspaceId,
    created_by: p.createdBy,
    name: p.name,
    kind: p.kind ?? 'company',
    account_type: 'client',
    industry: p.industry ?? null,
    website: p.website ?? null,
    status: p.status ?? 'aktiv',
    priority: p.priority ?? 'normal',
    // Schema-Drift: tags ist `text` (JSON-String), goals + social_links sind `jsonb` (native Werte).
    tags: JSON.stringify(p.tags ?? []),
    goals: p.goals ?? [],
    internal_notes: p.internalNotes ?? null,
    social_links: asJsonObject(p.socialLinks),
    primary_deal_id: p.primaryDealId ?? null,
    street: p.street ?? null,
    zip: p.zip ?? null,
    city: p.city ?? null,
    country: p.country ?? null,
    email: p.email ?? null,
    phone: p.phone ?? null,
    vat_id: p.vatId ?? null,
    updated_at: ctx.now,
  }
}
