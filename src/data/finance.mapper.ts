import type { Invoice, InvoiceItem, Offer, OfferItem, Payment, UpsertInvoicePayload, UpsertInvoiceItemPayload } from '@/types/finance.types'

/** Supabase-`invoices`-Zeile → Invoice-Domänentyp. */
export function invoiceRowToInvoice(r: any): Invoice {
  return {
    id: r.id, workspaceId: r.workspace_id, createdBy: r.created_by, accountId: r.account_id,
    dealId: r.deal_id ?? undefined, number: r.number ?? undefined, date: r.date, dueDate: r.due_date,
    status: r.status, taxMode: r.tax_mode, subtotal: r.subtotal, taxAmount: r.tax_amount, total: r.total,
    bankInfo: r.bank_info ?? '{}', notes: r.notes ?? undefined, pdfPath: r.pdf_path ?? undefined,
    isSuggestion: !!r.is_suggestion, suggestedBy: r.suggested_by ?? undefined,
    approvedBy: r.approved_by ?? undefined, pendingSync: !!r.pending_sync,
    createdAt: r.created_at, updatedAt: r.updated_at,
  }
}

/** Supabase-`invoice_items`-Zeile → InvoiceItem-Domänentyp. */
export function invoiceItemRowToItem(r: any): InvoiceItem {
  return {
    id: r.id, invoiceId: r.invoice_id, title: r.title, description: r.description ?? undefined,
    quantity: r.quantity, unitPrice: r.unit_price, taxRate: r.tax_rate, total: r.total,
    sortOrder: r.sort_order, itemDate: r.item_date ?? undefined, unit: r.unit ?? undefined,
  }
}

/** Supabase-`offers`-Zeile → Offer-Domänentyp. */
export function offerRowToOffer(r: any): Offer {
  return {
    id: r.id, workspaceId: r.workspace_id, createdBy: r.created_by, accountId: r.account_id,
    number: r.number ?? undefined, title: r.title, status: r.status, validUntil: r.valid_until,
    taxMode: r.tax_mode, subtotal: r.subtotal, taxAmount: r.tax_amount, total: r.total,
    notes: r.notes ?? undefined, pdfPath: r.pdf_path ?? undefined,
    convertedInvoiceId: r.converted_invoice_id ?? undefined, pendingSync: !!r.pending_sync,
    createdAt: r.created_at, updatedAt: r.updated_at,
  }
}

/** Supabase-`offer_items`-Zeile → OfferItem-Domänentyp. */
export function offerItemRowToItem(r: any): OfferItem {
  return {
    id: r.id, offerId: r.offer_id, title: r.title, description: r.description ?? undefined,
    quantity: r.quantity, unitPrice: r.unit_price, taxRate: r.tax_rate, total: r.total,
    sortOrder: r.sort_order, itemDate: r.item_date ?? undefined, unit: r.unit ?? undefined,
  }
}

/** Supabase-`payments`-Zeile → Payment-Domänentyp. */
export function paymentRowToPayment(r: any): Payment {
  return {
    id: r.id, workspaceId: r.workspace_id, invoiceId: r.invoice_id, amount: r.amount,
    paidAt: r.paid_at, method: r.method ?? undefined, note: r.note ?? undefined, createdAt: r.created_at,
  }
}

/** UpsertInvoicePayload → invoices-Row (ohne created_at = DB-Default; ohne items). */
export function invoicePayloadToRow(
  p: UpsertInvoicePayload, ctx: { id: string; now: string },
): Record<string, unknown> {
  return {
    id: ctx.id, workspace_id: p.workspaceId, created_by: p.createdBy, account_id: p.accountId,
    deal_id: p.dealId ?? null, number: p.number ?? null, date: p.date, due_date: p.dueDate,
    status: p.status ?? 'draft', tax_mode: p.taxMode ?? 'standard',
    subtotal: p.subtotal, tax_amount: p.taxAmount, total: p.total,
    bank_info: p.bankInfo ?? '{}', notes: p.notes ?? null,
    is_suggestion: p.isSuggestion ?? false, suggested_by: p.suggestedBy ?? null,
    updated_at: ctx.now,
  }
}

/** UpsertInvoiceItemPayload → invoice_items-Row. */
export function invoiceItemPayloadToRow(
  it: UpsertInvoiceItemPayload, ctx: { id: string; invoiceId: string },
): Record<string, unknown> {
  return {
    id: ctx.id, invoice_id: ctx.invoiceId, title: it.title, description: it.description ?? null,
    quantity: it.quantity, unit_price: it.unitPrice, tax_rate: it.taxRate, total: it.total,
    sort_order: it.sortOrder, item_date: it.itemDate ?? null, unit: it.unit ?? null,
  }
}
