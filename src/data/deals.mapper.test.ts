import { describe, it, expect } from 'vitest'
import { dealRowToDeal, dealPayloadToRow } from './deals.mapper'
import type { UpsertDealPayload } from '@/types/pipeline.types'

const fullRow = {
  id: 'd1', workspace_id: 'ws1', created_by: 'u1', account_id: 'a1', customer_id: 'cust1',
  contact_id: 'ct1', title: 'Website', stage: 'proposal', value: 5000, currency: 'USD',
  probability: 60, expected_close: '2026-07-30', owner: 'u1', notes: 'heiß',
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z',
}

describe('deals.mapper', () => {
  it('dealRowToDeal: mappt alle snake_case-Spalten', () => {
    expect(dealRowToDeal(fullRow)).toEqual({
      id: 'd1', workspaceId: 'ws1', createdBy: 'u1', accountId: 'a1', customerId: 'cust1',
      contactId: 'ct1', title: 'Website', stage: 'proposal', value: 5000, currency: 'USD',
      probability: 60, expectedClose: '2026-07-30', owner: 'u1', notes: 'heiß',
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z',
    })
  })

  it('dealRowToDeal: null-Spalten → undefined, currency defaultet EUR', () => {
    const d = dealRowToDeal({
      id: 'd2', workspace_id: 'ws1', created_by: 'u1', account_id: 'a1', customer_id: null,
      contact_id: null, title: 'X', stage: 'prospect', value: null, currency: null,
      probability: null, expected_close: null, owner: null, notes: null,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    })
    expect(d.customerId).toBeUndefined()
    expect(d.value).toBeUndefined()
    expect(d.notes).toBeUndefined()
    expect(d.currency).toBe('EUR')
  })

  it('dealPayloadToRow: camelCase→snake_case, lässt created_at/currency weg (DB-Default), setzt updated_at', () => {
    const p: UpsertDealPayload = {
      id: 'd1', workspaceId: 'ws1', createdBy: 'u1', accountId: 'a1', customerId: 'cust1',
      title: 'Website', stage: 'proposal', value: 5000, probability: 60,
      expectedClose: '2026-07-30', notes: 'heiß',
    }
    const row = dealPayloadToRow(p, { id: 'd1', now: '2026-06-22T10:00:00Z' })
    expect(row).toEqual({
      id: 'd1', workspace_id: 'ws1', created_by: 'u1', account_id: 'a1', customer_id: 'cust1',
      title: 'Website', stage: 'proposal', value: 5000, probability: 60,
      expected_close: '2026-07-30', notes: 'heiß', updated_at: '2026-06-22T10:00:00Z',
    })
    expect(row).not.toHaveProperty('created_at')
    expect(row).not.toHaveProperty('currency')
  })

  it('dealPayloadToRow: stage defaultet prospect, optionale Felder → null', () => {
    const p: UpsertDealPayload = {
      workspaceId: 'ws1', createdBy: 'u1', accountId: 'a1', title: 'Neu',
    }
    const row = dealPayloadToRow(p, { id: 'd3', now: '2026-06-22T10:00:00Z' })
    expect(row.stage).toBe('prospect')
    expect(row.customer_id).toBeNull()
    expect(row.value).toBeNull()
    expect(row.notes).toBeNull()
  })
})
