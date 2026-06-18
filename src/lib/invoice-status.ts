import type { Invoice } from '@/types/finance.types'

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
