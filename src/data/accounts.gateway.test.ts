import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/leads.service', () => ({
  LeadsService: { getAll: vi.fn(), upsert: vi.fn(), convertToClient: vi.fn(), bulkUpdate: vi.fn() },
}))
vi.mock('@/store/workspace.store', () => ({
  useWorkspaceStore: { getState: vi.fn() },
}))
vi.mock('@/store/auth.store', () => ({
  useAuthStore: { getState: () => ({ user: { id: 'u1' } }) },
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

const supaChain: any = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  or: vi.fn().mockReturnThis(),
  order: vi.fn().mockResolvedValue({ data: [], error: null }),
  update: vi.fn().mockReturnThis(),
  upsert: vi.fn().mockReturnThis(),
  in: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({ data: { id: 'a1', workspace_id: 'ws1', created_by: 'u1', name: 'X', account_type: 'client', created_at: '', updated_at: '' }, error: null }),
  then: (resolve: (v: { error: null }) => unknown) => resolve({ error: null }),
}
vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(() => supaChain) },
}))

import { LeadsService } from '@/services/leads.service'
import { useWorkspaceStore } from '@/store/workspace.store'
import { supabase } from '@/lib/supabase'
import { invoke } from '@tauri-apps/api/core'
import { AccountsGateway } from './accounts.gateway'

describe('AccountsGateway routing', () => {
  beforeEach(() => vi.clearAllMocks())

  it('getLeads (solo) ruft LeadsService.getAll', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({
      activeWorkspaceId: 'ws1', isActiveWorkspaceShared: () => false,
    } as any)
    vi.mocked(LeadsService.getAll).mockResolvedValueOnce([])
    await AccountsGateway.getLeads('ws1')
    expect(LeadsService.getAll).toHaveBeenCalledWith('ws1')
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('getLeads (shared) liest aus supabase.accounts', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({
      activeWorkspaceId: 'ws1', isActiveWorkspaceShared: () => true,
    } as any)
    await AccountsGateway.getLeads('ws1')
    expect(supabase.from).toHaveBeenCalledWith('accounts')
    expect(LeadsService.getAll).not.toHaveBeenCalled()
  })

  it('bulkUpdate (solo) ruft LeadsService.bulkUpdate', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({
      activeWorkspaceId: 'ws1', isActiveWorkspaceShared: () => false,
    } as any)
    vi.mocked(LeadsService.bulkUpdate).mockResolvedValueOnce(undefined)
    await AccountsGateway.bulkUpdate({ ids: ['a'], status: 'warm' })
    expect(LeadsService.bulkUpdate).toHaveBeenCalledWith({ ids: ['a'], status: 'warm' })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('bulkUpdate (shared) schreibt nach supabase.accounts', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({
      activeWorkspaceId: 'ws1', isActiveWorkspaceShared: () => true,
    } as any)
    await AccountsGateway.bulkUpdate({ ids: ['a'], status: 'warm' })
    expect(supabase.from).toHaveBeenCalledWith('accounts')
    expect(LeadsService.bulkUpdate).not.toHaveBeenCalled()
  })
})

describe('AccountsGateway generic accounts', () => {
  beforeEach(() => vi.clearAllMocks())

  it('getAccounts (solo) ruft invoke(get_accounts)', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => false } as any)
    vi.mocked(invoke).mockResolvedValueOnce([])
    await AccountsGateway.getAccounts('ws1')
    expect(invoke).toHaveBeenCalledWith('get_accounts', { workspaceId: 'ws1' })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('getAccounts (shared) liest aus supabase.accounts mit Lead-Ausschluss', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => true } as any)
    await AccountsGateway.getAccounts('ws1')
    expect(supabase.from).toHaveBeenCalledWith('accounts')
    expect(supaChain.or).toHaveBeenCalledWith('account_type.is.null,account_type.neq.lead')
    expect(invoke).not.toHaveBeenCalled()
  })

  it('upsertAccount (solo) ruft invoke(upsert_account)', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => false } as any)
    vi.mocked(invoke).mockResolvedValueOnce({ id: 'a1' })
    await AccountsGateway.upsertAccount({ workspaceId: 'ws1', createdBy: 'u1', name: 'X' })
    expect(invoke).toHaveBeenCalledWith('upsert_account', { payload: expect.objectContaining({ name: 'X' }) })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('upsertAccount (shared) schreibt nach supabase.accounts', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => true } as any)
    await AccountsGateway.upsertAccount({ workspaceId: 'ws1', createdBy: 'u1', name: 'X' })
    expect(supabase.from).toHaveBeenCalledWith('accounts')
    expect(supaChain.upsert).toHaveBeenCalled()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('setArchived (solo) ruft invoke(cmd_set_account_archived)', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => false } as any)
    vi.mocked(invoke).mockResolvedValueOnce({ id: 'a1' })
    await AccountsGateway.setArchived('a1', true)
    expect(invoke).toHaveBeenCalledWith('cmd_set_account_archived', { id: 'a1', archived: true })
  })

  it('setArchived (shared) schreibt archived_at nach supabase.accounts', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => true } as any)
    await AccountsGateway.setArchived('a1', true)
    expect(supabase.from).toHaveBeenCalledWith('accounts')
    expect(supaChain.update).toHaveBeenCalled()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('setPrimaryDeal (solo) ruft invoke(cmd_set_primary_deal)', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => false } as any)
    vi.mocked(invoke).mockResolvedValueOnce({ id: 'a1' })
    await AccountsGateway.setPrimaryDeal('a1', 'd1')
    expect(invoke).toHaveBeenCalledWith('cmd_set_primary_deal', { accountId: 'a1', dealId: 'd1' })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('setPrimaryDeal (shared) schreibt primary_deal_id nach supabase.accounts', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => true } as any)
    await AccountsGateway.setPrimaryDeal('a1', 'd1')
    expect(supabase.from).toHaveBeenCalledWith('accounts')
    expect(supaChain.update).toHaveBeenCalled()
    expect(invoke).not.toHaveBeenCalled()
  })
})
