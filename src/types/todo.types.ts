import type { Priority } from './customer.types'

export type TodoStatus = 'open' | 'in_progress' | 'done'

export interface ChecklistItem {
  id: string
  text: string
  done: boolean
}

export interface Todo {
  id: string
  customerId: string
  title: string
  status: TodoStatus
  priority: Priority
  dueDate?: string
  checklist: ChecklistItem[]
  tags: string[]
  assignee?: string
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
  checklist?: ChecklistItem[]
  tags?: string[]
  assignee?: string
}
