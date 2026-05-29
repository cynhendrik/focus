import { invoke } from '@tauri-apps/api/core'
import type { Activity, CreateActivityPayload, UpdateActivityPayload } from '@/types/pipeline.types'

export const ActivitiesService = {
  getByCustomer(customerId: string): Promise<Activity[]> {
    return invoke('get_activities_by_customer', { customerId })
  },
  getOpenFollowups(workspaceId: string): Promise<Activity[]> {
    return invoke('get_open_followups', { workspaceId })
  },
  create(payload: CreateActivityPayload): Promise<Activity> {
    return invoke('create_activity', { payload })
  },
  update(id: string, payload: UpdateActivityPayload): Promise<Activity> {
    return invoke('update_activity', { id, payload })
  },
  delete(id: string): Promise<void> {
    return invoke('delete_activity', { id })
  },
}
