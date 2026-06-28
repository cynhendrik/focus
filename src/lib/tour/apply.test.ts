import { describe, it, expect, vi, beforeEach } from 'vitest'

// Gateways mocken → falls die Tour irgendwas persistiert, schlagen die Assertions an.
// vi.hoisted stellt sicher dass gw vor dem gehoistetem vi.mock verfügbar ist.
const gw = vi.hoisted(() => ({ create: vi.fn(), upsert: vi.fn(), update: vi.fn() }))
vi.mock('@/data/accounts.gateway', () => ({ AccountsGateway: gw }))
vi.mock('@/data/customers.gateway', () => ({ CustomersGateway: gw }))
vi.mock('@/data/invoices.gateway', () => ({ InvoicesGateway: gw }))

import { applyTourFixtures, clearTourFixtures } from './apply'
import { useCustomersStore } from '@/store/customers.store'
import { useFinanceStore } from '@/store/finance.store'
import { useLeadsStore } from '@/store/leads.store'
import { tourCustomers } from './fixtures'

beforeEach(() => {
  vi.clearAllMocks()
  useCustomersStore.setState({ customers: [] } as any)
  useFinanceStore.setState({ invoices: [], kpis: null } as any)
  useLeadsStore.setState({ leads: [] } as any)
})

describe('tour apply/clear', () => {
  it('applyTourFixtures füllt die Stores aus dem Speicher', () => {
    applyTourFixtures()
    expect(useCustomersStore.getState().customers.length).toBe(tourCustomers.length)
    expect(useFinanceStore.getState().invoices.length).toBeGreaterThan(0)
    expect(useLeadsStore.getState().leads.length).toBeGreaterThan(0)
  })
  it('schreibt NICHTS über Gateways (flüchtig)', () => {
    applyTourFixtures()
    expect(gw.create).not.toHaveBeenCalled()
    expect(gw.upsert).not.toHaveBeenCalled()
    expect(gw.update).not.toHaveBeenCalled()
  })
  it('clearTourFixtures leert die Tour-Daten wieder', () => {
    applyTourFixtures()
    clearTourFixtures('real-ws')
    expect(useCustomersStore.getState().customers.every(c => !c.id.startsWith('tour-'))).toBe(true)
    expect(useFinanceStore.getState().invoices.every(i => !i.id.startsWith('tour-'))).toBe(true)
  })
})
