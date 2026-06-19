import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/services/finance.service', () => ({
  FinanceService: { getInvoices: vi.fn(), getOffers: vi.fn(), getPaymentsByWorkspace: vi.fn(), getInvoice: vi.fn() },
}))
vi.mock('@/store/workspace.store', () => ({ useWorkspaceStore: { getState: vi.fn() } }))
const chain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockResolvedValue({ data: [], error: null }) }
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(() => chain) } }))

import { FinanceService } from '@/services/finance.service'
import { useWorkspaceStore } from '@/store/workspace.store'
import { supabase } from '@/lib/supabase'
import { FinanceGateway } from './finance.gateway'

describe('FinanceGateway read routing', () => {
  beforeEach(() => vi.clearAllMocks())
  it('getInvoices solo → FinanceService', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => false } as any)
    vi.mocked(FinanceService.getInvoices).mockResolvedValueOnce([])
    await FinanceGateway.getInvoices('ws1')
    expect(FinanceService.getInvoices).toHaveBeenCalledWith('ws1', undefined)
    expect(supabase.from).not.toHaveBeenCalled()
  })
  it('getInvoices shared → supabase.invoices', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => true } as any)
    await FinanceGateway.getInvoices('ws1')
    expect(supabase.from).toHaveBeenCalledWith('invoices')
    expect(FinanceService.getInvoices).not.toHaveBeenCalled()
  })
})
