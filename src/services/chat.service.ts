import { invoke } from '@tauri-apps/api/core'
import type { ChatMessage, AddChatMessagePayload } from '@/types/chat.types'

export const ChatService = {
  getByCustomer(customerId: string): Promise<ChatMessage[]> {
    return invoke<ChatMessage[]>('get_chat_messages', { customerId })
  },
  add(payload: AddChatMessagePayload): Promise<ChatMessage> {
    return invoke<ChatMessage>('add_chat_message', { payload })
  },
  markRead(id: string): Promise<void> {
    return invoke<void>('mark_chat_read', { id })
  },
  delete(id: string): Promise<void> {
    return invoke<void>('delete_chat_message', { id })
  },
}
