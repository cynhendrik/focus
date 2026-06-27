import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useWorkspaceStore, generateJoinCode } from './workspace.store'
import { makeLocalWorkspace } from '@/data/workspace-local'

beforeEach(() => {
  useWorkspaceStore.setState({
    workspaces: [],
    localWorkspaces: [],
    activeWorkspaceId: null,
    pendingCount: 0,
    isOnline: true,
  })
  vi.clearAllMocks()
})

describe('useWorkspaceStore', () => {
  it('starts empty', () => {
    const { workspaces, activeWorkspaceId } = useWorkspaceStore.getState()
    expect(workspaces).toHaveLength(0)
    expect(activeWorkspaceId).toBeNull()
  })

  it('setActiveWorkspace sets activeWorkspaceId', () => {
    useWorkspaceStore.getState().setActiveWorkspace('ws-1')
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('ws-1')
  })

  it('setPendingCount updates pendingCount', () => {
    useWorkspaceStore.getState().setPendingCount(5)
    expect(useWorkspaceStore.getState().pendingCount).toBe(5)
  })

  it('setOnline updates isOnline', () => {
    useWorkspaceStore.getState().setOnline(false)
    expect(useWorkspaceStore.getState().isOnline).toBe(false)
  })

  it('loadWorkspaces scopes to current user; cloud workspace is always shared', async () => {
    const { supabase } = await import('@/lib/supabase')
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: { session: { user: { id: 'u1' } } },
      error: null,
    } as any)
    // Single membership query — new code derives isShared:true for all cloud workspaces.
    vi.mocked(supabase.from)
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [
              {
                workspace_id: 'ws-1',
                role: 'owner',
                capabilities: [],
                workspaces: { id: 'ws-1', name: 'Agentur', logo_url: null, join_code: null },
              },
            ],
            error: null,
          }),
        }),
      } as any)
    await useWorkspaceStore.getState().loadWorkspaces()
    const { workspaces } = useWorkspaceStore.getState()
    expect(workspaces).toHaveLength(1)
    expect(workspaces.filter((w) => w.id === 'ws-1')).toHaveLength(1)
    expect(workspaces[0].name).toBe('Agentur')
    expect(workspaces[0].role).toBe('owner')
    expect(workspaces[0].isShared).toBe(true)
  })

  it('loadWorkspaces clears workspaces when there is no session', async () => {
    const { supabase } = await import('@/lib/supabase')
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: { session: null },
      error: null,
    } as any)
    useWorkspaceStore.setState({ workspaces: [{ id: 'x', name: 'X', logo_url: null, role: 'owner', isShared: false, join_code: null, capabilities: [] }], localWorkspaces: [] })
    await useWorkspaceStore.getState().loadWorkspaces()
    expect(useWorkspaceStore.getState().workspaces).toHaveLength(0)
  })
})

describe('local workspaces', () => {
  it('createLocalWorkspace adds a local ws and sets it active', () => {
    useWorkspaceStore.setState({ workspaces: [], localWorkspaces: [], activeWorkspaceId: null })
    const id = useWorkspaceStore.getState().createLocalWorkspace('Mein Workspace')
    const s = useWorkspaceStore.getState()
    expect(s.localWorkspaces.map(w => w.name)).toContain('Mein Workspace')
    expect(s.activeWorkspaceId).toBe(id)
    expect(s.localWorkspaces.find(w => w.id === id)?.isShared).toBe(false)
  })

  it('isActiveWorkspaceShared is false for a local ws, true for a cloud ws', () => {
    useWorkspaceStore.setState({
      workspaces: [{ ...makeLocalWorkspace('c1', 'Cloud'), isShared: true }],
      localWorkspaces: [makeLocalWorkspace('l1', 'Lokal')],
      activeWorkspaceId: 'l1',
    })
    expect(useWorkspaceStore.getState().isActiveWorkspaceShared()).toBe(false)
    useWorkspaceStore.setState({ activeWorkspaceId: 'c1' })
    expect(useWorkspaceStore.getState().isActiveWorkspaceShared()).toBe(true)
  })
})

describe('generateJoinCode', () => {
  it('liefert 6 Zeichen aus dem sicheren Alphabet (ohne 0/O/1/I)', () => {
    for (let n = 0; n < 50; n++) {
      const code = generateJoinCode()
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
    }
  })
})

describe('joinWorkspaceByCode', () => {
  it('ruft die RPC, lädt neu und aktiviert den beigetretenen Workspace', async () => {
    const { supabase } = await import('@/lib/supabase')
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: 'ws-joined', error: null } as any)
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({ data: { session: null }, error: null } as any)

    await useWorkspaceStore.getState().joinWorkspaceByCode('abc234')

    expect(vi.mocked(supabase.rpc)).toHaveBeenCalledWith('join_workspace_by_code', { p_code: 'ABC234' })
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('ws-joined')
  })

  it('wirft eine lesbare Fehlermeldung bei ungültigem Code', async () => {
    const { supabase } = await import('@/lib/supabase')
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: { message: 'Ungültiger Code' } } as any)
    await expect(useWorkspaceStore.getState().joinWorkspaceByCode('zzz999'))
      .rejects.toThrow('Ungültiger Code')
  })
})

describe('createWorkspace', () => {
  it('schreibt einen generierten join_code mit', async () => {
    const { supabase } = await import('@/lib/supabase')
    vi.mocked(supabase.auth.getUser).mockResolvedValueOnce({ data: { user: { id: 'u1' } }, error: null } as any)
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({ data: { session: null }, error: null } as any)

    let captured: any = null
    vi.mocked(supabase.from)
      .mockReturnValueOnce({
        insert: vi.fn((row: any) => { captured = row; return {
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'ws-new' }, error: null }),
          }),
        } }),
      } as any)
      .mockReturnValueOnce({
        insert: vi.fn().mockResolvedValue({ error: null }),
      } as any)

    await useWorkspaceStore.getState().createWorkspace('Neue Agentur')

    expect(captured.name).toBe('Neue Agentur')
    expect(captured.join_code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('ws-new')
  })
})

describe('createCloudWorkspaceRecord', () => {
  it('inserts workspace + membership and returns id, without setting active', async () => {
    const { supabase } = await import('@/lib/supabase')
    vi.mocked(supabase.auth.getUser).mockResolvedValueOnce({ data: { user: { id: 'u1' } }, error: null } as any)

    vi.mocked(supabase.from)
      .mockReturnValueOnce({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'cloud-1' }, error: null }),
          }),
        }),
      } as any)
      .mockReturnValueOnce({
        insert: vi.fn().mockResolvedValue({ error: null }),
      } as any)

    useWorkspaceStore.setState({ activeWorkspaceId: 'local-x' })
    const id = await useWorkspaceStore.getState().createCloudWorkspaceRecord('Team')
    expect(id).toBe('cloud-1')
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('local-x') // unchanged
  })

  it('throws when not logged in', async () => {
    const { supabase } = await import('@/lib/supabase')
    vi.mocked(supabase.auth.getUser).mockResolvedValueOnce({ data: { user: null }, error: null } as any)
    await expect(useWorkspaceStore.getState().createCloudWorkspaceRecord('Team'))
      .rejects.toThrow('Nicht eingeloggt')
  })
})

describe('regenerateJoinCode', () => {
  it('setzt einen neuen Code per Update und aktualisiert den lokalen State', async () => {
    const { supabase } = await import('@/lib/supabase')
    useWorkspaceStore.setState({
      workspaces: [{ id: 'ws1', name: 'A', logo_url: null, role: 'owner', isShared: false, join_code: 'OLD234', capabilities: [] }],
      activeWorkspaceId: 'ws1',
    })
    const eq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({ eq })
    vi.mocked(supabase.from).mockReturnValueOnce({ update } as any)

    const code = await useWorkspaceStore.getState().regenerateJoinCode('ws1')

    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
    expect(update).toHaveBeenCalledWith({ join_code: code })
    expect(eq).toHaveBeenCalledWith('id', 'ws1')
    expect(useWorkspaceStore.getState().workspaces[0].join_code).toBe(code)
  })

  it('würfelt bei Unique-Kollision genau einmal neu', async () => {
    const { supabase } = await import('@/lib/supabase')
    useWorkspaceStore.setState({
      workspaces: [{ id: 'ws1', name: 'A', logo_url: null, role: 'owner', isShared: false, join_code: 'OLD234', capabilities: [] }],
      activeWorkspaceId: 'ws1',
    })
    const eqFail = vi.fn().mockResolvedValue({ error: { code: '23505', message: 'duplicate' } })
    const eqOk   = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(supabase.from)
      .mockReturnValueOnce({ update: vi.fn().mockReturnValue({ eq: eqFail }) } as any)
      .mockReturnValueOnce({ update: vi.fn().mockReturnValue({ eq: eqOk }) } as any)

    const code = await useWorkspaceStore.getState().regenerateJoinCode('ws1')
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
    expect(eqFail).toHaveBeenCalledTimes(1)
    expect(eqOk).toHaveBeenCalledTimes(1)
  })
})
