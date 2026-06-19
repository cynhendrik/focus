import { describe, it, expect } from 'vitest'
import { invoiceRowToInvoice, invoiceItemRowToItem, offerRowToOffer, paymentRowToPayment, invoicePayloadToRow, invoiceItemPayloadToRow } from './finance.mapper'

describe('finance.mapper', () => {
  it('invoiceRowToInvoice mappt snake→camel', () => {
    const inv = invoiceRowToInvoice({
      id:'i1', workspace_id:'ws1', created_by:'u1', account_id:'a1', deal_id:null,
      number:null, date:'2026-01-01', due_date:'2026-01-15', status:'draft', tax_mode:'standard',
      subtotal:100, tax_amount:19, total:119, bank_info:'{}', notes:null, pdf_path:null,
      is_suggestion:0, suggested_by:null, approved_by:null, pending_sync:0,
      created_at:'2026-01-01T00:00:00Z', updated_at:'2026-01-02T00:00:00Z',
    })
    expect(inv.workspaceId).toBe('ws1')
    expect(inv.accountId).toBe('a1')
    expect(inv.taxAmount).toBe(19)
    expect(inv.isSuggestion).toBe(false)
    expect(inv.number).toBeUndefined()
  })
  it('invoiceItemRowToItem mappt inkl. optionaler Felder', () => {
    const it = invoiceItemRowToItem({ id:'it1', invoice_id:'i1', title:'Pos', description:null,
      quantity:2, unit_price:50, tax_rate:19, total:100, sort_order:0, item_date:null, unit:null })
    expect(it.invoiceId).toBe('i1'); expect(it.unitPrice).toBe(50); expect(it.taxRate).toBe(19)
  })
  it('paymentRowToPayment mappt', () => {
    const p = paymentRowToPayment({ id:'p1', workspace_id:'ws1', invoice_id:'i1', amount:50,
      paid_at:'2026-01-10', method:'bank', note:null, created_at:'2026-01-10T00:00:00Z' })
    expect(p.invoiceId).toBe('i1'); expect(p.amount).toBe(50)
  })
})

describe('finance payload→row', () => {
  it('invoicePayloadToRow setzt defaults + snake_case', () => {
    const r = invoicePayloadToRow(
      { workspaceId:'ws1', createdBy:'u1', accountId:'a1', date:'2026-01-01', dueDate:'2026-01-15',
        subtotal:100, taxAmount:19, total:119, items:[] },
      { id:'i1', now:'2026-01-01T00:00:00Z' })
    expect(r.id).toBe('i1'); expect(r.workspace_id).toBe('ws1'); expect(r.account_id).toBe('a1')
    expect(r.status).toBe('draft'); expect(r.tax_mode).toBe('standard')
    expect(r.bank_info).toBe('{}'); expect(r.is_suggestion).toBe(0)
    expect(r.number).toBeNull(); expect(r.updated_at).toBe('2026-01-01T00:00:00Z')
    expect(r).not.toHaveProperty('created_at')
  })
  it('invoicePayloadToRow setzt is_suggestion=1 bei true', () => {
    const r = invoicePayloadToRow(
      { workspaceId:'ws1', createdBy:'u1', accountId:'a1', date:'2026-01-01', dueDate:'2026-01-15',
        subtotal:100, taxAmount:19, total:119, isSuggestion:true, items:[] },
      { id:'i1', now:'2026-01-01T00:00:00Z' })
    expect(r.is_suggestion).toBe(1)
  })
  it('invoiceItemPayloadToRow mappt + invoice_id', () => {
    const r = invoiceItemPayloadToRow(
      { title:'Pos', quantity:2, unitPrice:50, taxRate:19, total:100, sortOrder:0 },
      { id:'it1', invoiceId:'i1' })
    expect(r.invoice_id).toBe('i1'); expect(r.unit_price).toBe(50); expect(r.tax_rate).toBe(19)
    expect(r.description).toBeNull()
  })
})
