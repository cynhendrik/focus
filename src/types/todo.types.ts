export type TodoPriority  = 'p1' | 'p2' | 'p3' | 'p4'
export type TodoBucket    = 'backlog' | 'today' | 'in_progress' | 'done'
export type TodoStatus    = 'open' | 'in_progress' | 'done'
export type TodoSource    = 'manual' | 'finance'
export type TodoActionType = 'send_reminder' | 'create_invoice' | 'followup' | 'reply_mail' | 'write_email' | 'write_offer' | 'call'

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
  /** ID of a linked calendar event — set when the task was created with a clock time. */
  calendarEventId?: string
  checklist: ChecklistItem[]
  tags: string[]
  assignee?: string
  source?: TodoSource
  actionType?: TodoActionType
  sourceRef?: string
  /** Projekt-Verknuepfung (Projektplaner). projectId ist eine echte activities.project_id-Spalte;
   *  projectPhaseId lebt wie bucket/notes im payload-JSON (siehe todos.mapper.ts). */
  projectId?: string
  projectPhaseId?: string
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
  projectId?: string
  projectPhaseId?: string
}
