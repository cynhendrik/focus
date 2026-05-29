import { invoke } from '@tauri-apps/api/core'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import type { Todo, UpsertTodoPayload } from '@/types/todo.types'
import type { Activity } from '@/types/activity.types'

function activityToTodo(a: Activity): Todo {
  let checklist: Todo['checklist'] = []
  let tags: string[] = []
  let priority: Todo['priority'] = 'normal'
  try {
    const p = JSON.parse(a.payload)
    checklist = Array.isArray(p.checklist) ? p.checklist : []
    tags = Array.isArray(p.tags) ? p.tags : []
    priority = p.priority ?? 'normal'
  } catch {}
  return {
    id: a.id,
    customerId: a.accountId,
    title: a.title ?? '',
    status: a.status === 'done' ? 'done' : 'open',
    priority,
    dueDate: a.dueAt,
    checklist,
    tags,
    assignee: a.assignee,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  }
}

export const TodoService = {
  async getAll(workspaceId: string): Promise<Todo[]> {
    const activities = await invoke<Activity[]>('get_open_tasks', { workspaceId })
    return activities.map(activityToTodo)
  },

  async getByCustomer(customerId: string): Promise<Todo[]> {
    const activities = await invoke<Activity[]>('get_activities_by_account', { accountId: customerId })
    return activities.filter(a => a.type === 'task').map(activityToTodo)
  },

  async upsert(payload: UpsertTodoPayload): Promise<Todo> {
    const activityPayload = JSON.stringify({
      checklist: payload.checklist ?? [],
      tags: payload.tags ?? [],
      priority: payload.priority ?? 'normal',
      is_follow_up: false,
    })
    if (payload.id) {
      const updated = await invoke<Activity>('update_activity', {
        id: payload.id,
        payload: {
          title: payload.title,
          status: payload.status === 'done' ? 'done' : 'open',
          dueAt: payload.dueDate ?? null,
          assignee: payload.assignee ?? null,
          payload: activityPayload,
        },
      })
      return activityToTodo(updated)
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
        status: payload.status === 'done' ? 'done' : 'open',
        dueAt: payload.dueDate ?? null,
        assignee: payload.assignee ?? null,
        payload: activityPayload,
      },
    })
    return activityToTodo(created)
  },

  delete(id: string): Promise<void> {
    return invoke<void>('delete_activity', { id })
  },
}
