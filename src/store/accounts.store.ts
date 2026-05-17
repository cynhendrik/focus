import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { useWorkspaceStore } from './workspace.store'
import { useAuthStore } from './auth.store'
import type { Account, UpsertAccountPayload } from '@/types/account.types'

interface AccountsState {
  accounts: Account[]
  isLoading: boolean
  init: () => Promise<void>
  upsert: (payload: Omit<UpsertAccountPayload, 'workspaceId' | 'createdBy'> & { id?: string }) => Promise<Account>
  remove: (id: string) => Promise<void>
}

function upsertById(list: Account[], updated: Account): Account[] {
  const idx = list.findIndex(a => a.id === updated.id)
  if (idx >= 0) { const next = [...list]; next[idx] = updated; return next }
  return [...list, updated]
}

export const useAccountsStore = create<AccountsState>()((set) => ({
  accounts: [],
  isLoading: false,

  init: async () => {
    const workspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? ''
    set({ isLoading: true })
    try {
      const accounts = await invoke<Account[]>('get_accounts', { workspaceId })
      set({ accounts, isLoading: false })
    } catch {
      set({ isLoading: false })
    }
  },

  upsert: async (payload) => {
    const workspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? ''
    const createdBy = useAuthStore.getState().user?.id ?? ''
    const updated = await invoke<Account>('upsert_account', { payload: { ...payload, workspaceId, createdBy } })
    set(s => ({ accounts: upsertById(s.accounts, updated) }))
    return updated
  },

  remove: async (id) => {
    const workspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? ''
    await invoke<void>('delete_account', { id, workspaceId })
    set(s => ({ accounts: s.accounts.filter(a => a.id !== id) }))
  },
}))
