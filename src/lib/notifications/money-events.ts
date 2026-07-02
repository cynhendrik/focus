import type { Invoice } from '@/types/finance.types'

/**
 * Rechnungen, die überfällig sind und noch nie gemeldet wurden.
 * Je Rechnung genau EINE Meldung (Spec §7: „je Ereignis genau einmal").
 */
export function newlyOverdueInvoices(
  invoices: Invoice[], alreadyNotified: string[], todayIso: string,
): Invoice[] {
  const seen = new Set(alreadyNotified)
  return invoices.filter(i =>
    !seen.has(i.id)
    && i.status !== 'paid' && i.status !== 'cancelled' && i.status !== 'draft'
    && !!i.dueDate && i.dueDate.slice(0, 10) < todayIso,
  )
}
