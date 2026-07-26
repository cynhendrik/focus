import { create } from 'zustand'
import { ProjectsGateway } from '@/data/projects.gateway'
import { log } from '@/lib/logger'
import type { Project, ProjectPhase, UpsertProjectPayload, CreateProjectPhasePayload } from '@/types/project.types'
import type { AppError } from '@/types/error.types'
import { isAppError, formatError } from '@/types/error.types'

interface ProjectsState {
  projects: Project[]
  phasesByProject: Record<string, ProjectPhase[]>
  isLoading: boolean
  error: AppError | null
  load: (workspaceId: string) => Promise<void>
  loadPhases: (projectId: string) => Promise<void>
  upsert: (payload: UpsertProjectPayload) => Promise<Project>
  remove: (id: string, workspaceId: string) => Promise<void>
  advancePhase: (projectId: string) => Promise<void>
  setStatus: (projectId: string, status: 'active' | 'paused') => Promise<void>
  createPhase: (payload: CreateProjectPhasePayload) => Promise<void>
  deletePhase: (id: string, projectId: string) => Promise<void>
  reorderPhases: (projectId: string, orderedIds: string[]) => Promise<void>
  updatePhaseProgress: (id: string, projectId: string, progressPercent: number) => Promise<void>
}

export const useProjectsStore = create<ProjectsState>()((set, get) => ({
  projects: [],
  phasesByProject: {},
  isLoading: false,
  error: null,

  load: async (workspaceId) => {
    set({ isLoading: true, error: null })
    try {
      const projects = await ProjectsGateway.getAll(workspaceId)
      set({ projects, isLoading: false })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
      log.error('Failed to load projects', { error })
    }
  },

  loadPhases: async (projectId) => {
    set({ error: null })
    try {
      const phases = await ProjectsGateway.getPhases(projectId)
      set(s => ({ phasesByProject: { ...s.phasesByProject, [projectId]: phases } }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error })
      log.error('Failed to load project phases', { error, projectId })
    }
  },

  upsert: async (payload) => {
    set({ error: null })
    try {
      const project = await ProjectsGateway.upsert(payload)
      set(s => {
        const exists = s.projects.some(p => p.id === project.id)
        return { projects: exists ? s.projects.map(p => p.id === project.id ? project : p) : [project, ...s.projects] }
      })
      return project
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error })
      log.error('Failed to upsert project', { error })
      throw err
    }
  },

  remove: async (id, workspaceId) => {
    set({ error: null })
    try {
      await ProjectsGateway.delete(id, workspaceId)
      set(s => ({ projects: s.projects.filter(p => p.id !== id) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error })
      log.error('Failed to delete project', { error })
      throw err
    }
  },

  advancePhase: async (projectId) => {
    set({ error: null })
    try {
      const project = await ProjectsGateway.advancePhase(projectId)
      set(s => ({ projects: s.projects.map(p => p.id === projectId ? project : p) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error })
      log.error('Failed to advance project phase', { error, projectId })
      throw err
    }
  },

  setStatus: async (projectId, status) => {
    set({ error: null })
    try {
      const project = await ProjectsGateway.setStatus(projectId, status)
      set(s => ({ projects: s.projects.map(p => p.id === projectId ? project : p) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error })
      log.error('Failed to set project status', { error, projectId })
      throw err
    }
  },

  createPhase: async (payload) => {
    set({ error: null })
    try {
      const phase = await ProjectsGateway.createPhase(payload)
      set(s => ({
        phasesByProject: {
          ...s.phasesByProject,
          [payload.projectId]: [...(s.phasesByProject[payload.projectId] ?? []), phase],
        },
      }))
      // Erste Phase eines Projekts setzt server-seitig current_phase_id -- lokalen
      // Projekt-Zustand nachziehen, damit die UI ohne Reload den Stepper korrekt zeigt.
      if (phase.orderIndex === 0) {
        set(s => ({
          projects: s.projects.map(p => p.id === payload.projectId ? { ...p, currentPhaseId: phase.id } : p),
        }))
      }
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error })
      log.error('Failed to create project phase', { error })
      throw err
    }
  },

  deletePhase: async (id, projectId) => {
    set({ error: null })
    try {
      await ProjectsGateway.deletePhase(id, projectId)
      set(s => ({
        phasesByProject: {
          ...s.phasesByProject,
          [projectId]: (s.phasesByProject[projectId] ?? []).filter(ph => ph.id !== id),
        },
      }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error })
      log.error('Failed to delete project phase', { error })
      throw err
    }
  },

  reorderPhases: async (projectId, orderedIds) => {
    const prev = get().phasesByProject[projectId] ?? []
    set(s => ({
      phasesByProject: {
        ...s.phasesByProject,
        [projectId]: orderedIds
          .map((id, idx) => {
            const ph = prev.find(x => x.id === id)
            return ph ? { ...ph, orderIndex: idx } : null
          })
          .filter((ph): ph is ProjectPhase => ph !== null),
      },
    }))
    try {
      await ProjectsGateway.reorderPhases(projectId, orderedIds)
    } catch (err) {
      set(s => ({ phasesByProject: { ...s.phasesByProject, [projectId]: prev } }))
      throw err
    }
  },

  updatePhaseProgress: async (id, projectId, progressPercent) => {
    set({ error: null })
    try {
      const phase = await ProjectsGateway.updatePhaseProgress(id, projectId, progressPercent)
      set(s => ({
        phasesByProject: {
          ...s.phasesByProject,
          [projectId]: (s.phasesByProject[projectId] ?? []).map(p => p.id === id ? phase : p),
        },
      }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error })
      log.error('Failed to update project phase progress', { error, id, projectId })
      throw err
    }
  },
}))
