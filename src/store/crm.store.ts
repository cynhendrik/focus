import { create } from 'zustand'
import { CrmService } from '@/services/crm.service'
import { log } from '@/lib/logger'
import type { FollowUp, UpsertFollowUpPayload } from '@/types/crm.types'
import type { AppError } from '@/types/error.types'
import { isAppError, formatError } from '@/types/error.types'

interface CrmState {
  followUps: FollowUp[]
  isLoading: boolean
  error: AppError | null
  loadForCustomer: (customerId: string) => Promise<void>
  upsert: (payload: UpsertFollowUpPayload) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useCrmStore = create<CrmState>()((set) => ({
  followUps: [],
  isLoading: false,
  error: null,

  loadForCustomer: async (customerId) => {
    set({ isLoading: true, error: null })
    try {
      const followUps = await CrmService.getByCustomer(customerId)
      set({ followUps, isLoading: false })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
      log.error('Failed to load follow-ups', { error })
    }
  },

  upsert: async (payload) => {
    try {
      const fu = await CrmService.upsert(payload)
      set(s => {
        const exists = s.followUps.some(f => f.id === fu.id)
        return {
          followUps: exists
            ? s.followUps.map(f => f.id === fu.id ? fu : f)
            : [...s.followUps, fu],
        }
      })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  remove: async (id) => {
    try {
      await CrmService.delete(id)
      set(s => ({ followUps: s.followUps.filter(f => f.id !== id) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },
}))
