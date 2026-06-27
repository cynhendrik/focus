import { invoke } from '@tauri-apps/api/core'
import { supabase } from '@/lib/supabase'
import { accountPayloadToRow, leadPayloadToAccountRow } from './accounts.mapper'
import { dealPayloadToRow } from './deals.mapper'
import { pipelineStageToRow } from './pipeline-stages.mapper'
import { leadStageToRow } from './lead-stages.mapper'
import { eventPayloadToRow } from './calendar.mapper'
import type { Account } from '@/types/account.types'
import type { Lead, UpsertLeadPayload } from '@/types/lead.types'
import type { UpsertAccountPayload } from '@/types/account.types'
import type { UpsertDealPayload } from '@/types/pipeline.types'

export interface MigrationCtx { localWsId: string; cloudWsId: string; uid: string }

const CHUNK = 500

/**
 * Idempotenter Cloud-Write: upsert per id, in Blöcken.
 * No-op bei leerem Array.
 */
export async function upsertRows(table: string, rows: Record<string, unknown>[]): Promise<void> {
  if (rows.length === 0) return
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK)
    const { error } = await supabase.from(table).upsert(slice, { onConflict: 'id' })
    if (error) throw new Error(`${table}: ${error.message}`)
  }
}

/**
 * Re-scope-Injektion: workspace_id/created_by setzen, created_at erhalten.
 * Überschreibt was der Mapper gesetzt hat — damit Migrations-uid/cloudWsId immer korrekt sind.
 */
function scope(
  row: Record<string, unknown>,
  ctx: MigrationCtx,
  createdAt?: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row, workspace_id: ctx.cloudWsId, created_by: ctx.uid }
  if (createdAt !== undefined) out.created_at = createdAt
  return out
}

/**
 * Migriert lokale Clients (get_accounts) + Leads (get_leads) in die Cloud-Tabelle `accounts`.
 * Gibt die Zahl der upserteten Zeilen zurück.
 *
 * Mapper-Signaturen (aus accounts.mapper.ts, verifiziert):
 *   accountPayloadToRow(p: UpsertAccountPayload, ctx: { id: string; now: string })
 *   leadPayloadToAccountRow(p: UpsertLeadPayload, ctx: { id: string; createdBy: string; now: string })
 * Beide Mapper emittieren kein created_at — scope() injiziert es aus dem Domänenobjekt.
 */
export async function migrateAccounts(ctx: MigrationCtx): Promise<number> {
  const now = new Date().toISOString()
  const clients = await invoke<Account[]>('get_accounts', { workspaceId: ctx.localWsId })
  const leads = await invoke<Lead[]>('get_leads', { workspaceId: ctx.localWsId })

  const rows: Record<string, unknown>[] = [
    ...clients.map(a =>
      scope(
        accountPayloadToRow(a as unknown as UpsertAccountPayload, { id: a.id, now }),
        ctx,
        a.createdAt,
      ),
    ),
    ...leads.map(l =>
      scope(
        leadPayloadToAccountRow(l as unknown as UpsertLeadPayload, {
          id: l.id,
          createdBy: ctx.uid,
          now,
        }),
        ctx,
        l.createdAt,
      ),
    ),
  ]

  await upsertRows('accounts', rows)
  return rows.length
}

/**
 * Collects all local account IDs (clients + leads) for per-account iteration.
 */
async function localAccountIds(ctx: MigrationCtx): Promise<string[]> {
  const clients = await invoke<{ id: string }[]>('get_accounts', { workspaceId: ctx.localWsId })
  const leads   = await invoke<{ id: string }[]>('get_leads', { workspaceId: ctx.localWsId })
  return [...clients, ...leads].map(a => a.id)
}

// Cloud column allowlist for `contacts` (derived from contactPayloadToRow write-path
// + contactRowToContact read-path; excludes local-only `pending_sync`).
const CONTACT_CLOUD_COLS = new Set([
  'id', 'workspace_id', 'created_by', 'account_id',
  'first_name', 'last_name', 'email', 'phone', 'role',
  'is_primary', 'avatar_url', 'linkedin_url', 'decision_power',
  'preferred_channel', 'notes', 'birthday', 'created_at', 'updated_at',
])

/**
 * Migriert lokale Contacts in die Cloud-Tabelle `contacts` via workspace-weitem
 * SQLite-Dump (cmd_dump_table). Projiziert auf die Cloud-Spalten-Allowlist,
 * re-scoped workspace_id/created_by auf Cloud-Werte, preserviert created_at + id
 * direkt aus dem Rohzeile (snake_case). is_primary bleibt 0/1 (cloud: smallint).
 */
export async function migrateContacts(ctx: MigrationCtx): Promise<number> {
  const raw = await invoke<Record<string, unknown>[]>('cmd_dump_table', {
    table: 'contacts',
    workspaceId: ctx.localWsId,
  })
  const rows = raw.map(r => {
    const row: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(r)) {
      if (CONTACT_CLOUD_COLS.has(k)) row[k] = v
    }
    // Re-scope: cloud ids overwrite whatever the raw row had.
    row.workspace_id = ctx.cloudWsId
    row.created_by = ctx.uid
    // created_at is preserved from the raw row (already copied in the loop above).
    return row
  })
  await upsertRows('contacts', rows)
  return rows.length
}

/**
 * Migriert lokale Deals (pro Workspace) in die Cloud-Tabelle `deals`.
 *
 * Mapper-Signatur (deals.mapper.ts, verifiziert):
 *   dealPayloadToRow(p: UpsertDealPayload, ctx: { id: string; now: string })
 */
export async function migrateDeals(ctx: MigrationCtx): Promise<number> {
  const now = new Date().toISOString()
  const deals = await invoke<any[]>('get_deals_by_workspace', { workspaceId: ctx.localWsId })
  const rows = deals.map(d =>
    scope(
      dealPayloadToRow(d as unknown as UpsertDealPayload, { id: d.id, now }),
      ctx,
      d.createdAt,
    ),
  )
  await upsertRows('deals', rows)
  return rows.length
}

// Cloud column allowlist for `activities` (derived from activityPayloadToRow write-path
// + activityRowToActivity read-path + local schema; excludes local-only `pending_sync`;
// includes customer_id — present in both local schema and cloud write-path).
const ACTIVITY_CLOUD_COLS = new Set([
  'id', 'workspace_id', 'created_by', 'account_id', 'contact_id', 'deal_id', 'customer_id',
  'type', 'title', 'body', 'payload', 'status', 'due_at', 'assignee',
  'outcome', 'direction', 'email_id', 'created_at', 'updated_at',
])

/**
 * Migriert lokale Activities in die Cloud-Tabelle `activities` via workspace-weitem
 * SQLite-Dump (cmd_dump_table). Projiziert auf die Cloud-Spalten-Allowlist,
 * re-scoped workspace_id/created_by, preserviert created_at + id aus dem Rohzeile.
 * payload wird String→Objekt geparst (SQLite speichert als JSON-String, Cloud: jsonb).
 * customer_id wird mitgesendet (ist Cloud-Spalte und local-column in activities).
 */
export async function migrateActivities(ctx: MigrationCtx): Promise<number> {
  const raw = await invoke<Record<string, unknown>[]>('cmd_dump_table', {
    table: 'activities',
    workspaceId: ctx.localWsId,
  })
  const rows = raw.map(r => {
    const row: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(r)) {
      if (ACTIVITY_CLOUD_COLS.has(k)) row[k] = v
    }
    // Parse payload: SQLite stores as JSON string, cloud expects jsonb object.
    if (typeof row.payload === 'string') {
      try { row.payload = JSON.parse(row.payload || '{}') } catch { row.payload = {} }
    } else if (row.payload == null) {
      row.payload = {}
    }
    // Re-scope: cloud ids overwrite whatever the raw row had.
    row.workspace_id = ctx.cloudWsId
    row.created_by = ctx.uid
    // created_at is preserved from the raw row (already copied in the loop above).
    return row
  })
  await upsertRows('activities', rows)
  return rows.length
}

/** JSON-String → Objekt; non-string values pass through unchanged. */
function parseMaybe(v: unknown): unknown {
  return typeof v === 'string' ? JSON.parse(v || 'null') : v
}

/**
 * Migriert die lokale company_settings-Singleton in die Cloud-Tabelle `company_settings`.
 * Cloud-Schema: id = workspace_id = cloudWsId (eine Zeile pro Workspace).
 * Lokale Felder profile/modules/crmConfig können JSON-Strings sein → werden zu Objekten geparst.
 */
export async function migrateCompanySettings(ctx: MigrationCtx): Promise<number> {
  const cs = await invoke<any>('get_company_settings')
  if (!cs) return 0
  await upsertRows('company_settings', [{
    id: ctx.cloudWsId,
    workspace_id: ctx.cloudWsId,
    created_by: ctx.uid,
    profile: parseMaybe(cs.profile),
    modules: parseMaybe(cs.modules),
    crm_config: parseMaybe(cs.crmConfig),
    updated_at: new Date().toISOString(),
  }])
  return 1
}

/**
 * Migriert lokale Pipeline-Stages in die Cloud-Tabelle `pipeline_stages`.
 * is_won/is_lost bleiben 0/1 (Cloud: smallint). Preserviert created_at via scope().
 *
 * Mapper-Signatur (pipeline-stages.mapper.ts, verifiziert):
 *   pipelineStageToRow(p: { id, workspaceId, name, label, orderIndex?, color?, isWon?, isLost? })
 *   — kein ctx-Argument.
 */
export async function migratePipelineStages(ctx: MigrationCtx): Promise<number> {
  const stages = await invoke<any[]>('cmd_get_pipeline_stages', { workspaceId: ctx.localWsId })
  const rows = stages.map(s => scope(pipelineStageToRow(s), ctx, s.createdAt))
  await upsertRows('pipeline_stages', rows)
  return rows.length
}

/**
 * Migriert lokale Lead-Stages in die Cloud-Tabelle `lead_stages`.
 * is_qualified/is_disqualified bleiben 0/1 (Cloud: smallint). Preserviert created_at via scope().
 *
 * Mapper-Signatur (lead-stages.mapper.ts, verifiziert):
 *   leadStageToRow(p: { id, workspaceId, name, label, orderIndex?, color?, isQualified?, isDisqualified? })
 *   — kein ctx-Argument.
 */
export async function migrateLeadStages(ctx: MigrationCtx): Promise<number> {
  const stages = await invoke<any[]>('cmd_get_lead_stages', { workspaceId: ctx.localWsId })
  const rows = stages.map(s => scope(leadStageToRow(s), ctx, s.createdAt))
  await upsertRows('lead_stages', rows)
  return rows.length
}

/**
 * Migriert lokale Kalender-Events in die Cloud-Tabelle `calendar_events`.
 * Liest alle Events über den maximalen Zeitbereich (1970–2099). Preserviert created_at via scope().
 *
 * Mapper-Signatur (calendar.mapper.ts, verifiziert):
 *   eventPayloadToRow(p: UpsertCalendarEventPayload, ctx: { id: string; now: string })
 */
export async function migrateCalendar(ctx: MigrationCtx): Promise<number> {
  const now = new Date().toISOString()
  const events = await invoke<any[]>('get_calendar_events', {
    workspaceId: ctx.localWsId,
    from: '1970-01-01',
    to: '2099-12-31',
  })
  const rows = events.map(e => scope(eventPayloadToRow(e, { id: e.id, now }), ctx, e.createdAt))
  await upsertRows('calendar_events', rows)
  return rows.length
}

const ENTITIES: Array<{ name: string; run: (ctx: MigrationCtx) => Promise<number> }> = [
  { name: 'company_settings', run: migrateCompanySettings },
  { name: 'pipeline_stages', run: migratePipelineStages },
  { name: 'lead_stages', run: migrateLeadStages },
  { name: 'accounts', run: migrateAccounts },
  { name: 'contacts', run: migrateContacts },
  { name: 'deals', run: migrateDeals },
  { name: 'activities', run: migrateActivities },
  { name: 'calendar_events', run: migrateCalendar },
]

export async function runMigration(
  ctx: MigrationCtx,
  onProgress?: (entity: string, n: number) => void,
): Promise<void> {
  for (const e of ENTITIES) {
    const n = await e.run(ctx)
    onProgress?.(e.name, n)
  }
}
