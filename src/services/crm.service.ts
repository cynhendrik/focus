import { invoke } from '@tauri-apps/api/core'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import type { FollowUp, UpsertFollowUpPayload } from '@/types/crm.types'
import type { Activity } from '@/types/activity.types'

function activityToFollowUp(a: Activity): FollowUp {
  let priority: FollowUp['priority'] = 'normal'
  try {
    const p = JSON.parse(a.payload)
    priority = p.priority ?? 'normal'
  } catch {}
  return {
    id: a.id,
    customerId: a.accountId,
    title: a.title ?? '',
    dueDate: a.dueAt ?? '',
    status: a.status === 'done' ? 'erledigt' : 'offen',
    priority,
    createdAt: a.createdAt,
  }
}

export const CrmService = {
  async getByCustomer(customerId: string): Promise<FollowUp[]> {
    const activities = await invoke<Activity[]>('get_activities_by_account', { accountId: customerId })
    return activities
      .filter(a => {
        if (a.type !== 'task') return false
        try { return JSON.parse(a.payload).is_follow_up === true } catch { return false }
      })
      .map(activityToFollowUp)
  },

  async upsert(payload: UpsertFollowUpPayload): Promise<FollowUp> {
    const activityPayload = JSON.stringify({
      is_follow_up: true,
      priority: payload.priority ?? 'normal',
    })
    if (payload.id) {
      const updated = await invoke<Activity>('update_activity', {
        id: payload.id,
        payload: {
          title: payload.title,
          status: payload.status === 'erledigt' ? 'done' : 'open',
          dueAt: payload.dueDate,
          payload: activityPayload,
        },
      })
      return activityToFollowUp(updated)
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
        status: payload.status === 'erledigt' ? 'done' : 'open',
        dueAt: payload.dueDate,
        payload: activityPayload,
      },
    })
    return activityToFollowUp(created)
  },

  delete(id: string): Promise<void> {
    return invoke<void>('delete_activity', { id })
  },
}
