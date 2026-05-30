import { invoke } from '@tauri-apps/api/core'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import type { TimeEntry, AddTimeEntryPayload } from '@/types/time.types'
import type { Activity } from '@/types/activity.types'

function activityToTimeEntry(a: Activity): TimeEntry {
  let minutes = 0
  let date = a.createdAt.slice(0, 10)
  try {
    const p = JSON.parse(a.payload)
    minutes = p.minutes ?? 0
    date = p.date ?? date
  } catch {}
  return {
    id: a.id,
    customerId: a.accountId ?? '',
    description: a.title ?? '',
    minutes,
    date,
    createdAt: a.createdAt,
  }
}

export const TimeService = {
  async getByCustomer(customerId: string): Promise<TimeEntry[]> {
    const activities = await invoke<Activity[]>('get_activities_by_account', { accountId: customerId })
    return activities.filter(a => a.type === 'time_entry').map(activityToTimeEntry)
  },

  async add(payload: AddTimeEntryPayload): Promise<TimeEntry> {
    const workspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? ''
    const createdBy = useAuthStore.getState().user?.id ?? ''
    const created = await invoke<Activity>('create_activity', {
      payload: {
        accountId: payload.customerId,
        workspaceId,
        createdBy,
        type: 'time_entry',
        title: payload.description,
        payload: JSON.stringify({ minutes: payload.minutes, date: payload.date }),
      },
    })
    return activityToTimeEntry(created)
  },

  delete(id: string): Promise<void> {
    return invoke<void>('delete_activity', { id })
  },
}
