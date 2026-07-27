import type { Project, ProjectPhase, Deliverable } from '@/types/project.types'

function parseDeliverables(raw: unknown): Deliverable[] {
  if (Array.isArray(raw)) return raw as Deliverable[]
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

export function projectRowToProject(r: any): Project {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    accountId: r.account_id,
    title: r.title,
    description: r.description ?? null,
    status: r.status ?? 'active',
    currentPhaseId: r.current_phase_id ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    completedAt: r.completed_at ?? null,
    retainerMonthly: r.retainer_monthly ?? 0,
    retainerHours: r.retainer_hours ?? 0,
    retainerMonths: r.retainer_months ?? null,
  }
}

export function projectToRow(
  p: {
    workspaceId: string; accountId: string; title: string; description?: string
    retainerMonthly: number; retainerHours: number; retainerMonths: number | null
  },
  ctx: { id: string; now: string; isNew: boolean },
): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: ctx.id,
    workspace_id: p.workspaceId,
    account_id: p.accountId,
    title: p.title,
    description: p.description ?? null,
    updated_at: ctx.now,
    retainer_monthly: p.retainerMonthly,
    retainer_hours: p.retainerHours,
    retainer_months: p.retainerMonths,
  }
  if (ctx.isNew) {
    row.created_at = ctx.now
    row.status = 'active'
  }
  return row
}

export function projectPhaseRowToPhase(r: any): ProjectPhase {
  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    orderIndex: r.order_index ?? 0,
    createdAt: r.created_at,
    startDate: r.start_date,
    endDate: r.end_date,
    gateName: r.gate_name,
    gateState: r.gate_state ?? 'open',
    gateDate: r.gate_date ?? null,
    gateApprovedBy: r.gate_approved_by ?? null,
    progressPercent: r.progress_percent ?? 0,
    deliverables: parseDeliverables(r.deliverables),
  }
}
