import type { Kpi, UpsertKpiPayload } from '@/types/kpi.types'

/** Supabase-`kpis`-Zeile → Kpi (account_id → customerId). */
export function kpiRowToKpi(r: any): Kpi {
  return {
    id:         r.id,
    customerId: r.account_id,
    label:      r.label,
    value:      r.value ?? undefined,
    unit:       r.unit ?? undefined,
    target:     r.target ?? undefined,
    period:     r.period ?? undefined,
    updatedAt:  r.updated_at,
  }
}

/** UpsertKpiPayload → `kpis`-Row (customerId → account_id). Kein created_at (wie lokal). */
export function kpiPayloadToRow(
  p: UpsertKpiPayload,
  ctx: { id: string; workspaceId: string; createdBy: string; now: string },
): Record<string, unknown> {
  return {
    id:           ctx.id,
    workspace_id: ctx.workspaceId,
    created_by:   ctx.createdBy,
    account_id:   p.customerId,
    label:        p.label,
    value:        p.value ?? null,
    unit:         p.unit ?? null,
    target:       p.target ?? null,
    period:       p.period ?? null,
    updated_at:   ctx.now,
  }
}
