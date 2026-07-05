import { describe, it, expect, beforeEach, vi } from 'vitest'

// --- Mocks (must be hoisted before imports) ---

vi.mock('@/store/workspace.store', () => {
  const { create } = require('zustand')
  const store = create(() => ({
    activeWorkspaceId: null as string | null,
    workspaces: [] as Array<{ id: string; join_code: string | null }>,
    localWorkspaces: [] as Array<{ id: string }>,
    user: null,
    createCloudWorkspaceRecord: vi.fn(),
    loadWorkspaces: vi.fn(),
    setActiveWorkspace: vi.fn((id: string) =>
      store.setState({ activeWorkspaceId: id }),
    ),
  }))
  return { useWorkspaceStore: store }
})

vi.mock('@/store/auth.store', () => {
  const { create } = require('zustand')
  const store = create(() => ({
    user: { id: 'uid-1' } as { id: string } | null,
  }))
  return { useAuthStore: store }
})

vi.mock('@/data/migration-runner', () => ({
  runMigration: vi.fn(),
  bumpSequences: vi.fn(),
}))

vi.mock('@/data/workspace-local', () => ({
  rescopeWorkspace: vi.fn(),
}))

// --- Tests ---

import { shareWorkspace } from './share-workspace'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { runMigration, bumpSequences } from '@/data/migration-runner'
import { rescopeWorkspace } from '@/data/workspace-local'

describe('shareWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useWorkspaceStore.setState({
      activeWorkspaceId: 'L',
      workspaces: [],
      localWorkspaces: [{ id: 'L' }],
    })
    useAuthStore.setState({ user: { id: 'uid-1' } })
    vi.mocked(useWorkspaceStore.getState().createCloudWorkspaceRecord).mockResolvedValue('C')
    vi.mocked(useWorkspaceStore.getState().loadWorkspaces).mockImplementation(async () => {
      useWorkspaceStore.setState({
        workspaces: [{ id: 'C', join_code: 'ABC123' }],
      })
    })
    vi.mocked(runMigration).mockResolvedValue(undefined)
    vi.mocked(bumpSequences).mockResolvedValue(undefined)
    vi.mocked(rescopeWorkspace).mockResolvedValue(0)
  })

  it('creates cloud record BEFORE runMigration (order check)', async () => {
    const order: string[] = []
    vi.mocked(useWorkspaceStore.getState().createCloudWorkspaceRecord).mockImplementation(async () => {
      order.push('createCloud')
      return 'C'
    })
    vi.mocked(runMigration).mockImplementation(async () => { order.push('runMigration') })
    vi.mocked(bumpSequences).mockImplementation(async () => { order.push('bumpSequences') })
    vi.mocked(useWorkspaceStore.getState().loadWorkspaces).mockImplementation(async () => {
      order.push('loadWorkspaces')
      useWorkspaceStore.setState({ workspaces: [{ id: 'C', join_code: 'ABC123' }] })
    })

    await shareWorkspace('L', 'Team')

    expect(order).toEqual(['createCloud', 'runMigration', 'bumpSequences', 'loadWorkspaces'])
  })

  it('shares: creates cloud, migrates, then flips active + returns join code', async () => {
    const res = await shareWorkspace('L', 'Team')
    expect(res.cloudWsId).toBe('C')
    expect(res.joinCode).toBe('ABC123')
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('C')
  })

  it('passes onProgress to runMigration', async () => {
    const onProgress = vi.fn()
    await shareWorkspace('L', 'Team', onProgress)
    expect(vi.mocked(runMigration)).toHaveBeenCalledWith(
      { localWsId: 'L', cloudWsId: 'C', uid: 'uid-1' },
      onProgress,
    )
  })

  it('removes local workspace from localWorkspaces after flip', async () => {
    await shareWorkspace('L', 'Team')
    expect(useWorkspaceStore.getState().localWorkspaces.find(w => w.id === 'L')).toBeUndefined()
  })

  it('does not flip active when migration fails', async () => {
    vi.mocked(runMigration).mockRejectedValue(new Error('Migration failed'))
    useWorkspaceStore.setState({ activeWorkspaceId: 'L' })
    await expect(shareWorkspace('L', 'Team')).rejects.toThrow()
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('L')
  })

  it('throws when not logged in', async () => {
    useAuthStore.setState({ user: null })
    await expect(shareWorkspace('L', 'Team')).rejects.toThrow('Nicht eingeloggt')
  })

  it('returns null joinCode if workspace not found in workspaces after load', async () => {
    vi.mocked(useWorkspaceStore.getState().loadWorkspaces).mockResolvedValue(undefined)
    useWorkspaceStore.setState({ workspaces: [] })
    const res = await shareWorkspace('L', 'Team')
    expect(res.joinCode).toBeNull()
  })

  it('rescopeWorkspace called with (localWsId, cloudWsId, uid) AFTER runMigration and BEFORE flip', async () => {
    const order: string[] = []
    vi.mocked(runMigration).mockImplementation(async () => { order.push('runMigration') })
    vi.mocked(bumpSequences).mockImplementation(async () => { order.push('bumpSequences') })
    vi.mocked(rescopeWorkspace).mockImplementation(async () => { order.push('rescopeWorkspace'); return 0 })
    vi.mocked(useWorkspaceStore.getState().loadWorkspaces).mockImplementation(async () => {
      order.push('loadWorkspaces')
      useWorkspaceStore.setState({ workspaces: [{ id: 'C', join_code: 'ABC123' }] })
    })

    await shareWorkspace('L', 'Team')

    expect(vi.mocked(rescopeWorkspace)).toHaveBeenCalledWith('L', 'C', 'uid-1')
    const rescIdx = order.indexOf('rescopeWorkspace')
    const migIdx = order.indexOf('runMigration')
    const loadIdx = order.indexOf('loadWorkspaces')
    expect(rescIdx).toBeGreaterThan(migIdx)
    expect(rescIdx).toBeLessThan(loadIdx)
  })

  it('does NOT call rescopeWorkspace when runMigration rejects', async () => {
    vi.mocked(runMigration).mockRejectedValue(new Error('Migration failed'))
    await expect(shareWorkspace('L', 'Team')).rejects.toThrow()
    expect(vi.mocked(rescopeWorkspace)).not.toHaveBeenCalled()
  })
})
