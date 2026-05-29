import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useLeadsStore } from './leads.store'
import { usePipelineStore } from './pipeline.store'
import { useDealsStore } from './deals.store'
import { useCustomersStore } from './customers.store'
import { LeadsService } from '@/services/leads.service'
import { DealsService } from '@/services/deals.service'
import type { Lead } from '@/types/lead.types'

vi.mock('@/services/leads.service', () => ({
  LeadsService: {
    getAll: vi.fn().mockResolvedValue([]),
    upsert: vi.fn(),
    bulkUpdate: vi.fn(),
    convertToClient: vi.fn(),
    deleteLead: vi.fn(),
    syncPending: vi.fn().mockResolvedValue(0),
    updateStage: vi.fn(),
  },
}))

vi.mock('@/services/deals.service', () => ({
  DealsService: {
    getByWorkspace: vi.fn().mockResolvedValue([]),
    getByCustomer: vi.fn().mockResolvedValue([]),
    upsert: vi.fn(),
    updateStage: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('@/services/pipeline.service', () => ({
  PipelineService: {
    getAll: vi.fn().mockResolvedValue([]),
    upsert: vi.fn(),
    delete: vi.fn(),
    reorder: vi.fn(),
  },
}))

vi.mock('./customers.store', () => ({
  useCustomersStore: {
    getState: vi.fn(() => ({ init: vi.fn().mockResolvedValue(undefined) })),
  },
}))

const mockLead: Lead = {
  id: 'lead-1', workspaceId: 'ws1', name: 'Acme GmbH', email: null,
  accountType: 'lead', pipelineStage: 'replied', leadStatus: 'warm',
  leadSource: 'manual', leadSourceDetail: null, companyName: null,
  linkedinUrl: null, lastActivityAt: null, nextFollowUpAt: null,
  engagementScore: 0, reEngageDate: null, convertedAt: null,
  createdAt: '2026-01-01', updatedAt: '2026-01-01',
}

describe('useLeadsStore.convertToDeal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useLeadsStore.setState({ leads: [mockLead], isLoading: false, error: null })
    useDealsStore.setState({ deals: [], customerDeals: [], isLoading: false, error: null })
    usePipelineStore.setState({
      stages: [
        { id: 'stage-1', workspaceId: 'ws1', name: 'discovery', label: 'Discovery', orderIndex: 0, color: '#blue', isWon: false, isLost: false, createdAt: '', updatedAt: '' },
        { id: 'stage-2', workspaceId: 'ws1', name: 'won', label: 'Won', orderIndex: 99, color: '#green', isWon: true, isLost: false, createdAt: '', updatedAt: '' },
      ],
      isLoading: false, error: null,
    } as any)
  })

  it('throws if no active pipeline stages', async () => {
    usePipelineStore.setState({ stages: [], isLoading: false, error: null } as any)
    await expect(
      useLeadsStore.getState().convertToDeal('lead-1', 'ws1', 'user-1')
    ).rejects.toThrow(/Keine Pipeline-Stage/)
    expect(useLeadsStore.getState().leads).toHaveLength(1)
  })

  it('converts lead and creates deal in first active stage', async () => {
    const convertSpy = vi.spyOn(LeadsService, 'convertToClient').mockResolvedValue({ ...mockLead, accountType: 'customer' as any })
    const upsertSpy  = vi.spyOn(DealsService, 'upsert').mockResolvedValue({
      id: 'deal-1', workspaceId: 'ws1', createdBy: 'user-1', accountId: 'lead-1',
      customerId: 'lead-1', title: 'Acme GmbH', stage: 'discovery', value: 0,
      currency: 'EUR', createdAt: '', updatedAt: '',
    })

    await useLeadsStore.getState().convertToDeal('lead-1', 'ws1', 'user-1')

    expect(convertSpy).toHaveBeenCalledWith('lead-1')
    expect(upsertSpy).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'ws1',
      createdBy: 'user-1',
      accountId: 'lead-1',
      customerId: 'lead-1',
      title: 'Acme GmbH',
      stage: 'discovery',
      value: 0,
    }))
    expect(useLeadsStore.getState().leads).toHaveLength(0)
    expect(useDealsStore.getState().deals).toHaveLength(1)
  })

  it('rolls back on convertToClient failure (lead remains)', async () => {
    vi.spyOn(LeadsService, 'convertToClient').mockRejectedValue(new Error('network'))
    await expect(
      useLeadsStore.getState().convertToDeal('lead-1', 'ws1', 'user-1')
    ).rejects.toThrow()
    expect(useLeadsStore.getState().leads).toHaveLength(1)
    expect(useDealsStore.getState().deals).toHaveLength(0)
  })
})
