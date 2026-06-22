import { describe, it, expect } from 'vitest'
import {
  auftragRowToAuftrag, auftragToRow, zeiteintragRowToZeiteintrag, zeiteintragToRow,
} from './auftraege.mapper'
import type { Auftrag, Zeiteintrag } from '@/types/auftrag.types'

describe('auftraege.mapper', () => {
  it('auftragRowToAuftrag: mappt title/default_hourly_rate/notes/status (ignoriert Drift-Spalten)', () => {
    const a = auftragRowToAuftrag({
      id: 'a1', workspace_id: 'ws', created_by: 'u', name: 'alt', title: 'Website',
      default_hourly_rate: 90, notes: 'x', status: 'active', created_at: '2026-01-01',
      budget_hours: 10, hourly_rate: 80,
    })
    expect(a).toEqual({ id: 'a1', title: 'Website', defaultHourlyRate: 90, notes: 'x', status: 'active', createdAt: '2026-01-01' })
  })

  it('auftragToRow: sendet created_at, mappt camelCase', () => {
    const a: Auftrag = { id: 'a1', title: 'Website', defaultHourlyRate: null, notes: '', status: 'active', createdAt: '2026-01-01' }
    const row = auftragToRow(a, { workspaceId: 'ws', createdBy: 'u' })
    expect(row).toEqual({
      id: 'a1', workspace_id: 'ws', created_by: 'u', title: 'Website',
      notes: '', status: 'active', default_hourly_rate: null, created_at: '2026-01-01',
    })
  })

  it('zeiteintragRowToZeiteintrag: billed nativ boolean, null→null', () => {
    const z = zeiteintragRowToZeiteintrag({
      id: 'z1', auftrag_id: null, account_id: 'acc', date: '2026-06-06', minutes: 90,
      description: 'Setup', hourly_rate: null, billed: true, invoice_id: 'inv1', created_at: '2026-01-01',
    })
    expect(z).toEqual({
      id: 'z1', auftragId: null, accountId: 'acc', date: '2026-06-06', minutes: 90,
      description: 'Setup', hourlyRate: null, billed: true, invoiceId: 'inv1',
    })
  })

  it('zeiteintragToRow: lässt created_at weg (DB-Default), billed bleibt boolean', () => {
    const z: Zeiteintrag = {
      id: 'z1', auftragId: 'a1', accountId: 'acc', date: '2026-06-06', minutes: 60,
      description: 'A', hourlyRate: 120, billed: false, invoiceId: null,
    }
    const row = zeiteintragToRow(z, { workspaceId: 'ws', createdBy: 'u' })
    expect(row).toEqual({
      id: 'z1', workspace_id: 'ws', created_by: 'u', auftrag_id: 'a1', account_id: 'acc',
      date: '2026-06-06', minutes: 60, description: 'A', hourly_rate: 120, billed: false, invoice_id: null,
    })
    expect(row).not.toHaveProperty('created_at')
  })
})
