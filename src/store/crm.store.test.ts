import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/crm.service', () => ({
  CrmService: {
    getByCustomer: vi.fn().mockResolvedValue([]),
    getAllFollowUps: vi.fn().mockResolvedValue([]),
    getLastActivityDates: vi.fn().mockResolvedValue([]),
    upsert: vi.fn(),
    delete: vi.fn(),
  },
}))

import { CrmService } from '@/services/crm.service'
import { useCrmStore } from './crm.store'

beforeEach(() => {
  vi.clearAllMocks()
  useCrmStore.setState({ followUps: [], allFollowUps: [], lastActivity: [], currentCustomerId: null, isLoading: false, error: null })
})

describe('useCrmStore', () => {
  it('loadForCustomer merkt sich currentCustomerId (fuer Realtime-Reload)', async () => {
    vi.mocked(CrmService.getByCustomer).mockResolvedValueOnce([])
    await useCrmStore.getState().loadForCustomer('c1')
    expect(CrmService.getByCustomer).toHaveBeenCalledWith('c1')
    expect(useCrmStore.getState().currentCustomerId).toBe('c1')
  })
})
