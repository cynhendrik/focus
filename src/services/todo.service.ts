import { invoke } from '@tauri-apps/api/core'
import type { Todo, UpsertTodoPayload } from '@/types/todo.types'

export const TodoService = {
  getByCustomer(customerId: string): Promise<Todo[]> {
    return invoke<Todo[]>('get_todos', { customerId })
  },
  upsert(payload: UpsertTodoPayload): Promise<Todo> {
    return invoke<Todo>('upsert_todo', { payload })
  },
  delete(id: string): Promise<void> {
    return invoke<void>('delete_todo', { id })
  },
}
