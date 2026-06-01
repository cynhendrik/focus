import { invoke } from '@tauri-apps/api/core'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import type { Todo, UpsertTodoPayload, TodoPriority, TodoBucket } from '@/types/todo.types'
import type { Activity } from '@/types/activity.types'

const LEGACY_PRIORITY_MAP: Record<string, TodoPriority> = {
  high:   'p1',
  normal: 'p3',
  low:    'p4',
}

function normalizePriority(raw: unknown): TodoPriority {
  if (raw === 'p1' || raw === 'p2' || raw === 'p3' || raw === 'p4') return raw
  if (typeof raw === 'string' && raw in LEGACY_PRIORITY_MAP) return LEGACY_PRIORITY_MAP[raw]
  return 'p3'
}

function deriveBucket(status: string, scheduledAt: string | undefined): TodoBucket {
  if (status === 'done')        return 'done'
  if (status === 'in_progress') return 'in_progress'
  if (scheduledAt) {
    const today = new Date().toISOString().slice(0, 10)
    if (scheduledAt.slice(0, 10) === today) return 'today'
  }
  return 'backlog'
}

function activityToTodo(a: Activity): Todo {
  let checklist: Todo['checklist'] = []
  let tags: string[] = []
  let rawPriority: unknown = 'normal'
  let bucket: TodoBucket | undefined
  let scheduledAt: string | undefined
  let plannedMinutes: number | undefined
  let notes: string | undefined
  let aiSummary: string | undefined
  let calendarEventId: string | undefined
  let source: Todo['source']
  let actionType: Todo['actionType']
  let sourceRef: string | undefined

  try {
    const p = JSON.parse(a.payload)
    checklist       = Array.isArray(p.checklist) ? p.checklist : []
    tags            = Array.isArray(p.tags) ? p.tags : []
    rawPriority     = p.priority
    bucket          = p.bucket
    scheduledAt     = p.scheduledAt
    plannedMinutes  = typeof p.plannedMinutes === 'number' ? p.plannedMinutes : undefined
    notes           = typeof p.notes === 'string' ? p.notes : undefined
    aiSummary       = typeof p.aiSummary === 'string' ? p.aiSummary : undefined
    calendarEventId = typeof p.calendarEventId === 'string' ? p.calendarEventId : undefined
    const VALID_SOURCES: readonly string[] = ['manual', 'finance']
    source          = VALID_SOURCES.includes(p.source) ? p.source as Todo['source'] : undefined
    const VALID_ACTION_TYPES: readonly string[] = ['send_reminder']
    actionType      = VALID_ACTION_TYPES.includes(p.actionType) ? p.actionType as Todo['actionType'] : undefined
    sourceRef       = typeof p.sourceRef === 'string' ? p.sourceRef : undefined
  } catch {}

  const status: Todo['status'] = a.status === 'done'
    ? 'done'
    : (a.status as string) === 'in_progress' ? 'in_progress' : 'open'
  const priority = normalizePriority(rawPriority)

  return {
    id: a.id,
    customerId: a.accountId,
    title: a.title ?? '',
    status,
    priority,
    bucket: bucket ?? deriveBucket(status, scheduledAt),
    scheduledAt,
    plannedMinutes,
    dueDate: a.dueAt,
    notes,
    aiSummary,
    calendarEventId,
    checklist,
    tags,
    assignee: a.assignee,
    source,
    actionType,
    sourceRef,
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
    const status: 'open' | 'done' | 'in_progress' = payload.status ?? 'open'
    const scheduledAt = payload.scheduledAt
    const bucket = payload.bucket ?? deriveBucket(status, scheduledAt)

    const activityPayload = JSON.stringify({
      checklist:       payload.checklist ?? [],
      tags:            payload.tags ?? [],
      priority:        payload.priority ?? 'p3',
      bucket,
      scheduledAt:     scheduledAt ?? null,
      plannedMinutes:  payload.plannedMinutes ?? null,
      notes:           payload.notes ?? null,
      aiSummary:       payload.aiSummary ?? null,
      calendarEventId: payload.calendarEventId ?? null,
      source:          payload.source     ?? null,
      actionType:      payload.actionType ?? null,
      sourceRef:       payload.sourceRef  ?? null,
      is_follow_up:    false,
    })

    if (payload.id) {
      const updated = await invoke<Activity>('update_activity', {
        id: payload.id,
        payload: {
          title:    payload.title,
          status:   status,
          dueAt:    payload.dueDate ?? null,
          assignee: payload.assignee ?? null,
          payload:  activityPayload,
        },
      })
      return activityToTodo(updated)
    }
    const workspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? ''
    const createdBy = useAuthStore.getState().user?.id ?? ''
    const created = await invoke<Activity>('create_activity', {
      payload: {
        accountId:   payload.customerId,
        workspaceId,
        createdBy,
        type:        'task',
        title:       payload.title,
        status:      status,
        dueAt:       payload.dueDate ?? null,
        assignee:    payload.assignee ?? null,
        payload:     activityPayload,
      },
    })
    return activityToTodo(created)
  },

  delete(id: string): Promise<void> {
    return invoke<void>('delete_activity', { id })
  },
}
