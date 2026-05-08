export type ChatSender = 'user' | 'customer'

export interface ChatMessage {
  id: string
  customerId: string
  content: string
  sender: ChatSender
  read: boolean
  createdAt: string
}

export interface AddChatMessagePayload {
  customerId: string
  content: string
  sender: ChatSender
}
