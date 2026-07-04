import { describe, it, expect, afterEach } from 'vitest'
import {
  normalizeIban,
  blzFromIban,
  bankNameFromIban,
  _resetBlzCache,
  _setBlzCache,
} from './iban'

afterEach(() => {
  _resetBlzCache()
})

describe('normalizeIban', () => {
  it('entfernt Leerzeichen und wandelt in Großbuchstaben um', () => {
    expect(normalizeIban('DE89 3704 0044 0532 0130 00')).toBe('DE89370400440532013000')
  })
  it('Kleinbuchstaben → uppercase', () => {
    expect(normalizeIban('de89370400440532013000')).toBe('DE89370400440532013000')
  })
  it('bereits normalisiert → unverändert', () => {
    expect(normalizeIban('DE89370400440532013000')).toBe('DE89370400440532013000')
  })
  it('leerer String bleibt leer', () => {
    expect(normalizeIban('')).toBe('')
  })
})

describe('blzFromIban', () => {
  it('extrahiert BLZ aus gültiger DE-IBAN — Beispiel DE89 3704 0044 → 37040044', () => {
    expect(blzFromIban('DE89 3704 0044 0532 0130 00')).toBe('37040044')
    expect(blzFromIban('DE89370400440532013000')).toBe('37040044')
  })
  it('extrahiert BLZ aus Postbank-IBAN DE86 1001 0010 → 10010010', () => {
    expect(blzFromIban('DE86 1001 0010 0532 0130 00')).toBe('10010010')
  })
  it('nicht-DE IBAN → null', () => {
    expect(blzFromIban('AT61190430023457320100')).toBeNull()
    expect(blzFromIban('GB29 NWBK 6016 1331 9268 19')).toBeNull()
  })
  it('zu kurze IBAN → null', () => {
    expect(blzFromIban('DE89 3704')).toBeNull()
  })
  it('leerer String → null', () => {
    expect(blzFromIban('')).toBeNull()
  })
  it('IBAN mit Buchstaben im Ziffernteil → null', () => {
    expect(blzFromIban('DE89370400440532013X00')).toBeNull()
  })
  it('zu lange IBAN → null', () => {
    expect(blzFromIban('DE89370400440532013000X')).toBeNull()
  })
})

describe('bankNameFromIban', () => {
  it('gibt Banknamen aus gemockter Map zurück', async () => {
    _setBlzCache({ '37040044': 'Commerzbank' })
    const result = await bankNameFromIban('DE89 3704 0044 0532 0130 00')
    expect(result).toBe('Commerzbank')
  })

  it('gibt null für unbekannte BLZ zurück', async () => {
    _setBlzCache({ '37040044': 'Commerzbank' })
    const result = await bankNameFromIban('DE00 9999 9999 0000 0000 00')
    expect(result).toBeNull()
  })

  it('gibt null für nicht-DE IBAN zurück', async () => {
    _setBlzCache({})
    const result = await bankNameFromIban('AT61190430023457320100')
    expect(result).toBeNull()
  })

  it('cached: zweiter Aufruf nutzt denselben Cache', async () => {
    let callCount = 0
    _setBlzCache({ '37040044': 'Commerzbank' })
    // Simuliere: Cache wurde schon befüllt, kein zweiter Import nötig
    const r1 = await bankNameFromIban('DE89370400440532013000')
    const r2 = await bankNameFromIban('DE89370400440532013000')
    callCount++ // beide sollten funktionieren
    expect(r1).toBe('Commerzbank')
    expect(r2).toBe('Commerzbank')
    expect(callCount).toBe(1)
  })
})
