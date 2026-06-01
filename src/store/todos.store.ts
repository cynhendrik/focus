import { create } from 'zustand'
import { TodoService } from '@/services/todo.service'
import { useCalendarStore } from '@/store/calendar.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { log } from '@/lib/logger'
import type { Todo, UpsertTodoPayload, TodoBucket, TodoPriority } from '@/types/todo.types'
import type { AppError } from '@/types/error.types'
import { isAppError, formatError } from '@/types/error.types'

// Format ISO date as local-iso (no timezone Z) — matches calendar store's format
function calendarIso(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}` +
         `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function addMinutesIso(iso: string, minutes: number): string {
  const d = new Date(iso)
  d.setMinutes(d.getMinutes() + minutes)
  return d.toISOString()
}

/** Task → Calendar: update the linked event when a task's schedule changes. */
async function syncLinkedEvent(todo: Todo, newScheduledAt: string | undefined): Promise<void> {
  if (!todo.calendarEventId) return
  if (!newScheduledAt) return
  const workspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? ''
  const createdBy   = useAuthStore.getState().user?.id ?? ''
  if (!workspaceId) return
  try {
    const minutes = todo.plannedMinutes ?? 30
    await useCalendarStore.getState().upsert({
      id: todo.calendarEventId,
      workspaceId, createdBy,
      accountId: todo.customerId,
      title: todo.title,
      startAt: calendarIso(newScheduledAt),
      endAt: calendarIso(addMinutesIso(newScheduledAt, minutes)),
      allDay: false,
      color: 'accent',
    }, { fromTodoSync: true })   // skip reverse-sync — we're the originator
  } catch (e) {
    log.error('failed to sync linked calendar event', { e })
  }
}

/** Task → Calendar: delete the linked event when its task is removed. */
async function deleteLinkedEvent(todo: Todo): Promise<void> {
  if (!todo.calendarEventId) return
  const workspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? ''
  if (!workspaceId) return
  try {
    await useCalendarStore.getState().remove(todo.calendarEventId, workspaceId, { fromTodoSync: true })
  } catch (e) {
    log.error('failed to delete linked calendar event', { e })
  }
}

// ─── Calendar → Task: reverse sync entrypoints used by calendar.store ────────

/** Called by calendar.store.upsert when an existing event's startAt changes. */
export async function syncTodoFromCalendar(eventId: string, newStartAt: string): Promise<void> {
  const state = useTodosStore.getState()
  const todo = state.allTodos.find(t => t.calendarEventId === eventId)
  if (!todo) return

  // Parse "YYYY-MM-DDTHH:mm:ss" (no timezone) as local time, then back to ISO.
  // Keeps the user-intended wall-clock time intact.
  const localDate = new Date(newStartAt)
  const newScheduledIso = localDate.toISOString()

  if (todo.scheduledAt === newScheduledIso) return   // already in sync

  // Derive new bucket from new date
  const today = new Date().toISOString().slice(0, 10)
  const newBucket = newScheduledIso.slice(0, 10) === today
    ? (todo.bucket === 'in_progress' ? 'in_progress' : 'today')
    : 'backlog'

  await state.upsert({
    id:             todo.id,
    customerId:     todo.customerId,
    title:          todo.title,
    status:         todo.status,
    priority:       todo.priority,
    bucket:         newBucket,
    scheduledAt:    newScheduledIso,
    plannedMinutes: todo.plannedMinutes,
    dueDate:        todo.dueDate,
    notes:          todo.notes,
    aiSummary:      todo.aiSummary,
    calendarEventId: todo.calendarEventId,
    checklist:      todo.checklist,
    tags:           todo.tags,
    assignee:       todo.assignee,
  })
}

/** Called by calendar.store.remove when an event with a linked todo gets deleted. */
export async function deleteTodoLinkedToEvent(eventId: string): Promise<void> {
  const state = useTodosStore.getState()
  const todo = state.allTodos.find(t => t.calendarEventId === eventId)
  if (!todo) return
  try {
    await TodoService.delete(todo.id)
    useTodosStore.setState(s => ({
      todos:    s.todos.filter(t => t.id !== todo.id),
      allTodos: s.allTodos.filter(t => t.id !== todo.id),
    }))
  } catch (e) {
    log.error('failed to delete todo linked to removed calendar event', { e })
  }
}

interface TodosState {
  todos: Todo[]
  allTodos: Todo[]
  isLoading: boolean
  error: AppError | null

  loadForCustomer: (customerId: string) => Promise<void>
  loadAll: (workspaceId: string) => Promise<void>
  upsert: (payload: UpsertTodoPayload) => Promise<Todo>
  remove: (id: string) => Promise<void>

  complete:        (id: string) => Promise<void>
  postpone:        (id: string) => Promise<void>
  setBucket:       (id: string, bucket: TodoBucket) => Promise<void>
  setScheduledAt:  (id: string, iso: string | undefined) => Promise<void>
  setPriority:     (id: string, priority: TodoPriority) => Promise<void>
  toggleChecklist: (id: string, itemId: string) => Promise<void>
  updateNotes:     (id: string, notes: string) => Promise<void>
}

function upsertById(list: Todo[], updated: Todo): Todo[] {
  const idx = list.findIndex(t => t.id === updated.id)
  if (idx >= 0) { const next = [...list]; next[idx] = updated; return next }
  return [...list, updated]
}

function todoToPayload(t: Todo): UpsertTodoPayload {
  return {
    id: t.id,
    customerId:     t.customerId,
    title:          t.title,
    status:         t.status,
    priority:       t.priority,
    bucket:         t.bucket,
    scheduledAt:    t.scheduledAt,
    plannedMinutes: t.plannedMinutes,
    dueDate:        t.dueDate,
    notes:           t.notes,
    aiSummary:       t.aiSummary,
    calendarEventId: t.calendarEventId,
    checklist:       t.checklist,
    tags:            t.tags,
    assignee:        t.assignee,
    source:          t.source,
    actionType:      t.actionType,
    sourceRef:       t.sourceRef,
  }
}

export const useTodosStore = create<TodosState>()((set, get) => ({
  todos: [],
  allTodos: [],
  isLoading: false,
  error: null,

  loadAll: async (workspaceId) => {
    try {
      const allTodos = await TodoService.getAll(workspaceId)
      set({ allTodos })
    } catch (err) {
      log.error('Failed to load all todos', { err })
    }
  },

  loadForCustomer: async (customerId) => {
    set({ isLoading: true, error: null })
    try {
      const todos = await TodoService.getByCustomer(customerId)
      // Merge into allTodos so global views (filtered by customerId) see ALL of this
      // customer's tasks — including done/in_progress — not just the open ones from loadAll.
      set(s => {
        const otherCustomers = s.allTodos.filter(t => t.customerId !== customerId)
        return { todos, allTodos: [...otherCustomers, ...todos], isLoading: false }
      })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
      log.error('Failed to load todos', { error })
    }
  },

  upsert: async (payload) => {
    try {
      const updated = await TodoService.upsert(payload)
      set(s => ({
        todos:    upsertById(s.todos, updated),
        allTodos: upsertById(s.allTodos, updated),
      }))
      return updated
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  remove: async (id) => {
    try {
      const existing = get().allTodos.find(t => t.id === id)
      if (existing) await deleteLinkedEvent(existing)
      await TodoService.delete(id)
      set(s => ({
        todos:    s.todos.filter(t => t.id !== id),
        allTodos: s.allTodos.filter(t => t.id !== id),
      }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  complete: async (id) => {
    const current = get().allTodos.find(t => t.id === id)
    if (!current) return
    await get().upsert({ ...todoToPayload(current), status: 'done', bucket: 'done' })
  },

  postpone: async (id) => {
    const current = get().allTodos.find(t => t.id === id)
    if (!current) return
    // Shift the existing scheduledAt by 1 day if present (preserves clock time),
    // otherwise tomorrow 09:00.
    let nextIso: string
    if (current.scheduledAt) {
      const d = new Date(current.scheduledAt)
      d.setDate(d.getDate() + 1)
      nextIso = d.toISOString()
    } else {
      const d = new Date()
      d.setDate(d.getDate() + 1)
      d.setHours(9, 0, 0, 0)
      nextIso = d.toISOString()
    }
    await syncLinkedEvent(current, nextIso)
    await get().upsert({
      ...todoToPayload(current),
      scheduledAt: nextIso,
      bucket: 'backlog',
    })
  },

  setBucket: async (id, bucket) => {
    const current = get().allTodos.find(t => t.id === id)
    if (!current) return
    let status = current.status
    let scheduledAt = current.scheduledAt
    if (bucket === 'done')        status = 'done'
    if (bucket === 'in_progress') status = 'in_progress'
    if (bucket === 'today' && !scheduledAt) {
      const t = new Date(); t.setHours(9, 0, 0, 0)
      scheduledAt = t.toISOString()
    }
    if (bucket === 'backlog') status = 'open'
    if (bucket === 'today')   status = 'open'
    await get().upsert({ ...todoToPayload(current), bucket, status, scheduledAt })
  },

  setScheduledAt: async (id, iso) => {
    const current = get().allTodos.find(t => t.id === id)
    if (!current) return
    if (iso) await syncLinkedEvent(current, iso)
    await get().upsert({ ...todoToPayload(current), scheduledAt: iso })
  },

  setPriority: async (id, priority) => {
    const current = get().allTodos.find(t => t.id === id)
    if (!current) return
    await get().upsert({ ...todoToPayload(current), priority })
  },

  toggleChecklist: async (id, itemId) => {
    const current = get().allTodos.find(t => t.id === id)
    if (!current) return
    const nextChecklist = current.checklist.map(c =>
      c.id === itemId ? { ...c, done: !c.done } : c
    )
    await get().upsert({ ...todoToPayload(current), checklist: nextChecklist })
  },

  updateNotes: async (id, notes) => {
    const current = get().allTodos.find(t => t.id === id)
    if (!current) return
    await get().upsert({ ...todoToPayload(current), notes })
  },
}))
