import type { CompanyProfile } from '@/types/company.types'
import type { TaxMode, UpsertInvoiceItemPayload } from '@/types/finance.types'

// ── Types ────────────────────────────────────────────────────────────────────

export interface InvoiceItemDraft {
  title: string
  description?: string
  quantity: number
  unitPrice: number
  taxRate: number  // 0 if kleinunternehmer
  total: number    // brutto per item
  sortOrder: number
  itemDate?: string
  unit?: string
}

export interface InvoiceTotals {
  subtotal: number    // netto
  taxAmount: number   // 0 if kleinunternehmer
  total: number       // brutto (= subtotal if kleinunternehmer)
  taxBreakdown: Array<{ rate: number; net: number; tax: number }>
}

// ── Date helpers ──────────────────────────────────────────────────────────────

export function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

export function lastDayOfMonth(isoDate: string): string {
  const d = new Date(isoDate)
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0]
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

export function formatDateDE(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ── Core engine functions ─────────────────────────────────────────────────────

export function generateLeistungsdatum(
  rechnungsdatum: string,
  leistungszeitpunkt: CompanyProfile['leistungszeitpunkt'],
): string {
  if (leistungszeitpunkt === 'monatsende') return lastDayOfMonth(rechnungsdatum)
  return rechnungsdatum  // 'rechnungsdatum' or undefined → same as invoice date
}

export function generateZahlungsziel(
  rechnungsdatum: string,
  tage: number = 14,
): string {
  return addDays(rechnungsdatum, tage)
}

export function getTaxMode(profile: CompanyProfile): TaxMode {
  return profile.kleinunternehmer ? 'kleinunternehmer' : 'standard'
}

export function calcItemTotal(item: Omit<InvoiceItemDraft, 'total'>, kleinunternehmer: boolean): number {
  const net = item.quantity * item.unitPrice
  if (kleinunternehmer || item.taxRate === 0) return net
  return net * (1 + item.taxRate / 100)
}

export function calcTotals(items: InvoiceItemDraft[], kleinunternehmer: boolean): InvoiceTotals {
  let subtotal = 0
  let taxAmount = 0
  const taxMap = new Map<number, { net: number; tax: number }>()

  for (const item of items) {
    const net = item.quantity * item.unitPrice
    subtotal += net
    if (!kleinunternehmer && item.taxRate > 0) {
      const tax = net * (item.taxRate / 100)
      taxAmount += tax
      const existing = taxMap.get(item.taxRate) ?? { net: 0, tax: 0 }
      taxMap.set(item.taxRate, { net: existing.net + net, tax: existing.tax + tax })
    }
  }

  const taxBreakdown = Array.from(taxMap.entries())
    .map(([rate, { net, tax }]) => ({ rate, net, tax }))
    .sort((a, b) => a.rate - b.rate)

  return { subtotal, taxAmount, total: subtotal + taxAmount, taxBreakdown }
}

export function applyKleinunternehmerLogic(
  items: InvoiceItemDraft[],
  kleinunternehmer: boolean,
): InvoiceItemDraft[] {
  return items.map(item => ({
    ...item,
    taxRate: kleinunternehmer ? 0 : item.taxRate || 19,
    total: calcItemTotal(item, kleinunternehmer),
  }))
}

export function defaultItem(kleinunternehmer: boolean, sortOrder: number, invoiceDate?: string): InvoiceItemDraft {
  return {
    title: '', description: undefined,
    quantity: 1, unitPrice: 0,
    taxRate: kleinunternehmer ? 0 : 19,
    total: 0, sortOrder,
    itemDate: invoiceDate,
    unit: undefined,
  }
}

export function toUpsertItems(items: InvoiceItemDraft[]): UpsertInvoiceItemPayload[] {
  return items.map(item => ({
    title: item.title,
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    taxRate: item.taxRate,
    total: item.total,
    sortOrder: item.sortOrder,
    itemDate: item.itemDate,
    unit: item.unit,
  }))
}
