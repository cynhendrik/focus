import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/data/activities.gateway', () => ({
  ActivitiesGateway: { getByAccount: vi.fn(), create: vi.fn(), delete: vi.fn() },
}))
vi.mock('@/store/workspace.store', () => ({ useWorkspaceStore: { getState: () => ({ activeWorkspaceId: 'ws1' }) } }))
vi.mock('@/store/auth.store', () => ({ useAuthStore: { getState: () => ({ user: { id: 'u1' } }) } }))

import { ActivitiesGateway } from '@/data/activities.gateway'
import { TimeService } from './time.service'
import type { Activity } from '@/types/pipeline.types'

const timeActivity = (over: Partial<Activity> = {}): Activity => ({
  id: 't1', workspaceId: 'ws1', createdBy: 'u1', accountId: 'c1', type: 'time_entry',
  title: 'Dev', payload: '{"minutes":90,"date":"2026-06-20"}', status: 'done',
  createdAt: '2026-06-20T10:00:00Z', updatedAt: '2026-06-20T10:00:00Z', ...over,
})

beforeEach(() => vi.clearAllMocks())

describe('TimeService', () => {
  it('getByCustomer: routet über Gateway, filtert type=time_entry, mappt minutes/date', async () => {
    vi.mocked(ActivitiesGateway.getByAccount).mockResolvedValueOnce([
      timeActivity(),
      timeActivity({ id: 'x', type: 'note' }),
    ])
    const result = await TimeService.getByCustomer('c1')
    expect(ActivitiesGateway.getByAccount).toHaveBeenCalledWith('c1')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ customerId: 'c1', description: 'Dev', minutes: 90, date: '2026-06-20' })
  })

  it('add: routet über Gateway.create als type=time_entry mit minutes/date im payload', async () => {
    vi.mocked(ActivitiesGateway.create).mockResolvedValueOnce(timeActivity({ id: 'new' }))
    const r = await TimeService.add({ customerId: 'c1', description: 'Dev', minutes: 90, date: '2026-06-20' })
    expect(ActivitiesGateway.create).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'c1', workspaceId: 'ws1', createdBy: 'u1', type: 'time_entry', title: 'Dev',
      payload: JSON.stringify({ minutes: 90, date: '2026-06-20' }),
    }))
    expect(r.id).toBe('new')
  })

  it('delete: routet über Gateway.delete', async () => {
    vi.mocked(ActivitiesGateway.delete).mockResolvedValueOnce(undefined)
    await TimeService.delete('t1')
    expect(ActivitiesGateway.delete).toHaveBeenCalledWith('t1')
  })
})
