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
  updatePhaseProgress(id: string, projectId: string, progressPercent: number): Promise<ProjectPhase> {
    return invoke('cmd_update_project_phase_progress', { id, projectId, progressPercent })
  },
  requestGate(id: string, projectId: string, gateDate: string | null): Promise<ProjectPhase> {
    return invoke('cmd_request_gate', { id, projectId, gateDate })
  },
  approveGate(id: string, projectId: string, approvedBy: string): Promise<ProjectPhase> {
    return invoke('cmd_approve_gate', { id, projectId, approvedBy })
  },
  updateDeliverables(id: string, projectId: string, deliverablesJson: string): Promise<ProjectPhase> {
    return invoke('cmd_update_project_phase_deliverables', { id, projectId, deliverablesJson })
  },
  updateAssignees(id: string, projectId: string, assigneeIdsJson: string): Promise<ProjectPhase> {
    return invoke('cmd_update_project_phase_assignees', { id, projectId, assigneeIdsJson })
  },
  updateMoodboardItems(id: string, moodboardItemsJson: string): Promise<Project> {
    return invoke('cmd_update_project_moodboard_items', { id, moodboardItemsJson })
  },
  importMoodboardImage(workspaceId: string, name: string, data: number[], mimeType: string | null): Promise<{ id: string; path: string }> {
    return invoke('cmd_import_ws_file', { workspaceId, folderId: null, name, data, mimeType })
  },
  readMoodboardImage(id: string): Promise<number[]> {
    return invoke('cmd_read_ws_file', { id })
  },
  deleteMoodboardImage(id: string): Promise<void> {
    return invoke('cmd_delete_ws_file', { id })
  },
}
