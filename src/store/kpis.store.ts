import { create } from 'zustand'
import { KpiService } from '@/services/kpi.service'
import { log } from '@/lib/logger'
import type { Kpi, UpsertKpiPayload } from '@/types/kpi.types'
import type { AppError } from '@/types/error.types'
import { isAppError, formatError } from '@/types/error.types'

interface KpisState {
  kpis: Kpi[]
  isLoading: boolean
  error: AppError | null
  loadForCustomer: (customerId: string) => Promise<void>
  upsert: (payload: UpsertKpiPayload) => Promise<void>
  remove: (id: string) => Promise<void>
}

function upsertById(list: Kpi[], updated: Kpi): Kpi[] {
  const idx = list.findIndex(k => k.id === updated.id)
  if (idx >= 0) { const next = [...list]; next[idx] = updated; return next }
  return [...list, updated]
}

export const useKpisStore = create<KpisState>()((set) => ({
  kpis: [],
  isLoading: false,
  error: null,

  loadForCustomer: async (customerId) => {
    set({ isLoading: true, error: null })
    try {
      const kpis = await KpiService.getByCustomer(customerId)
      set({ kpis, isLoading: false })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
      log.error('Failed to load KPIs', { error })
    }
  },

  upsert: async (payload) => {
    try {
      const updated = await KpiService.upsert(payload)
      set(s => ({ kpis: upsertById(s.kpis, updated) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  remove: async (id) => {
    try {
      await KpiService.delete(id)
      set(s => ({ kpis: s.kpis.filter(k => k.id !== id) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },
}))
