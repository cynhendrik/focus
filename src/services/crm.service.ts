import { ActivitiesGateway } from '@/data/activities.gateway'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import type { FollowUp, UpsertFollowUpPayload, AccountActivityDate } from '@/types/crm.types'
import type { Activity } from '@/types/pipeline.types'

function activityToFollowUp(a: Activity): FollowUp {
  let priority: FollowUp['priority'] = 'normal'
  try {
    const p = JSON.parse(a.payload ?? '{}')
    priority = p.priority ?? 'normal'
  } catch {}
  return {
    id: a.id,
    customerId: a.accountId ?? '',
    title: a.title ?? '',
    dueDate: a.dueAt ?? '',
    status: a.status === 'done' ? 'erledigt' : 'offen',
    priority,
    createdAt: a.createdAt,
  }
}

const isFollowUp = (a: Activity): boolean => {
  if (a.type !== 'task') return false
  try { return JSON.parse(a.payload ?? '{}').is_follow_up === true } catch { return false }
}

export const CrmService = {
  async getByCustomer(customerId: string): Promise<FollowUp[]> {
    const activities = await ActivitiesGateway.getByAccount(customerId)
    return activities.filter(isFollowUp).map(activityToFollowUp)
  },

  async upsert(payload: UpsertFollowUpPayload): Promise<FollowUp> {
    const activityPayload = JSON.stringify({
      is_follow_up: true,
      priority: payload.priority ?? 'normal',
    })
    if (payload.id) {
      const updated = await ActivitiesGateway.update(payload.id, {
        title: payload.title,
        status: payload.status === 'erledigt' ? 'done' : 'open',
        dueAt: payload.dueDate,
        payload: activityPayload,
      })
      return activityToFollowUp(updated)
    }
    const workspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? ''
    const createdBy = useAuthStore.getState().user?.id ?? ''
    const created = await ActivitiesGateway.create({
      accountId: payload.customerId,
      workspaceId,
      createdBy,
      type: 'task',
      title: payload.title,
      status: payload.status === 'erledigt' ? 'done' : 'open',
      dueAt: payload.dueDate,
      payload: activityPayload,
    })
    return activityToFollowUp(created)
  },

  delete(id: string): Promise<void> {
    return ActivitiesGateway.delete(id)
  },

  async getAllFollowUps(workspaceId: string): Promise<FollowUp[]> {
    const activities = await ActivitiesGateway.getOpenTasks(workspaceId)
    return activities.filter(isFollowUp).map(activityToFollowUp)
  },

  getLastActivityDates(workspaceId: string): Promise<AccountActivityDate[]> {
    return ActivitiesGateway.getLastActivityDates(workspaceId)
  },
}
