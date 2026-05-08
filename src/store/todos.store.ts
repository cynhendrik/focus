import { create } from 'zustand'
import { TodoService } from '@/services/todo.service'
import { log } from '@/lib/logger'
import type { Todo, UpsertTodoPayload } from '@/types/todo.types'
import type { AppError } from '@/types/error.types'
import { isAppError, formatError } from '@/types/error.types'

interface TodosState {
  todos: Todo[]
  isLoading: boolean
  error: AppError | null
  loadForCustomer: (customerId: string) => Promise<void>
  upsert: (payload: UpsertTodoPayload) => Promise<void>
  remove: (id: string) => Promise<void>
}

function upsertById(list: Todo[], updated: Todo): Todo[] {
  const idx = list.findIndex(t => t.id === updated.id)
  if (idx >= 0) { const next = [...list]; next[idx] = updated; return next }
  return [...list, updated]
}

export const useTodosStore = create<TodosState>()((set) => ({
  todos: [],
  isLoading: false,
  error: null,

  loadForCustomer: async (customerId) => {
    set({ isLoading: true, error: null })
    try {
      const todos = await TodoService.getByCustomer(customerId)
      set({ todos, isLoading: false })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
      log.error('Failed to load todos', { error })
    }
  },

  upsert: async (payload) => {
    try {
      const updated = await TodoService.upsert(payload)
      set(s => ({ todos: upsertById(s.todos, updated) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  remove: async (id) => {
    try {
      await TodoService.delete(id)
      set(s => ({ todos: s.todos.filter(t => t.id !== id) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },
}))
