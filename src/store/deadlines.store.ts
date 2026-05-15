import { create } from 'zustand'
import { DeadlineService } from '@/services/deadline.service'
import { log } from '@/lib/logger'
import type { Deadline, UpsertDeadlinePayload } from '@/types/deadline.types'
import type { AppError } from '@/types/error.types'
import { isAppError, formatError } from '@/types/error.types'

interface DeadlinesState {
  deadlines: Deadline[]
  isLoading: boolean
  error: AppError | null
  loadForCustomer: (customerId: string) => Promise<void>
  upsert: (payload: UpsertDeadlinePayload) => Promise<Deadline>
  remove: (id: string) => Promise<void>
}

function upsertById(list: Deadline[], updated: Deadline): Deadline[] {
  const idx = list.findIndex(d => d.id === updated.id)
  if (idx >= 0) { const next = [...list]; next[idx] = updated; return next }
  return [...list, updated]
}

export const useDeadlinesStore = create<DeadlinesState>()((set) => ({
  deadlines: [],
  isLoading: false,
  error: null,

  loadForCustomer: async (customerId) => {
    set({ isLoading: true, error: null })
    try {
      const deadlines = await DeadlineService.getByCustomer(customerId)
      set({ deadlines, isLoading: false })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
      log.error('Failed to load deadlines', { error })
    }
  },

  upsert: async (payload) => {
    try {
      const updated = await DeadlineService.upsert(payload)
      set(s => ({ deadlines: upsertById(s.deadlines, updated) }))
      return updated
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  remove: async (id) => {
    try {
      await DeadlineService.delete(id)
      set(s => ({ deadlines: s.deadlines.filter(d => d.id !== id) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },
}))
