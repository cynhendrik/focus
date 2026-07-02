import { describe, it, expect } from 'vitest'
import { mahnungSubject, mahnungBody, begleitmailBody } from './mahnung'

const BASE = { customerName: 'Meyer GmbH', invoiceNumber: 'R-100', base: 1000, fee: 0, total: 1000, daysOverdue: 14, level: 0, newDeadline: '2026-07-16' }

describe('mahnungSubject', () => {
  it('nennt Stufe, Nummer und Betrag', () => {
    expect(mahnungSubject(BASE)).toBe('Zahlungserinnerung · Rechnung R-100 · zu zahlen 1.000,00 €')
    expect(mahnungSubject({ ...BASE, level: 2 })).toContain('2. Mahnung')
  })
})

describe('mahnungBody', () => {
  it('Stufe 0 ist freundlich und nennt Frist', () => {
    const b = mahnungBody(BASE)
    expect(b).toContain('Meyer GmbH')
    expect(b).toContain('R-100')
    expect(b).toContain('16.07.2026')
    expect(b).not.toContain('Mahngebühr')
  })
  it('mit Gebuehr wird die Aufschluesselung genannt', () => {
    const b = mahnungBody({ ...BASE, fee: 5, total: 1005, level: 1 })
    expect(b).toContain('1.000,00 €')
    expect(b).toContain('5,00 €')
    expect(b).toContain('1.005,00 €')
  })
  it('Stufe 2 kuendigt weitere Schritte an', () => {
    expect(mahnungBody({ ...BASE, level: 2 })).toContain('weitere Schritte')
  })
})

describe('begleitmailBody', () => {
  it('nennt Rechnung, Betrag und Zahlungsziel', () => {
    const b = begleitmailBody({ invoiceNumber: 'R-100', total: 1190, dueDate: '2026-07-16' })
    expect(b).toContain('R-100')
    expect(b).toContain('1.190,00 €')
    expect(b).toContain('16.07.2026')
  })
})

describe('Tag/Tagen Singular/Plural', () => {
  it('Singular: 1 Tag statt 1 Tagen', () => {
    expect(mahnungBody({ ...BASE, daysOverdue: 1 })).toContain('seit 1 Tag')
    expect(mahnungBody({ ...BASE, daysOverdue: 1 })).not.toContain('1 Tagen')
  })
})
