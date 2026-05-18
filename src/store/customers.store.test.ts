import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/customer.service', () => ({
  CustomerService: {
    getAll: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
  },
}))

import { CustomerService } from '@/services/customer.service'
import type { Customer } from '@/types/customer.types'

const mockCustomer: Customer = {
  id: 'c1',
  name: 'ACME AG',
  status: 'aktiv',
  priority: 'normal',
  tags: [],
  isPrivate: false,
  workspaceId: 'ws-1',
  goals: [],
  socialLinks: '{}',
  leadScore: 0,
  scoreFactors: {},
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

describe('useCustomersStore', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { useCustomersStore } = await import('./customers.store')
    useCustomersStore.setState({ customers: [], isLoading: false, error: null })
  })

  it('init loads customers from service', async () => {
    vi.mocked(CustomerService.getAll).mockResolvedValueOnce([mockCustomer])
    const { useCustomersStore } = await import('./customers.store')
    await useCustomersStore.getState().init()
    expect(useCustomersStore.getState().customers).toEqual([mockCustomer])
    expect(useCustomersStore.getState().isLoading).toBe(false)
  })

  it('upsert adds new customer to list', async () => {
    vi.mocked(CustomerService.upsert).mockResolvedValueOnce(mockCustomer)
    const { useCustomersStore } = await import('./customers.store')
    await useCustomersStore.getState().upsert({ name: 'ACME AG' })
    expect(useCustomersStore.getState().customers).toHaveLength(1)
  })

  it('remove deletes customer from list', async () => {
    vi.mocked(CustomerService.delete).mockResolvedValueOnce(undefined)
    const { useCustomersStore } = await import('./customers.store')
    useCustomersStore.setState({ customers: [mockCustomer], isLoading: false, error: null })
    await useCustomersStore.getState().remove('c1')
    expect(useCustomersStore.getState().customers).toHaveLength(0)
  })
})
