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
  it('reads raw workspace dump and upserts contacts re-scoped, preserving id/created_at', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string, args: any) => {
      if (cmd === 'cmd_dump_table' && args.table === 'contacts' && args.workspaceId === 'L')
        return [{
          id: 'k1', workspace_id: 'L', created_by: 'orig',
          account_id: 'a1', first_name: 'P', last_name: null,
          email: null, phone: null, role: null, is_primary: 0,
          avatar_url: null, linkedin_url: null, decision_power: null,
          preferred_channel: null, notes: null, birthday: null,
          pending_sync: 0,
          created_at: 'T', updated_at: 'T',
        }]
      return []
    })
    const n = await migrateContacts({ localWsId: 'L', cloudWsId: 'C', uid: 'U' })
    expect(n).toBe(1)
    const row = upsertMock.mock.calls.at(-1)![0][0]
    // Re-scoped
    expect(row.workspace_id).toBe('C')
    expect(row.created_by).toBe('U')
    // Preserved from raw row
    expect(row.id).toBe('k1')
    expect(row.created_at).toBe('T')
    // Local-only column excluded
    expect(row.pending_sync).toBeUndefined()
  })

  it('returns 0 and skips upsert when workspace has no contacts', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string, args: any) => {
      if (cmd === 'cmd_dump_table' && args.table === 'contacts') return []
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
  it('reads raw workspace dump and upserts activities re-scoped, preserving contact_id/outcome/direction/customer_id', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string, args: any) => {
      if (cmd === 'cmd_dump_table' && args.table === 'activities' && args.workspaceId === 'L')
        return [{
          id: 'act1', workspace_id: 'L', created_by: 'orig',
          account_id: 'a1', contact_id: 'c1', deal_id: null, customer_id: 'cust9',
          type: 'call', title: 'First call', body: null,
          outcome: 'strong_interest', direction: 'out', email_id: null,
          assignee: null, status: 'done', due_at: null,
          payload: '{"extra":"data"}',
          pending_sync: 0,
          created_at: 'AT', updated_at: 'AT2',
        }]
      return []
    })
    const n = await migrateActivities({ localWsId: 'L', cloudWsId: 'C', uid: 'U' })
    expect(n).toBe(1)
    const row = upsertMock.mock.calls.at(-1)![0][0]
    // Re-scoped
    expect(row.workspace_id).toBe('C')
    expect(row.created_by).toBe('U')
    // Preserved from raw row
    expect(row.id).toBe('act1')
    expect(row.created_at).toBe('AT')
    // contact_id, outcome, direction carried through
    expect(row.contact_id).toBe('c1')
    expect(row.outcome).toBe('strong_interest')
    expect(row.direction).toBe('out')
    // customer_id included (not dropped)
    expect(row.customer_id).toBe('cust9')
    // payload parsed to object
    expect(row.payload).toEqual({ extra: 'data' })
    // Local-only column excluded
    expect(row.pending_sync).toBeUndefined()
  })

  it('parses payload string to object and maps due_at/assignee correctly', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string, args: any) => {
      if (cmd === 'cmd_dump_table' && args.table === 'activities')
        return [{
          id: 'act2', workspace_id: 'L', created_by: 'orig',
          account_id: 'a1', contact_id: null, deal_id: null, customer_id: null,
          type: 'task', title: 'Task', body: null,
          outcome: null, direction: null, email_id: null,
          assignee: 'bob', status: 'open', due_at: '2026-07-01',
          payload: '{}',
          pending_sync: 0,
          created_at: 'CT', updated_at: 'UT',
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
