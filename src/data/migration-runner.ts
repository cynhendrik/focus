import { invoke } from '@tauri-apps/api/core'
import { supabase } from '@/lib/supabase'
import { accountPayloadToRow, leadPayloadToAccountRow } from './accounts.mapper'
import type { Account } from '@/types/account.types'
import type { Lead, UpsertLeadPayload } from '@/types/lead.types'
import type { UpsertAccountPayload } from '@/types/account.types'

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

const ENTITIES: Array<{ name: string; run: (ctx: MigrationCtx) => Promise<number> }> = [
  { name: 'accounts', run: migrateAccounts },
  // weitere Migratoren werden in den Folge-Tasks hier in FK-Reihenfolge eingefügt
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
