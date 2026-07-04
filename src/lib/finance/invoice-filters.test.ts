import { describe, it, expect } from 'vitest'
import { invoiceCategory, invoiceFilterCounts } from './invoice-filters'
import type { Invoice } from '@/types/finance.types'

const inv = (over: Partial<Invoice>): Invoice => ({
  id: 'i1', workspaceId: 'ws', createdBy: 'u', accountId: 'a',
  number: 'R-1', date: '2026-07-01', dueDate: '2026-07-15', status: 'open',
  taxMode: 'standard', subtotal: 100, taxAmount: 19, total: 119,
  bankInfo: '', isSuggestion: false, pendingSync: false,
  createdAt: '', updatedAt: '', ...over,
} as Invoice)

const TODAY = '2026-07-04'

describe('invoiceCategory', () => {
  it('open + Fälligkeit in der Zukunft → open', () => {
    expect(invoiceCategory(inv({ dueDate: '2026-07-15' }), TODAY)).toBe('open')
  })
  it('heute fällig ist NICHT überfällig', () => {
    expect(invoiceCategory(inv({ dueDate: TODAY }), TODAY)).toBe('open')
  })
  it('open + Fälligkeit überschritten → overdue', () => {
    expect(invoiceCategory(inv({ dueDate: '2026-07-01' }), TODAY)).toBe('overdue')
  })
  it('paid/cancelled/draft kommen direkt aus dem Status — auch wenn das Datum überschritten ist', () => {
    expect(invoiceCategory(inv({ status: 'paid', dueDate: '2026-01-01' }), TODAY)).toBe('paid')
    expect(invoiceCategory(inv({ status: 'cancelled', dueDate: '2026-01-01' }), TODAY)).toBe('cancelled')
    expect(invoiceCategory(inv({ status: 'draft', dueDate: '2026-01-01' }), TODAY)).toBe('draft')
  })
})

describe('invoiceFilterCounts', () => {
  it('zählt je Kategorie; all = ohne Entwürfe und Stornos', () => {
    const c = invoiceFilterCounts([
      inv({ id: '1', dueDate: '2026-07-15' }),                       // open
      inv({ id: '2', dueDate: '2026-07-01' }),                       // overdue
      inv({ id: '3', status: 'paid' }),
      inv({ id: '4', status: 'paid' }),
      inv({ id: '5', status: 'cancelled' }),
      inv({ id: '6', status: 'draft' }),
    ], TODAY)
    expect(c).toEqual({ all: 4, open: 1, overdue: 1, paid: 2, cancelled: 1 })
  })
})
