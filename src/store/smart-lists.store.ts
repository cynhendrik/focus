import { create } from 'zustand'
import { SmartListService } from '@/services/smart-list.service'
import type { SmartList, UpsertSmartListPayload } from '@/types/smart-list.types'
import type { AppError } from '@/types/error.types'
import { isAppError, formatError } from '@/types/error.types'
import { log } from '@/lib/logger'

interface SmartListsState {
  lists:        SmartList[]
  activeListId: string | null
  isLoading:    boolean
  error:        AppError | null
  load:   (workspaceId: string) => Promise<void>
  upsert: (payload: UpsertSmartListPayload) => Promise<void>
  remove: (id: string) => Promise<void>
  setActive: (id: string | null) => void
}

export const useSmartListsStore = create<SmartListsState>()((set) => ({
  lists:        [],
  activeListId: null,
  isLoading:    false,
  error:        null,

  load: async (workspaceId) => {
    set({ isLoading: true, error: null })
    try {
      const lists = await SmartListService.getAll(workspaceId)
      set({ lists, isLoading: false })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
      log.error('Failed to load smart lists', { error })
    }
  },

  upsert: async (payload) => {
    try {
      const list = await SmartListService.upsert(payload)
      set(s => {
        const idx = s.lists.findIndex(l => l.id === list.id)
        return {
          lists: idx >= 0
            ? s.lists.map(l => l.id === list.id ? list : l)
            : [...s.lists, list].sort((a, b) => a.orderIndex - b.orderIndex),
        }
      })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  remove: async (id) => {
    try {
      await SmartListService.delete(id)
      set(s => ({ lists: s.lists.filter(l => l.id !== id) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  setActive: (id) => set({ activeListId: id }),
}))
