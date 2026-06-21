import { describe, it, expect } from 'vitest'
import { unitCode } from './unit-codes'

describe('unitCode (UN/ECE Rec 20)', () => {
  it('Stunden-Varianten → HUR', () => {
    for (const u of ['Std', 'std', 'Stunde', 'Stunden', 'h', 'hr']) expect(unitCode(u)).toBe('HUR')
  })
  it('Tag → DAY', () => { expect(unitCode('Tag')).toBe('DAY'); expect(unitCode('tage')).toBe('DAY') })
  it('Stück/Pauschale → C62', () => {
    for (const u of ['Stk', 'Stück', 'stueck', 'x', 'Pauschale']) expect(unitCode(u)).toBe('C62')
  })
  it('km → KMT, Monat → MON', () => { expect(unitCode('km')).toBe('KMT'); expect(unitCode('Monat')).toBe('MON') })
  it('leer/unbekannt → Fallback C62', () => {
    expect(unitCode('')).toBe('C62'); expect(unitCode(undefined)).toBe('C62'); expect(unitCode('blubb')).toBe('C62')
  })
})
