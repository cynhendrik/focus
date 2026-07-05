import { describe, it, expect } from 'vitest'
import { fmtEurPdf, fmtQty } from './pdf-format'

describe('fmtEurPdf', () => {
  it('formatiert deutsch mit Tausenderpunkt und 2 Nachkommastellen', () => {
    expect(fmtEurPdf(1200)).toBe('1.200,00 €')
    expect(fmtEurPdf(297.5)).toBe('297,50 €')
    expect(fmtEurPdf(0)).toBe('0,00 €')
  })
})

describe('fmtQty', () => {
  it('ganze Mengen ohne Nachkommastellen, Brüche mit Komma', () => {
    expect(fmtQty(4)).toBe('4')
    expect(fmtQty(2.5)).toBe('2,5')
    expect(fmtQty(1.25)).toBe('1,25')
    expect(fmtQty(1000)).toBe('1.000')
  })
})
