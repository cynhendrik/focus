import { create } from 'zustand'
import { TimeService } from '@/services/time.service'
import { log } from '@/lib/logger'
import type { TimeEntry, AddTimeEntryPayload } from '@/types/time.types'
import type { AppError } from '@/types/error.types'
import { isAppError, formatError } from '@/types/error.types'

interface TimeState {
  entries: TimeEntry[]
  isLoading: boolean
  error: AppError | null
  loadForCustomer: (customerId: string) => Promise<void>
  add: (payload: AddTimeEntryPayload) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useTimeStore = create<TimeState>()((set) => ({
  entries: [],
  isLoading: false,
  error: null,

  loadForCustomer: async (customerId) => {
    set({ isLoading: true, error: null })
    try {
      const entries = await TimeService.getByCustomer(customerId)
      set({ entries, isLoading: false })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
      log.error('Failed to load time entries', { error })
    }
  },

  add: async (payload) => {
    try {
      const entry = await TimeService.add(payload)
      set(s => ({ entries: [entry, ...s.entries] }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  remove: async (id) => {
    try {
      await TimeService.delete(id)
      set(s => ({ entries: s.entries.filter(e => e.id !== id) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },
}))
