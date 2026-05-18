import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useDealsStore } from './deals.store'

vi.mock('@/services/deals.service', () => ({
  DealsService: {
    getByWorkspace: vi.fn().mockResolvedValue([]),
    getByCustomer: vi.fn().mockResolvedValue([]),
    upsert: vi.fn(),
    updateStage: vi.fn(),
    delete: vi.fn(),
  },
}))

describe('useDealsStore', () => {
  beforeEach(() => {
    useDealsStore.setState({ deals: [], customerDeals: [], isLoading: false, error: null })
  })

  it('moveToStage optimistically updates deal in store', async () => {
    const { DealsService } = await import('@/services/deals.service')
    const deal = {
      id: 'd1', workspaceId: 'ws', createdBy: 'u1', accountId: 'a1',
      title: 'Test', stage: 'lead', currency: 'EUR', createdAt: '', updatedAt: '',
    }
    useDealsStore.setState({ deals: [deal] })
    const updatedDeal = { ...deal, stage: 'qualified' }
    vi.mocked(DealsService.updateStage).mockResolvedValueOnce(updatedDeal)

    await useDealsStore.getState().moveToStage('d1', 'qualified')

    expect(useDealsStore.getState().deals.find(d => d.id === 'd1')?.stage).toBe('qualified')
  })

  it('moveToStage reverts on error', async () => {
    const { DealsService } = await import('@/services/deals.service')
    const deal = {
      id: 'd1', workspaceId: 'ws', createdBy: 'u1', accountId: 'a1',
      title: 'Test', stage: 'lead', currency: 'EUR', createdAt: '', updatedAt: '',
    }
    useDealsStore.setState({ deals: [deal] })
    vi.mocked(DealsService.updateStage).mockRejectedValueOnce(new Error('network'))

    try { await useDealsStore.getState().moveToStage('d1', 'qualified') } catch {}

    expect(useDealsStore.getState().deals.find(d => d.id === 'd1')?.stage).toBe('lead')
  })
})
