export interface ConversationSummary {
  conversationId: string
  peerId:         string
  lastMessageAt:  string | null
  unreadCount:    number
}

export interface ChatOverview {
  teamUnread:    number
  conversations: ConversationSummary[]
}
