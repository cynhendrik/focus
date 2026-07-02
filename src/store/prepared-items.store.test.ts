import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/data/prepared-items.gateway', () => ({
  PreparedItemsGateway: {
    listActive: vi.fn().mockResolvedValue([]),
    insertIgnore: vi.fn().mockResolvedValue(true),
    updateStatus: vi.fn(),
    updatePayload: vi.fn(),
    setAssignee: vi.fn(),
    approvedSince: vi.fn().mockResolvedValue([]),
  },
}))

import { usePreparedItemsStore } from './prepared-items.store'
import { PreparedItemsGateway } from '@/data/prepared-items.gateway'

const item = {
  id: 'p1', workspaceId: 'ws1', type: 'mahnung', sourceKind: 'invoice_reminder',
  sourceId: 'inv1:0', assignee: null, payload: { title: 'T', why: 'W' }, score: 1000,
  status: 'pending', snoozeUntil: null, ruleId: 'mahnung-l0',
  createdAt: '', updatedAt: '', approvedAt: null,
} as never

describe('usePreparedItemsStore', () => {
  beforeEach(() => {
    usePreparedItemsStore.setState({ items: [], loading: false, weekApproved: [] })
    vi.clearAllMocks()
  })

  it('load fuellt items', async () => {
    vi.mocked(PreparedItemsGateway.listActive).mockResolvedValueOnce([item])
    await usePreparedItemsStore.getState().load('ws1')
    expect(usePreparedItemsStore.getState().items).toHaveLength(1)
  })

  it('applyStatus entfernt die Karte optimistisch und ruft das Gateway', async () => {
    usePreparedItemsStore.setState({ items: [item] })
    vi.mocked(PreparedItemsGateway.updateStatus).mockResolvedValueOnce({ ...item, status: 'dismissed' })
    await usePreparedItemsStore.getState().applyStatus('p1', 'dismissed')
    expect(usePreparedItemsStore.getState().items).toHaveLength(0)
    expect(PreparedItemsGateway.updateStatus).toHaveBeenCalledWith('p1', 'dismissed', undefined)
  })

  it('Gateway-Fehler bei applyStatus stellt die Karte wieder her + Fehler-Toast', async () => {
    usePreparedItemsStore.setState({ items: [item] })
    vi.mocked(PreparedItemsGateway.updateStatus).mockRejectedValueOnce(new Error('offline'))
    await usePreparedItemsStore.getState().applyStatus('p1', 'dismissed')
    expect(usePreparedItemsStore.getState().items).toHaveLength(1)
    const { useToastStore } = await import('@/store/toast.store')
    expect(useToastStore.getState().toasts.some(t => t.variant === 'error')).toBe(true)
  })
})
