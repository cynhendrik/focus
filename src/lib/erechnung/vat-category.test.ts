import { describe, it, expect } from 'vitest'
import { vatCategory } from './vat-category'

describe('vatCategory', () => {
  it('standard → S mit Item-Satz', () => {
    expect(vatCategory('standard', 19)).toEqual({ code: 'S', rate: 19 })
  })
  it('reduced → S mit Item-Satz', () => {
    expect(vatCategory('reduced', 7)).toEqual({ code: 'S', rate: 7 })
  })
  it('reverse_charge → AE, Satz 0, §13b-Grund', () => {
    const r = vatCategory('reverse_charge', 19)
    expect(r.code).toBe('AE'); expect(r.rate).toBe(0)
    expect(r.exemptionReason).toMatch(/13b/)
  })
  it('kleinunternehmer → E, Satz 0, §19-Grund', () => {
    const r = vatCategory('kleinunternehmer', 19)
    expect(r.code).toBe('E'); expect(r.rate).toBe(0)
    expect(r.exemptionReason).toMatch(/19/)
  })
})
