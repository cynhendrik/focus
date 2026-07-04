import { describe, it, expect } from 'vitest'
import { receivables } from './receivables'
import type { Invoice, Payment } from '@/types/finance.types'

const inv = (over: Partial<Invoice>): Invoice => ({
  id: 'i1', workspaceId: 'ws', createdBy: 'u', accountId: 'a',
  number: 'R-1', date: '2026-07-01', dueDate: '2026-07-15', status: 'open',
  taxMode: 'standard', subtotal: 100, taxAmount: 19, total: 119,
  bankInfo: '', isSuggestion: false, pendingSync: false,
  createdAt: '', updatedAt: '', ...over,
} as Invoice)
const pay = (invoiceId: string, amount: number): Payment =>
  ({ id: 'p', invoiceId, amount, paidAt: '2026-07-02', workspaceId: 'ws' } as Payment)

const TODAY = '2026-07-04'

describe('receivables', () => {
  it('teilt Restbeträge in offen und überfällig', () => {
    const r = receivables([
      inv({ id: '1', total: 100, dueDate: '2026-07-15' }),  // offen
      inv({ id: '2', total: 200, dueDate: '2026-07-01' }),  // überfällig
    ], [], TODAY)
    expect(r).toEqual({ open: 100, overdue: 200 })
  })
  it('zieht erfasste Teilzahlungen ab', () => {
    const r = receivables([inv({ id: '1', total: 100, dueDate: '2026-07-15' })], [pay('1', 40)], TODAY)
    expect(r.open).toBe(60)
  })
  it('bezahlt/storniert/Entwurf/Vorschlag zählen nicht', () => {
    const r = receivables([
      inv({ id: '1', status: 'paid' }),
      inv({ id: '2', status: 'cancelled' }),
      inv({ id: '3', status: 'draft' }),
      inv({ id: '4', isSuggestion: true, status: 'draft' }),
    ], [], TODAY)
    expect(r).toEqual({ open: 0, overdue: 0 })
  })
})
