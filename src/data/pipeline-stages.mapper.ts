import type { PipelineStage } from '@/types/pipeline.types'

export function pipelineStageRowToStage(r: any): PipelineStage {
  return {
    id: r.id, workspaceId: r.workspace_id, name: r.name, label: r.label,
    orderIndex: r.order_index ?? 0, color: r.color ?? '#6B7280',
    isWon: r.is_won === 1 || r.is_won === true,
    isLost: r.is_lost === 1 || r.is_lost === true,
    createdAt: r.created_at, updatedAt: r.updated_at,
  }
}

/** Akzeptiert volle Stage (Migration) oder Upsert-Payload. created_at/updated_at = DB-Default. */
export function pipelineStageToRow(p: {
  id: string; workspaceId: string; name: string; label: string
  orderIndex?: number; color?: string; isWon?: boolean; isLost?: boolean
}): Record<string, unknown> {
  return {
    id: p.id, workspace_id: p.workspaceId, name: p.name, label: p.label,
    order_index: p.orderIndex ?? 0, color: p.color ?? '#6B7280',
    is_won: p.isWon ? 1 : 0, is_lost: p.isLost ? 1 : 0,
  }
}
