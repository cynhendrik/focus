import { invoke } from '@tauri-apps/api/core'
import type { TimeEntry, AddTimeEntryPayload } from '@/types/time.types'

export const TimeService = {
  getByCustomer(customerId: string): Promise<TimeEntry[]> {
    return invoke<TimeEntry[]>('get_time_entries', { customerId })
  },
  add(payload: AddTimeEntryPayload): Promise<TimeEntry> {
    return invoke<TimeEntry>('add_time_entry', { payload })
  },
  delete(id: string): Promise<void> {
    return invoke<void>('delete_time_entry', { id })
  },
}
