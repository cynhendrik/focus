import { invoke } from '@tauri-apps/api/core'
import type { PipelineStage, UpsertPipelineStagePayload } from '@/types/pipeline.types'

export const PipelineService = {
  getAll(workspaceId: string): Promise<PipelineStage[]> {
    return invoke('cmd_get_pipeline_stages', { workspaceId })
  },
  upsert(payload: UpsertPipelineStagePayload): Promise<PipelineStage> {
    return invoke('cmd_upsert_pipeline_stage', { payload })
  },
  delete(id: string, workspaceId: string): Promise<void> {
    return invoke('cmd_delete_pipeline_stage', { id, workspaceId })
  },
  reorder(workspaceId: string, orderedIds: string[]): Promise<void> {
    return invoke('cmd_reorder_pipeline_stages', { workspaceId, orderedIds })
  },
  seed(workspaceId: string): Promise<void> {
    return invoke('cmd_seed_pipeline_stages', { workspaceId })
  },
}
