import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@/store/workspace.store', () => ({ useWorkspaceStore: { getState: vi.fn() } }))
const chain: any = {
  select: vi.fn(() => chain), eq: vi.fn(() => chain),
  order: vi.fn(() => chain),
  insert: vi.fn(() => chain), update: vi.fn(() => chain), delete: vi.fn(() => chain),
  single: vi.fn().mockResolvedValue({ data: { id: 'a1', workspace_id: 'ws1', account_id: 'acc1', type: 'note', status: 'open', payload: {}, created_at: '', updated_at: '' }, error: null }),
  then: (resolve: (v: { data: never[]; error: null }) => unknown) => resolve({ data: [], error: null }),
}
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(() => chain) } }))

import { invoke } from '@tauri-apps/api/core'
import { useWorkspaceStore } from '@/store/workspace.store'
import { supabase } from '@/lib/supabase'
import { ActivitiesGateway } from './activities.gateway'

const solo = () => vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => false } as any)
const sharedM = () => vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => true } as any)

describe('ActivitiesGateway', () => {
  beforeEach(() => vi.clearAllMocks())

  it('getByAccount solo→invoke / shared→supabase(account_id)', async () => {
    solo(); vi.mocked(invoke).mockResolvedValueOnce([])
    await ActivitiesGateway.getByAccount('acc1')
    expect(invoke).toHaveBeenCalledWith('get_activities_by_account', { accountId: 'acc1' })
    sharedM(); await ActivitiesGateway.getByAccount('acc1')
    expect(supabase.from).toHaveBeenCalledWith('activities')
    expect(chain.eq).toHaveBeenCalledWith('account_id', 'acc1')
  })
  it('getByCustomer shared filtert customer_id', async () => {
    sharedM(); await ActivitiesGateway.getByCustomer('c1')
    expect(chain.eq).toHaveBeenCalledWith('customer_id', 'c1')
  })
  it('getOpenFollowups shared filtert workspace+type=followup+status=open', async () => {
    sharedM(); await ActivitiesGateway.getOpenFollowups('ws1')
    expect(chain.eq).toHaveBeenCalledWith('workspace_id', 'ws1')
    expect(chain.eq).toHaveBeenCalledWith('type', 'followup')
    expect(chain.eq).toHaveBeenCalledWith('status', 'open')
  })
  it('create solo→invoke / shared→supabase insert', async () => {
    const payload = { workspaceId: 'ws1', createdBy: 'u1', accountId: 'acc1', type: 'note' as const }
    solo(); vi.mocked(invoke).mockResolvedValueOnce({ id: 'a1' })
    await ActivitiesGateway.create(payload)
    expect(invoke).toHaveBeenCalledWith('create_activity', { payload })
    sharedM(); await ActivitiesGateway.create(payload)
    expect(supabase.from).toHaveBeenCalledWith('activities')
    expect(chain.insert).toHaveBeenCalled()
  })
  it('delete shared→supabase delete', async () => {
    sharedM(); await ActivitiesGateway.delete('a1')
    expect(supabase.from).toHaveBeenCalledWith('activities')
    expect(chain.delete).toHaveBeenCalled()
  })
})
