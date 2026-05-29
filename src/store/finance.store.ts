import { create } from 'zustand'
import { FinanceService } from '@/services/finance.service'
import { log } from '@/lib/logger'
import type {
  Invoice, InvoiceWithItems, UpsertInvoicePayload,
  Offer, OfferWithItems, UpsertOfferPayload,
  FinanceKpis, InvoiceStatus,
} from '@/types/finance.types'

type InvoiceFilter = InvoiceStatus | 'all' | 'suggestions'
type ActiveTab = 'invoices' | 'offers' | 'kpis'

interface FinanceState {
  invoices: Invoice[]
  offers: Offer[]
  kpis: FinanceKpis | null
  selectedInvoice: InvoiceWithItems | null
  selectedOffer: OfferWithItems | null
  activeTab: ActiveTab
  invoiceFilter: InvoiceFilter
  isLoading: boolean
  error: string | null

  loadAll: (workspaceId: string) => Promise<void>
  loadKpis: (workspaceId: string) => Promise<void>
  selectInvoice: (id: string) => Promise<void>
  clearSelectedInvoice: () => void
  selectOffer: (id: string) => Promise<void>
  clearSelectedOffer: () => void

  createInvoice: (payload: UpsertInvoicePayload) => Promise<InvoiceWithItems>
  updateInvoice: (id: string, payload: UpsertInvoicePayload) => Promise<void>
  deleteInvoice: (id: string) => Promise<void>
  approveInvoiceSuggestion: (id: string, approvedBy: string, workspaceId: string) => Promise<void>
  updateInvoiceStatus: (id: string, status: InvoiceStatus) => Promise<void>

  createOffer: (payload: UpsertOfferPayload) => Promise<OfferWithItems>
  updateOffer: (id: string, payload: UpsertOfferPayload) => Promise<void>
  deleteOffer: (id: string) => Promise<void>
  convertOfferToInvoice: (offerId: string, workspaceId: string, createdBy: string) => Promise<void>

  setActiveTab: (tab: ActiveTab) => void
  setInvoiceFilter: (filter: InvoiceFilter) => void
}

export const useFinanceStore = create<FinanceState>()((set, get) => ({
  invoices: [],
  offers: [],
  kpis: null,
  selectedInvoice: null,
  selectedOffer: null,
  activeTab: 'invoices',
  invoiceFilter: 'all',
  isLoading: false,
  error: null,

  loadAll: async (workspaceId) => {
    set({ isLoading: true, error: null })
    try {
      const [invoices, offers] = await Promise.all([
        FinanceService.getInvoices(workspaceId),
        FinanceService.getOffers(workspaceId),
      ])
      set({ invoices, offers, isLoading: false })
    } catch (err) {
      log.error('loadAll finance failed', { err })
      set({ isLoading: false, error: String(err) })
    }
  },

  loadKpis: async (workspaceId) => {
    try {
      const kpis = await FinanceService.getFinanceKpis(workspaceId)
      set({ kpis })
    } catch (err) {
      log.error('loadKpis failed', { err })
    }
  },

  selectInvoice: async (id) => {
    try {
      const selectedInvoice = await FinanceService.getInvoice(id)
      set({ selectedInvoice })
    } catch (err) {
      log.error('selectInvoice failed', { err })
    }
  },
  clearSelectedInvoice: () => set({ selectedInvoice: null }),

  selectOffer: async (id) => {
    try {
      const selectedOffer = await FinanceService.getOffer(id)
      set({ selectedOffer })
    } catch (err) {
      log.error('selectOffer failed', { err })
    }
  },
  clearSelectedOffer: () => set({ selectedOffer: null }),

  createInvoice: async (payload) => {
    const result = await FinanceService.createInvoice(payload)
    set(s => ({ invoices: [result.invoice, ...s.invoices] }))
    return result
  },

  updateInvoice: async (id, payload) => {
    const result = await FinanceService.updateInvoice(id, payload)
    set(s => ({
      invoices: s.invoices.map(i => i.id === id ? result.invoice : i),
      selectedInvoice: s.selectedInvoice?.invoice.id === id ? result : s.selectedInvoice,
    }))
  },

  deleteInvoice: async (id) => {
    await FinanceService.deleteInvoice(id)
    set(s => ({
      invoices: s.invoices.filter(i => i.id !== id),
      selectedInvoice: s.selectedInvoice?.invoice.id === id ? null : s.selectedInvoice,
    }))
  },

  approveInvoiceSuggestion: async (id, approvedBy, workspaceId) => {
    const approved = await FinanceService.approveInvoiceSuggestion(id, approvedBy, workspaceId)
    set(s => ({
      invoices: s.invoices.map(i => i.id === id ? approved : i),
    }))
  },

  updateInvoiceStatus: async (id, status) => {
    const updated = await FinanceService.updateInvoiceStatus(id, status)
    set(s => ({
      invoices: s.invoices.map(i => i.id === id ? updated : i),
    }))
  },

  createOffer: async (payload) => {
    const result = await FinanceService.createOffer(payload)
    set(s => ({ offers: [result.offer, ...s.offers] }))
    return result
  },

  updateOffer: async (id, payload) => {
    const result = await FinanceService.updateOffer(id, payload)
    set(s => ({
      offers: s.offers.map(o => o.id === id ? result.offer : o),
      selectedOffer: s.selectedOffer?.offer.id === id ? result : s.selectedOffer,
    }))
  },

  deleteOffer: async (id) => {
    await FinanceService.deleteOffer(id)
    set(s => ({
      offers: s.offers.filter(o => o.id !== id),
      selectedOffer: s.selectedOffer?.offer.id === id ? null : s.selectedOffer,
    }))
  },

  convertOfferToInvoice: async (offerId, workspaceId, createdBy) => {
    const result = await FinanceService.convertOfferToInvoice(offerId, workspaceId, createdBy)
    set(s => ({
      invoices: [result.invoice, ...s.invoices],
      offers: s.offers.map(o => o.id === offerId ? { ...o, status: 'accepted' as const, convertedInvoiceId: result.invoice.id } : o),
    }))
  },

  setActiveTab: (activeTab) => set({ activeTab }),
  setInvoiceFilter: (invoiceFilter) => set({ invoiceFilter }),
}))
