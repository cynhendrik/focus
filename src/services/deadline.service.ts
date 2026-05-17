import { invoke } from '@tauri-apps/api/core'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import type { Deadline, UpsertDeadlinePayload } from '@/types/deadline.types'
import type { Activity } from '@/types/activity.types'

function activityToDeadline(a: Activity): Deadline {
  return {
    id: a.id,
    customerId: a.accountId,
    title: a.title ?? '',
    dueDate: a.dueAt ?? '',
    done: a.status === 'done',
    createdAt: a.createdAt,
  }
}

export const DeadlineService = {
  async getByCustomer(customerId: string): Promise<Deadline[]> {
    const activities = await invoke<Activity[]>('get_activities_by_account', { accountId: customerId })
    return activities
      .filter(a => {
        if (a.type !== 'task') return false
        try { const p = JSON.parse(a.payload); return p.is_follow_up !== true } catch { return true }
      })
      .filter(a => a.dueAt)
      .map(activityToDeadline)
  },

  async upsert(payload: UpsertDeadlinePayload): Promise<Deadline> {
    if (payload.id) {
      const updated = await invoke<Activity>('update_activity', {
        id: payload.id,
        payload: {
          title: payload.title,
          status: payload.done ? 'done' : 'open',
          dueAt: payload.dueDate,
        },
      })
      return activityToDeadline(updated)
    }
    const workspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? ''
    const createdBy = useAuthStore.getState().user?.id ?? ''
    const created = await invoke<Activity>('create_activity', {
      payload: {
        accountId: payload.customerId,
        workspaceId,
        createdBy,
        type: 'task',
        title: payload.title,
        status: payload.done ? 'done' : 'open',
        dueAt: payload.dueDate,
        payload: JSON.stringify({ is_follow_up: false }),
      },
    })
    return activityToDeadline(created)
  },

  delete(id: string): Promise<void> {
    return invoke<void>('delete_activity', { id })
  },
}
