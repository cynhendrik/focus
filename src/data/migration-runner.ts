import { invoke } from '@tauri-apps/api/core'
import { supabase } from '@/lib/supabase'
import { accountPayloadToRow, leadPayloadToAccountRow } from './accounts.mapper'
import { contactPayloadToRow } from './contacts.mapper'
import { dealPayloadToRow } from './deals.mapper'
import type { Account } from '@/types/account.types'
import type { Lead, UpsertLeadPayload } from '@/types/lead.types'
import type { UpsertAccountPayload } from '@/types/account.types'
import type { UpsertContactPayload } from '@/types/contact.types'
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

/**
 * Migriert lokale Contacts (pro Account) in die Cloud-Tabelle `contacts`.
 *
 * Mapper-Signatur (contacts.mapper.ts, verifiziert):
 *   contactPayloadToRow(p: UpsertContactPayload, ctx: { id: string; now: string })
 * ctx.now → updated_at; created_by kommt aus p.createdBy; scope() überschreibt workspace_id/created_by/created_at.
 */
export async function migrateContacts(ctx: MigrationCtx): Promise<number> {
  const now = new Date().toISOString()
  const ids = await localAccountIds(ctx)
  const rows: Record<string, unknown>[] = []
  for (const accountId of ids) {
    const contacts = await invoke<any[]>('get_contacts', { accountId })
    for (const c of contacts) {
      rows.push(scope(
        contactPayloadToRow(c as unknown as UpsertContactPayload, { id: c.id, now }),
        ctx,
        c.createdAt,
      ))
    }
  }
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

/**
 * Migriert lokale Activities (pro Account) in die Cloud-Tabelle `activities`.
 * Row wird DIREKT aus dem Activity-Domänenobjekt gebaut (NICHT activityPayloadToRow),
 * damit contact_id/deal_id/outcome/direction/email_id erhalten bleiben.
 * payload: String→Objekt parsen (lokales SQLite speichert als JSON-String).
 *
 * Cloud-Spalten (aus activity.rs SELECT + Activity-Struct verifiziert):
 *   id, workspace_id, created_by, account_id, contact_id, deal_id,
 *   type, title, body, payload (jsonb), status, due_at, assignee,
 *   outcome, direction, email_id, created_at, updated_at
 * Nicht gesendet: customer_id (nur lokal, nicht im Activity-Struct).
 */
export async function migrateActivities(ctx: MigrationCtx): Promise<number> {
  const ids = await localAccountIds(ctx)
  const rows: Record<string, unknown>[] = []
  for (const accountId of ids) {
    const acts = await invoke<any[]>('get_activities_by_account', { accountId })
    for (const a of acts) {
      rows.push(scope({
        id: a.id,
        account_id: a.accountId ?? null,
        contact_id: a.contactId ?? null,
        deal_id: a.dealId ?? null,
        type: a.type,
        title: a.title ?? null,
        body: a.body ?? null,
        outcome: a.outcome ?? null,
        direction: a.direction ?? null,
        email_id: a.emailId ?? null,
        assignee: a.assignee ?? null,
        status: a.status ?? null,
        due_at: a.dueAt ?? null,
        payload: typeof a.payload === 'string' ? JSON.parse(a.payload || '{}') : (a.payload ?? {}),
        updated_at: a.updatedAt ?? a.createdAt,
      }, ctx, a.createdAt))
    }
  }
  await upsertRows('activities', rows)
  return rows.length
}

const ENTITIES: Array<{ name: string; run: (ctx: MigrationCtx) => Promise<number> }> = [
  { name: 'accounts', run: migrateAccounts },
  { name: 'contacts', run: migrateContacts },
  { name: 'deals', run: migrateDeals },
  { name: 'activities', run: migrateActivities },
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
