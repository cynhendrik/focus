import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useWorkspaceStore } from './workspace.store'

beforeEach(() => {
  useWorkspaceStore.setState({
    workspaces: [],
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

  it('loadWorkspaces calls supabase and sets workspaces', async () => {
    const { supabase } = await import('@/lib/supabase')
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockResolvedValue({
        data: [
          {
            workspace_id: 'ws-1',
            role: 'owner',
            workspaces: { id: 'ws-1', name: 'Agentur', logo_url: null },
          },
        ],
        error: null,
      }),
    } as any)
    await useWorkspaceStore.getState().loadWorkspaces()
    expect(useWorkspaceStore.getState().workspaces).toHaveLength(1)
    expect(useWorkspaceStore.getState().workspaces[0].name).toBe('Agentur')
  })
})
