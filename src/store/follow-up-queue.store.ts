import { create } from 'zustand'
import { FollowUpQueueService } from '@/services/follow-up-queue.service'
import { log } from '@/lib/logger'
import type { FollowUpQueueItem, CreateFollowUpSequencePayload } from '@/types/follow-up-queue.types'
import type { AppError } from '@/types/error.types'
import { isAppError, formatError } from '@/types/error.types'

interface FollowUpQueueState {
  items: FollowUpQueueItem[]
  isLoading: boolean
  error: AppError | null
  loadDue: (workspaceId: string) => Promise<void>
  loadForLead: (leadId: string) => Promise<void>
  createSequence: (payload: CreateFollowUpSequencePayload) => Promise<FollowUpQueueItem[]>
  cancelForLead: (leadId: string) => Promise<void>
  markSent: (id: string, sentActivityId: string) => Promise<void>
  markSkipped: (id: string) => Promise<void>
  updateDraft: (id: string, subject: string | null, body: string | null) => Promise<void>
  pendingItems: () => FollowUpQueueItem[]
  dueToday: () => FollowUpQueueItem[]
}

export const useFollowUpQueueStore = create<FollowUpQueueState>()((set, get) => ({
  items: [],
  isLoading: false,
  error: null,

  loadDue: async (workspaceId) => {
    set({ isLoading: true, error: null })
    try {
      const items = await FollowUpQueueService.getDue(workspaceId)
      set({ items, isLoading: false })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
      log.error('Failed to load due follow-ups', { error })
    }
  },

  loadForLead: async (leadId) => {
    set({ isLoading: true, error: null })
    try {
      const items = await FollowUpQueueService.getForLead(leadId)
      set({ items, isLoading: false })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
    }
  },

  createSequence: async (payload) => {
    try {
      const newItems = await FollowUpQueueService.createSequence(payload)
      set(s => ({ items: [...s.items, ...newItems] }))
      return newItems
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  cancelForLead: async (leadId) => {
    try {
      await FollowUpQueueService.cancelForLead(leadId)
      set(s => ({
        items: s.items.map(i =>
          i.leadId === leadId && i.status === 'pending'
            ? { ...i, status: 'cancelled' as const }
            : i
        ),
      }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  markSent: async (id, sentActivityId) => {
    try {
      const updated = await FollowUpQueueService.markSent(id, sentActivityId)
      set(s => ({ items: s.items.map(i => i.id === id ? updated : i) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  markSkipped: async (id) => {
    try {
      const updated = await FollowUpQueueService.markSkipped(id)
      set(s => ({ items: s.items.map(i => i.id === id ? updated : i) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  updateDraft: async (id, subject, body) => {
    try {
      const updated = await FollowUpQueueService.updateDraft(id, subject, body)
      set(s => ({ items: s.items.map(i => i.id === id ? updated : i) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  pendingItems: () => get().items.filter(i => i.status === 'pending'),
  dueToday: () => {
    const now = new Date().toISOString()
    return get().items.filter(i => i.status === 'pending' && i.sendAt <= now)
  },
}))
