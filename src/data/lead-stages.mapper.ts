import type { LeadStage } from '@/types/lead.types'

export function leadStageRowToStage(r: any): LeadStage {
  return {
    id: r.id, workspaceId: r.workspace_id, name: r.name, label: r.label,
    orderIndex: r.order_index ?? 0, color: r.color ?? '#6B7280',
    isQualified: r.is_qualified === 1 || r.is_qualified === true,
    isDisqualified: r.is_disqualified === 1 || r.is_disqualified === true,
    createdAt: r.created_at,
  }
}

/** Akzeptiert volle Stage (Migration) oder Upsert-Payload. created_at/updated_at = DB-Default. */
export function leadStageToRow(p: {
  id: string; workspaceId: string; name: string; label: string
  orderIndex?: number; color?: string; isQualified?: boolean; isDisqualified?: boolean
}): Record<string, unknown> {
  return {
    id: p.id, workspace_id: p.workspaceId, name: p.name, label: p.label,
    order_index: p.orderIndex ?? 0, color: p.color ?? '#6B7280',
    is_qualified: p.isQualified ? 1 : 0, is_disqualified: p.isDisqualified ? 1 : 0,
  }
}
