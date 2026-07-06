export type ProjectStatus = 'active' | 'paused' | 'completed'

export interface Project {
  id: string
  workspaceId: string
  accountId: string
  title: string
  description: string | null
  status: ProjectStatus
  currentPhaseId: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export interface UpsertProjectPayload {
  id?: string
  workspaceId: string
  accountId: string
  title: string
  description?: string
}

export interface ProjectPhase {
  id: string
  projectId: string
  name: string
  orderIndex: number
  createdAt: string
}

export interface CreateProjectPhasePayload {
  projectId: string
  name: string
}
