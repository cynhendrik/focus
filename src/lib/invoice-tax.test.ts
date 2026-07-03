import { describe, it, expect } from 'vitest'
import { computeTaxRateGroups } from './invoice-tax'
import { applyKleinunternehmerLogic, calcTotals } from './invoice-engine'
import type { InvoiceItem } from '@/types/finance.types'
import type { InvoiceItemDraft } from './invoice-engine'

const item = (quantity: number, unitPrice: number, taxRate: number) =>
  ({ quantity, unitPrice, taxRate } as InvoiceItem)

const draft = (taxRate: number | undefined, unitPrice = 100): InvoiceItemDraft => ({
  title: 'Test', quantity: 1, unitPrice,
  taxRate: taxRate as number, total: 0, sortOrder: 0,
})

describe('computeTaxRateGroups', () => {
  it('single rate → one group with net + tax', () => {
    const g = computeTaxRateGroups([item(2, 100, 19), item(1, 50, 19)])
    expect(g).toHaveLength(1)
    expect(g[0]).toEqual({ rate: 19, net: 250, tax: 47.5 })
  })

  it('mixed rates → grouped per rate, sorted desc', () => {
    const g = computeTaxRateGroups([item(1, 800, 19), item(1, 200, 7)])
    expect(g.map(x => x.rate)).toEqual([19, 7])
    expect(g[0]).toEqual({ rate: 19, net: 800, tax: 152 })
    expect(g[1]).toEqual({ rate: 7, net: 200, tax: 14 })
  })

  it('kleinunternehmer (rate 0) → tax is 0', () => {
    expect(computeTaxRateGroups([item(1, 500, 0)])).toEqual([{ rate: 0, net: 500, tax: 0 }])
  })

  it('rounds tax to cents', () => {
    // 100.5 * 0.19 = 19.095 → 19.10
    expect(computeTaxRateGroups([item(1, 100.5, 19)])[0].tax).toBe(19.1)
  })

  it('empty items → empty', () => {
    expect(computeTaxRateGroups([])).toEqual([])
  })
})

// ── applyKleinunternehmerLogic: Falsy-Bug (0 || 19) regression ───────────────

describe('applyKleinunternehmerLogic — 0%-Steuersatz pro Rechnung', () => {
  it('explizit gewaehlte 0% bleiben 0 wenn kein Kleinunternehmer (EU-Ausland / Reverse-Charge)', () => {
    const result = applyKleinunternehmerLogic([draft(0)], false)
    expect(result[0].taxRate).toBe(0)
  })

  it('taxRate undefined/null → faellt auf 19 zurueck (Standardverhalten unveraendert)', () => {
    const result = applyKleinunternehmerLogic([draft(undefined)], false)
    expect(result[0].taxRate).toBe(19)
  })

  it('taxRate 7 bleibt 7 (ermaessigter Satz)', () => {
    const result = applyKleinunternehmerLogic([draft(7)], false)
    expect(result[0].taxRate).toBe(7)
  })
})

// ── calcTotals: end-to-end Summen fuer 0%-Position ───────────────────────────

describe('calcTotals — 0%-Steuersatz ergibt Netto = Brutto', () => {
  it('1x 100 EUR bei 0% MwSt → total = 100, taxAmount = 0', () => {
    const items: InvoiceItemDraft[] = [
      { title: 'EU-Dienstleistung', quantity: 1, unitPrice: 100, taxRate: 0, total: 100, sortOrder: 0 },
    ]
    const totals = calcTotals(items, false)
    expect(totals.subtotal).toBe(100)
    expect(totals.taxAmount).toBe(0)
    expect(totals.total).toBe(100)
  })
})
