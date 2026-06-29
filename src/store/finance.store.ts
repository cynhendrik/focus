import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { FinanceService } from '@/services/finance.service'
import { FinanceGateway } from '@/data/finance.gateway'
import { toastError } from '@/store/toast.store'
import { useTourStore } from '@/store/tour.store'
// getInvoicePdfBytes is imported lazily at call time. This store is in the main
// bundle, so a static import here would drag the heavy react-pdf lib into the
// initial load even though PDFs are only generated on demand.
import { log } from '@/lib/logger'
import type {
  Invoice, InvoiceWithItems, UpsertInvoicePayload,
  Offer, OfferWithItems, UpsertOfferPayload,
  FinanceKpis, InvoiceStatus, OfferStatus,
  Payment, CreatePaymentPayload,
} from '@/types/finance.types'

async function tryAutoSaveToAblage(invoice: Invoice): Promise<void> {
  try {
    const { useWorkspaceStore } = await import('@/store/workspace.store')
    const { useAccountsStore }  = await import('@/store/accounts.store')
    const { useCompanyStore }   = await import('@/store/company.store')

    const workspaceId = useWorkspaceStore.getState().activeWorkspaceId
    if (!workspaceId || !invoice.number) return

    const account = useAccountsStore.getState().accounts.find(a => a.id === invoice.accountId)
    if (!account) return

    const full = await FinanceService.getInvoice(invoice.id)
    const profile = useCompanyStore.getState().profile
    const { getInvoicePdfBytes } = await import('@/components/finance/InvoicePDF')
    const bytes = await getInvoicePdfBytes(full, profile, account)
    const arr = Array.from(bytes)

    await invoke('cmd_save_invoice_to_ablage', {
      workspaceId,
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      accountName: account.name,
      invoiceDate: invoice.date,
      pdfData: arr,
    })
  } catch {
    // Ablage-Fehler unterdrücken — Hauptoperation bleibt unberührt
  }
}

// Schreib-Operationen dürfen nicht still scheitern: ein fehlgeschlagener Write (z. B.
// Rechnung anlegen) wurde bisher nur an die Komponente geworfen und dort selten angezeigt.
// Dieser Wrapper zeigt eine nutzerverständliche Fehlermeldung und wirft weiter, damit
// bestehende Aufrufer-Logik (await/Result-Nutzung) unverändert bleibt.
async function withErrorToast<T>(message: string, op: () => Promise<T>): Promise<T> {
  try {
    return await op()
  } catch (err) {
    log.error(message, { err })
    toastError(message)
    throw err
  }
}

type InvoiceFilter = InvoiceStatus | 'all' | 'suggestions'
type ActiveTab = 'invoices' | 'offers' | 'kpis'

interface FinanceState {
  invoices: Invoice[]
  offers: Offer[]
  payments: Payment[]
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

  loadPayments: (workspaceId: string) => Promise<void>
  addPayment: (payload: CreatePaymentPayload) => Promise<void>
  deletePayment: (id: string, workspaceId: string) => Promise<void>

  createOffer: (payload: UpsertOfferPayload) => Promise<OfferWithItems>
  updateOffer: (id: string, payload: UpsertOfferPayload) => Promise<void>
  deleteOffer: (id: string) => Promise<void>
  updateOfferStatus: (id: string, status: OfferStatus) => Promise<void>
  convertOfferToInvoice: (offerId: string, workspaceId: string, createdBy: string) => Promise<void>

  setActiveTab: (tab: ActiveTab) => void
  setInvoiceFilter: (filter: InvoiceFilter) => void
}

export const useFinanceStore = create<FinanceState>()((set, get) => ({
  invoices: [],
  offers: [],
  payments: [],
  kpis: null,
  selectedInvoice: null,
  selectedOffer: null,
  activeTab: 'invoices',
  invoiceFilter: 'all',
  isLoading: false,
  error: null,

  loadAll: async (workspaceId) => {
    // Während der KORA-Tour zeigen wir Schau-Daten im Speicher (applyTourFixtures).
    // Routen laden beim Mount neu — das würde die Fixtures mit dem echten (leeren)
    // Workspace überschreiben. Deshalb hier kein echter Load, solange die Tour läuft.
    if (useTourStore.getState().active) return
    set({ isLoading: true, error: null })
    try {
      const [invoices, offers, payments] = await Promise.all([
        FinanceGateway.getInvoices(workspaceId),
        FinanceGateway.getOffers(workspaceId),
        FinanceGateway.getPaymentsByWorkspace(workspaceId),
      ])
      set({ invoices, offers, payments, isLoading: false })
    } catch (err) {
      log.error('loadAll finance failed', { err })
      set({ isLoading: false, error: String(err) })
    }
  },

  loadKpis: async (workspaceId) => {
    if (useTourStore.getState().active) return   // siehe loadAll: Tour-Fixtures nicht überschreiben
    try {
      const kpis = await FinanceService.getFinanceKpis(workspaceId)
      set({ kpis })
    } catch (err) {
      log.error('loadKpis failed', { err })
    }
  },

  selectInvoice: async (id) => {
    try {
      const selectedInvoice = await FinanceGateway.getInvoice(id)
      set({ selectedInvoice })
    } catch (err) {
      log.error('selectInvoice failed', { err })
    }
  },
  clearSelectedInvoice: () => set({ selectedInvoice: null }),

  selectOffer: async (id) => {
    try {
      const selectedOffer = await FinanceGateway.getOffer(id)
      set({ selectedOffer })
    } catch (err) {
      log.error('selectOffer failed', { err })
    }
  },
  clearSelectedOffer: () => set({ selectedOffer: null }),

  createInvoice: (payload) => withErrorToast('Rechnung konnte nicht gespeichert werden.', async () => {
    const result = await FinanceGateway.createInvoice(payload)
    set(s => ({ invoices: [result.invoice, ...s.invoices] }))
    return result
  }),

  updateInvoice: (id, payload) => withErrorToast('Rechnung konnte nicht gespeichert werden.', async () => {
    const result = await FinanceGateway.updateInvoice(id, payload)
    set(s => ({
      invoices: s.invoices.map(i => i.id === id ? result.invoice : i),
      selectedInvoice: s.selectedInvoice?.invoice.id === id ? result : s.selectedInvoice,
    }))
  }),

  deleteInvoice: (id) => withErrorToast('Rechnung konnte nicht gelöscht werden.', async () => {
    await FinanceGateway.deleteInvoice(id)
    set(s => ({
      invoices: s.invoices.filter(i => i.id !== id),
      selectedInvoice: s.selectedInvoice?.invoice.id === id ? null : s.selectedInvoice,
    }))
  }),

  approveInvoiceSuggestion: (id, approvedBy, workspaceId) => withErrorToast('Rechnung konnte nicht freigegeben werden.', async () => {
    const approved = await FinanceGateway.approveInvoiceSuggestion(id, approvedBy, workspaceId)
    set(s => ({
      invoices: s.invoices.map(i => i.id === id ? approved : i),
    }))
    // Neue Rechnung → automatisch in Kunden-Ablage speichern
    tryAutoSaveToAblage(approved)
  }),

  updateInvoiceStatus: (id, status) => withErrorToast('Rechnungsstatus konnte nicht gespeichert werden.', async () => {
    const updated = await FinanceGateway.updateInvoiceStatus(id, status)
    set(s => ({
      invoices: s.invoices.map(i => i.id === id ? updated : i),
    }))
    // Bei "Bezahlt" oder "Offen (versendet)" → automatisch in Kunden-Ablage
    if (status === 'paid' || status === 'open') {
      tryAutoSaveToAblage(updated)
    }
  }),

  loadPayments: async (workspaceId) => {
    try {
      const payments = await FinanceGateway.getPaymentsByWorkspace(workspaceId)
      set({ payments })
    } catch (err) {
      log.error('loadPayments failed', { err })
    }
  },

  addPayment: (payload) => withErrorToast('Zahlung konnte nicht gespeichert werden.', async () => {
    await FinanceGateway.addPayment(payload)
    // Rechnungen + Zahlungen neu laden — Status kann auf "bezahlt" kippen.
    const [invoices, payments] = await Promise.all([
      FinanceGateway.getInvoices(payload.workspaceId),
      FinanceGateway.getPaymentsByWorkspace(payload.workspaceId),
    ])
    set({ invoices, payments })
  }),

  deletePayment: (id, workspaceId) => withErrorToast('Zahlung konnte nicht gelöscht werden.', async () => {
    await FinanceGateway.deletePayment(id)
    const [invoices, payments] = await Promise.all([
      FinanceGateway.getInvoices(workspaceId),
      FinanceGateway.getPaymentsByWorkspace(workspaceId),
    ])
    set({ invoices, payments })
  }),

  createOffer: (payload) => withErrorToast('Angebot konnte nicht gespeichert werden.', async () => {
    const result = await FinanceGateway.createOffer(payload)
    set(s => ({ offers: [result.offer, ...s.offers] }))
    return result
  }),

  updateOffer: (id, payload) => withErrorToast('Angebot konnte nicht gespeichert werden.', async () => {
    const result = await FinanceGateway.updateOffer(id, payload)
    set(s => ({
      offers: s.offers.map(o => o.id === id ? result.offer : o),
      selectedOffer: s.selectedOffer?.offer.id === id ? result : s.selectedOffer,
    }))
  }),

  deleteOffer: (id) => withErrorToast('Angebot konnte nicht gelöscht werden.', async () => {
    await FinanceGateway.deleteOffer(id)
    set(s => ({
      offers: s.offers.filter(o => o.id !== id),
      selectedOffer: s.selectedOffer?.offer.id === id ? null : s.selectedOffer,
    }))
  }),

  updateOfferStatus: (id, status) => withErrorToast('Angebotsstatus konnte nicht gespeichert werden.', async () => {
    const updated = await FinanceGateway.updateOfferStatus(id, status)
    set(s => ({
      offers: s.offers.map(o => o.id === id ? updated : o),
      selectedOffer: s.selectedOffer?.offer.id === id ? { ...s.selectedOffer, offer: updated } : s.selectedOffer,
    }))
  }),

  convertOfferToInvoice: (offerId, workspaceId, createdBy) => withErrorToast('Angebot konnte nicht in eine Rechnung umgewandelt werden.', async () => {
    const result = await FinanceGateway.convertOfferToInvoice(offerId, workspaceId, createdBy)
    set(s => ({
      invoices: [result.invoice, ...s.invoices],
      offers: s.offers.map(o => o.id === offerId ? { ...o, status: 'accepted' as const, convertedInvoiceId: result.invoice.id } : o),
    }))
  }),

  setActiveTab: (activeTab) => set({ activeTab }),
  setInvoiceFilter: (invoiceFilter) => set({ invoiceFilter }),
}))
