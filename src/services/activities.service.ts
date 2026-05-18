import { invoke } from '@tauri-apps/api/core'
import type { Activity, CreateActivityPayload } from '@/types/pipeline.types'

export const ActivitiesService = {
  getByCustomer(customerId: string): Promise<Activity[]> {
    return invoke('get_activities_by_customer', { customerId })
  },
  create(payload: CreateActivityPayload): Promise<Activity> {
    return invoke('create_activity', { payload })
  },
  delete(id: string): Promise<void> {
    return invoke('delete_activity', { id })
  },
}
