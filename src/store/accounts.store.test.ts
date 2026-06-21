import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/data/accounts.gateway', () => ({
  AccountsGateway: {
    getAccounts: vi.fn(),
    upsertAccount: vi.fn(),
    deleteAccount: vi.fn(),
    setPrimaryDeal: vi.fn(),
  },
}))
vi.mock('@/store/workspace.store', () => ({
  useWorkspaceStore: { getState: () => ({ activeWorkspaceId: 'ws1' }) },
}))
vi.mock('@/store/auth.store', () => ({
  useAuthStore: { getState: () => ({ user: { id: 'u1' } }) },
}))

import { AccountsGateway } from '@/data/accounts.gateway'
import { useAccountsStore } from './accounts.store'
import type { Account } from '@/types/account.types'

const acc: Account = {
  id: 'a1', workspaceId: 'ws1', createdBy: 'u1', name: 'ACME',
  kind: 'company', status: 'aktiv', priority: 'normal', tags: [], goals: [],
  isPrivate: false, socialLinks: '{}', leadScore: 0, scoreFactors: {},
  archivedAt: null, createdAt: '', updatedAt: '',
}

describe('useAccountsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAccountsStore.setState({ accounts: [], isLoading: false })
  })

  it('init lädt Accounts über das Gateway', async () => {
    vi.mocked(AccountsGateway.getAccounts).mockResolvedValueOnce([acc])
    await useAccountsStore.getState().init()
    expect(AccountsGateway.getAccounts).toHaveBeenCalledWith('ws1')
    expect(useAccountsStore.getState().accounts).toEqual([acc])
  })

  it('upsert ruft Gateway und fügt in die Liste ein', async () => {
    vi.mocked(AccountsGateway.upsertAccount).mockResolvedValueOnce(acc)
    await useAccountsStore.getState().upsert({ name: 'ACME' })
    expect(AccountsGateway.upsertAccount).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'ACME', workspaceId: 'ws1', createdBy: 'u1' }),
    )
    expect(useAccountsStore.getState().accounts).toHaveLength(1)
  })

  it('remove ruft Gateway und entfernt aus der Liste', async () => {
    vi.mocked(AccountsGateway.deleteAccount).mockResolvedValueOnce(undefined)
    useAccountsStore.setState({ accounts: [acc], isLoading: false })
    await useAccountsStore.getState().remove('a1')
    expect(AccountsGateway.deleteAccount).toHaveBeenCalledWith('a1', 'ws1')
    expect(useAccountsStore.getState().accounts).toHaveLength(0)
  })
})
