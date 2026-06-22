import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/data/activities.gateway', () => ({
  ActivitiesGateway: {
    getByAccount: vi.fn(), getOpenTasks: vi.fn(), create: vi.fn(), update: vi.fn(),
    delete: vi.fn(), getLastActivityDates: vi.fn(),
  },
}))
vi.mock('@/store/workspace.store', () => ({ useWorkspaceStore: { getState: () => ({ activeWorkspaceId: 'ws1' }) } }))
vi.mock('@/store/auth.store', () => ({ useAuthStore: { getState: () => ({ user: { id: 'u1' } }) } }))

import { ActivitiesGateway } from '@/data/activities.gateway'
import { CrmService } from './crm.service'
import type { Activity } from '@/types/pipeline.types'

const followUpActivity = (over: Partial<Activity> = {}): Activity => ({
  id: 'f1', workspaceId: 'ws1', createdBy: 'u1', accountId: 'c1', type: 'task',
  title: 'Nachfassen', payload: '{"is_follow_up":true,"priority":"hoch"}', status: 'open',
  dueAt: '2026-07-01', createdAt: '2026-01-01', updatedAt: '2026-01-02', ...over,
})

beforeEach(() => vi.clearAllMocks())

describe('CrmService', () => {
  it('getByCustomer: routet über Gateway, filtert nur Follow-up-Tasks, mappt Priorität', async () => {
    vi.mocked(ActivitiesGateway.getByAccount).mockResolvedValueOnce([
      followUpActivity(),
      followUpActivity({ id: 'deadline', payload: '{"is_follow_up":false}' }),
      followUpActivity({ id: 'note', type: 'note' }),
    ])
    const result = await CrmService.getByCustomer('c1')
    expect(ActivitiesGateway.getByAccount).toHaveBeenCalledWith('c1')
    expect(result.map(f => f.id)).toEqual(['f1'])
    expect(result[0]).toMatchObject({ customerId: 'c1', title: 'Nachfassen', status: 'offen', priority: 'hoch' })
  })

  it('upsert (neu): routet über Gateway.create als type=task, is_follow_up=true', async () => {
    vi.mocked(ActivitiesGateway.create).mockResolvedValueOnce(followUpActivity({ id: 'new' }))
    await CrmService.upsert({ customerId: 'c1', title: 'Nachfassen', dueDate: '2026-07-01', priority: 'hoch' })
    expect(ActivitiesGateway.create).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'c1', workspaceId: 'ws1', createdBy: 'u1', type: 'task', status: 'open',
      payload: JSON.stringify({ is_follow_up: true, priority: 'hoch' }),
    }))
  })

  it('upsert (vorhanden): routet über Gateway.update mit erledigt→done', async () => {
    vi.mocked(ActivitiesGateway.update).mockResolvedValueOnce(followUpActivity({ status: 'done' }))
    const r = await CrmService.upsert({ id: 'f1', customerId: 'c1', title: 'X', dueDate: '2026-07-01', status: 'erledigt' })
    expect(ActivitiesGateway.update).toHaveBeenCalledWith('f1', expect.objectContaining({ status: 'done' }))
    expect(r.status).toBe('erledigt')
  })

  it('getAllFollowUps: routet über Gateway.getOpenTasks, filtert Follow-ups', async () => {
    vi.mocked(ActivitiesGateway.getOpenTasks).mockResolvedValueOnce([
      followUpActivity(),
      followUpActivity({ id: 'task', payload: '{"is_follow_up":false}' }),
    ])
    const result = await CrmService.getAllFollowUps('ws1')
    expect(ActivitiesGateway.getOpenTasks).toHaveBeenCalledWith('ws1')
    expect(result.map(f => f.id)).toEqual(['f1'])
  })

  it('delete + getLastActivityDates: routen über Gateway', async () => {
    vi.mocked(ActivitiesGateway.delete).mockResolvedValueOnce(undefined)
    vi.mocked(ActivitiesGateway.getLastActivityDates).mockResolvedValueOnce([])
    await CrmService.delete('f1')
    await CrmService.getLastActivityDates('ws1')
    expect(ActivitiesGateway.delete).toHaveBeenCalledWith('f1')
    expect(ActivitiesGateway.getLastActivityDates).toHaveBeenCalledWith('ws1')
  })
})
