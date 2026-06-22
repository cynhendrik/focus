import type { Auftrag, Zeiteintrag } from '@/types/auftrag.types'

/** Supabase-`auftraege`-Zeile → Auftrag (Drift-Extraspalten name/budget_hours/hourly_rate ignoriert). */
export function auftragRowToAuftrag(r: any): Auftrag {
  return {
    id: r.id,
    title: r.title ?? r.name ?? '',
    defaultHourlyRate: r.default_hourly_rate ?? null,
    notes: r.notes ?? '',
    status: (r.status ?? 'active') as Auftrag['status'],
    createdAt: r.created_at,
  }
}

/** Auftrag → `auftraege`-Row. created_at mitgesendet (Store setzt es beim Anlegen). */
export function auftragToRow(
  a: Auftrag,
  ctx: { workspaceId: string; createdBy: string },
): Record<string, unknown> {
  return {
    id: a.id,
    workspace_id: ctx.workspaceId,
    created_by: ctx.createdBy,
    title: a.title,
    notes: a.notes ?? '',
    status: a.status,
    default_hourly_rate: a.defaultHourlyRate,
    created_at: a.createdAt,
  }
}

/** Supabase-`zeiteintraege`-Zeile → Zeiteintrag (billed ist nativ boolean). */
export function zeiteintragRowToZeiteintrag(r: any): Zeiteintrag {
  return {
    id: r.id,
    auftragId: r.auftrag_id ?? null,
    accountId: r.account_id ?? null,
    date: r.date,
    minutes: r.minutes,
    description: r.description ?? '',
    hourlyRate: r.hourly_rate ?? null,
    billed: r.billed === true || r.billed === 1,
    invoiceId: r.invoice_id ?? null,
  }
}

/** Zeiteintrag → `zeiteintraege`-Row. created_at weggelassen (DB-Default (now())::text). */
export function zeiteintragToRow(
  z: Zeiteintrag,
  ctx: { workspaceId: string; createdBy: string },
): Record<string, unknown> {
  return {
    id: z.id,
    workspace_id: ctx.workspaceId,
    created_by: ctx.createdBy,
    auftrag_id: z.auftragId,
    account_id: z.accountId,
    date: z.date,
    minutes: z.minutes,
    description: z.description ?? '',
    hourly_rate: z.hourlyRate,
    billed: z.billed,
    invoice_id: z.invoiceId,
  }
}
