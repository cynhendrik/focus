import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

import { invoke } from '@tauri-apps/api/core'
import { CustomerService } from './customer.service'
import type { Customer } from '@/types/customer.types'

const mockCustomer: Customer = {
  id: '1',
  name: 'Test GmbH',
  status: 'aktiv',
  priority: 'normal',
  tags: [],
  isPrivate: false,
  workspaceId: 'ws-1',
  goals: [],
  socialLinks: '{}',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

describe('CustomerService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getAll calls get_customers command with workspaceId', async () => {
    vi.mocked(invoke).mockResolvedValueOnce([mockCustomer])
    const result = await CustomerService.getAll('ws-1')
    expect(invoke).toHaveBeenCalledWith('get_customers', { workspaceId: 'ws-1' })
    expect(result).toEqual([mockCustomer])
  })

  it('upsert calls upsert_customer with payload', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(mockCustomer)
    const payload = { name: 'Test GmbH', workspaceId: 'ws-1', createdBy: 'u-1' }
    const result = await CustomerService.upsert(payload)
    expect(invoke).toHaveBeenCalledWith('upsert_customer', { payload })
    expect(result).toEqual(mockCustomer)
  })

  it('delete calls delete_customer with id and workspaceId', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined)
    await CustomerService.delete('1', 'ws-1')
    expect(invoke).toHaveBeenCalledWith('delete_customer', { id: '1', workspaceId: 'ws-1' })
  })
})
