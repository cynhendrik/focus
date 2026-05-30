import { create } from 'zustand'
import { TodoService } from '@/services/todo.service'
import { log } from '@/lib/logger'
import type { Todo, UpsertTodoPayload, TodoBucket, TodoPriority } from '@/types/todo.types'
import type { AppError } from '@/types/error.types'
import { isAppError, formatError } from '@/types/error.types'

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
    notes:          t.notes,
    aiSummary:      t.aiSummary,
    checklist:      t.checklist,
    tags:           t.tags,
    assignee:       t.assignee,
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
    const nextDate = new Date()
    nextDate.setDate(nextDate.getDate() + 1)
    nextDate.setHours(9, 0, 0, 0)
    await get().upsert({
      ...todoToPayload(current),
      scheduledAt: nextDate.toISOString(),
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
