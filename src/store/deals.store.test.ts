import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/data/deals.gateway', () => ({
  DealsGateway: {
    getByWorkspace: vi.fn().mockResolvedValue([]),
    getByCustomer: vi.fn().mockResolvedValue([]),
    upsert: vi.fn(),
    updateStage: vi.fn(),
    delete: vi.fn(),
  },
}))

import { DealsGateway } from '@/data/deals.gateway'
import { useDealsStore } from './deals.store'
import { useToastStore } from './toast.store'

const deal = (over: Record<string, unknown> = {}) => ({
  id: 'd1', workspaceId: 'ws', createdBy: 'u1', accountId: 'a1',
  title: 'Test', stage: 'lead', currency: 'EUR', createdAt: '', updatedAt: '', ...over,
})

describe('useDealsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useDealsStore.setState({ deals: [], customerDeals: [], currentCustomerId: null, isLoading: false, error: null })
  })

  it('loadForCustomer: routet übers Gateway und merkt sich currentCustomerId', async () => {
    vi.mocked(DealsGateway.getByCustomer).mockResolvedValueOnce([deal()])
    await useDealsStore.getState().loadForCustomer('cust1')
    expect(DealsGateway.getByCustomer).toHaveBeenCalledWith('cust1')
    expect(useDealsStore.getState().customerDeals).toHaveLength(1)
    expect(useDealsStore.getState().currentCustomerId).toBe('cust1')
  })

  it('moveToStage optimistically updates deal in store', async () => {
    useDealsStore.setState({ deals: [deal()] })
    vi.mocked(DealsGateway.updateStage).mockResolvedValueOnce(deal({ stage: 'qualified' }))
    await useDealsStore.getState().moveToStage('d1', 'qualified')
    expect(DealsGateway.updateStage).toHaveBeenCalledWith('d1', 'qualified')
    expect(useDealsStore.getState().deals.find(d => d.id === 'd1')?.stage).toBe('qualified')
  })

  it('moveToStage reverts on error', async () => {
    useDealsStore.setState({ deals: [deal()] })
    vi.mocked(DealsGateway.updateStage).mockRejectedValueOnce(new Error('network'))
    try { await useDealsStore.getState().moveToStage('d1', 'qualified') } catch {}
    expect(useDealsStore.getState().deals.find(d => d.id === 'd1')?.stage).toBe('lead')
  })

  it('upsert: bei Fehler nicht still — Fehler-Toast + weiterwerfen', async () => {
    useToastStore.setState({ toasts: [] })
    vi.mocked(DealsGateway.upsert).mockRejectedValueOnce(new Error('network'))
    await expect(useDealsStore.getState().upsert({ workspaceId: 'ws', createdBy: 'u1', accountId: 'a1', title: 'X', stage: 'lead', value: 0 } as any)).rejects.toThrow()
    expect(useToastStore.getState().toasts.some(t => t.variant === 'error')).toBe(true)
  })

  it('remove: bei Fehler nicht still — Fehler-Toast + weiterwerfen', async () => {
    useToastStore.setState({ toasts: [] })
    vi.mocked(DealsGateway.delete).mockRejectedValueOnce(new Error('network'))
    await expect(useDealsStore.getState().remove('d1')).rejects.toThrow()
    expect(useToastStore.getState().toasts.some(t => t.variant === 'error')).toBe(true)
  })

  it('moveToStage: bei Fehler Fehler-Toast (zusätzlich zum Revert)', async () => {
    useToastStore.setState({ toasts: [] })
    useDealsStore.setState({ deals: [deal()] })
    vi.mocked(DealsGateway.updateStage).mockRejectedValueOnce(new Error('network'))
    try { await useDealsStore.getState().moveToStage('d1', 'qualified') } catch {}
    expect(useToastStore.getState().toasts.some(t => t.variant === 'error')).toBe(true)
  })
})
