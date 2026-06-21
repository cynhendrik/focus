import { create } from 'zustand'
import { AccountsGateway } from '@/data/accounts.gateway'
import { useWorkspaceStore } from './workspace.store'
import { useAuthStore } from './auth.store'
import { log } from '@/lib/logger'
import type { Account, UpsertAccountPayload } from '@/types/account.types'
import type { AppError } from '@/types/error.types'
import { isAppError, formatError } from '@/types/error.types'

interface AccountsState {
  accounts: Account[]
  isLoading: boolean
  error: AppError | null
  init: () => Promise<void>
  upsert: (payload: Omit<UpsertAccountPayload, 'workspaceId' | 'createdBy'> & { id?: string }) => Promise<Account>
  remove: (id: string) => Promise<void>
  setPrimaryDeal: (accountId: string, dealId: string | null) => Promise<void>
}

function upsertById(list: Account[], updated: Account): Account[] {
  const idx = list.findIndex(a => a.id === updated.id)
  if (idx >= 0) { const next = [...list]; next[idx] = updated; return next }
  return [...list, updated]
}

function toAppError(err: unknown): AppError {
  return isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
}

export const useAccountsStore = create<AccountsState>()((set) => ({
  accounts: [],
  isLoading: false,
  error: null,

  init: async () => {
    const workspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? ''
    set({ isLoading: true, error: null })
    try {
      const accounts = await AccountsGateway.getAccounts(workspaceId)
      set({ accounts, isLoading: false })
    } catch (err) {
      const error = toAppError(err)
      set({ isLoading: false, error })
      log.error('Failed to load accounts', { error })
    }
  },

  upsert: async (payload) => {
    const workspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? ''
    const createdBy = useAuthStore.getState().user?.id ?? ''
    const updated = await AccountsGateway.upsertAccount({ ...payload, workspaceId, createdBy })
    set(s => ({ accounts: upsertById(s.accounts, updated) }))
    return updated
  },

  remove: async (id) => {
    const workspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? ''
    await AccountsGateway.deleteAccount(id, workspaceId)
    set(s => ({ accounts: s.accounts.filter(a => a.id !== id) }))
  },

  setPrimaryDeal: async (accountId, dealId) => {
    const updated = await AccountsGateway.setPrimaryDeal(accountId, dealId)
    set(s => ({ accounts: upsertById(s.accounts, updated) }))
  },
}))
