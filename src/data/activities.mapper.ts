import type { Activity, CreateActivityPayload, UpdateActivityPayload } from '@/types/pipeline.types'

function parseObj(s?: string): Record<string, unknown> {
  if (!s) return {}
  try { const p = JSON.parse(s); return p && typeof p === 'object' && !Array.isArray(p) ? p : {} } catch { return {} }
}

/** Supabase-`activities`-Zeile → Activity (payload jsonb→String). */
export function activityRowToActivity(r: any): Activity {
  return {
    id: r.id, workspaceId: r.workspace_id, createdBy: r.created_by,
    accountId: r.account_id ?? '', customerId: r.customer_id ?? undefined,
    type: r.type, title: r.title ?? undefined, body: r.body ?? undefined,
    payload: typeof r.payload === 'string' ? r.payload : JSON.stringify(r.payload ?? {}),
    status: r.status ?? 'open', dueAt: r.due_at ?? undefined,
    assignee: r.assignee ?? undefined,
    createdAt: r.created_at, updatedAt: r.updated_at,
  }
}

/** CreateActivityPayload → activities-Row (payload String→jsonb-Objekt; created_at/updated_at gesetzt). */
export function activityPayloadToRow(
  p: CreateActivityPayload, ctx: { id: string; now: string },
): Record<string, unknown> {
  return {
    id: ctx.id, workspace_id: p.workspaceId, created_by: p.createdBy,
    account_id: p.accountId || null, customer_id: p.customerId ?? null,
    type: p.type, title: p.title ?? null, body: p.body ?? null,
    payload: parseObj(p.payload), status: p.status ?? 'open', due_at: p.dueAt ?? null,
    assignee: p.assignee ?? null,
    created_at: ctx.now, updated_at: ctx.now,
  }
}

/** UpdateActivityPayload → Patch (nur gesetzte Felder; payload String→Objekt; + updated_at). */
export function activityUpdateToPatch(
  p: UpdateActivityPayload & { payload?: string }, now: string,
): Record<string, unknown> {
  const patch: Record<string, unknown> = { updated_at: now }
  if (p.title !== undefined) patch.title = p.title
  if (p.body !== undefined) patch.body = p.body
  if (p.status !== undefined) patch.status = p.status
  if (p.dueAt !== undefined) patch.due_at = p.dueAt
  if (p.assignee !== undefined) patch.assignee = p.assignee
  if (p.payload !== undefined) patch.payload = parseObj(p.payload)
  return patch
}
