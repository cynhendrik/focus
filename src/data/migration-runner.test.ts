import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
const upsertMock = vi.fn().mockResolvedValue({ error: null })
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ upsert: upsertMock }) } }))

import { invoke } from '@tauri-apps/api/core'
import { migrateAccounts, migrateContacts, migrateDeals, migrateActivities, runMigration } from './migration-runner'

beforeEach(() => { upsertMock.mockClear(); vi.mocked(invoke).mockReset() })

describe('migrateAccounts', () => {
  it('reads local clients+leads and upserts them re-scoped, preserving id/created_at', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'get_accounts') return [{ id: 'a1', name: 'X', createdAt: '2025-01-01T00:00:00Z', tags: [], isPrivate: false }]
      if (cmd === 'get_leads') return []
      return []
    })
    const n = await migrateAccounts({ localWsId: 'L', cloudWsId: 'C', uid: 'U' })
    expect(n).toBe(1)
    // upsert(rows, opts) → mock.calls[0] = [rows_array, opts_object]
    // table name goes to from() which the mock doesn't capture
    const [rows] = upsertMock.mock.calls[0]
    const row = rows[0]
    expect(row.id).toBe('a1')
    expect(row.workspace_id).toBe('C')
    expect(row.created_by).toBe('U')
    expect(row.created_at).toBe('2025-01-01T00:00:00Z')
  })

  it('is idempotent — a second run upserts the same ids (no duplication semantics)', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'get_accounts') return [{ id: 'a1', name: 'X', createdAt: 'T', tags: [], isPrivate: false }]
      if (cmd === 'get_leads') return []
      return []
    })
    await migrateAccounts({ localWsId: 'L', cloudWsId: 'C', uid: 'U' })
    await migrateAccounts({ localWsId: 'L', cloudWsId: 'C', uid: 'U' })
    // beide Läufe nutzen upsert(onConflict:id) → kein Duplikat-Pfad; hier: 2 upsert-Calls mit gleicher id
    expect(upsertMock).toHaveBeenCalledTimes(2)
  })
})

describe('runMigration', () => {
  it('calls onProgress with (entity, count) for each entity', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'get_accounts') return [
        { id: 'b1', name: 'A', createdAt: '2025-01-01T00:00:00Z', tags: [], isPrivate: false },
        { id: 'b2', name: 'B', createdAt: '2025-02-01T00:00:00Z', tags: [], isPrivate: false },
      ]
      if (cmd === 'get_leads') return []
      return []
    })
    const onProgress = vi.fn()
    await runMigration({ localWsId: 'L', cloudWsId: 'C', uid: 'U' }, onProgress)
    expect(onProgress).toHaveBeenCalledWith('accounts', 2)
  })

  it('resolves without throwing when onProgress is omitted', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'get_accounts') return [{ id: 'c1', name: 'Z', createdAt: '2025-03-01T00:00:00Z', tags: [], isPrivate: false }]
      if (cmd === 'get_leads') return []
      return []
    })
    await expect(runMigration({ localWsId: 'L', cloudWsId: 'C', uid: 'U' })).resolves.toBeUndefined()
  })
})

describe('migrateContacts', () => {
  it('iterates accounts and upserts contacts re-scoped, preserving id/created_at', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string, args: any) => {
      if (cmd === 'get_accounts') return [{ id: 'a1' }]
      if (cmd === 'get_leads') return []
      if (cmd === 'get_contacts' && args.accountId === 'a1')
        return [{ id: 'k1', accountId: 'a1', firstName: 'P', createdBy: 'orig', createdAt: 'T' }]
      return []
    })
    const n = await migrateContacts({ localWsId: 'L', cloudWsId: 'C', uid: 'U' })
    expect(n).toBe(1)
    expect(upsertMock.mock.calls.at(-1)![0][0]).toMatchObject({
      id: 'k1', workspace_id: 'C', created_by: 'U', created_at: 'T',
    })
  })

  it('returns 0 when no accounts exist', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'get_accounts') return []
      if (cmd === 'get_leads') return []
      return []
    })
    const n = await migrateContacts({ localWsId: 'L', cloudWsId: 'C', uid: 'U' })
    expect(n).toBe(0)
    expect(upsertMock).not.toHaveBeenCalled()
  })
})

describe('migrateDeals', () => {
  it('reads deals by workspace and upserts them re-scoped, preserving id/created_at', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'get_deals_by_workspace')
        return [{ id: 'd1', accountId: 'a1', title: 'Big Deal', stage: 'prospect', createdAt: 'DT' }]
      return []
    })
    const n = await migrateDeals({ localWsId: 'L', cloudWsId: 'C', uid: 'U' })
    expect(n).toBe(1)
    expect(upsertMock.mock.calls.at(-1)![0][0]).toMatchObject({
      id: 'd1', workspace_id: 'C', created_by: 'U', created_at: 'DT',
    })
  })

  it('is idempotent — second run upserts same ids', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'get_deals_by_workspace')
        return [{ id: 'd2', accountId: 'a1', title: 'Another', stage: 'prospect', createdAt: 'T2' }]
      return []
    })
    await migrateDeals({ localWsId: 'L', cloudWsId: 'C', uid: 'U' })
    await migrateDeals({ localWsId: 'L', cloudWsId: 'C', uid: 'U' })
    expect(upsertMock).toHaveBeenCalledTimes(2)
  })
})

describe('migrateActivities', () => {
  it('iterates accounts and upserts activities with direct row mapping, preserving contact_id/outcome/direction', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string, args: any) => {
      if (cmd === 'get_accounts') return [{ id: 'a1' }]
      if (cmd === 'get_leads') return []
      if (cmd === 'get_activities_by_account' && args.accountId === 'a1')
        return [{
          id: 'act1', accountId: 'a1', contactId: 'c1', dealId: null,
          type: 'call', title: 'First call', body: null,
          outcome: 'strong_interest', direction: 'out', emailId: null,
          assignee: null, status: 'done', dueAt: null,
          payload: '{"extra":"data"}',
          createdAt: 'AT', updatedAt: 'AT2',
        }]
      return []
    })
    const n = await migrateActivities({ localWsId: 'L', cloudWsId: 'C', uid: 'U' })
    expect(n).toBe(1)
    const row = upsertMock.mock.calls.at(-1)![0][0]
    expect(row).toMatchObject({
      id: 'act1', workspace_id: 'C', created_by: 'U', created_at: 'AT',
      contact_id: 'c1', outcome: 'strong_interest', direction: 'out',
    })
    expect(row.payload).toEqual({ extra: 'data' })
  })

  it('parses payload string to object and maps due_at correctly', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string, args: any) => {
      if (cmd === 'get_accounts') return [{ id: 'a1' }]
      if (cmd === 'get_leads') return []
      if (cmd === 'get_activities_by_account' && args.accountId === 'a1')
        return [{
          id: 'act2', accountId: 'a1', contactId: null, dealId: null,
          type: 'task', title: 'Task', body: null,
          outcome: null, direction: null, emailId: null,
          assignee: 'bob', status: 'open', dueAt: '2026-07-01',
          payload: '{}',
          createdAt: 'CT', updatedAt: 'UT',
        }]
      return []
    })
    await migrateActivities({ localWsId: 'L', cloudWsId: 'C', uid: 'U' })
    const row = upsertMock.mock.calls.at(-1)![0][0]
    expect(row.due_at).toBe('2026-07-01')
    expect(row.payload).toEqual({})
    expect(row.assignee).toBe('bob')
  })
})
