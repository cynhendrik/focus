import type { Priority } from './customer.types'

export type TodoStatus = 'open' | 'in_progress' | 'done'

export interface Todo {
  id: string
  customerId: string
  title: string
  status: TodoStatus
  priority: Priority
  dueDate?: string
  createdAt: string
  updatedAt: string
}

export interface UpsertTodoPayload {
  id?: string
  customerId: string
  title: string
  status?: TodoStatus
  priority?: Priority
  dueDate?: string
}
