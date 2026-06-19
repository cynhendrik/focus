import { supabase } from '@/lib/supabase'
import { FinanceService } from '@/services/finance.service'
import { useWorkspaceStore } from '@/store/workspace.store'
import {
  invoiceRowToInvoice, invoiceItemRowToItem, offerRowToOffer, offerItemRowToItem, paymentRowToPayment,
  invoicePayloadToRow, invoiceItemPayloadToRow,
} from './finance.mapper'
import type { Invoice, InvoiceWithItems, Offer, OfferWithItems, Payment, InvoiceStatus, UpsertInvoicePayload } from '@/types/finance.types'

/** Supabase-Fehler in eine lesbare Error werfen (sonst zeigt die UI "[object Object]"). */
function fail(error: { message?: string; details?: string; hint?: string; code?: string } | null): never {
  const e = error ?? {}
  const msg = [e.message, e.details, e.hint].filter(Boolean).join(' — ') || 'Unbekannter Supabase-Fehler'
  throw new Error(e.code ? `${msg} (${e.code})` : msg)
}

function shared(): boolean {
  return useWorkspaceStore.getState().isActiveWorkspaceShared()
}

export const FinanceGateway = {
  async getInvoices(workspaceId: string, statusFilter?: InvoiceStatus | 'suggestions'): Promise<Invoice[]> {
    if (!shared()) return FinanceService.getInvoices(workspaceId, statusFilter)
    let q = supabase.from('invoices').select('*').eq('workspace_id', workspaceId)
    if (statusFilter === 'suggestions') q = q.eq('is_suggestion', true)
    else if (statusFilter) q = q.eq('status', statusFilter)
    const { data, error } = await q.order('created_at', { ascending: false })
    if (error) fail(error)
    return (data ?? []).map(invoiceRowToInvoice)
  },

  async getInvoice(id: string): Promise<InvoiceWithItems> {
    if (!shared()) return FinanceService.getInvoice(id)
    const [invRes, itemRes] = await Promise.all([
      supabase.from('invoices').select('*').eq('id', id).single(),
      supabase.from('invoice_items').select('*').eq('invoice_id', id).order('sort_order', { ascending: true }),
    ])
    if (invRes.error) fail(invRes.error)
    if (itemRes.error) fail(itemRes.error)
    return { invoice: invoiceRowToInvoice(invRes.data), items: (itemRes.data ?? []).map(invoiceItemRowToItem) }
  },

  async getInvoicesByAccount(accountId: string): Promise<Invoice[]> {
    if (!shared()) return FinanceService.getInvoicesByAccount(accountId)
    const { data, error } = await supabase.from('invoices').select('*')
      .eq('account_id', accountId).order('created_at', { ascending: false })
    if (error) fail(error)
    return (data ?? []).map(invoiceRowToInvoice)
  },

  async getOffers(workspaceId: string): Promise<Offer[]> {
    if (!shared()) return FinanceService.getOffers(workspaceId)
    const { data, error } = await supabase.from('offers').select('*')
      .eq('workspace_id', workspaceId).order('created_at', { ascending: false })
    if (error) fail(error)
    return (data ?? []).map(offerRowToOffer)
  },

  async getOffer(id: string): Promise<OfferWithItems> {
    if (!shared()) return FinanceService.getOffer(id)
    const [offRes, itemRes] = await Promise.all([
      supabase.from('offers').select('*').eq('id', id).single(),
      supabase.from('offer_items').select('*').eq('offer_id', id).order('sort_order', { ascending: true }),
    ])
    if (offRes.error) fail(offRes.error)
    if (itemRes.error) fail(itemRes.error)
    return { offer: offerRowToOffer(offRes.data), items: (itemRes.data ?? []).map(offerItemRowToItem) }
  },

  async getOffersByAccount(accountId: string): Promise<Offer[]> {
    if (!shared()) return FinanceService.getOffersByAccount(accountId)
    const { data, error } = await supabase.from('offers').select('*')
      .eq('account_id', accountId).order('created_at', { ascending: false })
    if (error) fail(error)
    return (data ?? []).map(offerRowToOffer)
  },

  async getPaymentsByWorkspace(workspaceId: string): Promise<Payment[]> {
    if (!shared()) return FinanceService.getPaymentsByWorkspace(workspaceId)
    const { data, error } = await supabase.from('payments').select('*')
      .eq('workspace_id', workspaceId).order('paid_at', { ascending: false })
    if (error) fail(error)
    return (data ?? []).map(paymentRowToPayment)
  },

  async getPayments(invoiceId: string): Promise<Payment[]> {
    if (!shared()) return FinanceService.getPayments(invoiceId)
    const { data, error } = await supabase.from('payments').select('*')
      .eq('invoice_id', invoiceId).order('paid_at', { ascending: false })
    if (error) fail(error)
    return (data ?? []).map(paymentRowToPayment)
  },

  async createInvoice(payload: UpsertInvoicePayload): Promise<InvoiceWithItems> {
    if (!shared()) return FinanceService.createInvoice(payload)
    const id = payload.id ?? crypto.randomUUID()
    const now = new Date().toISOString()
    const row = invoicePayloadToRow(payload, { id, now })
    const { error: invErr } = await supabase.from('invoices').insert(row)
    if (invErr) fail(invErr)
    if (payload.items.length > 0) {
      const itemRows = payload.items.map(it =>
        invoiceItemPayloadToRow(it, { id: it.id ?? crypto.randomUUID(), invoiceId: id }))
      const { error: itErr } = await supabase.from('invoice_items').insert(itemRows)
      if (itErr) fail(itErr)
    }
    return this.getInvoice(id)
  },

  async updateInvoice(id: string, payload: UpsertInvoicePayload): Promise<InvoiceWithItems> {
    if (!shared()) return FinanceService.updateInvoice(id, payload)
    const now = new Date().toISOString()
    const row = invoicePayloadToRow(payload, { id, now })
    delete (row as any).id
    const { error: invErr } = await supabase.from('invoices').update(row).eq('id', id)
    if (invErr) fail(invErr)
    // Hinweis: delete+reinsert der Positionen ist nicht transaktional. Schlägt der Reinsert fehl, bleiben die Positionen leer (für Entwürfe behebbar; atomarer RPC = Backlog).
    const { error: delErr } = await supabase.from('invoice_items').delete().eq('invoice_id', id)
    if (delErr) fail(delErr)
    if (payload.items.length > 0) {
      const itemRows = payload.items.map(it =>
        invoiceItemPayloadToRow(it, { id: it.id ?? crypto.randomUUID(), invoiceId: id }))
      const { error: itErr } = await supabase.from('invoice_items').insert(itemRows)
      if (itErr) fail(itErr)
    }
    return this.getInvoice(id)
  },

  async updateInvoiceStatus(id: string, status: InvoiceStatus): Promise<Invoice> {
    if (!shared()) return FinanceService.updateInvoiceStatus(id, status)
    const now = new Date().toISOString()
    const patch: Record<string, unknown> = { status, updated_at: now }
    // Beim ERSTEN Übergang auf 'open' eine Nummer vergeben (GoBD), falls noch keine.
    if (status === 'open') {
      const { data: cur, error: curErr } = await supabase.from('invoices')
        .select('workspace_id, number').eq('id', id).single()
      if (curErr) fail(curErr)
      if (cur && !cur.number) {
        const { data: number, error: rpcErr } = await supabase
          .rpc('allocate_invoice_number', { ws_id: cur.workspace_id })
        if (rpcErr) fail(rpcErr)
        patch.number = number
      }
    }
    const { data, error } = await supabase.from('invoices').update(patch).eq('id', id).select('*').single()
    if (error) fail(error)
    return invoiceRowToInvoice(data)
  },

  async approveInvoiceSuggestion(id: string, approvedBy: string, workspaceId: string): Promise<Invoice> {
    if (!shared()) return FinanceService.approveInvoiceSuggestion(id, approvedBy, workspaceId)
    const now = new Date().toISOString()
    const { data: number, error: rpcErr } = await supabase
      .rpc('allocate_invoice_number', { ws_id: workspaceId })
    if (rpcErr) fail(rpcErr)
    const { data, error } = await supabase.from('invoices')
      .update({ number, status: 'open', is_suggestion: false, approved_by: approvedBy, updated_at: now })
      .eq('id', id).eq('is_suggestion', true).select('*').single()
    if (error) fail(error)
    return invoiceRowToInvoice(data)
  },

  async deleteInvoice(id: string): Promise<void> {
    if (!shared()) return FinanceService.deleteInvoice(id)
    const { error } = await supabase.from('invoices').delete().eq('id', id)
    if (error) fail(error)
  },
}
