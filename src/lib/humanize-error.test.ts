import { describe, it, expect } from 'vitest'
import { humanizeError } from './humanize-error'

describe('humanizeError', () => {
  it('nutzt den Fallback bei leerem/unbrauchbarem Fehler', () => {
    expect(humanizeError(null, 'Speichern fehlgeschlagen.')).toBe('Speichern fehlgeschlagen.')
    expect(humanizeError({}, 'Speichern fehlgeschlagen.')).toBe('Speichern fehlgeschlagen.')
  })

  it('haengt die Fehlermeldung lesbar an', () => {
    expect(humanizeError(new Error('UNIQUE constraint failed: invoices.number'), 'Rechnung konnte nicht gespeichert werden.'))
      .toBe('Rechnung konnte nicht gespeichert werden. (UNIQUE constraint failed: invoices.number)')
  })

  it('entfernt technische Praefixe und kuerzt lange Meldungen', () => {
    const long = 'invoke error: ' + 'x'.repeat(300)
    const out = humanizeError(long, 'Fehler.')
    expect(out.startsWith('Fehler. (xxx')).toBe(true)
    expect(out.length).toBeLessThan(220)
  })
})
