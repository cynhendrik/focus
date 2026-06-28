import { create } from 'zustand'
import { MessagesGateway } from '@/data/messages.gateway'
import { ConversationsGateway } from '@/data/conversations.gateway'
import { useChatOverlayStore } from '@/store/chat-overlay.store'
import { useAuthStore } from '@/store/auth.store'
import { TEAM_KEY, threadKeyOf } from '@/lib/chat/threads'
import { log } from '@/lib/logger'
import type { Message, CreateMessagePayload } from '@/types/message.types'
import type { ConversationSummary } from '@/types/conversation.types'

interface ThreadState { messages: Message[]; hasMore: boolean; loading: boolean; loadingMore: boolean }
export const emptyThread = (): ThreadState => ({ messages: [], hasMore: true, loading: false, loadingMore: false })

interface MessagesState {
  threads:       Record<string, ThreadState>
  conversations: ConversationSummary[]
  unreadTeam:    number
  loadOverview:  (workspaceId: string) => Promise<void>
  loadThread:    (workspaceId: string, key: string) => Promise<void>
  loadMore:      (workspaceId: string, key: string) => Promise<void>
  markRead:      (workspaceId: string, key: string) => Promise<void>
  getOrCreateDm: (workspaceId: string, peerId: string) => Promise<string>
  send:          (payload: CreateMessagePayload) => Promise<Message>
  appendRealtime:(msg: Message) => void
}

const PAGE = 50
const keyOfMessage = (m: Message): string => m.conversationId ?? TEAM_KEY

export const useMessagesStore = create<MessagesState>()((set, get) => ({
  threads: {},
  conversations: [],
  unreadTeam: 0,

  loadOverview: async (workspaceId) => {
    try {
      const ov = await ConversationsGateway.overview(workspaceId)
      set({ conversations: ov.conversations, unreadTeam: ov.teamUnread })
    } catch (err) { log.error('Failed to load chat overview', { err }) }
  },

  loadThread: async (workspaceId, key) => {
    set(s => ({ threads: { ...s.threads, [key]: { ...(s.threads[key] ?? emptyThread()), loading: true } } }))
    try {
      const conversationId = key === TEAM_KEY ? null : key
      const msgs = await MessagesGateway.listRecent(workspaceId, conversationId, PAGE)
      set(s => ({ threads: { ...s.threads, [key]: { messages: msgs, hasMore: msgs.length === PAGE, loading: false, loadingMore: false } } }))
    } catch (err) {
      log.error('Failed to load thread', { err, key })
      set(s => ({ threads: { ...s.threads, [key]: { ...(s.threads[key] ?? emptyThread()), loading: false } } }))
    }
  },

  loadMore: async (workspaceId, key) => {
    const t = get().threads[key]
    if (!t || !t.hasMore || t.messages.length === 0 || t.loadingMore) return
    const oldest = t.messages[0].createdAt
    set(s => ({ threads: { ...s.threads, [key]: { ...t, loadingMore: true } } }))
    try {
      const conversationId = key === TEAM_KEY ? null : key
      const older = await MessagesGateway.listBefore(workspaceId, oldest, conversationId, PAGE)
      set(s => {
        const cur = s.threads[key] ?? emptyThread()
        const existing = new Set(cur.messages.map(m => m.id))
        const fresh = older.filter(m => !existing.has(m.id))
        return { threads: { ...s.threads, [key]: { ...cur, messages: [...fresh, ...cur.messages], hasMore: older.length === PAGE, loadingMore: false } } }
      })
    } catch (err) {
      log.error('Failed to load older messages', { err })
      set(s => ({ threads: { ...s.threads, [key]: { ...(s.threads[key] ?? emptyThread()), loadingMore: false } } }))
    }
  },

  markRead: async (workspaceId, key) => {
    set(s => key === TEAM_KEY
      ? { unreadTeam: 0 }
      : { conversations: s.conversations.map(c => c.conversationId === key ? { ...c, unreadCount: 0 } : c) })
    try { await ConversationsGateway.markRead(workspaceId, key) }
    catch (err) { log.error('Failed to mark chat read', { err }) }
  },

  getOrCreateDm: async (workspaceId, peerId) => {
    const id = await ConversationsGateway.getOrCreateDm(workspaceId, peerId)
    set(s => s.conversations.some(c => c.conversationId === id)
      ? s
      : { conversations: [...s.conversations, { conversationId: id, peerId, lastMessageAt: null, unreadCount: 0 }] })
    return id
  },

  send: async (payload) => {
    const msg = await MessagesGateway.create(payload)
    get().appendRealtime(msg)
    return msg
  },

  appendRealtime: (msg) => {
    const key = keyOfMessage(msg)
    const myId = useAuthStore.getState().user?.id
    const ov = useChatOverlayStore.getState()
    const viewing = ov.open && threadKeyOf(ov.selected as any) === key
    const fromMe = msg.createdBy === myId

    set(s => {
      const cur = s.threads[key] ?? emptyThread()
      const threads = cur.messages.some(m => m.id === msg.id)
        ? s.threads
        : { ...s.threads, [key]: { ...cur, messages: [...cur.messages, msg] } }

      let unreadTeam = s.unreadTeam
      let conversations = s.conversations
      const countsAsUnread = !fromMe && !viewing

      if (key === TEAM_KEY) {
        if (countsAsUnread) unreadTeam = s.unreadTeam + 1
      } else {
        const exists = conversations.some(c => c.conversationId === key)
        if (!exists) {
          conversations = [...conversations, { conversationId: key, peerId: msg.createdBy, lastMessageAt: msg.createdAt, unreadCount: countsAsUnread ? 1 : 0 }]
        } else {
          conversations = conversations.map(c => c.conversationId === key
            ? { ...c, lastMessageAt: msg.createdAt, unreadCount: countsAsUnread ? c.unreadCount + 1 : c.unreadCount }
            : c)
        }
      }
      return { threads, unreadTeam, conversations }
    })

    if (viewing) void get().markRead(msg.workspaceId, key)
  },
}))
