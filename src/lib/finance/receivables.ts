import type { Invoice, Payment } from '@/types/finance.types'
import { paidAmount, remaining } from '@/lib/invoice-status'
import { invoiceCategory } from './invoice-filters'

export interface Receivables { open: number; overdue: number }

/** Offene Forderungen als Restbeträge (Teilzahlungen abgezogen).
 *  Gesnoozte Rechnungen zählen mit — Snooze vertagt die Mahnung,
 *  nicht die Forderung. Geteilt von Dashboard-Kachel und Finanzen-Cockpit. */
export function receivables(invoices: Invoice[], payments: Payment[], today?: string): Receivables {
  const r: Receivables = { open: 0, overdue: 0 }
  for (const inv of invoices) {
    if (inv.isSuggestion) continue
    const cat = invoiceCategory(inv, today)
    if (cat !== 'open' && cat !== 'overdue') continue
    r[cat] += remaining(inv, paidAmount(payments, inv.id))
  }
  r.open = Math.round(r.open * 100) / 100
  r.overdue = Math.round(r.overdue * 100) / 100
  return r
}
