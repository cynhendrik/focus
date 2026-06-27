import { describe, it, expect } from 'vitest'
import { kpiRowToKpi, kpiPayloadToRow } from './kpis.mapper'

describe('kpiRowToKpi', () => {
  it('maps account_id → customerId and snake→camel', () => {
    const k = kpiRowToKpi({ id: 'k1', workspace_id: 'w', created_by: 'u', account_id: 'a1', label: 'MRR', value: 5, unit: '€', target: 10, period: 'M', updated_at: 'T' })
    expect(k).toEqual({ id: 'k1', customerId: 'a1', label: 'MRR', value: 5, unit: '€', target: 10, period: 'M', updatedAt: 'T' })
  })
  it('null-ish numerics become undefined', () => {
    const k = kpiRowToKpi({ id: 'k1', account_id: 'a1', label: 'X', value: null, unit: null, target: null, period: null, updated_at: 'T' })
    expect(k.value).toBeUndefined(); expect(k.unit).toBeUndefined()
  })
})

describe('kpiPayloadToRow', () => {
  it('maps customerId → account_id, sets audit fields, no created_at', () => {
    const row = kpiPayloadToRow(
      { id: 'k1', customerId: 'a1', label: 'MRR', value: 5 },
      { id: 'k1', workspaceId: 'w', createdBy: 'u', now: 'T' },
    )
    expect(row).toMatchObject({ id: 'k1', workspace_id: 'w', created_by: 'u', account_id: 'a1', label: 'MRR', value: 5, updated_at: 'T' })
    expect(row).not.toHaveProperty('created_at')
  })
})
