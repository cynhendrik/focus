import { describe, it, expect, beforeEach } from 'vitest'
import { snoozeInvoice, snoozedInvoiceIds } from './snooze'

const NOW = Date.parse('2026-07-01T10:00:00.000Z')

describe('invoice snooze', () => {
  beforeEach(() => { localStorage.clear() })

  it('snoozes an invoice for N days', () => {
    snoozeInvoice('inv-1', 7, NOW)
    expect(snoozedInvoiceIds(NOW).has('inv-1')).toBe(true)
  })

  it('drops the snooze once it has expired', () => {
    snoozeInvoice('inv-1', 7, NOW)
    const later = NOW + 8 * 86_400_000
    expect(snoozedInvoiceIds(later).has('inv-1')).toBe(false)
  })

  it('keeps a still-live snooze while the day rolls', () => {
    snoozeInvoice('inv-1', 7, NOW)
    const nextDay = NOW + 1 * 86_400_000
    expect(snoozedInvoiceIds(nextDay).has('inv-1')).toBe(true)
  })

  it('prunes expired entries from storage', () => {
    snoozeInvoice('old', 1, NOW)
    snoozeInvoice('fresh', 10, NOW)
    const later = NOW + 5 * 86_400_000
    const ids = snoozedInvoiceIds(later)
    expect(ids.has('old')).toBe(false)
    expect(ids.has('fresh')).toBe(true)
    expect(JSON.parse(localStorage.getItem('heute:invoice-snooze')!)).not.toHaveProperty('old')
  })
})
