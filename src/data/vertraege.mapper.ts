import type { ContractRow } from '@/services/vertraege.service'
import type { VertragItem, IntervalUnit, VertragStatus } from '@/types/vertrag.types'
import type { TaxMode } from '@/types/finance.types'

function parseItems(v: unknown): VertragItem[] {
  if (Array.isArray(v)) return v as VertragItem[]
  if (typeof v === 'string') {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : [] } catch { return [] }
  }
  return []
}

/** Supabase-`vertraege`-Zeile → ContractRow (items jsonb→Array; created_by ist intern). */
export function vertragRowToContract(r: any): ContractRow {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    accountId: r.account_id ?? '',
    title: r.title,
    intervalValue: r.interval_value,
    intervalUnit: r.interval_unit as IntervalUnit,
    startDate: r.start_date,
    nextBillingDate: r.next_billing_date,
    endDate: r.end_date ?? null,
    status: r.status as VertragStatus,
    taxMode: r.tax_mode as TaxMode,
    notes: r.notes ?? '',
    items: parseItems(r.items),
    createdAt: r.created_at,
  }
}

/**
 * ContractRow → `vertraege`-Row für `supabase.from('vertraege').upsert(...)`.
 * created_by wird injiziert (RLS "own data": created_by = auth.uid()). items ist
 * jsonb → natives Array. created_at wird mitgesendet (Spalte hat keinen Default,
 * der Store setzt es beim Anlegen). Leerer accountId → null.
 */
export function vertragPayloadToRow(
  p: ContractRow,
  ctx: { createdBy: string },
): Record<string, unknown> {
  return {
    id: p.id,
    workspace_id: p.workspaceId,
    created_by: ctx.createdBy,
    account_id: p.accountId || null,
    title: p.title,
    interval_value: p.intervalValue,
    interval_unit: p.intervalUnit,
    start_date: p.startDate,
    next_billing_date: p.nextBillingDate,
    end_date: p.endDate ?? null,
    status: p.status,
    tax_mode: p.taxMode,
    notes: p.notes ?? '',
    items: p.items ?? [],
    created_at: p.createdAt,
  }
}
