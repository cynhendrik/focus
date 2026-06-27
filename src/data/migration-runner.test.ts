import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
const upsertMock = vi.fn().mockResolvedValue({ error: null })
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ upsert: upsertMock }) } }))

import { invoke } from '@tauri-apps/api/core'
import { migrateAccounts, runMigration } from './migration-runner'

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
