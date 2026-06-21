import type { Activity, CreateActivityPayload, UpdateActivityPayload } from '@/types/pipeline.types'
import type { Todo, UpsertTodoPayload, TodoBucket, TodoPriority } from '@/types/todo.types'

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

export function activityToTodo(a: Activity): Todo {
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
    const p = JSON.parse(a.payload ?? '{}')
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

function buildTaskPayloadJson(p: UpsertTodoPayload): string {
  const status = p.status ?? 'open'
  const bucket = p.bucket ?? deriveBucket(status, p.scheduledAt)
  return JSON.stringify({
    checklist: p.checklist ?? [], tags: p.tags ?? [], priority: p.priority ?? 'p3', bucket,
    scheduledAt: p.scheduledAt ?? null, plannedMinutes: p.plannedMinutes ?? null,
    notes: p.notes ?? null, aiSummary: p.aiSummary ?? null, calendarEventId: p.calendarEventId ?? null,
    source: p.source ?? null, actionType: p.actionType ?? null, sourceRef: p.sourceRef ?? null,
    is_follow_up: false,
  })
}

export function todoToCreatePayload(
  p: UpsertTodoPayload, ctx: { workspaceId: string; createdBy: string },
): CreateActivityPayload {
  return {
    workspaceId: ctx.workspaceId, createdBy: ctx.createdBy, accountId: p.customerId ?? '',
    type: 'task', title: p.title, status: p.status ?? 'open', dueAt: p.dueDate ?? undefined,
    assignee: p.assignee ?? undefined, payload: buildTaskPayloadJson(p),
  }
}

export function todoToUpdatePayload(
  p: UpsertTodoPayload,
): UpdateActivityPayload & { payload: string } {
  return {
    title: p.title, status: p.status ?? 'open', dueAt: p.dueDate ?? undefined,
    assignee: p.assignee ?? undefined, payload: buildTaskPayloadJson(p),
  }
}
