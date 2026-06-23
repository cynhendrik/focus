import { describe, it, expect } from 'vitest'
import {
  DEFAULT_DUNNING_FEES, dunningFee, parseFeeTag, reminderFeeTags,
  dueReminders, escalatedInvoices,
} from './dunning.service'
import type { Invoice } from '@/types/finance.types'

const inv = (over: Partial<Invoice> = {}): Invoice => ({
  id: 'inv1', workspaceId: 'w', createdBy: 'u', accountId: 'a',
  date: '2020-01-01', dueDate: '2020-01-15', status: 'open',
  taxMode: 'standard', subtotal: 100, taxAmount: 19, total: 119,
  bankInfo: '', isSuggestion: false, pendingSync: false,
  createdAt: '', updatedAt: '', ...over,
})
const accounts = [{ id: 'a', name: 'Acme GmbH' }] as any

describe('dunningFee', () => {
  it('uses default staffel 0/5/10 by level', () => {
    expect(dunningFee(0)).toBe(0)
    expect(dunningFee(1)).toBe(5)
    expect(dunningFee(2)).toBe(10)
  })
  it('clamps levels beyond the config to the last fee', () => {
    expect(dunningFee(3)).toBe(10)
  })
  it('honours a custom fee config', () => {
    expect(dunningFee(1, [0, 7.5, 15])).toBe(7.5)
  })
  it('falls back to 0 for an empty config', () => {
    expect(dunningFee(1, [])).toBe(0)
  })
})

describe('parseFeeTag', () => {
  it('parses cent tags to euro', () => {
    expect(parseFeeTag('fee:500')).toBe(5)
    expect(parseFeeTag('fee:0')).toBe(0)
  })
  it('ignores non-fee tags', () => {
    expect(parseFeeTag('priority:p1')).toBe(0)
  })
})

describe('reminderFeeTags', () => {
  it('snapshots the level fee as a cent tag', () => {
    expect(reminderFeeTags(1)).toEqual(['fee:500'])
    expect(reminderFeeTags(2, [0, 5, 12])).toEqual(['fee:1200'])
  })
  it('emits fee:0 for the free Zahlungserinnerung', () => {
    expect(reminderFeeTags(0)).toEqual(['fee:0'])
  })
  it('exposes the default staffel', () => {
    expect(DEFAULT_DUNNING_FEES).toEqual([0, 5, 10])
  })
})

describe('dueReminders', () => {
  it('lists a fresh overdue invoice with level 0 and customer name', () => {
    const res = dueReminders([inv()], [], accounts, [0, 5, 10], [])
    expect(res).toHaveLength(1)
    expect(res[0].customerName).toBe('Acme GmbH')
    expect(res[0].level).toBe(0)
    expect(res[0].amountDue).toBe(119) // remaining + 0 fees + level-0 fee 0
  })
  it('skips suggestions and non-overdue invoices', () => {
    const notDue = inv({ id: 'i2', dueDate: '2999-01-01' })
    const suggestion = inv({ id: 'i3', isSuggestion: true })
    expect(dueReminders([notDue, suggestion], [], accounts, [0, 5, 10], [])).toHaveLength(0)
  })
})

describe('escalatedInvoices', () => {
  it('lists invoices past the 2. Mahnung', () => {
    const done = (i: number) => ({
      id: 'r' + i, title: 'x', status: 'done', priority: 'p2', bucket: 'done',
      checklist: [], tags: ['fee:0'], source: 'finance', actionType: 'send_reminder',
      sourceRef: 'inv1', createdAt: '', updatedAt: '2020-02-01T00:00:00.000Z',
    }) as any
    const res = escalatedInvoices([inv()], [done(1), done(2), done(3)], accounts)
    expect(res.map(r => r.invoice.id)).toEqual(['inv1'])
  })
})
