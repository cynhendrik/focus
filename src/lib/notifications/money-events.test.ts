import { describe, it, expect } from 'vitest'
import { newlyOverdueInvoices } from './money-events'
import type { Invoice } from '@/types/finance.types'

const inv = (id: string, status: string, dueDate: string): Invoice =>
  ({ id, status, dueDate, total: 100, accountId: 'a', number: id } as never)

describe('newlyOverdueInvoices', () => {
  const today = '2026-07-02'
  it('findet ueberfaellige offene Rechnungen, die noch nicht gemeldet wurden', () => {
    const result = newlyOverdueInvoices(
      [inv('a', 'open', '2026-07-01'), inv('b', 'open', '2026-07-05')], [], today)
    expect(result.map(i => i.id)).toEqual(['a'])
  })
  it('ignoriert bereits gemeldete, bezahlte, stornierte und Entwuerfe', () => {
    const result = newlyOverdueInvoices([
      inv('a', 'open', '2026-07-01'),
      inv('b', 'paid', '2026-07-01'),
      inv('c', 'cancelled', '2026-07-01'),
      inv('d', 'draft', '2026-07-01'),
    ], ['a'], today)
    expect(result).toEqual([])
  })
  it('faellig heute ist noch nicht ueberfaellig', () => {
    expect(newlyOverdueInvoices([inv('a', 'open', today)], [], today)).toEqual([])
  })
})
