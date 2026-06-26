export type MessageKind = 'user' | 'system'
export type SystemEvent = 'task_assigned' | 'task_completed' | 'task_created'
export type MessageRefType = 'task' | 'account' | 'project'

export interface Message {
  id:          string
  workspaceId: string
  createdBy:   string
  kind:        MessageKind
  body:        string
  systemEvent: SystemEvent | null
  refType:     MessageRefType | null
  refId:       string | null
  visibility:  'internal' | 'client'
  mentions:    string[]
  createdAt:   string
  updatedAt:   string
  deletedAt:   string | null
}

export interface CreateMessagePayload {
  workspaceId: string
  createdBy:   string
  body:        string
  refType?:    MessageRefType | null
  refId?:      string | null
  mentions?:   string[]
}
