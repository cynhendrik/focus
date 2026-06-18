import type { Invoice, Payment } from '@/types/finance.types'

/** Local YYYY-MM-DD. dueDate is a bare date string, so we compare date strings
 *  (no `new Date()` UTC-midnight drift that would flip CET invoices a day early). */
export function todayLocalISO(): string {
  return new Date().toLocaleDateString('sv') // 'sv' → YYYY-MM-DD
}

/**
 * A bill is overdue when it's unpaid (open) and past its due date.
 * Derived on read — the DB never persists status='overdue' (keeps the audit
 * trail clean / GoBD-safe). Single source of truth for all dunning UIs + KPIs.
 */
export function isOverdue(invoice: Invoice, today: string = todayLocalISO()): boolean {
  if (invoice.status === 'paid' || invoice.status === 'cancelled' || invoice.status === 'draft') {
    return false
  }
  if (invoice.status === 'overdue') return true // defensive — never set today
  return !!invoice.dueDate && invoice.dueDate < today
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Summe der erfassten Zahlungen für eine Rechnung. */
export function paidAmount(payments: Payment[], invoiceId: string): number {
  return round2(payments.reduce((s, p) => p.invoiceId === invoiceId ? s + p.amount : s, 0))
}

/** Noch offener Restbetrag (nie negativ). */
export function remaining(invoice: Invoice, paid: number): number {
  return Math.max(0, round2(invoice.total - paid))
}

/** Anzeige-Status inkl. „teilbezahlt", abgeleitet aus Zahlungen + Fälligkeit.
 *  'partly' ist kein gespeicherter Status — nur fürs UI. */
export type DisplayInvoiceStatus = Invoice['status'] | 'partly'
export function displayInvoiceStatus(invoice: Invoice, paid: number): DisplayInvoiceStatus {
  if (invoice.status === 'cancelled' || invoice.status === 'draft') return invoice.status
  if (invoice.total > 0 && paid + 0.005 >= invoice.total) return 'paid'
  if (paid > 0) return 'partly'
  return isOverdue(invoice) ? 'overdue' : invoice.status
}
