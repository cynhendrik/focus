import { invoke } from '@tauri-apps/api/core'
import type {
  Invoice, InvoiceWithItems, UpsertInvoicePayload,
  Offer, OfferWithItems, UpsertOfferPayload,
  FinanceKpis, InvoiceStatus,
  Payment, CreatePaymentPayload,
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
  setInvoiceProject(id: string, projectId: string | null): Promise<Invoice> {
    return invoke('set_invoice_project', { id, projectId })
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
  getInvoicesByProject(projectId: string): Promise<Invoice[]> {
    return invoke('get_invoices_by_project', { projectId })
  },
  getFinanceKpis(workspaceId: string): Promise<FinanceKpis> {
    return invoke('get_finance_kpis', { workspaceId })
  },
  getInvoiceSequence(workspaceId: string): Promise<[number, number, string]> {
    return invoke('get_invoice_sequence', { workspaceId })
  },
  setInvoiceStartNumber(workspaceId: string, startNumber: number): Promise<void> {
    return invoke('set_invoice_start_number', { workspaceId, startNumber })
  },
  peekInvoiceNumber(workspaceId: string): Promise<string> {
    return invoke('peek_invoice_number', { workspaceId })
  },
  setInvoiceFormat(workspaceId: string, format: string): Promise<void> {
    return invoke('set_invoice_format', { workspaceId, format })
  },
  invoiceNumberExists(workspaceId: string, number: string, excludeId?: string): Promise<boolean> {
    return invoke('invoice_number_exists', { workspaceId, number, excludeId: excludeId ?? null })
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

  // ── Payments (Zahlungs-Journal) ─────────────────────────────────────────────
  addPayment(payload: CreatePaymentPayload): Promise<Payment> {
    return invoke('cmd_add_payment', { payload })
  },
  getPayments(invoiceId: string): Promise<Payment[]> {
    return invoke('cmd_get_payments', { invoiceId })
  },
  getPaymentsByWorkspace(workspaceId: string): Promise<Payment[]> {
    return invoke('cmd_get_payments_by_workspace', { workspaceId })
  },
  deletePayment(id: string): Promise<void> {
    return invoke('cmd_delete_payment', { id })
  },
}
