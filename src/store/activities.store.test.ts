import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/data/activities.gateway', () => ({
  ActivitiesGateway: {
    getByCustomer: vi.fn(),
    getOpenFollowups: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))
vi.mock('@/store/crm.store', () => ({
  useCrmStore: { getState: () => ({ loadLastActivity: vi.fn() }) },
}))

import { ActivitiesGateway } from '@/data/activities.gateway'
import { useActivitiesStore } from './activities.store'

beforeEach(() => {
  vi.clearAllMocks()
  useActivitiesStore.setState({
    activities: [], followups: [], currentCustomerId: null, isLoading: false, error: null,
  })
})

describe('useActivitiesStore', () => {
  it('loadForCustomer: setzt currentCustomerId', async () => {
    vi.mocked(ActivitiesGateway.getByCustomer).mockResolvedValueOnce([])
    await useActivitiesStore.getState().loadForCustomer('c7')
    expect(ActivitiesGateway.getByCustomer).toHaveBeenCalledWith('c7')
    expect(useActivitiesStore.getState().currentCustomerId).toBe('c7')
  })
})
