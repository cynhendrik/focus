import { create } from 'zustand'
import { PipelineService } from '@/services/pipeline.service'
import { log } from '@/lib/logger'
import type { PipelineStage, UpsertPipelineStagePayload } from '@/types/pipeline.types'
import type { AppError } from '@/types/error.types'
import { isAppError, formatError } from '@/types/error.types'

interface PipelineState {
  stages: PipelineStage[]
  isLoading: boolean
  error: AppError | null
  load: (workspaceId: string) => Promise<void>
  upsertStage: (payload: UpsertPipelineStagePayload) => Promise<void>
  removeStage: (id: string, workspaceId: string) => Promise<void>
  reorder: (workspaceId: string, orderedIds: string[]) => Promise<void>
  // Derived helpers (getters, not stored state):
  activeStages: () => PipelineStage[]
  wonStage: () => PipelineStage | undefined
  lostStage: () => PipelineStage | undefined
}

export const usePipelineStore = create<PipelineState>()((set, get) => ({
  stages: [],
  isLoading: false,
  error: null,

  load: async (workspaceId) => {
    set({ isLoading: true, error: null })
    try {
      const stages = await PipelineService.getAll(workspaceId)
      set({ stages, isLoading: false })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
      log.error('Failed to load pipeline stages', { error })
    }
  },

  upsertStage: async (payload) => {
    set({ error: null })
    try {
      const stage = await PipelineService.upsert(payload)
      set(s => {
        const exists = s.stages.some(st => st.id === stage.id)
        const updated = exists
          ? s.stages.map(st => st.id === stage.id ? stage : st)
          : [...s.stages, stage]
        return { stages: updated.sort((a, b) => a.orderIndex - b.orderIndex) }
      })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  removeStage: async (id, workspaceId) => {
    set({ error: null })
    try {
      await PipelineService.delete(id, workspaceId)
      set(s => ({ stages: s.stages.filter(st => st.id !== id) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  reorder: async (workspaceId, orderedIds) => {
    const prev = get().stages
    set(s => ({
      stages: orderedIds
        .map((id, idx) => {
          const st = s.stages.find(x => x.id === id)!
          return { ...st, orderIndex: idx }
        })
        .filter(Boolean),
    }))
    try {
      await PipelineService.reorder(workspaceId, orderedIds)
    } catch (err) {
      set({ stages: prev })
      throw err
    }
  },

  activeStages: () => get().stages.filter(s => !s.isWon && !s.isLost),
  wonStage: () => get().stages.find(s => s.isWon),
  lostStage: () => get().stages.find(s => s.isLost),
}))
