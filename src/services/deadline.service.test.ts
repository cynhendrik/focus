import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/data/activities.gateway', () => ({
  ActivitiesGateway: { getByAccount: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
}))
vi.mock('@/store/workspace.store', () => ({ useWorkspaceStore: { getState: () => ({ activeWorkspaceId: 'ws1' }) } }))
vi.mock('@/store/auth.store', () => ({ useAuthStore: { getState: () => ({ user: { id: 'u1' } }) } }))

import { ActivitiesGateway } from '@/data/activities.gateway'
import { DeadlineService } from './deadline.service'
import type { Activity } from '@/types/pipeline.types'

const taskActivity = (over: Partial<Activity> = {}): Activity => ({
  id: 't1', workspaceId: 'ws1', createdBy: 'u1', accountId: 'c1', type: 'task',
  title: 'Frist', payload: '{"is_follow_up":false}', status: 'open',
  dueAt: '2026-07-01', createdAt: '2026-01-01', updatedAt: '2026-01-02', ...over,
})

beforeEach(() => vi.clearAllMocks())

describe('DeadlineService', () => {
  it('getByCustomer: routet über ActivitiesGateway.getByAccount', async () => {
    vi.mocked(ActivitiesGateway.getByAccount).mockResolvedValueOnce([taskActivity()])
    const result = await DeadlineService.getByCustomer('c1')
    expect(ActivitiesGateway.getByAccount).toHaveBeenCalledWith('c1')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ id: 't1', customerId: 'c1', title: 'Frist', dueDate: '2026-07-01', done: false })
  })

  it('getByCustomer: filtert Nicht-Tasks, Follow-ups und Tasks ohne dueAt heraus', async () => {
    vi.mocked(ActivitiesGateway.getByAccount).mockResolvedValueOnce([
      taskActivity({ id: 'keep' }),
      taskActivity({ id: 'note', type: 'note' }),
      taskActivity({ id: 'followup', payload: '{"is_follow_up":true}' }),
      taskActivity({ id: 'nodue', dueAt: undefined }),
    ])
    const result = await DeadlineService.getByCustomer('c1')
    expect(result.map(d => d.id)).toEqual(['keep'])
  })

  it('upsert (neu): routet über ActivitiesGateway.create als type=task, is_follow_up=false', async () => {
    vi.mocked(ActivitiesGateway.create).mockResolvedValueOnce(taskActivity({ id: 'new' }))
    const result = await DeadlineService.upsert({ customerId: 'c1', title: 'Frist', dueDate: '2026-07-01' })
    expect(ActivitiesGateway.create).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'c1', workspaceId: 'ws1', createdBy: 'u1', type: 'task',
      title: 'Frist', status: 'open', dueAt: '2026-07-01',
      payload: JSON.stringify({ is_follow_up: false }),
    }))
    expect(result.id).toBe('new')
  })

  it('upsert (vorhanden): routet über ActivitiesGateway.update', async () => {
    vi.mocked(ActivitiesGateway.update).mockResolvedValueOnce(taskActivity({ id: 't1', status: 'done' }))
    const result = await DeadlineService.upsert({ id: 't1', customerId: 'c1', title: 'Frist', dueDate: '2026-07-01', done: true })
    expect(ActivitiesGateway.update).toHaveBeenCalledWith('t1', { title: 'Frist', status: 'done', dueAt: '2026-07-01' })
    expect(result.done).toBe(true)
  })

  it('delete: routet über ActivitiesGateway.delete', async () => {
    vi.mocked(ActivitiesGateway.delete).mockResolvedValueOnce(undefined)
    await DeadlineService.delete('t1')
    expect(ActivitiesGateway.delete).toHaveBeenCalledWith('t1')
  })
})
