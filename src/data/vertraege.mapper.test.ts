import { describe, it, expect } from 'vitest'
import { vertragRowToContract, vertragPayloadToRow } from './vertraege.mapper'
import type { ContractRow } from '@/services/vertraege.service'

const items = [{ title: 'Retainer', quantity: 1, unitPrice: 1500, taxRate: 19 }]

const fullRow = {
  id: 'v1', workspace_id: 'ws1', created_by: 'u1', account_id: 'a1', title: 'Wartung',
  interval_value: 1, interval_unit: 'months', start_date: '2026-01-01',
  next_billing_date: '2026-07-01', end_date: '2026-12-31', status: 'active',
  tax_mode: 'standard', notes: 'jährlich kündbar', items, created_at: '2026-01-01T00:00:00Z',
}

describe('vertraege.mapper', () => {
  it('vertragRowToContract: mappt alle Spalten, items jsonb (Array)', () => {
    expect(vertragRowToContract(fullRow)).toEqual({
      id: 'v1', workspaceId: 'ws1', accountId: 'a1', title: 'Wartung',
      intervalValue: 1, intervalUnit: 'months', startDate: '2026-01-01',
      nextBillingDate: '2026-07-01', endDate: '2026-12-31', status: 'active',
      taxMode: 'standard', notes: 'jährlich kündbar', items, createdAt: '2026-01-01T00:00:00Z',
    })
  })

  it('vertragRowToContract: items als JSON-String → Array; null end_date → null', () => {
    const c = vertragRowToContract({ ...fullRow, end_date: null, items: JSON.stringify(items) })
    expect(c.items).toEqual(items)
    expect(c.endDate).toBeNull()
  })

  it('vertragPayloadToRow: camelCase→snake_case, injiziert created_by, items nativ (jsonb)', () => {
    const p: ContractRow = {
      id: 'v1', workspaceId: 'ws1', accountId: 'a1', title: 'Wartung',
      intervalValue: 1, intervalUnit: 'months', startDate: '2026-01-01',
      nextBillingDate: '2026-07-01', endDate: '2026-12-31', status: 'active',
      taxMode: 'standard', notes: 'jährlich kündbar', items, createdAt: '2026-01-01T00:00:00Z',
    }
    const row = vertragPayloadToRow(p, { createdBy: 'u1' })
    expect(row).toEqual({
      id: 'v1', workspace_id: 'ws1', created_by: 'u1', account_id: 'a1', title: 'Wartung',
      interval_value: 1, interval_unit: 'months', start_date: '2026-01-01',
      next_billing_date: '2026-07-01', end_date: '2026-12-31', status: 'active',
      tax_mode: 'standard', notes: 'jährlich kündbar', items, created_at: '2026-01-01T00:00:00Z',
    })
  })

  it('vertragPayloadToRow: leerer accountId → null', () => {
    const p = {
      id: 'v2', workspaceId: 'ws1', accountId: '', title: 'X', intervalValue: 1,
      intervalUnit: 'months', startDate: '2026-01-01', nextBillingDate: '2026-02-01',
      endDate: null, status: 'active', taxMode: 'standard', notes: '', items: [],
      createdAt: '2026-01-01T00:00:00Z',
    } as ContractRow
    const row = vertragPayloadToRow(p, { createdBy: 'u1' })
    expect(row.account_id).toBeNull()
    expect(row.end_date).toBeNull()
  })
})
