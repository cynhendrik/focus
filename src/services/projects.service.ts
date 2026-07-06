import { invoke } from '@tauri-apps/api/core'
import type {
  Project, UpsertProjectPayload, ProjectPhase, CreateProjectPhasePayload,
} from '@/types/project.types'

export const ProjectsService = {
  getAll(workspaceId: string): Promise<Project[]> {
    return invoke('cmd_get_projects', { workspaceId })
  },
  getById(id: string): Promise<Project> {
    return invoke('cmd_get_project', { id })
  },
  upsert(payload: UpsertProjectPayload): Promise<Project> {
    return invoke('cmd_upsert_project', { payload })
  },
  delete(id: string, workspaceId: string): Promise<void> {
    return invoke('cmd_delete_project', { id, workspaceId })
  },
  advancePhase(projectId: string): Promise<Project> {
    return invoke('cmd_advance_project_phase', { projectId })
  },
  setStatus(projectId: string, status: 'active' | 'paused'): Promise<Project> {
    return invoke('cmd_set_project_status', { projectId, status })
  },
  getPhases(projectId: string): Promise<ProjectPhase[]> {
    return invoke('cmd_get_project_phases', { projectId })
  },
  createPhase(payload: CreateProjectPhasePayload): Promise<ProjectPhase> {
    return invoke('cmd_create_project_phase', { payload })
  },
  deletePhase(id: string, projectId: string): Promise<void> {
    return invoke('cmd_delete_project_phase', { id, projectId })
  },
  reorderPhases(projectId: string, orderedIds: string[]): Promise<void> {
    return invoke('cmd_reorder_project_phases', { projectId, orderedIds })
  },
}
