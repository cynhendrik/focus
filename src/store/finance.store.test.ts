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
    setInvoiceProject: vi.fn(),
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
import type { Invoice } from '@/types/finance.types'

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

describe('useFinanceStore — setInvoiceProject', () => {
  const sampleInvoice: Invoice = {
    id: 'inv1',
    workspaceId: 'ws1',
    createdBy: 'user1',
    accountId: 'acc1',
    date: '2026-07-01',
    dueDate: '2026-07-15',
    status: 'draft',
    taxMode: 'standard',
    subtotal: 100,
    taxAmount: 19,
    total: 119,
    bankInfo: '',
    isSuggestion: false,
    pendingSync: false,
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    useFinanceStore.setState({ invoices: [sampleInvoice] })
  })

  it('setInvoiceProject aktualisiert die Rechnung im Store', async () => {
    vi.mocked(FinanceGateway.setInvoiceProject).mockResolvedValue({ ...sampleInvoice, projectId: 'p1' })
    await useFinanceStore.getState().setInvoiceProject('inv1', 'p1')
    expect(useFinanceStore.getState().invoices.find(i => i.id === 'inv1')?.projectId).toBe('p1')
  })
})
