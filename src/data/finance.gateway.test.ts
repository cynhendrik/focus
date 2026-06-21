import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/services/finance.service', () => ({
  FinanceService: {
    getInvoices: vi.fn(), getOffers: vi.fn(), getPaymentsByWorkspace: vi.fn(), getInvoice: vi.fn(),
    createInvoice: vi.fn(), updateInvoice: vi.fn(), deleteInvoice: vi.fn(),
    updateInvoiceStatus: vi.fn(), approveInvoiceSuggestion: vi.fn(),
    createOffer: vi.fn(), updateOffer: vi.fn(), deleteOffer: vi.fn(),
    addPayment: vi.fn(), deletePayment: vi.fn(),
    getOffer: vi.fn(), convertOfferToInvoice: vi.fn(),
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
// Overridable result for single(); reset in beforeEach. Lets the finalize path return
// a current-invoice row with number:null so the RPC branch runs.
let singleResult: { data: any; error: null | { message: string } } = { data: invoiceRow, error: null }
const chain: any = {
  select: vi.fn(() => chain),
  eq: vi.fn(() => chain),
  insert: vi.fn(() => chain),
  update: vi.fn(() => chain),
  delete: vi.fn(() => chain),
  order: vi.fn().mockResolvedValue({ data: [], error: null }),
  single: vi.fn(() => Promise.resolve(singleResult)),
  // Make the chain awaitable for terminal builders (insert, update().eq(), delete().eq()).
  // insert resolves the overridable insertResult so error paths can be exercised.
  then: (resolve: (v: { data: null; error: null | { message: string } }) => unknown) => resolve(insertResult),
}
vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(() => chain), rpc: vi.fn().mockResolvedValue({ data: '2026-00001', error: null }) },
}))

import { FinanceService } from '@/services/finance.service'
import { useWorkspaceStore } from '@/store/workspace.store'
import { supabase } from '@/lib/supabase'
import { FinanceGateway } from './finance.gateway'

describe('FinanceGateway read routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    insertResult = { data: null, error: null }
    singleResult = { data: invoiceRow, error: null }
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
    } as any)).rejects.toThrow('boom')
  })
  it('updateInvoiceStatus shared → open ohne Nummer ruft RPC und wendet Nummer an', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => true } as any)
    singleResult = { data: { workspace_id: 'ws1', number: null }, error: null }
    vi.mocked((supabase as any).rpc).mockResolvedValueOnce({ data: '2026-00001', error: null })
    await FinanceGateway.updateInvoiceStatus('i1', 'open')
    expect((supabase as any).rpc).toHaveBeenCalledWith('allocate_invoice_number', expect.any(Object))
    expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({ number: '2026-00001' }))
  })
  it('approveInvoiceSuggestion shared → RPC + update patch', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => true } as any)
    vi.mocked((supabase as any).rpc).mockResolvedValueOnce({ data: '2026-00002', error: null })
    await FinanceGateway.approveInvoiceSuggestion('i1', 'approver', 'ws1')
    expect((supabase as any).rpc).toHaveBeenCalledWith('allocate_invoice_number', expect.any(Object))
    expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'open', is_suggestion: 0, approved_by: 'approver', number: '2026-00002',
    }))
    expect(chain.eq).toHaveBeenCalledWith('is_suggestion', 1)
    expect(FinanceService.approveInvoiceSuggestion).not.toHaveBeenCalled()
  })
  it('approveInvoiceSuggestion solo → FinanceService, kein RPC', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => false } as any)
    vi.mocked(FinanceService.approveInvoiceSuggestion).mockResolvedValueOnce({ id: 'i1' } as any)
    await FinanceGateway.approveInvoiceSuggestion('i1', 'approver', 'ws1')
    expect(FinanceService.approveInvoiceSuggestion).toHaveBeenCalledWith('i1', 'approver', 'ws1')
    expect((supabase as any).rpc).not.toHaveBeenCalled()
  })
  it('updateInvoiceStatus solo → FinanceService', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => false } as any)
    vi.mocked(FinanceService.updateInvoiceStatus).mockResolvedValueOnce({ id: 'i1' } as any)
    await FinanceGateway.updateInvoiceStatus('i1', 'open')
    expect(FinanceService.updateInvoiceStatus).toHaveBeenCalledWith('i1', 'open')
    expect((supabase as any).rpc).not.toHaveBeenCalled()
  })
  it('deleteInvoice shared → supabase delete', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => true } as any)
    await FinanceGateway.deleteInvoice('i1')
    expect(supabase.from).toHaveBeenCalledWith('invoices')
  })
})

describe('FinanceGateway offers write', () => {
  beforeEach(() => { vi.clearAllMocks(); insertResult = { data: null, error: null }; singleResult = { data: { id: 'o1', workspace_id: 'ws1', account_id: 'a1', title: 'A', status: 'draft', valid_until: '2026-07-01', tax_mode: 'standard', subtotal: 0, tax_amount: 0, total: 0, created_at: '', updated_at: '' }, error: null } })
  const offerPayload = { workspaceId: 'ws1', createdBy: 'u1', accountId: 'a1', title: 'A', validUntil: '2026-07-01', subtotal: 0, taxAmount: 0, total: 0, items: [] }

  it('createOffer (solo) ruft FinanceService', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => false } as any)
    vi.mocked(FinanceService.createOffer).mockResolvedValueOnce({ offer: {} as any, items: [] })
    await FinanceGateway.createOffer(offerPayload as any)
    expect(FinanceService.createOffer).toHaveBeenCalled()
    expect(supabase.from).not.toHaveBeenCalled()
  })
  it('createOffer (shared) allokiert Nummer + schreibt nach supabase', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => true } as any)
    await FinanceGateway.createOffer(offerPayload as any)
    expect(supabase.rpc).toHaveBeenCalledWith('allocate_offer_number', { ws_id: 'ws1' })
    expect(supabase.from).toHaveBeenCalledWith('offers')
  })
  it('deleteOffer (shared) löscht aus supabase', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => true } as any)
    await FinanceGateway.deleteOffer('o1')
    expect(supabase.from).toHaveBeenCalledWith('offers')
  })
})

describe('FinanceGateway payments write', () => {
  beforeEach(() => { vi.clearAllMocks(); insertResult = { data: null, error: null } })
  const pay = { workspaceId: 'ws1', invoiceId: 'inv1', amount: 50, paidAt: '2026-06-02' }
  it('addPayment (solo) ruft FinanceService', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => false } as any)
    vi.mocked(FinanceService.addPayment).mockResolvedValueOnce({} as any)
    await FinanceGateway.addPayment(pay as any)
    expect(FinanceService.addPayment).toHaveBeenCalled()
    expect(supabase.from).not.toHaveBeenCalled()
  })
  it('addPayment (shared) schreibt nach supabase.payments', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => true } as any)
    await FinanceGateway.addPayment(pay as any)
    expect(supabase.from).toHaveBeenCalledWith('payments')
  })
  it('deletePayment (shared) löscht aus supabase.payments', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => true } as any)
    await FinanceGateway.deletePayment('p1')
    expect(supabase.from).toHaveBeenCalledWith('payments')
  })
})

describe('FinanceGateway convertOfferToInvoice', () => {
  beforeEach(() => { vi.clearAllMocks(); insertResult = { data: null, error: null } })
  it('convert (solo) ruft FinanceService', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => false } as any)
    vi.mocked(FinanceService.convertOfferToInvoice).mockResolvedValueOnce({ invoice: {} as any, items: [] })
    await FinanceGateway.convertOfferToInvoice('o1', 'ws1', 'u1')
    expect(FinanceService.convertOfferToInvoice).toHaveBeenCalledWith('o1', 'ws1', 'u1')
  })
  it('convert (shared) liest Offer, erstellt Rechnung, markiert Offer accepted', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => true } as any)
    // getOffer → single() liefert offer; createInvoice nutzt insert (then→insertResult ok); getInvoice → single()
    singleResult = { data: { id: 'o1', workspace_id: 'ws1', account_id: 'a1', title: 'A', status: 'draft', valid_until: '2026-07-01', tax_mode: 'standard', subtotal: 100, tax_amount: 19, total: 119, created_at: '', updated_at: '' }, error: null }
    const res = await FinanceGateway.convertOfferToInvoice('o1', 'ws1', 'u1')
    expect(supabase.from).toHaveBeenCalledWith('offers')   // markiert accepted
    expect(res).toBeDefined()
  })
})
