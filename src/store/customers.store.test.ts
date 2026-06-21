import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/data/accounts.gateway', () => ({
  AccountsGateway: {
    getAccounts: vi.fn(),
    upsertAccount: vi.fn(),
    deleteAccount: vi.fn(),
    setArchived: vi.fn(),
  },
}))
vi.mock('@/store/mail.store', () => ({
  useMailStore: { getState: () => ({ rematchCustomers: vi.fn().mockResolvedValue(undefined) }) },
}))
vi.mock('@/store/workspace.store', () => ({
  useWorkspaceStore: { getState: () => ({ activeWorkspaceId: 'ws-1' }) },
}))
vi.mock('@/store/auth.store', () => ({
  useAuthStore: { getState: () => ({ user: { id: 'u-1' } }) },
}))

import { AccountsGateway } from '@/data/accounts.gateway'
import type { Account } from '@/types/account.types'

const acc: Account = {
  id: 'c1', workspaceId: 'ws-1', createdBy: 'u-1', name: 'ACME AG',
  kind: 'company', status: 'aktiv', priority: 'normal', tags: [], goals: [],
  isPrivate: false, socialLinks: '{}', leadScore: 0, scoreFactors: {},
  archivedAt: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
}

describe('useCustomersStore', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { useCustomersStore } = await import('./customers.store')
    useCustomersStore.setState({ customers: [], isLoading: false, error: null })
  })

  it('init lädt Accounts übers Gateway und mappt zu Customer', async () => {
    vi.mocked(AccountsGateway.getAccounts).mockResolvedValueOnce([acc])
    const { useCustomersStore } = await import('./customers.store')
    await useCustomersStore.getState().init()
    expect(AccountsGateway.getAccounts).toHaveBeenCalledWith('ws-1')
    expect(useCustomersStore.getState().customers[0].id).toBe('c1')
    expect(useCustomersStore.getState().customers[0].company).toBe('ACME AG')
  })

  it('upsert ruft Gateway und fügt Customer hinzu', async () => {
    vi.mocked(AccountsGateway.upsertAccount).mockResolvedValueOnce(acc)
    const { useCustomersStore } = await import('./customers.store')
    await useCustomersStore.getState().upsert({ name: 'ACME AG' })
    expect(AccountsGateway.upsertAccount).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'ACME AG', kind: 'individual', workspaceId: 'ws-1', createdBy: 'u-1' }),
    )
    expect(useCustomersStore.getState().customers).toHaveLength(1)
  })

  it('remove ruft Gateway und entfernt Customer', async () => {
    vi.mocked(AccountsGateway.deleteAccount).mockResolvedValueOnce(undefined)
    const { useCustomersStore } = await import('./customers.store')
    const { accountToCustomer } = await import('@/data/customers.mapper')
    useCustomersStore.setState({ customers: [accountToCustomer(acc)], isLoading: false, error: null })
    await useCustomersStore.getState().remove('c1')
    expect(AccountsGateway.deleteAccount).toHaveBeenCalledWith('c1', 'ws-1')
    expect(useCustomersStore.getState().customers).toHaveLength(0)
  })

  it('setArchived ruft Gateway und aktualisiert Customer', async () => {
    vi.mocked(AccountsGateway.setArchived).mockResolvedValueOnce({ ...acc, archivedAt: '2026-02-01T00:00:00Z' })
    const { useCustomersStore } = await import('./customers.store')
    const { accountToCustomer } = await import('@/data/customers.mapper')
    useCustomersStore.setState({ customers: [accountToCustomer(acc)], isLoading: false, error: null })
    await useCustomersStore.getState().setArchived('c1', true)
    expect(AccountsGateway.setArchived).toHaveBeenCalledWith('c1', true)
    expect(useCustomersStore.getState().customers[0].archivedAt).toBe('2026-02-01T00:00:00Z')
  })
})
