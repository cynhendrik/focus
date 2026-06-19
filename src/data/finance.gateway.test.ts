import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/services/finance.service', () => ({
  FinanceService: {
    getInvoices: vi.fn(), getOffers: vi.fn(), getPaymentsByWorkspace: vi.fn(), getInvoice: vi.fn(),
    createInvoice: vi.fn(), updateInvoice: vi.fn(), deleteInvoice: vi.fn(),
  },
}))
vi.mock('@/store/workspace.store', () => ({ useWorkspaceStore: { getState: vi.fn() } }))
const invoiceRow = {
  id: 'inv1', workspace_id: 'ws1', created_by: 'u1', account_id: 'acc1', date: '2026-01-01',
  due_date: '2026-01-31', status: 'draft', tax_mode: 'net', subtotal: 100, tax_amount: 19, total: 119,
  created_at: '2026-01-01', updated_at: '2026-01-01',
}
// Overridable result for insert() terminal awaits; reset in beforeEach.
let insertResult: { data: null; error: null | { message: string } } = { data: null, error: null }
const chain: any = {
  select: vi.fn(() => chain),
  eq: vi.fn(() => chain),
  insert: vi.fn(() => chain),
  update: vi.fn(() => chain),
  delete: vi.fn(() => chain),
  order: vi.fn().mockResolvedValue({ data: [], error: null }),
  single: vi.fn().mockResolvedValue({ data: invoiceRow, error: null }),
  // Make the chain awaitable for terminal builders (insert, update().eq(), delete().eq()).
  // insert resolves the overridable insertResult so error paths can be exercised.
  then: (resolve: (v: { data: null; error: null | { message: string } }) => unknown) => resolve(insertResult),
}
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(() => chain) } }))

import { FinanceService } from '@/services/finance.service'
import { useWorkspaceStore } from '@/store/workspace.store'
import { supabase } from '@/lib/supabase'
import { FinanceGateway } from './finance.gateway'

describe('FinanceGateway read routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    insertResult = { data: null, error: null }
  })
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

  it('getInvoice shared → supabase.invoices + invoice_items', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => true } as any)
    const res = await FinanceGateway.getInvoice('inv1')
    expect(supabase.from).toHaveBeenCalledWith('invoices')
    expect(supabase.from).toHaveBeenCalledWith('invoice_items')
    expect(FinanceService.getInvoice).not.toHaveBeenCalled()
    expect(res.invoice.id).toBe('inv1')
    expect(res.items).toEqual([])
  })

  it('getInvoice solo → FinanceService', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => false } as any)
    vi.mocked(FinanceService.getInvoice).mockResolvedValueOnce({ invoice: {} as any, items: [] })
    await FinanceGateway.getInvoice('inv1')
    expect(FinanceService.getInvoice).toHaveBeenCalledWith('inv1')
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('getPaymentsByWorkspace shared → supabase.payments ordered by paid_at', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => true } as any)
    await FinanceGateway.getPaymentsByWorkspace('ws1')
    expect(supabase.from).toHaveBeenCalledWith('payments')
    expect(chain.eq).toHaveBeenCalledWith('workspace_id', 'ws1')
    expect(chain.order).toHaveBeenCalledWith('paid_at', { ascending: false })
    expect(FinanceService.getPaymentsByWorkspace).not.toHaveBeenCalled()
  })

  it('getPaymentsByWorkspace solo → FinanceService', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => false } as any)
    vi.mocked(FinanceService.getPaymentsByWorkspace).mockResolvedValueOnce([])
    await FinanceGateway.getPaymentsByWorkspace('ws1')
    expect(FinanceService.getPaymentsByWorkspace).toHaveBeenCalledWith('ws1')
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('createInvoice solo → FinanceService', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => false } as any)
    vi.mocked(FinanceService.createInvoice).mockResolvedValueOnce({ invoice: { id: 'i1' }, items: [] } as any)
    await FinanceGateway.createInvoice({ workspaceId: 'ws1', createdBy: 'u1', accountId: 'a1', date: 'd', dueDate: 'd', subtotal: 0, taxAmount: 0, total: 0, items: [] })
    expect(FinanceService.createInvoice).toHaveBeenCalled()
    expect(supabase.from).not.toHaveBeenCalled()
  })
  it('createInvoice shared → supabase invoices insert', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => true } as any)
    await FinanceGateway.createInvoice({ workspaceId: 'ws1', createdBy: 'u1', accountId: 'a1', date: 'd', dueDate: 'd', subtotal: 0, taxAmount: 0, total: 0, items: [] })
    expect(supabase.from).toHaveBeenCalledWith('invoices')
  })
  it('createInvoice shared with items → inserts invoices + invoice_items', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => true } as any)
    await FinanceGateway.createInvoice({
      workspaceId: 'ws1', createdBy: 'u1', accountId: 'a1', date: 'd', dueDate: 'd',
      subtotal: 10, taxAmount: 0, total: 10,
      items: [{ title: 'P', quantity: 1, unitPrice: 10, taxRate: 19, total: 10, sortOrder: 0 }],
    } as any)
    expect(supabase.from).toHaveBeenCalledWith('invoices')
    expect(supabase.from).toHaveBeenCalledWith('invoice_items')
  })
  it('createInvoice shared invoices insert error → rejects', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => true } as any)
    insertResult = { data: null, error: { message: 'boom' } }
    await expect(FinanceGateway.createInvoice({
      workspaceId: 'ws1', createdBy: 'u1', accountId: 'a1', date: 'd', dueDate: 'd',
      subtotal: 0, taxAmount: 0, total: 0, items: [],
    } as any)).rejects.toEqual({ message: 'boom' })
  })
  it('deleteInvoice shared → supabase delete', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => true } as any)
    await FinanceGateway.deleteInvoice('i1')
    expect(supabase.from).toHaveBeenCalledWith('invoices')
  })
})
