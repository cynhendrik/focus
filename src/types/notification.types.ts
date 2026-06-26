export type NotificationType = 'assigned' | 'mention' | 'comment' | 'completed'
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
  readAt:      string | null
  createdAt:   string
}
