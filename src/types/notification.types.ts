export type NotificationType = 'assigned' | 'mention' | 'comment' | 'completed' | 'dm'
export type NotificationRefType = 'task' | 'message'

export interface Notification {
  id:          string
  workspaceId: string
  userId:      string
  type:        NotificationType
  actorId:     string
  refType:     NotificationRefType
  refId:       string
  messageId:   string | null
  conversationId: string | null
  readAt:      string | null
  createdAt:   string
}
