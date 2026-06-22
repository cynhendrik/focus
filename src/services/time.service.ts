import { ActivitiesGateway } from '@/data/activities.gateway'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import type { TimeEntry, AddTimeEntryPayload } from '@/types/time.types'
import type { Activity } from '@/types/pipeline.types'

function activityToTimeEntry(a: Activity): TimeEntry {
  let minutes = 0
  let date = a.createdAt.slice(0, 10)
  try {
    const p = JSON.parse(a.payload ?? '{}')
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
    const activities = await ActivitiesGateway.getByAccount(customerId)
    return activities.filter(a => a.type === 'time_entry').map(activityToTimeEntry)
  },

  async add(payload: AddTimeEntryPayload): Promise<TimeEntry> {
    const workspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? ''
    const createdBy = useAuthStore.getState().user?.id ?? ''
    const created = await ActivitiesGateway.create({
      accountId: payload.customerId,
      workspaceId,
      createdBy,
      type: 'time_entry',
      title: payload.description,
      payload: JSON.stringify({ minutes: payload.minutes, date: payload.date }),
    })
    return activityToTimeEntry(created)
  },

  delete(id: string): Promise<void> {
    return ActivitiesGateway.delete(id)
  },
}
