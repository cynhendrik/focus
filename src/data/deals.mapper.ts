import type { Deal, UpsertDealPayload } from '@/types/pipeline.types'

/** Supabase-`deals`-Zeile → Deal-Domänentyp. */
export function dealRowToDeal(r: any): Deal {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    createdBy: r.created_by,
    accountId: r.account_id,
    customerId: r.customer_id ?? undefined,
    contactId: r.contact_id ?? undefined,
    title: r.title,
    stage: r.stage,
    value: r.value ?? undefined,
    currency: r.currency ?? 'EUR',
    probability: r.probability ?? undefined,
    expectedClose: r.expected_close ?? undefined,
    owner: r.owner ?? undefined,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

/**
 * UpsertDealPayload → `deals`-Row für `supabase.from('deals').upsert(...)`.
 * Weggelassen (DB-Default beim Insert, Erhalt beim Update): created_at ((now())::text),
 * currency ('EUR'). contact_id/owner sind nicht im TS-Payload → bleiben beim Update erhalten.
 * account_id ist NOT NULL (ein Deal gehört immer zu einem Account).
 */
export function dealPayloadToRow(
  p: UpsertDealPayload,
  ctx: { id: string; now: string },
): Record<string, unknown> {
  return {
    id: ctx.id,
    workspace_id: p.workspaceId,
    created_by: p.createdBy,
    account_id: p.accountId,
    customer_id: p.customerId ?? null,
    title: p.title,
    stage: p.stage ?? 'prospect',
    value: p.value ?? null,
    probability: p.probability ?? null,
    expected_close: p.expectedClose ?? null,
    notes: p.notes ?? null,
    updated_at: ctx.now,
  }
}
