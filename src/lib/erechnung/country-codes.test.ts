import { describe, it, expect } from 'vitest'
import { countryCode } from './country-codes'

describe('countryCode (ISO 3166-1 alpha-2)', () => {
  it('Deutschland-Varianten → DE', () => {
    for (const c of ['Deutschland', 'germany', 'DE', 'de']) expect(countryCode(c)).toBe('DE')
  })
  it('Österreich → AT, Schweiz → CH', () => {
    expect(countryCode('Österreich')).toBe('AT'); expect(countryCode('Schweiz')).toBe('CH')
  })
  it('bereits 2-stelliger Code → uppercase durchgereicht', () => {
    expect(countryCode('fr')).toBe('FR')
  })
  it('leer/unbekannt → Fallback DE', () => {
    expect(countryCode('')).toBe('DE'); expect(countryCode(undefined)).toBe('DE'); expect(countryCode('Atlantis')).toBe('DE')
  })
})
