import type { ConversationSummary } from '@/types/conversation.types'

export function totalUnread(unreadTeam: number, conversations: ConversationSummary[]): number {
  return unreadTeam + conversations.reduce((sum, c) => sum + c.unreadCount, 0)
}
