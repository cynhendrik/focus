import { create } from 'zustand'
import { DealsService } from '@/services/deals.service'
import { log } from '@/lib/logger'
import type { Deal, UpsertDealPayload } from '@/types/pipeline.types'
import type { AppError } from '@/types/error.types'
import { isAppError, formatError } from '@/types/error.types'

interface DealsState {
  deals: Deal[]
  customerDeals: Deal[]
  isLoading: boolean
  error: AppError | null
  loadAll: (workspaceId: string) => Promise<void>
  loadForCustomer: (customerId: string) => Promise<void>
  upsert: (payload: UpsertDealPayload) => Promise<void>
  remove: (id: string) => Promise<void>
  moveToStage: (dealId: string, stage: string) => Promise<void>
}

export const useDealsStore = create<DealsState>()((set, get) => ({
  deals: [],
  customerDeals: [],
  isLoading: false,
  error: null,

  loadAll: async (workspaceId) => {
    set({ isLoading: true, error: null })
    try {
      const deals = await DealsService.getByWorkspace(workspaceId)
      set({ deals, isLoading: false })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
      log.error('Failed to load deals', { error })
    }
  },

  loadForCustomer: async (customerId) => {
    set({ isLoading: true, error: null })
    try {
      const customerDeals = await DealsService.getByCustomer(customerId)
      set({ customerDeals, isLoading: false })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
      log.error('Failed to load customer deals', { error })
    }
  },

  upsert: async (payload) => {
    set({ error: null })
    try {
      const deal = await DealsService.upsert(payload)
      set(s => {
        const exists = s.deals.some(d => d.id === deal.id)
        const updatedDeals = exists
          ? s.deals.map(d => d.id === deal.id ? deal : d)
          : [deal, ...s.deals]
        const existsInCustomer = s.customerDeals.some(d => d.id === deal.id)
        const updatedCustomerDeals = existsInCustomer
          ? s.customerDeals.map(d => d.id === deal.id ? deal : d)
          : deal.customerId ? [deal, ...s.customerDeals] : s.customerDeals
        return { deals: updatedDeals, customerDeals: updatedCustomerDeals }
      })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  remove: async (id) => {
    set({ error: null })
    try {
      await DealsService.delete(id)
      set(s => ({
        deals: s.deals.filter(d => d.id !== id),
        customerDeals: s.customerDeals.filter(d => d.id !== id),
      }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  moveToStage: async (dealId, stage) => {
    const prev = get().deals.find(d => d.id === dealId)?.stage
    set(s => ({
      deals: s.deals.map(d => d.id === dealId ? { ...d, stage } : d),
      customerDeals: s.customerDeals.map(d => d.id === dealId ? { ...d, stage } : d),
    }))
    try {
      const updated = await DealsService.updateStage(dealId, stage)
      set(s => ({
        deals: s.deals.map(d => d.id === dealId ? updated : d),
        customerDeals: s.customerDeals.map(d => d.id === dealId ? updated : d),
      }))
    } catch (err) {
      if (prev !== undefined) {
        set(s => ({
          deals: s.deals.map(d => d.id === dealId ? { ...d, stage: prev } : d),
          customerDeals: s.customerDeals.map(d => d.id === dealId ? { ...d, stage: prev } : d),
        }))
      }
      throw err
    }
  },
}))
