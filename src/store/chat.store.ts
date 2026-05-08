import { create } from 'zustand'
import { ChatService } from '@/services/chat.service'
import { log } from '@/lib/logger'
import type { ChatMessage, AddChatMessagePayload } from '@/types/chat.types'
import type { AppError } from '@/types/error.types'
import { isAppError, formatError } from '@/types/error.types'

interface ChatState {
  messages: ChatMessage[]
  isLoading: boolean
  error: AppError | null
  loadForCustomer: (customerId: string) => Promise<void>
  add: (payload: AddChatMessagePayload) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useChatStore = create<ChatState>()((set) => ({
  messages: [],
  isLoading: false,
  error: null,

  loadForCustomer: async (customerId) => {
    set({ isLoading: true, error: null })
    try {
      const messages = await ChatService.getByCustomer(customerId)
      set({ messages, isLoading: false })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
      log.error('Failed to load chat messages', { error })
    }
  },

  add: async (payload) => {
    try {
      const message = await ChatService.add(payload)
      set(s => ({ messages: [...s.messages, message] }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  remove: async (id) => {
    try {
      await ChatService.delete(id)
      set(s => ({ messages: s.messages.filter(m => m.id !== id) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },
}))
