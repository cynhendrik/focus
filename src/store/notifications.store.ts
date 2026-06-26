import { create } from 'zustand'
import { NotificationsGateway } from '@/data/notifications.gateway'
import { log } from '@/lib/logger'
import type { Notification } from '@/types/notification.types'

interface NotificationsState {
  notifications: Notification[]
  load:           (userId: string) => Promise<void>
  upsertRealtime: (n: Notification) => void
  markRead:       (id: string) => Promise<void>
  markAllRead:    (userId: string) => Promise<void>
  unreadCount:    () => number
}

export const useNotificationsStore = create<NotificationsState>()((set, get) => ({
  notifications: [],

  load: async (userId) => {
    try {
      const list = await NotificationsGateway.listForUser(userId)
      set({ notifications: list })
    } catch (err) {
      log.error('Failed to load notifications', { err })
    }
  },

  upsertRealtime: (n) => set(s => {
    const without = s.notifications.filter(x => x.id !== n.id)
    return { notifications: [n, ...without] }
  }),

  markRead: async (id) => {
    const stamp = new Date().toISOString()
    set(s => ({ notifications: s.notifications.map(n => n.id === id ? { ...n, readAt: stamp } : n) }))
    try { await NotificationsGateway.markRead(id) }
    catch (err) { log.error('Failed to mark notification read', { err }) }
  },

  markAllRead: async (userId) => {
    const stamp = new Date().toISOString()
    set(s => ({ notifications: s.notifications.map(n => n.readAt ? n : { ...n, readAt: stamp }) }))
    try { await NotificationsGateway.markAllRead(userId) }
    catch (err) { log.error('Failed to mark all read', { err }) }
  },

  unreadCount: () => get().notifications.filter(n => !n.readAt).length,
}))
