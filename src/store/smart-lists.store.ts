import { create } from 'zustand'
import { SmartListService } from '@/services/smart-list.service'
import type { SmartList, UpsertSmartListPayload } from '@/types/smart-list.types'

interface SmartListsState {
  lists:        SmartList[]
  activeListId: string | null
  isLoading:    boolean
  load:   (workspaceId: string) => Promise<void>
  upsert: (payload: UpsertSmartListPayload) => Promise<void>
  remove: (id: string) => Promise<void>
  setActive: (id: string | null) => void
}

export const useSmartListsStore = create<SmartListsState>()((set) => ({
  lists:        [],
  activeListId: null,
  isLoading:    false,

  load: async (workspaceId) => {
    set({ isLoading: true })
    try {
      const lists = await SmartListService.getAll(workspaceId)
      set({ lists, isLoading: false })
    } catch {
      set({ isLoading: false })
    }
  },

  upsert: async (payload) => {
    const list = await SmartListService.upsert(payload)
    set(s => {
      const idx = s.lists.findIndex(l => l.id === list.id)
      return {
        lists: idx >= 0
          ? s.lists.map(l => l.id === list.id ? list : l)
          : [...s.lists, list],
      }
    })
  },

  remove: async (id) => {
    await SmartListService.delete(id)
    set(s => ({ lists: s.lists.filter(l => l.id !== id) }))
  },

  setActive: (id) => set({ activeListId: id }),
}))
