import { invoke } from '@tauri-apps/api/core'
import { supabase } from '@/lib/supabase'
import { accountPayloadToRow, leadPayloadToAccountRow } from './accounts.mapper'
import { dealPayloadToRow } from './deals.mapper'
import { pipelineStageToRow } from './pipeline-stages.mapper'
import { leadStageToRow } from './lead-stages.mapper'
import { eventPayloadToRow } from './calendar.mapper'
import {
  invoicePayloadToRow, invoiceItemPayloadToRow,
  offerPayloadToRow, offerItemPayloadToRow,
  paymentPayloadToRow,
} from './finance.mapper'
import { vertragPayloadToRow } from './vertraege.mapper'
import { auftragToRow, zeiteintragToRow } from './auftraege.mapper'
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
  opts?: { withCreatedBy?: boolean },
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row, workspace_id: ctx.cloudWsId }
  if (opts?.withCreatedBy !== false) out.created_by = ctx.uid
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
  const rows = stages.map(s => scope(pipelineStageToRow(s), ctx, s.createdAt, { withCreatedBy: false }))
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
  const rows = stages.map(s => scope(leadStageToRow(s), ctx, s.createdAt, { withCreatedBy: false }))
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

/**
 * Migriert lokale Rechnungen (get_invoices, statusFilter:null) in die Cloud-Tabelle `invoices`.
 * GoBD-kritisch: das ursprüngliche `number`-Feld wird explizit erhalten;
 * kein `allocate_invoice_number`-RPC wird aufgerufen.
 *
 * Mapper-Signatur (finance.mapper.ts, verifiziert):
 *   invoicePayloadToRow(p, ctx: { id: string; now: string }) → enthält already number: p.number ?? null
 */
export async function migrateInvoices(ctx: MigrationCtx): Promise<number> {
  const now = new Date().toISOString()
  const invoices = await invoke<any[]>('get_invoices', { workspaceId: ctx.localWsId, statusFilter: null })
  const rows = invoices.map(inv => {
    const row = scope(invoicePayloadToRow(inv, { id: inv.id, now }), ctx, inv.createdAt)
    row.number = inv.number ?? null  // GoBD: Originalnummer explizit sichern (kein allocate)
    return row
  })
  await upsertRows('invoices', rows)
  return rows.length
}

/**
 * Migriert Rechnungspositionen per Delete+Insert je Rechnung.
 * Liest vollständige Rechnung via `get_invoice` (inkl. items).
 * Kein workspace_id auf Items (FK-scoped über invoice_id).
 *
 * Mapper-Signatur (finance.mapper.ts, verifiziert):
 *   invoiceItemPayloadToRow(it, ctx: { id: string; invoiceId: string })
 */
export async function migrateInvoiceItems(ctx: MigrationCtx): Promise<number> {
  const invoices = await invoke<any[]>('get_invoices', { workspaceId: ctx.localWsId, statusFilter: null })
  let total = 0
  for (const inv of invoices) {
    const full = await invoke<any>('get_invoice', { id: inv.id })
    const items: any[] = full?.items ?? []
    // Delete+Insert: idempotent, preserviert item-IDs
    await supabase.from('invoice_items').delete().eq('invoice_id', inv.id)
    if (items.length > 0) {
      const rows = items.map(it => invoiceItemPayloadToRow(it, { id: it.id, invoiceId: inv.id }))
      await upsertRows('invoice_items', rows)
      total += rows.length
    }
  }
  return total
}

/**
 * Migriert lokale Zahlungen (cmd_get_payments_by_workspace) in die Cloud-Tabelle `payments`.
 * Re-scoped auf cloudWsId via scope(). Preserviert created_at aus der Domain.
 *
 * Mapper-Signatur (finance.mapper.ts, verifiziert):
 *   paymentPayloadToRow(p, ctx: { id: string; now: string })
 */
export async function migratePayments(ctx: MigrationCtx): Promise<number> {
  const now = new Date().toISOString()
  const pays = await invoke<any[]>('cmd_get_payments_by_workspace', { workspaceId: ctx.localWsId })
  const rows = pays.map(p => scope(paymentPayloadToRow(p, { id: p.id, now }), ctx, p.createdAt, { withCreatedBy: false }))
  await upsertRows('payments', rows)
  return rows.length
}

/**
 * Migriert lokale Angebote (get_offers) in die Cloud-Tabelle `offers`.
 * GoBD-kritisch: `number` wird explizit ergänzt (offerPayloadToRow lässt es aus —
 * normalerweise per allocate_offer_number RPC vergeben).
 *
 * Mapper-Signatur (finance.mapper.ts, verifiziert):
 *   offerPayloadToRow(p, ctx: { id: string; now: string }) → kein `number` im Output
 */
export async function migrateOffers(ctx: MigrationCtx): Promise<number> {
  const now = new Date().toISOString()
  const offers = await invoke<any[]>('get_offers', { workspaceId: ctx.localWsId })
  const rows = offers.map(o => {
    const row = scope(offerPayloadToRow(o, { id: o.id, now }), ctx, o.createdAt)
    row.number = o.number ?? null  // GoBD: Mapper lässt number weg → aus Domain ergänzen
    return row
  })
  await upsertRows('offers', rows)
  return rows.length
}

/**
 * Migriert Angebotspositionen per Delete+Insert je Angebot.
 * Liest vollständiges Angebot via `get_offer` (inkl. items).
 *
 * Mapper-Signatur (finance.mapper.ts, verifiziert):
 *   offerItemPayloadToRow(it, ctx: { id: string; offerId: string })
 */
export async function migrateOfferItems(ctx: MigrationCtx): Promise<number> {
  const offers = await invoke<any[]>('get_offers', { workspaceId: ctx.localWsId })
  let total = 0
  for (const o of offers) {
    const full = await invoke<any>('get_offer', { id: o.id })
    const items: any[] = full?.items ?? []
    await supabase.from('offer_items').delete().eq('offer_id', o.id)
    if (items.length > 0) {
      const rows = items.map(it => offerItemPayloadToRow(it, { id: it.id, offerId: o.id }))
      await upsertRows('offer_items', rows)
      total += rows.length
    }
  }
  return total
}

/**
 * Setzt die Cloud-Nummernkreise auf MAX(number) der migrierten Belege (lückenlose Fortführung).
 * Wird vom Orchestrator NACH runMigration aufgerufen — NICHT in ENTITIES registriert.
 *
 * Verifikation: invoice_sequences(workspace_id PK, next_number, start_number, format, seq_year)
 *               offer_sequences(workspace_id PK, next_number, start_number)
 * GoBD-Korrekt: allocate_invoice/offer_number intern: v_to_use = next_number + 1 → next_number
 * speichert die ZULETZT VERGEBENE Nummer. Daher muss next_number = MAX(lokal) gesetzt werden,
 * damit die nächste Cloud-Vergabe MAX+1 ergibt (kein Sprung, kein Duplikat).
 * Regex: RE-YYYY-NNN → trailing NNN; ANG-YYYY-NNN → trailing NNN.
 */
export async function bumpSequences(ctx: MigrationCtx): Promise<void> {
  const maxOf = (nums: (string | null | undefined)[]): number => {
    const seqs = nums
      .map(n => Number(String(n ?? '').match(/(\d+)\s*$/)?.[1] ?? 0))
      .filter(n => Number.isFinite(n) && n > 0)
    return seqs.length > 0 ? Math.max(...seqs) : 0
  }
  const invoices = await invoke<any[]>('get_invoices', { workspaceId: ctx.localWsId, statusFilter: null })
  const offers   = await invoke<any[]>('get_offers', { workspaceId: ctx.localWsId })
  const [localInvSeq]   = await invoke<any[]>('cmd_dump_table', { table: 'invoice_sequences', workspaceId: ctx.localWsId })
  const [localOfferSeq] = await invoke<any[]>('cmd_dump_table', { table: 'offer_sequences', workspaceId: ctx.localWsId })
  await supabase.from('invoice_sequences').upsert(
    {
      workspace_id: ctx.cloudWsId,
      next_number:  localInvSeq?.next_number ?? maxOf(invoices.map(i => i.number)),
      start_number: localInvSeq?.start_number ?? 1,
      format:       localInvSeq?.format ?? null,
      seq_year:     localInvSeq?.seq_year ?? 0,
    },
    { onConflict: 'workspace_id' },
  )
  await supabase.from('offer_sequences').upsert(
    {
      workspace_id: ctx.cloudWsId,
      next_number:  localOfferSeq?.next_number ?? maxOf(offers.map(o => o.number)),
      start_number: localOfferSeq?.start_number ?? 1,
    },
    { onConflict: 'workspace_id' },
  )
}

/** Parse localStorage value as T[]; returns [] on missing/invalid JSON or non-array. */
function lsParse<T>(key: string): T[] {
  try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}

/** String-encoded JSON array → native array; arrays pass through; anything else → []. */
function asJsonArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : [] } catch { return [] } }
  return []
}

// Cloud column allowlist for `note_folders` (derived from NotesModuleGateway createFolder write-path).
const NOTE_FOLDER_CLOUD_COLS = new Set([
  'id', 'workspace_id', 'created_by', 'account_id', 'name', 'created_at', 'updated_at',
])

// Cloud column allowlist for `note_entries` (derived from NotesModuleGateway createEntry write-path).
const NOTE_ENTRY_CLOUD_COLS = new Set([
  'id', 'workspace_id', 'created_by', 'account_id', 'folder_id',
  'title', 'content', 'tags', 'stickies', 'updated_by', 'created_at', 'updated_at',
])

/**
 * Migriert lokale Verträge (cmd_get_contracts) in die Cloud-Tabelle `vertraege`.
 * items ist bereits natives Array (Mapper liefert Array aus lokalem Rust-Wert).
 * Preserviert created_at aus dem Domain-Objekt.
 *
 * Mapper-Signatur (vertraege.mapper.ts, verifiziert):
 *   vertragPayloadToRow(p: ContractRow, ctx: { createdBy: string })
 *   → enthält workspace_id (aus p.workspaceId), created_by, created_at.
 *   scope() überschreibt workspace_id mit cloudWsId und created_by mit uid.
 */
export async function migrateVertraege(ctx: MigrationCtx): Promise<number> {
  const list = await invoke<any[]>('cmd_get_contracts', { workspaceId: ctx.localWsId })
  const rows = list.map(v => scope(vertragPayloadToRow(v, { createdBy: ctx.uid }), ctx, v.createdAt))
  await upsertRows('vertraege', rows)
  return rows.length
}

/**
 * Migriert lokale Note-Folders in die Cloud-Tabelle `note_folders` via workspace-weitem
 * SQLite-Dump (cmd_dump_table). Projiziert auf Cloud-Spalten-Allowlist, re-scoped
 * workspace_id/created_by, preserviert id + created_at aus dem Rohzeile.
 * Workspace-weiter Dump statt per-Account: vermeidet Datenverlust durch Waisen-Rows.
 */
export async function migrateNoteFolders(ctx: MigrationCtx): Promise<number> {
  const raw = await invoke<Record<string, unknown>[]>('cmd_dump_table', {
    table: 'note_folders',
    workspaceId: ctx.localWsId,
  })
  const rows = raw.map(r => {
    const row: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(r)) {
      if (NOTE_FOLDER_CLOUD_COLS.has(k)) row[k] = v
    }
    row.workspace_id = ctx.cloudWsId
    row.created_by = ctx.uid
    return row
  })
  await upsertRows('note_folders', rows)
  return rows.length
}

/**
 * Migriert lokale Note-Entries in die Cloud-Tabelle `note_entries` via workspace-weitem
 * SQLite-Dump (cmd_dump_table). Projiziert auf Cloud-Spalten-Allowlist, parst
 * tags/stickies JSON-String → jsonb-Array, re-scoped workspace_id/created_by,
 * preserviert id + created_at aus dem Rohzeile.
 * Workspace-weiter Dump statt per-Account: vermeidet Datenverlust durch Waisen-Rows.
 */
export async function migrateNoteEntries(ctx: MigrationCtx): Promise<number> {
  const raw = await invoke<Record<string, unknown>[]>('cmd_dump_table', {
    table: 'note_entries',
    workspaceId: ctx.localWsId,
  })
  const rows = raw.map(r => {
    const row: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(r)) {
      if (NOTE_ENTRY_CLOUD_COLS.has(k)) row[k] = v
    }
    // SQLite stores tags/stickies as JSON strings; cloud expects jsonb arrays.
    row.tags = asJsonArray(row.tags)
    row.stickies = asJsonArray(row.stickies)
    row.workspace_id = ctx.cloudWsId
    row.created_by = ctx.uid
    return row
  })
  await upsertRows('note_entries', rows)
  return rows.length
}

/**
 * Migriert Aufträge aus localStorage (`cynera-auftraege-v1`) in die Cloud-Tabelle `auftraege`.
 * Preserviert created_at (Mapper liefert es aus a.createdAt).
 *
 * Mapper-Signatur (auftraege.mapper.ts, verifiziert):
 *   auftragToRow(a: Auftrag, ctx: { workspaceId: string; createdBy: string })
 */
export async function migrateAuftraege(ctx: MigrationCtx): Promise<number> {
  const rows = lsParse<any>('cynera-auftraege-v1').map(a =>
    scope(auftragToRow(a, { workspaceId: ctx.cloudWsId, createdBy: ctx.uid }), ctx, a.createdAt),
  )
  await upsertRows('auftraege', rows)
  return rows.length
}

/**
 * Migriert Zeiteinträge aus localStorage (`cynera-zeiteintraege-v1`) in die Cloud-Tabelle `zeiteintraege`.
 * created_at wird NICHT injiziert — Zeiteintrag-Typ hat kein createdAt, DB-Default (now()) greift.
 *
 * Mapper-Signatur (auftraege.mapper.ts, verifiziert):
 *   zeiteintragToRow(z: Zeiteintrag, ctx: { workspaceId: string; createdBy: string })
 */
export async function migrateZeiteintraege(ctx: MigrationCtx): Promise<number> {
  const rows = lsParse<any>('cynera-zeiteintraege-v1').map(z =>
    scope(zeiteintragToRow(z, { workspaceId: ctx.cloudWsId, createdBy: ctx.uid }), ctx),
  )
  await upsertRows('zeiteintraege', rows)
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
  { name: 'invoices', run: migrateInvoices },
  { name: 'invoice_items', run: migrateInvoiceItems },
  { name: 'payments', run: migratePayments },
  { name: 'offers', run: migrateOffers },
  { name: 'offer_items', run: migrateOfferItems },
  { name: 'vertraege', run: migrateVertraege },
  { name: 'note_folders', run: migrateNoteFolders },
  { name: 'note_entries', run: migrateNoteEntries },
  { name: 'auftraege', run: migrateAuftraege },
  { name: 'zeiteintraege', run: migrateZeiteintraege },
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
