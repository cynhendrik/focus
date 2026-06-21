import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/data/activities.gateway', () => ({ ActivitiesGateway: { getOpenTasks: vi.fn(), getByAccount: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() } }))
vi.mock('@/store/calendar.store', () => ({ useCalendarStore: { getState: () => ({ upsert: vi.fn(), remove: vi.fn() }) } }))
vi.mock('@/store/workspace.store', () => ({ useWorkspaceStore: { getState: () => ({ activeWorkspaceId: 'ws1' }) } }))
vi.mock('@/store/auth.store', () => ({ useAuthStore: { getState: () => ({ user: { id: 'u1' } }) } }))

import { ActivitiesGateway } from '@/data/activities.gateway'
import { useTodosStore } from './todos.store'

const act = { id: 't1', workspaceId: 'ws1', createdBy: 'u1', accountId: 'c1', type: 'task', title: 'T', status: 'open', payload: '{}', createdAt: '', updatedAt: '' }

describe('useTodosStore', () => {
  beforeEach(() => { vi.clearAllMocks(); useTodosStore.setState({ todos: [], allTodos: [], isLoading: false, error: null }) })
  it('loadAll lädt offene Tasks übers Gateway', async () => {
    vi.mocked(ActivitiesGateway.getOpenTasks).mockResolvedValueOnce([act] as any)
    await useTodosStore.getState().loadAll('ws1')
    expect(ActivitiesGateway.getOpenTasks).toHaveBeenCalledWith('ws1')
    expect(useTodosStore.getState().allTodos).toHaveLength(1)
  })
  it('upsert (neu) ruft create', async () => {
    vi.mocked(ActivitiesGateway.create).mockResolvedValueOnce(act as any)
    await useTodosStore.getState().upsert({ title: 'T' })
    expect(ActivitiesGateway.create).toHaveBeenCalled()
  })
  it('remove ruft delete', async () => {
    vi.mocked(ActivitiesGateway.delete).mockResolvedValueOnce(undefined)
    useTodosStore.setState({ todos: [{ id: 't1' } as any], allTodos: [{ id: 't1' } as any], isLoading: false, error: null })
    await useTodosStore.getState().remove('t1')
    expect(ActivitiesGateway.delete).toHaveBeenCalledWith('t1')
    expect(useTodosStore.getState().allTodos).toHaveLength(0)
  })
})
