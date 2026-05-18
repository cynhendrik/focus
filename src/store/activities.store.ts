import { create } from 'zustand'
import { ActivitiesService } from '@/services/activities.service'
import { useCrmStore } from '@/store/crm.store'
import { log } from '@/lib/logger'
import type { Activity, CreateActivityPayload } from '@/types/pipeline.types'
import type { AppError } from '@/types/error.types'
import { isAppError, formatError } from '@/types/error.types'

interface ActivitiesState {
  activities: Activity[]
  isLoading: boolean
  error: AppError | null
  loadForCustomer: (customerId: string) => Promise<void>
  create: (payload: CreateActivityPayload) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useActivitiesStore = create<ActivitiesState>()((set) => ({
  activities: [],
  isLoading: false,
  error: null,

  loadForCustomer: async (customerId) => {
    set({ isLoading: true, error: null })
    try {
      const activities = await ActivitiesService.getByCustomer(customerId)
      set({ activities, isLoading: false })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
      log.error('Failed to load activities', { error })
    }
  },

  create: async (payload) => {
    set({ error: null })
    try {
      const activity = await ActivitiesService.create(payload)
      set(s => ({ activities: [activity, ...s.activities] }))
      useCrmStore.getState().loadLastActivity(payload.workspaceId)
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  remove: async (id) => {
    set({ error: null })
    try {
      await ActivitiesService.delete(id)
      set(s => ({ activities: s.activities.filter(a => a.id !== id) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },
}))
