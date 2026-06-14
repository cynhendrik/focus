import type { Lead, UpsertLeadPayload } from '@/types/lead.types'

/**
 * Rebuild a complete UpsertLeadPayload from an existing lead.
 *
 * The Rust `upsert_lead` command overwrites every column from the payload on
 * conflict, falling back to defaults when a field is absent (lead_status→"neu",
 * pipeline_stage→"inbox", re_engage_date→NULL). A partial payload therefore
 * silently resets the lead's stage and pulls re-engage leads back onto the
 * board. Editing one field must round-trip the whole lead.
 */
export function leadToUpsertPayload(
  lead: Lead,
  overrides: Partial<UpsertLeadPayload> = {},
): UpsertLeadPayload {
  return {
    id: lead.id,
    workspaceId: lead.workspaceId,
    name: lead.name,
    email: lead.email ?? undefined,
    phone: lead.phone ?? undefined,
    leadStatus: lead.leadStatus,
    leadSource: lead.leadSource,
    leadSourceDetail: lead.leadSourceDetail ?? undefined,
    pipelineStage: lead.pipelineStage,
    companyName: lead.companyName ?? undefined,
    linkedinUrl: lead.linkedinUrl ?? undefined,
    reEngageDate: lead.reEngageDate ?? undefined,
    ...overrides,
  }
}
