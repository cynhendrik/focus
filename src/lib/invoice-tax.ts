import type { InvoiceItem } from '@/types/finance.types'

export interface TaxRateGroup {
  rate: number
  net: number
  tax: number
}

/**
 * Entgelt nach Steuersätzen aufgeschlüsselt (§14 UStG — Pflicht, sobald eine
 * Rechnung verschiedene Sätze mischt). Netto pro Position = quantity * unitPrice
 * (item.total ist brutto). Ergebnis nach Satz absteigend sortiert; Steuer auf
 * Cent gerundet.
 */
export function computeTaxRateGroups(
  items: Pick<InvoiceItem, 'quantity' | 'unitPrice' | 'taxRate'>[],
): TaxRateGroup[] {
  const netByRate = new Map<number, number>()
  for (const it of items) {
    netByRate.set(it.taxRate, (netByRate.get(it.taxRate) ?? 0) + it.quantity * it.unitPrice)
  }
  return [...netByRate.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([rate, net]) => ({ rate, net, tax: Math.round(net * rate) / 100 }))
}
