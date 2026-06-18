import { describe, it, expect } from 'vitest'
import { computeTaxRateGroups } from './invoice-tax'
import type { InvoiceItem } from '@/types/finance.types'

const item = (quantity: number, unitPrice: number, taxRate: number) =>
  ({ quantity, unitPrice, taxRate } as InvoiceItem)

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
