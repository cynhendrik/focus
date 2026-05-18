import { invoke } from '@tauri-apps/api/core'
import type { Deal, UpsertDealPayload } from '@/types/pipeline.types'

export const DealsService = {
  getByWorkspace(workspaceId: string): Promise<Deal[]> {
    return invoke('get_deals_by_workspace', { workspaceId })
  },
  getByCustomer(customerId: string): Promise<Deal[]> {
    return invoke('get_deals_by_customer', { customerId })
  },
  upsert(payload: UpsertDealPayload): Promise<Deal> {
    return invoke('upsert_deal', { payload })
  },
  updateStage(id: string, stage: string): Promise<Deal> {
    return invoke('update_deal_stage', { id, stage })
  },
  delete(id: string): Promise<void> {
    return invoke('delete_deal', { id })
  },
}
