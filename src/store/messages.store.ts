import { create } from 'zustand'
import { MessagesGateway } from '@/data/messages.gateway'
import { log } from '@/lib/logger'
import type { Message, CreateMessagePayload } from '@/types/message.types'

interface MessagesState {
  messages: Message[]
  loading:  boolean
  hasMore:  boolean
  loadRecent:     (workspaceId: string) => Promise<void>
  loadMore:       (workspaceId: string) => Promise<void>
  appendRealtime: (msg: Message) => void
  send:           (payload: CreateMessagePayload) => Promise<Message>
}

const PAGE = 50

export const useMessagesStore = create<MessagesState>()((set, get) => ({
  messages: [],
  loading:  false,
  hasMore:  true,

  loadRecent: async (workspaceId) => {
    set({ loading: true })
    try {
      const msgs = await MessagesGateway.listRecent(workspaceId, PAGE)
      set({ messages: msgs, loading: false, hasMore: msgs.length === PAGE })
    } catch (err) {
      log.error('Failed to load messages', { err })
      set({ loading: false })
    }
  },

  loadMore: async (workspaceId) => {
    const { messages, hasMore } = get()
    if (!hasMore || messages.length === 0) return
    const oldest = messages[0].createdAt
    try {
      const older = await MessagesGateway.listBefore(workspaceId, oldest, PAGE)
      set(s => ({ messages: [...older, ...s.messages], hasMore: older.length === PAGE }))
    } catch (err) {
      log.error('Failed to load older messages', { err })
    }
  },

  appendRealtime: (msg) => set(s =>
    s.messages.some(m => m.id === msg.id) ? s : { messages: [...s.messages, msg] }
  ),

  send: async (payload) => {
    const msg = await MessagesGateway.create(payload)
    get().appendRealtime(msg)
    return msg
  },
}))
