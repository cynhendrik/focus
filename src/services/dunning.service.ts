import type { Todo } from '@/types/todo.types'
import type { Invoice, Payment } from '@/types/finance.types'
import { paidAmount, remaining } from '@/lib/invoice-status'

/** Default-Mahngebühr je Stufe in Euro: [Zahlungserinnerung, 1. Mahnung, 2. Mahnung]. */
export const DEFAULT_DUNNING_FEES = [0, 5, 10]

/** Gebühr der Stufe (Euro). Stufen jenseits der Config werden auf die letzte geklemmt. */
export function dunningFee(level: number, fees: number[] = DEFAULT_DUNNING_FEES): number {
  if (fees.length === 0) return 0
  return fees[level] ?? fees[fees.length - 1] ?? 0
}

/** 'fee:<cent>' → Euro; alles andere → 0. */
export function parseFeeTag(tag: string): number {
  if (!tag.startsWith('fee:')) return 0
  const cent = Number(tag.slice(4))
  return Number.isFinite(cent) ? cent / 100 : 0
}

/** Snapshot-Tags, die beim Versand am abgeschlossenen To-do hängen. */
export function reminderFeeTags(level: number, fees: number[] = DEFAULT_DUNNING_FEES): string[] {
  return [`fee:${Math.round(dunningFee(level, fees) * 100)}`]
}

/** Summe der bereits berechneten Gebühren (Euro) aus abgeschlossenen Reminder-To-dos. */
export function accruedFees(todos: Todo[], invoiceId: string): number {
  return todos
    .filter(t => t.sourceRef === invoiceId && t.actionType === 'send_reminder' && t.status === 'done')
    .flatMap(t => t.tags)
    .reduce((sum, tag) => sum + parseFeeTag(tag), 0)
}

/** Offener Gesamtbetrag inkl. der Gebühr der gerade fälligen Stufe (Euro). */
export function outstandingWithPendingFee(
  invoice: Invoice, payments: Payment[], todos: Todo[], level: number,
  fees: number[] = DEFAULT_DUNNING_FEES,
): number {
  const paid = paidAmount(payments, invoice.id)
  const base = remaining(invoice, paid)
  return Math.round((base + accruedFees(todos, invoice.id) + dunningFee(level, fees)) * 100) / 100
}
