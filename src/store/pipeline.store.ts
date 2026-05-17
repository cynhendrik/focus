import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import type { PipelineStage, UpsertPipelineStagePayload } from '@/types/pipeline.types'

interface PipelineStore {
  stages: PipelineStage[]
  isLoading: boolean
  load: (workspaceId: string) => Promise<void>
  upsert: (payload: UpsertPipelineStagePayload) => Promise<void>
  remove: (id: string, workspaceId: string) => Promise<void>
  reorder: (workspaceId: string, orderedIds: string[]) => Promise<void>
  // Derived helpers (getters, not stored state):
  activeStages: () => PipelineStage[]
  wonStage: () => PipelineStage | undefined
  lostStage: () => PipelineStage | undefined
}

export const usePipelineStore = create<PipelineStore>()((set, get) => ({
  stages: [],
  isLoading: false,

  load: async (workspaceId) => {
    set({ isLoading: true })
    try {
      const stages = await invoke<PipelineStage[]>('cmd_get_pipeline_stages', { workspaceId })
      set({ stages, isLoading: false })
    } catch {
      set({ isLoading: false })
    }
  },

  upsert: async (payload) => {
    const stage = await invoke<PipelineStage>('cmd_upsert_pipeline_stage', { payload })
    set(s => {
      const idx = s.stages.findIndex(x => x.id === stage.id)
      if (idx >= 0) {
        const next = [...s.stages]
        next[idx] = stage
        return { stages: next }
      }
      return { stages: [...s.stages, stage] }
    })
  },

  remove: async (id, workspaceId) => {
    await invoke<void>('cmd_delete_pipeline_stage', { id, workspaceId })
    set(s => ({ stages: s.stages.filter(x => x.id !== id) }))
  },

  reorder: async (workspaceId, orderedIds) => {
    await invoke<void>('cmd_reorder_pipeline_stages', { workspaceId, orderedIds })
    const stages = await invoke<PipelineStage[]>('cmd_get_pipeline_stages', { workspaceId })
    set({ stages })
  },

  activeStages: () => get().stages.filter(s => !s.isWon && !s.isLost),
  wonStage: () => get().stages.find(s => s.isWon),
  lostStage: () => get().stages.find(s => s.isLost),
}))
