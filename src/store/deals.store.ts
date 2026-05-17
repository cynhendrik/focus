import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { useWorkspaceStore } from './workspace.store'
import { useAuthStore } from './auth.store'
import type { Deal, UpsertDealPayload, DealStage } from '@/types/deal.types'

interface DealsState {
  deals: Deal[]
  isLoading: boolean
  loadByAccount: (accountId: string) => Promise<void>
  upsert: (payload: Omit<UpsertDealPayload, 'workspaceId' | 'createdBy'>) => Promise<Deal>
  updateStage: (id: string, stage: DealStage) => Promise<Deal>
  remove: (id: string) => Promise<void>
}

export const useDealsStore = create<DealsState>()((set) => ({
  deals: [],
  isLoading: false,

  loadByAccount: async (accountId) => {
    set({ isLoading: true })
    try {
      const deals = await invoke<Deal[]>('get_deals', { accountId })
      set({ deals, isLoading: false })
    } catch {
      set({ isLoading: false })
    }
  },

  upsert: async (payload) => {
    const workspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? ''
    const createdBy = useAuthStore.getState().user?.id ?? ''
    const updated = await invoke<Deal>('upsert_deal', { payload: { ...payload, workspaceId, createdBy } })
    set(s => {
      const idx = s.deals.findIndex(d => d.id === updated.id)
      if (idx >= 0) { const next = [...s.deals]; next[idx] = updated; return { deals: next } }
      return { deals: [...s.deals, updated] }
    })
    return updated
  },

  updateStage: async (id, stage) => {
    const updated = await invoke<Deal>('update_deal_stage', { id, stage })
    set(s => ({ deals: s.deals.map(d => d.id === id ? updated : d) }))
    return updated
  },

  remove: async (id) => {
    await invoke<void>('delete_deal', { id })
    set(s => ({ deals: s.deals.filter(d => d.id !== id) }))
  },
}))
