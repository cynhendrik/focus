import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/deadline.service', () => ({
  DeadlineService: {
    getByCustomer: vi.fn().mockResolvedValue([]),
    upsert: vi.fn(),
    delete: vi.fn(),
  },
}))

import { DeadlineService } from '@/services/deadline.service'
import { useDeadlinesStore } from './deadlines.store'

beforeEach(() => {
  vi.clearAllMocks()
  useDeadlinesStore.setState({ deadlines: [], currentCustomerId: null, isLoading: false, error: null })
})

describe('useDeadlinesStore', () => {
  it('loadForCustomer merkt sich currentCustomerId (fuer Realtime-Reload)', async () => {
    vi.mocked(DeadlineService.getByCustomer).mockResolvedValueOnce([])
    await useDeadlinesStore.getState().loadForCustomer('c1')
    expect(DeadlineService.getByCustomer).toHaveBeenCalledWith('c1')
    expect(useDeadlinesStore.getState().currentCustomerId).toBe('c1')
  })
})
