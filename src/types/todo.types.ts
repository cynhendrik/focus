export type TodoPriority  = 'p1' | 'p2' | 'p3' | 'p4'
export type TodoBucket    = 'backlog' | 'today' | 'in_progress' | 'done'
export type TodoStatus    = 'open' | 'in_progress' | 'done'
export type TodoSource    = 'manual' | 'finance'
export type TodoActionType = 'send_reminder'

export interface ChecklistItem {
  id: string
  text: string
  done: boolean
}

export interface Todo {
  id: string
  customerId?: string
  title: string
  status: TodoStatus
  priority: TodoPriority
  bucket: TodoBucket
  scheduledAt?: string
  plannedMinutes?: number
  dueDate?: string
  notes?: string
  aiSummary?: string
  calendarEventId?: string
  checklist: ChecklistItem[]
  tags: string[]
  assignee?: string
  source?: TodoSource
  actionType?: TodoActionType
  sourceRef?: string
  createdAt: string
  updatedAt: string
}

export interface UpsertTodoPayload {
  id?: string
  customerId?: string
  title: string
  status?: TodoStatus
  priority?: TodoPriority
  bucket?: TodoBucket
  scheduledAt?: string
  plannedMinutes?: number
  dueDate?: string
  notes?: string
  aiSummary?: string
  calendarEventId?: string
  checklist?: ChecklistItem[]
  tags?: string[]
  assignee?: string
  source?: TodoSource
  actionType?: TodoActionType
  sourceRef?: string
}
