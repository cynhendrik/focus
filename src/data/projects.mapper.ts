import type { Project, ProjectPhase } from '@/types/project.types'

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
  }
}

export function projectToRow(p: {
  id: string; workspaceId: string; accountId: string; title: string; description?: string
}): Record<string, unknown> {
  return {
    id: p.id,
    workspace_id: p.workspaceId,
    account_id: p.accountId,
    title: p.title,
    description: p.description ?? null,
  }
}

export function projectPhaseRowToPhase(r: any): ProjectPhase {
  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    orderIndex: r.order_index ?? 0,
    createdAt: r.created_at,
  }
}
