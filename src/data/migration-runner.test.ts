import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
const upsertMock = vi.fn().mockResolvedValue({ error: null })
const deleteEqMock = vi.fn().mockResolvedValue({ error: null })
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      upsert: upsertMock,
      delete: () => ({ eq: deleteEqMock }),
    }),
  },
}))

import { invoke } from '@tauri-apps/api/core'
import {
  migrateAccounts, migrateContacts, migrateDeals, migrateActivities,
  migrateCompanySettings, migratePipelineStages, migrateLeadStages, migrateCalendar,
  migrateInvoices, migrateInvoiceItems, migratePayments,
  migrateOffers, migrateOfferItems, bumpSequences,
  runMigration,
} from './migration-runner'

beforeEach(() => { upsertMock.mockClear(); deleteEqMock.mockClear(); vi.mocked(invoke).mockReset() })

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

describe('migrateCompanySettings', () => {
  it('maps singleton to cloudWsId for id+workspace_id and parses json strings', async () => {
    vi.mocked(invoke).mockResolvedValue({ profile: '{"name":"X"}', modules: '{}', crmConfig: '{}' })
    const n = await migrateCompanySettings({ localWsId: 'L', cloudWsId: 'C', uid: 'U' })
    expect(n).toBe(1)
    const row = upsertMock.mock.calls.at(-1)![0][0]
    expect(row).toMatchObject({ id: 'C', workspace_id: 'C' })
    expect(row).not.toHaveProperty('created_by')
    expect(row.profile).toEqual({ name: 'X' })
    expect(row.modules).toEqual({})
    expect(row.crm_config).toEqual({})
  })

  it('passes through object values without reparsing', async () => {
    vi.mocked(invoke).mockResolvedValue({ profile: { name: 'Y' }, modules: { crm: true }, crmConfig: { stage: 1 } })
    const n = await migrateCompanySettings({ localWsId: 'L', cloudWsId: 'C', uid: 'U' })
    expect(n).toBe(1)
    const row = upsertMock.mock.calls.at(-1)![0][0]
    expect(row.profile).toEqual({ name: 'Y' })
    expect(row.crm_config).toEqual({ stage: 1 })
  })

  it('returns 0 when no company settings exist (null)', async () => {
    vi.mocked(invoke).mockResolvedValue(null)
    const n = await migrateCompanySettings({ localWsId: 'L', cloudWsId: 'C', uid: 'U' })
    expect(n).toBe(0)
    expect(upsertMock).not.toHaveBeenCalled()
  })
})

describe('migratePipelineStages', () => {
  it('reads stages and upserts them re-scoped, preserving created_at', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'cmd_get_pipeline_stages')
        return [{ id: 'ps1', workspaceId: 'L', name: 'Prospect', label: 'Prospect', orderIndex: 0, color: '#fff', isWon: false, isLost: false, createdAt: 'T1' }]
      return []
    })
    const n = await migratePipelineStages({ localWsId: 'L', cloudWsId: 'C', uid: 'U' })
    expect(n).toBe(1)
    const row = upsertMock.mock.calls.at(-1)![0][0]
    expect(row).toMatchObject({ id: 'ps1', workspace_id: 'C', created_at: 'T1' })
    expect(row).not.toHaveProperty('created_by')
    expect(row.is_won).toBe(0)
    expect(row.is_lost).toBe(0)
  })

  it('maps isWon/isLost booleans to 0/1 integers', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'cmd_get_pipeline_stages')
        return [{ id: 'ps2', workspaceId: 'L', name: 'Won', label: 'Won', orderIndex: 1, color: '#0f0', isWon: true, isLost: false, createdAt: 'T2' }]
      return []
    })
    await migratePipelineStages({ localWsId: 'L', cloudWsId: 'C', uid: 'U' })
    const row = upsertMock.mock.calls.at(-1)![0][0]
    expect(row.is_won).toBe(1)
    expect(row.is_lost).toBe(0)
  })

  it('returns 0 and skips upsert when no stages', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'cmd_get_pipeline_stages') return []
      return []
    })
    const n = await migratePipelineStages({ localWsId: 'L', cloudWsId: 'C', uid: 'U' })
    expect(n).toBe(0)
    expect(upsertMock).not.toHaveBeenCalled()
  })
})

describe('migrateLeadStages', () => {
  it('reads stages and upserts them re-scoped, preserving created_at', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'cmd_get_lead_stages')
        return [{ id: 'ls1', workspaceId: 'L', name: 'New', label: 'New', orderIndex: 0, color: '#aaa', isQualified: false, isDisqualified: false, createdAt: 'T3' }]
      return []
    })
    const n = await migrateLeadStages({ localWsId: 'L', cloudWsId: 'C', uid: 'U' })
    expect(n).toBe(1)
    const row = upsertMock.mock.calls.at(-1)![0][0]
    expect(row).toMatchObject({ id: 'ls1', workspace_id: 'C', created_at: 'T3' })
    expect(row).not.toHaveProperty('created_by')
    expect(row.is_qualified).toBe(0)
    expect(row.is_disqualified).toBe(0)
  })

  it('maps isQualified/isDisqualified booleans to 0/1 integers', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'cmd_get_lead_stages')
        return [{ id: 'ls2', workspaceId: 'L', name: 'Qualified', label: 'Qualified', orderIndex: 1, color: '#0f0', isQualified: true, isDisqualified: false, createdAt: 'T4' }]
      return []
    })
    await migrateLeadStages({ localWsId: 'L', cloudWsId: 'C', uid: 'U' })
    const row = upsertMock.mock.calls.at(-1)![0][0]
    expect(row.is_qualified).toBe(1)
    expect(row.is_disqualified).toBe(0)
  })

  it('returns 0 and skips upsert when no stages', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'cmd_get_lead_stages') return []
      return []
    })
    const n = await migrateLeadStages({ localWsId: 'L', cloudWsId: 'C', uid: 'U' })
    expect(n).toBe(0)
    expect(upsertMock).not.toHaveBeenCalled()
  })
})

describe('migrateCalendar', () => {
  it('reads calendar events with full date range and upserts re-scoped, preserving created_at', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string, args: any) => {
      if (cmd === 'get_calendar_events' && args.from === '1970-01-01' && args.to === '2099-12-31')
        return [{
          id: 'ev1', workspaceId: 'L', createdBy: 'orig',
          title: 'Meeting', startAt: '2026-01-01T10:00:00Z', endAt: '2026-01-01T11:00:00Z',
          allDay: false, createdAt: 'EC', updatedAt: 'EU',
        }]
      return []
    })
    const n = await migrateCalendar({ localWsId: 'L', cloudWsId: 'C', uid: 'U' })
    expect(n).toBe(1)
    const row = upsertMock.mock.calls.at(-1)![0][0]
    expect(row).toMatchObject({ id: 'ev1', workspace_id: 'C', created_by: 'U', created_at: 'EC' })
    expect(row.all_day).toBe(0)
    expect(row.title).toBe('Meeting')
  })

  it('maps allDay:true to 1 and preserves optional fields', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'get_calendar_events')
        return [{
          id: 'ev2', workspaceId: 'L', createdBy: 'orig',
          accountId: 'acc1', title: 'Holiday', description: 'Off', location: 'Home',
          startAt: '2026-12-25T00:00:00Z', endAt: '2026-12-25T23:59:59Z',
          allDay: true, color: 'ok', createdAt: 'HC', updatedAt: 'HU',
        }]
      return []
    })
    await migrateCalendar({ localWsId: 'L', cloudWsId: 'C', uid: 'U' })
    const row = upsertMock.mock.calls.at(-1)![0][0]
    expect(row.all_day).toBe(1)
    expect(row.account_id).toBe('acc1')
    expect(row.color).toBe('ok')
  })

  it('returns 0 and skips upsert when no events', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'get_calendar_events') return []
      return []
    })
    const n = await migrateCalendar({ localWsId: 'L', cloudWsId: 'C', uid: 'U' })
    expect(n).toBe(0)
    expect(upsertMock).not.toHaveBeenCalled()
  })
})

describe('migrateInvoices', () => {
  it('preserves original number and does NOT call allocate RPC', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) =>
      cmd === 'get_invoices'
        ? [{ id: 'i1', number: 'RE-2025-007', createdAt: 'T', workspaceId: 'L', createdBy: 'orig', accountId: 'a1', date: '2025-01-01', dueDate: '2025-02-01', status: 'paid', taxMode: 'standard', subtotal: 700, taxAmount: 133, total: 833 }]
        : [],
    )
    const n = await migrateInvoices({ localWsId: 'L', cloudWsId: 'C', uid: 'U' })
    expect(n).toBe(1)
    const row = upsertMock.mock.calls.at(-1)![0][0]
    expect(row.number).toBe('RE-2025-007')
    expect(row.workspace_id).toBe('C')
    expect(row.created_by).toBe('U')
    expect(row.created_at).toBe('T')
    // allocate_invoice_number must NOT have been invoked
    const invokedCmds = vi.mocked(invoke).mock.calls.map(c => c[0])
    expect(invokedCmds).not.toContain('allocate_invoice_number')
  })

  it('returns 0 and skips upsert when workspace has no invoices', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) =>
      cmd === 'get_invoices' ? [] : [],
    )
    const n = await migrateInvoices({ localWsId: 'L', cloudWsId: 'C', uid: 'U' })
    expect(n).toBe(0)
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it('passes statusFilter: null to get_invoices (all statuses)', async () => {
    vi.mocked(invoke).mockResolvedValue([])
    await migrateInvoices({ localWsId: 'L', cloudWsId: 'C', uid: 'U' })
    expect(vi.mocked(invoke)).toHaveBeenCalledWith('get_invoices', { workspaceId: 'L', statusFilter: null })
  })
})

describe('migrateInvoiceItems', () => {
  it('deletes then inserts items per invoice, preserving item id', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string, args: any) => {
      if (cmd === 'get_invoices') return [{ id: 'inv1' }]
      if (cmd === 'get_invoice' && args?.id === 'inv1')
        return { items: [{ id: 'it1', invoiceId: 'inv1', title: 'Dev', quantity: 1, unitPrice: 100, taxRate: 0.19, total: 119, sortOrder: 0 }] }
      return []
    })
    const n = await migrateInvoiceItems({ localWsId: 'L', cloudWsId: 'C', uid: 'U' })
    expect(n).toBe(1)
    expect(deleteEqMock).toHaveBeenCalledWith('invoice_id', 'inv1')
    const row = upsertMock.mock.calls.at(-1)![0][0]
    expect(row.id).toBe('it1')
    expect(row.invoice_id).toBe('inv1')
  })

  it('skips upsert but still deletes when invoice has no items', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'get_invoices') return [{ id: 'inv2' }]
      if (cmd === 'get_invoice') return { items: [] }
      return []
    })
    const n = await migrateInvoiceItems({ localWsId: 'L', cloudWsId: 'C', uid: 'U' })
    expect(n).toBe(0)
    expect(deleteEqMock).toHaveBeenCalledWith('invoice_id', 'inv2')
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it('returns 0 and does nothing when workspace has no invoices', async () => {
    vi.mocked(invoke).mockResolvedValue([])
    const n = await migrateInvoiceItems({ localWsId: 'L', cloudWsId: 'C', uid: 'U' })
    expect(n).toBe(0)
    expect(deleteEqMock).not.toHaveBeenCalled()
    expect(upsertMock).not.toHaveBeenCalled()
  })
})

describe('migratePayments', () => {
  it('reads payments by workspace and upserts re-scoped, preserving created_at', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'cmd_get_payments_by_workspace')
        return [{ id: 'p1', workspaceId: 'L', invoiceId: 'inv1', amount: 500, paidAt: '2025-06-01', createdAt: 'PT' }]
      return []
    })
    const n = await migratePayments({ localWsId: 'L', cloudWsId: 'C', uid: 'U' })
    expect(n).toBe(1)
    const row = upsertMock.mock.calls.at(-1)![0][0]
    expect(row.id).toBe('p1')
    expect(row.workspace_id).toBe('C')
    expect(row).not.toHaveProperty('created_by')
    expect(row.created_at).toBe('PT')
    expect(row.invoice_id).toBe('inv1')
    expect(row.amount).toBe(500)
  })

  it('returns 0 and skips upsert when no payments', async () => {
    vi.mocked(invoke).mockResolvedValue([])
    const n = await migratePayments({ localWsId: 'L', cloudWsId: 'C', uid: 'U' })
    expect(n).toBe(0)
    expect(upsertMock).not.toHaveBeenCalled()
  })
})

describe('migrateOffers', () => {
  it('preserves original number (mapper omits it) and does NOT call allocate RPC', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) =>
      cmd === 'get_offers'
        ? [{ id: 'o1', number: 'ANG-2025-003', createdAt: 'OT', workspaceId: 'L', createdBy: 'orig', accountId: 'a1', title: 'Angebot', status: 'draft', validUntil: '2025-12-31', taxMode: 'standard', subtotal: 300, taxAmount: 57, total: 357 }]
        : [],
    )
    const n = await migrateOffers({ localWsId: 'L', cloudWsId: 'C', uid: 'U' })
    expect(n).toBe(1)
    const row = upsertMock.mock.calls.at(-1)![0][0]
    expect(row.number).toBe('ANG-2025-003')
    expect(row.workspace_id).toBe('C')
    expect(row.created_by).toBe('U')
    expect(row.created_at).toBe('OT')
    const invokedCmds = vi.mocked(invoke).mock.calls.map(c => c[0])
    expect(invokedCmds).not.toContain('allocate_offer_number')
  })

  it('returns 0 and skips upsert when workspace has no offers', async () => {
    vi.mocked(invoke).mockResolvedValue([])
    const n = await migrateOffers({ localWsId: 'L', cloudWsId: 'C', uid: 'U' })
    expect(n).toBe(0)
    expect(upsertMock).not.toHaveBeenCalled()
  })
})

describe('migrateOfferItems', () => {
  it('deletes then inserts items per offer, preserving item id and offer_id', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string, args: any) => {
      if (cmd === 'get_offers') return [{ id: 'off1' }]
      if (cmd === 'get_offer' && args?.id === 'off1')
        return { items: [{ id: 'oi1', offerId: 'off1', title: 'Pos 1', quantity: 2, unitPrice: 50, taxRate: 0.19, total: 119, sortOrder: 0 }] }
      return []
    })
    const n = await migrateOfferItems({ localWsId: 'L', cloudWsId: 'C', uid: 'U' })
    expect(n).toBe(1)
    expect(deleteEqMock).toHaveBeenCalledWith('offer_id', 'off1')
    const row = upsertMock.mock.calls.at(-1)![0][0]
    expect(row.id).toBe('oi1')
    expect(row.offer_id).toBe('off1')
  })

  it('returns 0 and does nothing when workspace has no offers', async () => {
    vi.mocked(invoke).mockResolvedValue([])
    const n = await migrateOfferItems({ localWsId: 'L', cloudWsId: 'C', uid: 'U' })
    expect(n).toBe(0)
    expect(deleteEqMock).not.toHaveBeenCalled()
    expect(upsertMock).not.toHaveBeenCalled()
  })
})

describe('bumpSequences', () => {
  it('sets invoice next_number to MAX(RE-number) (no +1) and carries format/seq_year/start_number from local seq', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string, args: any) => {
      if (cmd === 'get_invoices')
        return [
          { id: 'i1', number: 'RE-2025-007' },
          { id: 'i2', number: 'RE-2024-003' },
        ]
      if (cmd === 'get_offers')
        return [{ id: 'o1', number: 'ANG-2025-003' }]
      if (cmd === 'cmd_dump_table' && args?.table === 'invoice_sequences')
        return [{ workspace_id: 'L', next_number: 6, start_number: 1, format: 'RE-{YYYY}-{NNN}', seq_year: 2025 }]
      if (cmd === 'cmd_dump_table' && args?.table === 'offer_sequences')
        return [{ workspace_id: 'L', next_number: 2, start_number: 1 }]
      return []
    })
    await bumpSequences({ localWsId: 'L', cloudWsId: 'C', uid: 'U' })
    // First upsert = invoice_sequences, second = offer_sequences
    expect(upsertMock.mock.calls).toHaveLength(2)
    const invSeq = upsertMock.mock.calls[0][0]
    expect(invSeq.workspace_id).toBe('C')
    expect(invSeq.next_number).toBe(7) // MAX(7, 3) — no +1; next cloud call returns 7+1=8
    expect(invSeq.start_number).toBe(1)
    expect(invSeq.format).toBe('RE-{YYYY}-{NNN}')
    expect(invSeq.seq_year).toBe(2025)
    const offSeq = upsertMock.mock.calls[1][0]
    expect(offSeq.workspace_id).toBe('C')
    expect(offSeq.next_number).toBe(3) // MAX(3) — no +1; next cloud call returns 3+1=4
    expect(offSeq.start_number).toBe(1)
  })

  it('sets next_number to 0 when there are no invoices/offers (empty workspace; first cloud call yields 1)', async () => {
    vi.mocked(invoke).mockImplementation(async () => [])
    await bumpSequences({ localWsId: 'L', cloudWsId: 'C', uid: 'U' })
    const invSeq = upsertMock.mock.calls[0][0]
    expect(invSeq.next_number).toBe(0) // no invoices → MAX = 0; cloud function returns 0+1=1
    expect(invSeq.start_number).toBe(1)     // fallback when no local seq row
    expect(invSeq.format).toBeNull()         // fallback
    expect(invSeq.seq_year).toBe(0)          // fallback
    const offSeq = upsertMock.mock.calls[1][0]
    expect(offSeq.next_number).toBe(0)
    expect(offSeq.start_number).toBe(1)      // fallback
  })
})
