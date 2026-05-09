import { invoke } from '@tauri-apps/api/core'
import type { FollowUp, UpsertFollowUpPayload } from '@/types/crm.types'

export const CrmService = {
  getByCustomer(customerId: string): Promise<FollowUp[]> {
    return invoke<FollowUp[]>('get_follow_ups', { customerId })
  },
  upsert(payload: UpsertFollowUpPayload): Promise<FollowUp> {
    return invoke<FollowUp>('upsert_follow_up', { payload })
  },
  delete(id: string): Promise<void> {
    return invoke<void>('delete_follow_up', { id })
  },
}
