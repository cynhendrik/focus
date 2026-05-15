import { invoke } from '@tauri-apps/api/core'
import type { Deadline, UpsertDeadlinePayload } from '@/types/deadline.types'

export const DeadlineService = {
  getByCustomer(customerId: string): Promise<Deadline[]> {
    return invoke<Deadline[]>('get_deadlines', { customerId })
  },
  upsert(payload: UpsertDeadlinePayload): Promise<Deadline> {
    return invoke<Deadline>('upsert_deadline', { payload })
  },
  delete(id: string): Promise<void> {
    return invoke<void>('delete_deadline', { id })
  },
}
