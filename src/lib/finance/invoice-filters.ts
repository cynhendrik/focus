import type { Invoice } from '@/types/finance.types'
import { isOverdue } from '@/lib/invoice-status'

/** Anzeige-Kategorie einer Rechnung. 'overdue' ist IMMER abgeleitet
 *  (aus dueDate) — der DB-Status wird nie auf overdue gesetzt. Eine
 *  Wahrheitsquelle für Filter-Chips, Cockpit-Kacheln und Forderungen. */
export type InvoiceCategory = 'draft' | 'open' | 'overdue' | 'paid' | 'cancelled'

export function invoiceCategory(invoice: Invoice, today?: string): InvoiceCategory {
  if (invoice.status === 'paid' || invoice.status === 'cancelled' || invoice.status === 'draft') {
    return invoice.status
  }
  return isOverdue(invoice, today) ? 'overdue' : 'open'
}

export interface InvoiceFilterCounts {
  all: number; open: number; overdue: number; paid: number; cancelled: number
}

/** Zähler für die Filter-Chips. 'all' = alles außer Entwürfen und Stornos
 *  (entspricht dem heutigen „Alle"-Verhalten der Liste). */
export function invoiceFilterCounts(invoices: Invoice[], today?: string): InvoiceFilterCounts {
  const c: InvoiceFilterCounts = { all: 0, open: 0, overdue: 0, paid: 0, cancelled: 0 }
  for (const inv of invoices) {
    const cat = invoiceCategory(inv, today)
    if (cat === 'draft') continue
    c[cat] += 1
    if (cat !== 'cancelled') c.all += 1
  }
  return c
}
