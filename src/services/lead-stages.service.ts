import { invoke } from '@tauri-apps/api/core'
import type { LeadStage, UpsertLeadStagePayload } from '@/types/lead.types'

export const LeadStagesService = {
  getAll(workspaceId: string): Promise<LeadStage[]> {
    return invoke('cmd_get_lead_stages', { workspaceId })
  },
  upsert(payload: UpsertLeadStagePayload): Promise<LeadStage> {
    return invoke('cmd_upsert_lead_stage', { payload })
  },
  delete(id: string, workspaceId: string): Promise<void> {
    return invoke('cmd_delete_lead_stage', { id, workspaceId })
  },
  reorder(workspaceId: string, orderedIds: string[]): Promise<void> {
    return invoke('cmd_reorder_lead_stages', { workspaceId, orderedIds })
  },
  seed(workspaceId: string): Promise<void> {
    return invoke('cmd_seed_lead_stages', { workspaceId })
  },
}
