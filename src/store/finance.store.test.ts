import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }))

vi.mock('@/data/finance.gateway', () => ({
  FinanceGateway: {
    getInvoices: vi.fn().mockResolvedValue([]),
    getOffers: vi.fn().mockResolvedValue([]),
    getPaymentsByWorkspace: vi.fn().mockResolvedValue([]),
    getInvoice: vi.fn(),
    getOffer: vi.fn(),
    createInvoice: vi.fn(),
    updateInvoice: vi.fn(),
    deleteInvoice: vi.fn(),
    addPayment: vi.fn(),
    deletePayment: vi.fn(),
    createOffer: vi.fn(),
    updateOffer: vi.fn(),
    deleteOffer: vi.fn(),
    convertOfferToInvoice: vi.fn(),
    approveInvoiceSuggestion: vi.fn(),
    updateInvoiceStatus: vi.fn(),
    updateOfferStatus: vi.fn(),
  },
}))

vi.mock('@/services/finance.service', () => ({
  FinanceService: { getFinanceKpis: vi.fn().mockResolvedValue(null), getInvoice: vi.fn() },
}))

import { FinanceGateway } from '@/data/finance.gateway'
import { FinanceService } from '@/services/finance.service'
import { useFinanceStore } from './finance.store'
import { useToastStore } from './toast.store'
import { useTourStore } from './tour.store'

describe('useFinanceStore — Schreibfehler sind nicht still (Toast + weiterwerfen)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useToastStore.setState({ toasts: [] })
    useFinanceStore.setState({ invoices: [], offers: [], payments: [] })
  })

  it('createInvoice: Fehler → Fehler-Toast + wirft', async () => {
    vi.mocked(FinanceGateway.createInvoice).mockRejectedValueOnce(new Error('network'))
    await expect(useFinanceStore.getState().createInvoice({} as any)).rejects.toThrow()
    expect(useToastStore.getState().toasts.some(t => t.variant === 'error')).toBe(true)
  })

  it('addPayment: Fehler → Fehler-Toast + wirft', async () => {
    vi.mocked(FinanceGateway.addPayment).mockRejectedValueOnce(new Error('network'))
    await expect(useFinanceStore.getState().addPayment({ workspaceId: 'ws' } as any)).rejects.toThrow()
    expect(useToastStore.getState().toasts.some(t => t.variant === 'error')).toBe(true)
  })

  it('deleteInvoice: Fehler → Fehler-Toast + wirft', async () => {
    vi.mocked(FinanceGateway.deleteInvoice).mockRejectedValueOnce(new Error('network'))
    await expect(useFinanceStore.getState().deleteInvoice('inv1')).rejects.toThrow()
    expect(useToastStore.getState().toasts.some(t => t.variant === 'error')).toBe(true)
  })

  it('createOffer: Fehler → Fehler-Toast + wirft', async () => {
    vi.mocked(FinanceGateway.createOffer).mockRejectedValueOnce(new Error('network'))
    await expect(useFinanceStore.getState().createOffer({} as any)).rejects.toThrow()
    expect(useToastStore.getState().toasts.some(t => t.variant === 'error')).toBe(true)
  })
})

describe('useFinanceStore — während der KORA-Tour keine Loads (Schau-Daten nicht überschreiben)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useTourStore.setState({ active: false })
    useFinanceStore.setState({ invoices: [], offers: [], payments: [], kpis: null })
  })

  it('loadAll: bei aktiver Tour kein Gateway-Aufruf (Fixtures bleiben erhalten)', async () => {
    useTourStore.setState({ active: true })
    await useFinanceStore.getState().loadAll('ws1')
    expect(FinanceGateway.getInvoices).not.toHaveBeenCalled()
  })

  it('loadKpis: bei aktiver Tour kein Service-Aufruf', async () => {
    useTourStore.setState({ active: true })
    await useFinanceStore.getState().loadKpis('ws1')
    expect(FinanceService.getFinanceKpis).not.toHaveBeenCalled()
  })

  it('loadAll: ohne Tour normal laden', async () => {
    await useFinanceStore.getState().loadAll('ws1')
    expect(FinanceGateway.getInvoices).toHaveBeenCalledWith('ws1')
  })
})
