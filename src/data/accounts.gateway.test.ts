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

const supaChain: any = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockResolvedValue({ data: [], error: null }),
  update: vi.fn().mockReturnThis(),
  in: vi.fn().mockReturnThis(),
  // make the chain awaitable so `.update().in().eq()` resolves to { error: null }
  then: (resolve: (v: { error: null }) => unknown) => resolve({ error: null }),
}
vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(() => supaChain) },
}))

import { LeadsService } from '@/services/leads.service'
import { useWorkspaceStore } from '@/store/workspace.store'
import { supabase } from '@/lib/supabase'
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
