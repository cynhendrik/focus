import { invoke } from '@tauri-apps/api/core'
import type {
  Invoice, InvoiceWithItems, UpsertInvoicePayload,
  Offer, OfferWithItems, UpsertOfferPayload,
  FinanceKpis, InvoiceStatus,
} from '@/types/finance.types'

export const FinanceService = {
  // ── Invoices ──────────────────────────────────────────────────────────────
  getInvoices(workspaceId: string, statusFilter?: InvoiceStatus | 'suggestions'): Promise<Invoice[]> {
    return invoke('get_invoices', { workspaceId, statusFilter: statusFilter ?? null })
  },
  getInvoice(id: string): Promise<InvoiceWithItems> {
    return invoke('get_invoice', { id })
  },
  createInvoice(payload: UpsertInvoicePayload): Promise<InvoiceWithItems> {
    return invoke('create_invoice', { payload })
  },
  updateInvoice(id: string, payload: UpsertInvoicePayload): Promise<InvoiceWithItems> {
    return invoke('update_invoice', { id, payload })
  },
  deleteInvoice(id: string): Promise<void> {
    return invoke('delete_invoice', { id })
  },
  approveInvoiceSuggestion(id: string, approvedBy: string, workspaceId: string): Promise<Invoice> {
    return invoke('approve_invoice_suggestion', { id, approvedBy, workspaceId })
  },
  updateInvoiceStatus(id: string, status: InvoiceStatus): Promise<Invoice> {
    return invoke('update_invoice_status', { id, status })
  },
  getInvoiceSuggestions(workspaceId: string): Promise<Invoice[]> {
    return invoke('get_invoice_suggestions', { workspaceId })
  },
  getInvoicesByAccount(accountId: string): Promise<Invoice[]> {
    return invoke('get_invoices_by_account', { accountId })
  },
  getFinanceKpis(workspaceId: string): Promise<FinanceKpis> {
    return invoke('get_finance_kpis', { workspaceId })
  },

  // ── Offers ────────────────────────────────────────────────────────────────
  getOffers(workspaceId: string): Promise<Offer[]> {
    return invoke('get_offers', { workspaceId })
  },
  getOffer(id: string): Promise<OfferWithItems> {
    return invoke('get_offer', { id })
  },
  createOffer(payload: UpsertOfferPayload): Promise<OfferWithItems> {
    return invoke('create_offer', { payload })
  },
  updateOffer(id: string, payload: UpsertOfferPayload): Promise<OfferWithItems> {
    return invoke('update_offer', { id, payload })
  },
  deleteOffer(id: string): Promise<void> {
    return invoke('delete_offer', { id })
  },
  updateOfferStatus(id: string, status: string): Promise<Offer> {
    return invoke('update_offer_status', { id, status })
  },
  convertOfferToInvoice(offerId: string, workspaceId: string, createdBy: string): Promise<InvoiceWithItems> {
    return invoke('convert_offer_to_invoice', { offerId, workspaceId, createdBy })
  },
  getOffersByAccount(accountId: string): Promise<Offer[]> {
    return invoke('get_offers_by_account', { accountId })
  },
}
