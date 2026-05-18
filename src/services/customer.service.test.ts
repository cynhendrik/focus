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
  leadScore: 0,
  scoreFactors: {},
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

describe('CustomerService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getAll calls get_accounts command with workspaceId', async () => {
    vi.mocked(invoke).mockResolvedValueOnce([mockCustomer])
    const result = await CustomerService.getAll('ws-1')
    expect(invoke).toHaveBeenCalledWith('get_accounts', { workspaceId: 'ws-1' })
    expect(result[0].id).toBe('1')
  })

  it('upsert calls upsert_account with payload', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(mockCustomer)
    const payload = { name: 'Test GmbH', workspaceId: 'ws-1', createdBy: 'u-1' }
    await CustomerService.upsert(payload)
    expect(invoke).toHaveBeenCalledWith('upsert_account', expect.objectContaining({ payload: expect.any(Object) }))
  })

  it('delete calls delete_account with id and workspaceId', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined)
    await CustomerService.delete('1', 'ws-1')
    expect(invoke).toHaveBeenCalledWith('delete_account', { id: '1', workspaceId: 'ws-1' })
  })

  it('maps leadScore and scoreFactors from account to customer', async () => {
    const mockAccount = {
      id: '2', name: 'Hot Lead GmbH', kind: 'company',
      status: 'aktiv', priority: 'high', tags: [], goals: [],
      isPrivate: false, workspaceId: 'ws-1', createdBy: 'u-1',
      socialLinks: '{}', leadScore: 75,
      scoreFactors: { qualified_meeting: 25, strong_interest: 50 },
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    }
    vi.mocked(invoke).mockResolvedValueOnce([mockAccount])
    const result = await CustomerService.getAll('ws-1')
    expect(result[0].leadScore).toBe(75)
    expect(result[0].scoreFactors).toEqual({ qualified_meeting: 25, strong_interest: 50 })
  })
})
