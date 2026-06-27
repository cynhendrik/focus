import { create } from 'zustand'
import { KpisGateway } from '@/data/kpis.gateway'
import { log } from '@/lib/logger'
import type { Kpi, UpsertKpiPayload } from '@/types/kpi.types'
import type { AppError } from '@/types/error.types'
import { isAppError, formatError } from '@/types/error.types'

interface KpisState {
  kpis: Kpi[]
  isLoading: boolean
  error: AppError | null
  currentCustomerId: string | null
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
  currentCustomerId: null,

  loadForCustomer: async (customerId) => {
    set({ isLoading: true, error: null })
    try {
      const kpis = await KpisGateway.getByCustomer(customerId)
      set({ kpis, isLoading: false, currentCustomerId: customerId })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
      log.error('Failed to load KPIs', { error })
    }
  },

  upsert: async (payload) => {
    try {
      const updated = await KpisGateway.upsert(payload)
      set(s => ({ kpis: upsertById(s.kpis, updated) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  remove: async (id) => {
    try {
      await KpisGateway.delete(id)
      set(s => ({ kpis: s.kpis.filter(k => k.id !== id) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },
}))
