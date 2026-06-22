import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase', () => {
  const update = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
  })
  const select = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({
      data: [{ user_id: 'u2', role: 'member', capabilities: ['contracts'] }],
      error: null,
    }),
  })
  return { supabase: { from: vi.fn(() => ({ update, select })) } }
})

import { supabase } from '@/lib/supabase'
import { WorkspaceMembersGateway } from './workspace-members.gateway'

beforeEach(() => vi.clearAllMocks())

describe('WorkspaceMembersGateway', () => {
  it('list: liest user_id/role/capabilities des Workspace', async () => {
    const rows = await WorkspaceMembersGateway.list('ws1')
    expect(supabase.from).toHaveBeenCalledWith('workspace_members')
    expect(rows).toEqual([{ userId: 'u2', role: 'member', capabilities: ['contracts'] }])
  })

  it('updateMember: schreibt role+capabilities für (workspace,user)', async () => {
    await WorkspaceMembersGateway.updateMember('ws1', 'u2', { role: 'admin', capabilities: [] })
    expect(supabase.from).toHaveBeenCalledWith('workspace_members')
  })
})
