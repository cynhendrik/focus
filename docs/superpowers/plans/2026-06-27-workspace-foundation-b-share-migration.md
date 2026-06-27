# ① Fundament — Teil B: „Teilen"-Flow + Migrations-Runner — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Einen lokalen Workspace per **„Teilen"** einbahnig in einen Cloud-Workspace verwandeln: Cloud-Workspace anlegen, den cloud-fähigen Kern (Kunden, Kontakte, Deals, Aufgaben/Notizen/Follow-ups, Rechnungen+Positionen, Angebote+Positionen, Zahlungen, Kalender, Verträge, Notizen-Modul, Pipeline/Lead-Stufen, Firmenprofil, Aufträge/Zeiten) idempotent migrieren, auf Cloud flippen und den Beitritts-Code zeigen.

**Architecture:** Dediziertes `src/data/migration-runner.ts` umgeht den Gateway-Switch (während der Migration ist der Workspace noch lokal → `isActiveWorkspaceShared()` ist `false`). Es liest lokal direkt (Tauri `invoke` / `localStorage`) und schreibt Cloud direkt per `supabase.upsert(onConflict:'id')` mit injiziertem `workspace_id`/`created_by`, wobei die **bestehenden Mapper** wiederverwendet werden. Ein Orchestrator (`shareWorkspace`) verkettet Cloud-Anlage → Migration (FK-Reihenfolge) → Flip → Join-Code.

**Tech Stack:** TypeScript (strict), React, Zustand, Supabase, Vitest. Tests kolokiert; `npx vitest run`, `npx tsc --noEmit -p tsconfig.json`.

## Global Constraints

- **Baut auf ①a auf** (gemerged in denselben Branch): `workspace.store` hat `localWorkspaces`, `createLocalWorkspace`, strukturelles `isShared`; `createCloudWorkspaceRecord` wird in Task 1 ergänzt.
- **Spec:** `docs/superpowers/specs/2026-06-27-local-default-workspace-cloud-sharing-design.md` §3/§3a/§3b. Verbindlich.
- **Engine = Ansatz A:** Runner nutzt **Mapper** (`*PayloadToRow`/row-Builder), **nicht** die Gateway-Schreibmethoden (die schalten um bzw. allozieren Nummern). Cloud-Write **immer** `upsert(rows, { onConflict: 'id' })`.
- **Idempotent:** Re-Run erzeugt keine Duplikate (Upsert per id). FK-Reihenfolge gilt auch bei Upsert (Eltern vor Kindern).
- **Erhalten (verbindlich, GoBD/Historie):** Originale `id`, `created_at`, **`number`** (Rechnungen/Angebote — **niemals** `allocate_*_number` aufrufen). `workspace_id`→`cloudWsId`, `created_by`→`uid` injizieren.
- **Sonderfälle:** `invoice_items`/`offer_items` per **Delete+Insert** (kein Upsert-by-id), nach Parent; `company_settings` Singleton `id='singleton'` → Cloud `{ id: cloudWsId, workspace_id: cloudWsId }`; `auftraege`/`zeiteintraege` Quelle = **localStorage** (`cynera-auftraege-v1`/`cynera-zeiteintraege-v1`); nach `invoices`/`offers` Cloud-Sequenz `next_number = MAX(number)+1`.
- **Reihenfolge:** `company_settings → pipeline_stages → lead_stages → accounts → contacts → deals → activities → calendar_events → invoices → invoice_items → payments → offers → offer_items → vertraege → note_folders → note_entries → auftraege → zeiteintraege`.
- **Redundante lazy-Migrationen entfernen:** die „push local stages to cloud"-Blöcke in `PipelineStagesGateway.getAll()` + `LeadStagesGateway.getAll()` und der `MIGRATED_KEY`-localStorage→Cloud-Block in `auftraege.store.ts`.
- **`tsc` sauber + Tests grün.** UI deutsch. Supabase: `import { supabase } from '@/lib/supabase'`.

## Entity-Inventur (verbindliche Referenz für die Migratoren)

Pro Entität: lokaler Read · Cloud-Tabelle · Mapper · Felder, die der Mapper auslässt (Runner muss sie aus dem Lokalrecord ergänzen) · Sonderfall. (Alle Pfade aus dem Code-Audit 2026-06-27.)

| Entität | Lokaler Read | Cloud-Tabelle | Mapper (row-Builder) | Runner ergänzt | Sonderfall |
|---|---|---|---|---|---|
| company_settings | `invoke('get_company_settings')` (Singleton) | company_settings | — (inline) | `id=cloudWsId, workspace_id=cloudWsId, created_by, created_at` | id-Mapping; profile/modules/crm_config sind JSON-Strings → als jsonb-Objekte senden |
| pipeline_stages | `invoke('cmd_get_pipeline_stages',{workspaceId})` | pipeline_stages | `pipelineStageToRow` | `created_at` | is_won/is_lost als 0/1 |
| lead_stages | `invoke('cmd_get_lead_stages',{workspaceId})` | lead_stages | `leadStageToRow` | `created_at` | is_qualified/is_disqualified als 0/1 |
| accounts (clients) | `invoke('get_accounts',{workspaceId})` | accounts | `accountPayloadToRow` | `created_at` | tags=JSON-String (text), goals/social_links=jsonb; setzt account_type='client' |
| accounts (leads) | `invoke('get_leads',{workspaceId})` | accounts | `leadPayloadToAccountRow` | `created_at` | setzt account_type='lead' |
| contacts | `invoke('get_contacts',{accountId})` **pro Account** | contacts | `contactPayloadToRow` | `created_at` | kein workspace-Read → über migrierte Accounts iterieren; is_primary 0/1 |
| deals | `invoke('get_deals_by_workspace',{workspaceId})` | deals | `dealPayloadToRow` | `created_at` | — |
| activities | `invoke('get_activities_by_account',{accountId})` **pro Account** | activities | **NICHT** `activityPayloadToRow` (lässt contact_id/deal_id/outcome/direction/email_id weg) → Row direkt aus Domain bauen | alle Felder + `created_at` | kein workspace-Read; payload string→jsonb |
| calendar_events | `invoke('get_calendar_events',{workspaceId,from:'1970-01-01',to:'2099-12-31'})` | calendar_events | `eventPayloadToRow` | `created_at` | Datumsbereich Pflicht; all_day 0/1 |
| invoices | `invoke('get_invoices',{workspaceId,statusFilter:null})` | invoices | `invoicePayloadToRow` (enthält `number`) | `created_at` | **keine** `allocate_invoice_number`; Items separat |
| invoice_items | aus `invoke('get_invoice',{id})` `.items` pro Rechnung | invoice_items | `invoiceItemPayloadToRow` (ctx.id) | original `id` | **Delete+Insert** je invoice_id, nach invoices |
| payments | `invoke('cmd_get_payments_by_workspace',{workspaceId})` | payments | `paymentPayloadToRow` | `created_at` | — |
| offers | `invoke('get_offers',{workspaceId})` | offers | `offerPayloadToRow` (**ohne** number) | `created_at` + **`number` aus Domain** | **keine** `allocate_offer_number` |
| offer_items | aus `invoke('get_offer',{id})` `.items` pro Angebot | offer_items | `offerItemPayloadToRow` (ctx.id) | original `id` | **Delete+Insert** je offer_id, nach offers |
| vertraege | `invoke('cmd_get_contracts',{workspaceId})` | vertraege | `vertragPayloadToRow` (enthält created_at) | `createdBy` | items jsonb (schon geparst) |
| note_folders | `invoke('get_note_folders',{accountId})` **pro Account** | note_folders | — (inline) | original `id`, `created_at`, `workspace_id`, `created_by` | kein workspace-Read |
| note_entries | `invoke('get_note_entries',{accountId})` **pro Account** | note_entries | — (inline) | original `id`, `created_at`, stickies aus Lokalrecord (nicht []) | kein workspace-Read; tags/stickies String→jsonb |
| auftraege | `JSON.parse(localStorage['cynera-auftraege-v1'])` | auftraege | `auftragToRow` (enthält created_at) | `workspace_id, created_by` | localStorage |
| zeiteintraege | `JSON.parse(localStorage['cynera-zeiteintraege-v1'])` | zeiteintraege | `zeiteintragToRow` | `workspace_id, created_by` | localStorage; kein created_at im Typ |

## File Structure

- `src/store/workspace.store.ts` — `createCloudWorkspaceRecord` (Cloud-Anlage ohne Aktiv-Setzen). (Modify)
- `src/data/migration-runner.ts` — `upsertRows`, die 18 Migratoren, `runMigration`. (Create) + `.test.ts` (Create)
- `src/services/share-workspace.ts` — Orchestrator `shareWorkspace(localWsId, name, onProgress)`. (Create) + `.test.ts` (Create)
- `src/data/pipeline-stages.gateway.ts`, `src/data/lead-stages.gateway.ts`, `src/store/auftraege.store.ts` — lazy-Migrationen entfernen. (Modify)
- `src/components/workspace/ShareWorkspaceButton.tsx` — UI (Button + Confirm + Fortschritt + Join-Code). (Create)
- Einbindung der UI in das bestehende Workspace-Menü/Settings. (Modify)

---

## Task 1: `createCloudWorkspaceRecord` (Cloud-Anlage ohne Nebenwirkung) + Test

**Files:**
- Modify: `src/store/workspace.store.ts`
- Modify: `src/store/workspace.store.test.ts`

**Interfaces:**
- Produces: `createCloudWorkspaceRecord(name: string): Promise<string>` (legt Supabase `workspaces` + `workspace_members`(owner) an, gibt `cloudWsId` zurück; setzt **nicht** aktiv, lädt **nicht** neu).

- [ ] **Step 1: Failing test** — in `workspace.store.test.ts`:
```ts
it('createCloudWorkspaceRecord inserts workspace + membership and returns id, without setting active', async () => {
  // supabase mock: workspaces.insert→select→single liefert { id: 'cloud-1' }, members.insert ok
  useWorkspaceStore.setState({ activeWorkspaceId: 'local-x' })
  const id = await useWorkspaceStore.getState().createCloudWorkspaceRecord('Team')
  expect(id).toBe('cloud-1')
  expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('local-x') // unverändert
})
```
(Nutze das in dieser Test-Datei bereits etablierte `supabase`-Mock-Muster; falls noch keins existiert, mocke `@/lib/supabase` mit `from().insert().select().single()` analog zu vorhandenen Gateway-Tests.)

- [ ] **Step 2: Run → FAIL** (`npx vitest run src/store/workspace.store.test.ts`).

- [ ] **Step 3: Implementierung** — in `workspace.store.ts` die bestehende `createWorkspace`-Cloud-Logik in eine nebenwirkungsfreie Funktion herausziehen und als Aktion exportieren:
```ts
      createCloudWorkspaceRecord: async (name) => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Nicht eingeloggt')
        const { data: ws, error: wsErr } = await supabase
          .from('workspaces')
          .insert({ name, created_by: user.id, join_code: generateJoinCode() })
          .select().single()
        if (wsErr) throw wsErr
        const { error: memberErr } = await supabase
          .from('workspace_members')
          .insert({ workspace_id: ws.id, user_id: user.id, role: 'owner' })
        if (memberErr) throw memberErr
        return ws.id as string
      },
```
Interface-Eintrag ergänzen: `createCloudWorkspaceRecord: (name: string) => Promise<string>`. (Das bestehende `createWorkspace` bleibt vorerst, wird aber vom Picker nicht mehr genutzt — kann später entfallen; nicht in diesem Task anfassen.)

- [ ] **Step 4: Run → PASS. Step 5: tsc + volle Suite grün.**

- [ ] **Step 6: Commit**
```bash
git add src/store/workspace.store.ts src/store/workspace.store.test.ts
git commit -m "feat(workspace): createCloudWorkspaceRecord (side-effect-free cloud workspace creation)"
```

---

## Task 2: Migrations-Runner Kern + `accounts`-Migrator (Muster) + Tests

**Files:**
- Create: `src/data/migration-runner.ts`
- Test: `src/data/migration-runner.test.ts`

**Interfaces:**
- Produces:
  - `upsertRows(table: string, rows: Record<string, unknown>[]): Promise<void>` — chunked `supabase.from(table).upsert(rows, { onConflict: 'id' })` (Chunk 500), No-op bei leer.
  - `MigrationCtx = { localWsId: string; cloudWsId: string; uid: string }`
  - `migrateAccounts(ctx): Promise<number>` — gibt migrierte Zeilenzahl zurück.
  - `runMigration(ctx, onProgress?: (entity: string, n: number) => void): Promise<void>` — ruft die Migratoren in fester Reihenfolge (in diesem Task nur `accounts`; weitere Tasks hängen sich ein).

- [ ] **Step 1: Failing test** — `src/data/migration-runner.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
const upsertMock = vi.fn().mockResolvedValue({ error: null })
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ upsert: upsertMock }) } }))

import { invoke } from '@tauri-apps/api/core'
import { migrateAccounts } from './migration-runner'

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
    const [table, rows] = upsertMock.mock.calls[0]
    expect(table ?? 'accounts') // table passed via from(); assert rows instead
    const row = rows[0]
    expect(row.id).toBe('a1')
    expect(row.workspace_id).toBe('C')
    expect(row.created_by).toBe('U')
    expect(row.created_at).toBe('2025-01-01T00:00:00Z')
  })

  it('is idempotent — a second run upserts the same ids (no duplication semantics)', async () => {
    vi.mocked(invoke).mockResolvedValue([{ id: 'a1', name: 'X', createdAt: 'T', tags: [], isPrivate: false }])
    await migrateAccounts({ localWsId: 'L', cloudWsId: 'C', uid: 'U' })
    await migrateAccounts({ localWsId: 'L', cloudWsId: 'C', uid: 'U' })
    // beide Läufe nutzen upsert(onConflict:id) → kein Duplikat-Pfad; hier: 2 upsert-Calls mit gleicher id
    expect(upsertMock).toHaveBeenCalledTimes(2)
  })
})
```
(Hinweis: `from()` gibt im Mock direkt `{ upsert }` zurück; daher prüfen wir die **rows**, nicht den Tabellennamen. Falls du den Tabellennamen asserten willst, erweitere den Mock zu `from: (t) => { lastTable = t; return { upsert } }`.)

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implementierung** — `src/data/migration-runner.ts`:
```ts
import { invoke } from '@tauri-apps/api/core'
import { supabase } from '@/lib/supabase'
import { accountPayloadToRow, leadPayloadToAccountRow } from './accounts.mapper'
import type { Account, Lead } from '@/types/account.types'

export interface MigrationCtx { localWsId: string; cloudWsId: string; uid: string }

const CHUNK = 500

/** Idempotenter Cloud-Write: upsert per id, in Blöcken. */
export async function upsertRows(table: string, rows: Record<string, unknown>[]): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK)
    const { error } = await supabase.from(table).upsert(slice, { onConflict: 'id' })
    if (error) throw new Error(`${table}: ${error.message}`)
  }
}

/** Gemeinsame Re-scope-Injektion: workspace_id/created_by setzen, created_at erhalten. */
function scope(row: Record<string, unknown>, ctx: MigrationCtx, createdAt?: string): Record<string, unknown> {
  const out = { ...row, workspace_id: ctx.cloudWsId, created_by: ctx.uid }
  if (createdAt !== undefined) out.created_at = createdAt
  return out
}

export async function migrateAccounts(ctx: MigrationCtx): Promise<number> {
  const clients = await invoke<Account[]>('get_accounts', { workspaceId: ctx.localWsId })
  const leads   = await invoke<Lead[]>('get_leads', { workspaceId: ctx.localWsId })
  const rows = [
    ...clients.map(a => scope(accountPayloadToRow(a as any, { id: a.id, createdBy: ctx.uid }), ctx, (a as any).createdAt)),
    ...leads.map(l => scope(leadPayloadToAccountRow(l as any, { id: l.id, createdBy: ctx.uid }), ctx, (l as any).createdAt)),
  ]
  await upsertRows('accounts', rows)
  return rows.length
}

const ENTITIES: Array<{ name: string; run: (ctx: MigrationCtx) => Promise<number> }> = [
  { name: 'accounts', run: migrateAccounts },
  // weitere Migratoren werden in den Folge-Tasks hier in FK-Reihenfolge eingefügt
]

export async function runMigration(ctx: MigrationCtx, onProgress?: (entity: string, n: number) => void): Promise<void> {
  for (const e of ENTITIES) {
    const n = await e.run(ctx)
    onProgress?.(e.name, n)
  }
}
```
**Wichtig:** Die exakte Signatur von `accountPayloadToRow`/`leadPayloadToAccountRow` (Argument-Form `ctx`) in `accounts.mapper.ts` prüfen und den Aufruf daran anpassen (der Mapper setzt `account_type`; `scope()` überschreibt nur workspace_id/created_by/created_at). Falls der Mapper `id` nicht aus dem Payload übernimmt, `id` in `scope` mit ergänzen: `out.id = a.id`.

- [ ] **Step 4: Run → PASS. Step 5: tsc + volle Suite grün.**

- [ ] **Step 6: Commit**
```bash
git add src/data/migration-runner.ts src/data/migration-runner.test.ts
git commit -m "feat(share): migration runner core + accounts migrator + tests"
```

---

## Task 3: CRM-Migratoren — contacts, deals, activities

**Files:**
- Modify: `src/data/migration-runner.ts`, `src/data/migration-runner.test.ts`

**Interfaces:**
- Consumes: `MigrationCtx`, `upsertRows`, `scope`, die migrierten Accounts (für per-Account-Reads).
- Produces: `migrateContacts(ctx)`, `migrateDeals(ctx)`, `migrateActivities(ctx)`; in `ENTITIES` nach `accounts` in Reihenfolge `contacts, deals, activities` eingehängt.

- [ ] **Step 1: Failing tests** — je Migrator ein Test (idempotenter Upsert, re-scope, created_at erhalten). Muster für `contacts` (iteriert Accounts):
```ts
it('migrateContacts iterates accounts and upserts contacts re-scoped', async () => {
  vi.mocked(invoke).mockImplementation(async (cmd: string, args: any) => {
    if (cmd === 'get_accounts') return [{ id: 'a1' }]
    if (cmd === 'get_leads') return []
    if (cmd === 'get_contacts' && args.accountId === 'a1') return [{ id: 'k1', accountId: 'a1', name: 'P', createdAt: 'T' }]
    return []
  })
  const n = await migrateContacts({ localWsId: 'L', cloudWsId: 'C', uid: 'U' })
  expect(n).toBe(1)
  expect(upsertMock.mock.calls.at(-1)![0][0]).toMatchObject({ id: 'k1', workspace_id: 'C', created_by: 'U', created_at: 'T' })
})
```
(`deals`: `get_deals_by_workspace`. `activities`: `get_activities_by_account` pro Account; Row **direkt aus Domain** bauen — NICHT `activityPayloadToRow` — damit contact_id/deal_id/outcome/direction/email_id erhalten bleiben; `payload` String→Objekt parsen.)

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implementierung** — in `migration-runner.ts` (Mapper-Importe ergänzen). Helper für die Account-IDs:
```ts
async function localAccountIds(ctx: MigrationCtx): Promise<string[]> {
  const clients = await invoke<{ id: string }[]>('get_accounts', { workspaceId: ctx.localWsId })
  const leads   = await invoke<{ id: string }[]>('get_leads', { workspaceId: ctx.localWsId })
  return [...clients, ...leads].map(a => a.id)
}

export async function migrateContacts(ctx: MigrationCtx): Promise<number> {
  const ids = await localAccountIds(ctx)
  const rows: Record<string, unknown>[] = []
  for (const accountId of ids) {
    const contacts = await invoke<any[]>('get_contacts', { accountId })
    for (const c of contacts) rows.push(scope(contactPayloadToRow(c, { id: c.id, createdBy: ctx.uid }), ctx, c.createdAt))
  }
  await upsertRows('contacts', rows)
  return rows.length
}

export async function migrateDeals(ctx: MigrationCtx): Promise<number> {
  const deals = await invoke<any[]>('get_deals_by_workspace', { workspaceId: ctx.localWsId })
  const rows = deals.map(d => scope(dealPayloadToRow(d, { id: d.id, createdBy: ctx.uid }), ctx, d.createdAt))
  await upsertRows('deals', rows)
  return rows.length
}

export async function migrateActivities(ctx: MigrationCtx): Promise<number> {
  const ids = await localAccountIds(ctx)
  const rows: Record<string, unknown>[] = []
  for (const accountId of ids) {
    const acts = await invoke<any[]>('get_activities_by_account', { accountId })
    for (const a of acts) {
      rows.push(scope({
        id: a.id, account_id: a.accountId ?? null, contact_id: a.contactId ?? null,
        deal_id: a.dealId ?? null, type: a.type, title: a.title ?? null, body: a.body ?? null,
        outcome: a.outcome ?? null, direction: a.direction ?? null, email_id: a.emailId ?? null,
        assignee: a.assignee ?? null, status: a.status ?? null, due_date: a.dueDate ?? null,
        payload: typeof a.payload === 'string' ? JSON.parse(a.payload || '{}') : (a.payload ?? {}),
        updated_at: a.updatedAt ?? a.createdAt,
      }, ctx, a.createdAt))
    }
  }
  await upsertRows('activities', rows)
  return rows.length
}
```
**Wichtig:** Die Domain-Feldnamen (`Activity`/`Contact`/`Deal` in `src/types/`) und die exakte Cloud-Spaltenliste der `activities`-Tabelle gegen `src-tauri/src/db/activity.rs` + die Supabase-Tabelle prüfen und die Row-Felder daran ausrichten (oben ist die aus dem Audit abgeleitete Liste; fehlt/zu viel → anpassen, kein unbekanntes Feld senden). In `ENTITIES` ergänzen: `{ name:'contacts', run: migrateContacts }, { name:'deals', run: migrateDeals }, { name:'activities', run: migrateActivities }` nach `accounts`.

- [ ] **Step 4: Run → PASS. Step 5: tsc + Suite grün.**

- [ ] **Step 6: Commit**
```bash
git add src/data/migration-runner.ts src/data/migration-runner.test.ts
git commit -m "feat(share): contacts/deals/activities migrators"
```

---

## Task 4: Config-Migratoren — company_settings, pipeline_stages, lead_stages, calendar_events

**Files:**
- Modify: `src/data/migration-runner.ts`, `src/data/migration-runner.test.ts`

**Interfaces:**
- Produces: `migrateCompanySettings`, `migratePipelineStages`, `migrateLeadStages`, `migrateCalendar`; in `ENTITIES` **vor** `accounts` (company/pipeline/lead) bzw. nach `activities` (calendar) gemäß Gesamtreihenfolge.

- [ ] **Step 1: Failing tests** — `company_settings` (Singleton→cloudWsId), stages (0/1-Bools), calendar (Datumsbereich). Muster company_settings:
```ts
it('migrateCompanySettings maps singleton to cloud id + workspace_id and parses json', async () => {
  vi.mocked(invoke).mockResolvedValue({ profile: '{"name":"X"}', modules: '{}', crmConfig: '{}' })
  const n = await migrateCompanySettings({ localWsId: 'L', cloudWsId: 'C', uid: 'U' })
  expect(n).toBe(1)
  const row = upsertMock.mock.calls.at(-1)![0][0]
  expect(row).toMatchObject({ id: 'C', workspace_id: 'C', created_by: 'U' })
  expect(row.profile).toEqual({ name: 'X' })
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implementierung**:
```ts
function parseMaybe(v: unknown): unknown { return typeof v === 'string' ? JSON.parse(v || 'null') : v }

export async function migrateCompanySettings(ctx: MigrationCtx): Promise<number> {
  const cs = await invoke<any>('get_company_settings')
  if (!cs) return 0
  await upsertRows('company_settings', [{
    id: ctx.cloudWsId, workspace_id: ctx.cloudWsId, created_by: ctx.uid,
    profile: parseMaybe(cs.profile), modules: parseMaybe(cs.modules), crm_config: parseMaybe(cs.crmConfig),
    updated_at: new Date().toISOString(),
  }])
  return 1
}

export async function migratePipelineStages(ctx: MigrationCtx): Promise<number> {
  const stages = await invoke<any[]>('cmd_get_pipeline_stages', { workspaceId: ctx.localWsId })
  const rows = stages.map(s => scope(pipelineStageToRow(s, { createdBy: ctx.uid }), ctx, s.createdAt))
  await upsertRows('pipeline_stages', rows)
  return rows.length
}

export async function migrateLeadStages(ctx: MigrationCtx): Promise<number> {
  const stages = await invoke<any[]>('cmd_get_lead_stages', { workspaceId: ctx.localWsId })
  const rows = stages.map(s => scope(leadStageToRow(s, { createdBy: ctx.uid }), ctx, s.createdAt))
  await upsertRows('lead_stages', rows)
  return rows.length
}

export async function migrateCalendar(ctx: MigrationCtx): Promise<number> {
  const events = await invoke<any[]>('get_calendar_events', { workspaceId: ctx.localWsId, from: '1970-01-01', to: '2099-12-31' })
  const rows = events.map(e => scope(eventPayloadToRow(e, { id: e.id, createdBy: ctx.uid }), ctx, e.createdAt))
  await upsertRows('calendar_events', rows)
  return rows.length
}
```
Mapper-Signaturen prüfen (`pipelineStageToRow`/`leadStageToRow`/`eventPayloadToRow` ctx-Form). In `ENTITIES` korrekt einsortieren: `company_settings, pipeline_stages, lead_stages` vor `accounts`; `calendar_events` nach `activities`.

- [ ] **Step 4: Run → PASS. Step 5: tsc + Suite grün.**

- [ ] **Step 6: Commit**
```bash
git add src/data/migration-runner.ts src/data/migration-runner.test.ts
git commit -m "feat(share): company_settings/pipeline/lead-stages/calendar migrators"
```

---

## Task 5: Finance-Migratoren — invoices(+items), payments, offers(+items) + Sequenz-Continuity

**Files:**
- Modify: `src/data/migration-runner.ts`, `src/data/migration-runner.test.ts`

**Interfaces:**
- Produces: `migrateInvoices`, `migrateInvoiceItems`, `migratePayments`, `migrateOffers`, `migrateOfferItems`, `bumpSequences`; in `ENTITIES` in Reihenfolge `invoices → invoice_items → payments → offers → offer_items` (nach calendar_events).

- [ ] **Step 1: Failing tests** — Schwerpunkte: (a) `number` wird **erhalten** und **kein** `allocate_*`-RPC aufgerufen; (b) items per Delete+Insert je Parent; (c) `bumpSequences` setzt `next_number = MAX+1`. Muster:
```ts
it('migrateInvoices preserves number and does NOT allocate', async () => {
  vi.mocked(invoke).mockImplementation(async (cmd: string) =>
    cmd === 'get_invoices' ? [{ id: 'i1', number: 'RE-2025-007', createdAt: 'T', items: undefined }] : [])
  await migrateInvoices({ localWsId: 'L', cloudWsId: 'C', uid: 'U' })
  const row = upsertMock.mock.calls.at(-1)![0][0]
  expect(row.number).toBe('RE-2025-007')
  expect(row.workspace_id).toBe('C')
})
```
(Für items braucht der supabase-Mock zusätzlich `delete().eq()` — erweitere den Mock: `from: (t) => ({ upsert: upsertMock, delete: () => ({ eq: deleteEqMock }) })`.)

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implementierung**:
```ts
export async function migrateInvoices(ctx: MigrationCtx): Promise<number> {
  const invoices = await invoke<any[]>('get_invoices', { workspaceId: ctx.localWsId, statusFilter: null })
  const rows = invoices.map(inv => {
    const row = scope(invoicePayloadToRow(inv, { id: inv.id, createdBy: ctx.uid }), ctx, inv.createdAt)
    row.number = inv.number ?? null   // explizit erhalten (kein allocate)
    return row
  })
  await upsertRows('invoices', rows)
  return rows.length
}

export async function migrateInvoiceItems(ctx: MigrationCtx): Promise<number> {
  const invoices = await invoke<any[]>('get_invoices', { workspaceId: ctx.localWsId, statusFilter: null })
  let total = 0
  for (const inv of invoices) {
    const full = await invoke<any>('get_invoice', { id: inv.id })
    const items = full?.items ?? []
    await supabase.from('invoice_items').delete().eq('invoice_id', inv.id)   // idempotent
    if (items.length) {
      const rows = items.map((it: any) => invoiceItemPayloadToRow(it, { id: it.id }))
      await upsertRows('invoice_items', rows)
      total += rows.length
    }
  }
  return total
}

export async function migratePayments(ctx: MigrationCtx): Promise<number> {
  const pays = await invoke<any[]>('cmd_get_payments_by_workspace', { workspaceId: ctx.localWsId })
  const rows = pays.map(p => scope(paymentPayloadToRow(p, { id: p.id, createdBy: ctx.uid }), ctx, p.createdAt))
  await upsertRows('payments', rows)
  return rows.length
}

export async function migrateOffers(ctx: MigrationCtx): Promise<number> {
  const offers = await invoke<any[]>('get_offers', { workspaceId: ctx.localWsId })
  const rows = offers.map(o => {
    const row = scope(offerPayloadToRow(o, { id: o.id, createdBy: ctx.uid }), ctx, o.createdAt)
    row.number = o.number ?? null   // Mapper lässt number weg → aus Domain ergänzen
    return row
  })
  await upsertRows('offers', rows)
  return rows.length
}

export async function migrateOfferItems(ctx: MigrationCtx): Promise<number> {
  const offers = await invoke<any[]>('get_offers', { workspaceId: ctx.localWsId })
  let total = 0
  for (const o of offers) {
    const full = await invoke<any>('get_offer', { id: o.id })
    const items = full?.items ?? []
    await supabase.from('offer_items').delete().eq('offer_id', o.id)
    if (items.length) {
      const rows = items.map((it: any) => offerItemPayloadToRow(it, { id: it.id }))
      await upsertRows('offer_items', rows)
      total += rows.length
    }
  }
  return total
}

/** Cloud-Nummernkreise auf MAX(number)+1 der migrierten Belege setzen (lückenlose Fortführung). */
export async function bumpSequences(ctx: MigrationCtx): Promise<void> {
  const nextOf = (nums: (string | null | undefined)[]) => {
    const seqs = nums.map(n => Number(String(n ?? '').match(/(\d+)\s*$/)?.[1] ?? 0)).filter(Number.isFinite)
    return (seqs.length ? Math.max(...seqs) : 0) + 1
  }
  const invoices = await invoke<any[]>('get_invoices', { workspaceId: ctx.localWsId, statusFilter: null })
  const offers   = await invoke<any[]>('get_offers', { workspaceId: ctx.localWsId })
  await supabase.from('invoice_sequences').upsert(
    { workspace_id: ctx.cloudWsId, next_number: nextOf(invoices.map(i => i.number)) }, { onConflict: 'workspace_id' })
  await supabase.from('offer_sequences').upsert(
    { workspace_id: ctx.cloudWsId, next_number: nextOf(offers.map(o => o.number)) }, { onConflict: 'workspace_id' })
}
```
**Wichtig:** Cloud-Schema von `invoice_sequences`/`offer_sequences` prüfen (Spaltennamen `next_number`/`workspace_id`, PK) und `bumpSequences` daran ausrichten; die Nummern-Regex an das tatsächliche Format (`RE-YYYY-NNN`/`ANG-YYYY-NNN`) anpassen. `bumpSequences` wird im Orchestrator **nach** `runMigration` aufgerufen (Task 6), nicht in `ENTITIES`. In `ENTITIES`: `invoices, invoice_items, payments, offers, offer_items` in dieser Reihenfolge nach `calendar_events`.

- [ ] **Step 4: Run → PASS. Step 5: tsc + Suite grün.**

- [ ] **Step 6: Commit**
```bash
git add src/data/migration-runner.ts src/data/migration-runner.test.ts
git commit -m "feat(share): finance migrators (invoices/items/payments/offers/items) + sequence continuity"
```

---

## Task 6: Restliche Migratoren — vertraege, note_folders, note_entries, auftraege, zeiteintraege

**Files:**
- Modify: `src/data/migration-runner.ts`, `src/data/migration-runner.test.ts`

**Interfaces:**
- Produces: `migrateVertraege`, `migrateNoteFolders`, `migrateNoteEntries`, `migrateAuftraege`, `migrateZeiteintraege`; in `ENTITIES` in Reihenfolge `vertraege → note_folders → note_entries → auftraege → zeiteintraege` (am Ende).

- [ ] **Step 1: Failing tests** — Schwerpunkte: note_entries `stickies` aus Lokalrecord (nicht `[]`), tags String→Array; auftraege/zeiteintraege aus **localStorage** gelesen + workspace_id/created_by ergänzt. Muster localStorage:
```ts
it('migrateAuftraege reads localStorage and re-scopes', async () => {
  localStorage.setItem('cynera-auftraege-v1', JSON.stringify([{ id: 'au1', title: 'T', createdAt: 'T' }]))
  const n = await migrateAuftraege({ localWsId: 'L', cloudWsId: 'C', uid: 'U' })
  expect(n).toBe(1)
  expect(upsertMock.mock.calls.at(-1)![0][0]).toMatchObject({ id: 'au1', workspace_id: 'C', created_by: 'U' })
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implementierung**:
```ts
function lsParse<T>(key: string): T[] {
  try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}
function asJsonArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : [] } catch { return [] } }
  return []
}

export async function migrateVertraege(ctx: MigrationCtx): Promise<number> {
  const list = await invoke<any[]>('cmd_get_contracts', { workspaceId: ctx.localWsId })
  const rows = list.map(v => scope(vertragPayloadToRow(v, { createdBy: ctx.uid }), ctx, v.createdAt))
  await upsertRows('vertraege', rows)
  return rows.length
}

export async function migrateNoteFolders(ctx: MigrationCtx): Promise<number> {
  const ids = await localAccountIds(ctx)
  const rows: Record<string, unknown>[] = []
  for (const accountId of ids) {
    const folders = await invoke<any[]>('get_note_folders', { accountId })
    for (const f of folders) rows.push(scope({ id: f.id, account_id: accountId, name: f.name, updated_at: f.updatedAt ?? f.createdAt }, ctx, f.createdAt))
  }
  await upsertRows('note_folders', rows)
  return rows.length
}

export async function migrateNoteEntries(ctx: MigrationCtx): Promise<number> {
  const ids = await localAccountIds(ctx)
  const rows: Record<string, unknown>[] = []
  for (const accountId of ids) {
    const entries = await invoke<any[]>('get_note_entries', { accountId })
    for (const e of entries) rows.push(scope({
      id: e.id, account_id: accountId, folder_id: e.folderId ?? null, title: e.title ?? null,
      content: e.content ?? '', tags: asJsonArray(e.tags), stickies: asJsonArray(e.stickies),
      updated_by: null, updated_at: e.updatedAt ?? e.createdAt,
    }, ctx, e.createdAt))
  }
  await upsertRows('note_entries', rows)
  return rows.length
}

export async function migrateAuftraege(ctx: MigrationCtx): Promise<number> {
  const rows = lsParse<any>('cynera-auftraege-v1').map(a => scope(auftragToRow(a, { workspaceId: ctx.cloudWsId, createdBy: ctx.uid }), ctx, a.createdAt))
  await upsertRows('auftraege', rows)
  return rows.length
}

export async function migrateZeiteintraege(ctx: MigrationCtx): Promise<number> {
  const rows = lsParse<any>('cynera-zeiteintraege-v1').map(z => scope(zeiteintragToRow(z, { workspaceId: ctx.cloudWsId, createdBy: ctx.uid }), ctx))
  await upsertRows('zeiteintraege', rows)
  return rows.length
}
```
**Wichtig:** Mapper-Signaturen (`vertragPayloadToRow`, `auftragToRow`, `zeiteintragToRow`) + Cloud-Spalten von `note_folders`/`note_entries` (gegen Migration 0017) prüfen und Felder angleichen. In `ENTITIES` am Ende anhängen: `vertraege, note_folders, note_entries, auftraege, zeiteintraege`.

- [ ] **Step 4: Run → PASS. Step 5: tsc + Suite grün.**

- [ ] **Step 6: Commit**
```bash
git add src/data/migration-runner.ts src/data/migration-runner.test.ts
git commit -m "feat(share): vertraege/notes/auftraege/zeiten migrators — runner complete (18 entities)"
```

---

## Task 7: Orchestrator `shareWorkspace` + redundante lazy-Migrationen entfernen + Test

**Files:**
- Create: `src/services/share-workspace.ts`
- Test: `src/services/share-workspace.test.ts`
- Modify: `src/data/pipeline-stages.gateway.ts`, `src/data/lead-stages.gateway.ts`, `src/store/auftraege.store.ts`

**Interfaces:**
- Consumes: `createCloudWorkspaceRecord` (Task 1), `runMigration` + `bumpSequences` (Task 2–6), `useWorkspaceStore`, `useAuthStore`.
- Produces: `shareWorkspace(localWsId: string, name: string, onProgress?): Promise<{ cloudWsId: string; joinCode: string | null }>`.

- [ ] **Step 1: Failing test** — `share-workspace.test.ts`: mockt `createCloudWorkspaceRecord`→'C', `runMigration`/`bumpSequences`, prüft: Reihenfolge (Cloud-Anlage **vor** Migration), nach Erfolg `loadWorkspaces` + `setActiveWorkspace('C')` aufgerufen, lokalen Workspace als migriert markiert, joinCode zurückgegeben. Bei Migrationsfehler: **kein** Flip (activeWorkspaceId unverändert).
```ts
it('shares: creates cloud, migrates, then flips active + returns join code', async () => {
  // mocks: createCloudWorkspaceRecord→'C', runMigration→resolves, supabase join_code select→'ABC123'
  const res = await shareWorkspace('L', 'Team')
  expect(res.cloudWsId).toBe('C')
  expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('C')
})
it('does not flip active when migration fails', async () => {
  // runMigration rejects
  useWorkspaceStore.setState({ activeWorkspaceId: 'L' })
  await expect(shareWorkspace('L', 'Team')).rejects.toThrow()
  expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('L')
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implementierung** — `src/services/share-workspace.ts`:
```ts
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { runMigration, bumpSequences } from '@/data/migration-runner'

export async function shareWorkspace(
  localWsId: string, name: string,
  onProgress?: (entity: string, n: number) => void,
): Promise<{ cloudWsId: string; joinCode: string | null }> {
  const uid = useAuthStore.getState().user?.id
  if (!uid) throw new Error('Nicht eingeloggt')

  const cloudWsId = await useWorkspaceStore.getState().createCloudWorkspaceRecord(name)
  await runMigration({ localWsId, cloudWsId, uid }, onProgress)
  await bumpSequences({ localWsId, cloudWsId, uid })

  // Erst NACH erfolgreicher Migration flippen:
  await useWorkspaceStore.getState().loadWorkspaces()      // lädt Cloud-Workspace (isShared:true)
  useWorkspaceStore.setState((s) => ({
    localWorkspaces: s.localWorkspaces.filter(w => w.id !== localWsId),  // lokalen als migriert entfernen
  }))
  useWorkspaceStore.getState().setActiveWorkspace(cloudWsId)

  const joinCode = useWorkspaceStore.getState().workspaces.find(w => w.id === cloudWsId)?.join_code ?? null
  return { cloudWsId, joinCode }
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Redundante lazy-Migrationen entfernen** (feuern sonst unkontrolliert):
  - `src/data/pipeline-stages.gateway.ts` — den Block in `getAll()`, der bei leerem Cloud-Store lokale Stages hochschiebt, entfernen (nur normales Cloud-Read behalten).
  - `src/data/lead-stages.gateway.ts` — analog.
  - `src/store/auftraege.store.ts` — den `MIGRATED_KEY`-localStorage→Cloud-Auto-Migrationsblock entfernen.
  Nach jedem Entfernen: tsc + Suite. (Falls Tests diese lazy-Migration prüfen, entsprechende Tests anpassen/entfernen.)

- [ ] **Step 6: tsc + volle Suite grün.**

- [ ] **Step 7: Commit**
```bash
git add src/services/share-workspace.ts src/services/share-workspace.test.ts src/data/pipeline-stages.gateway.ts src/data/lead-stages.gateway.ts src/store/auftraege.store.ts
git commit -m "feat(share): shareWorkspace orchestrator + remove redundant lazy-migrations"
```

---

## Task 8: „Teilen"-UI — Button, Confirm, Fortschritt, Join-Code

**Files:**
- Create: `src/components/workspace/ShareWorkspaceButton.tsx`
- Modify: Einbindungsort (Workspace-Menü/Settings — siehe Step 3).

**Interfaces:**
- Consumes: `shareWorkspace` (Task 7), `useWorkspaceStore` (active + localWorkspaces).
- Produces: `ShareWorkspaceButton` — nur sichtbar, wenn der aktive Workspace **lokal** ist.

- [ ] **Step 1: Komponente** — `src/components/workspace/ShareWorkspaceButton.tsx`:
```tsx
import { useState } from 'react'
import { Share2 } from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspace.store'
import { shareWorkspace } from '@/services/share-workspace'

export function ShareWorkspaceButton() {
  const activeId = useWorkspaceStore(s => s.activeWorkspaceId)
  const localWorkspaces = useWorkspaceStore(s => s.localWorkspaces)
  const local = localWorkspaces.find(w => w.id === activeId)
  const [phase, setPhase] = useState<'idle' | 'confirm' | 'running' | 'done'>('idle')
  const [progress, setProgress] = useState<string>('')
  const [joinCode, setJoinCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!local) return null  // nur für lokale Workspaces

  const run = async () => {
    setPhase('running'); setError(null)
    try {
      const res = await shareWorkspace(local.id, local.name, (entity, n) => setProgress(`${entity}: ${n}`))
      setJoinCode(res.joinCode); setPhase('done')
    } catch (e) {
      setError(String(e)); setPhase('confirm')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {phase === 'idle' && (
        <button className="btn-ghost" onClick={() => setPhase('confirm')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '7px 16px' }}>
          <Share2 size={13} /> Workspace teilen
        </button>
      )}
      {phase === 'confirm' && (
        <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span>Dieser Workspace wird dauerhaft in die Cloud verschoben (einbahnig). Deine Daten werden hochgeladen.</span>
          {error && <span style={{ color: 'var(--danger)' }}>Fehler: {error}. Erneut versuchen ist sicher.</span>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" onClick={run} style={{ fontSize: 12, padding: '6px 14px' }}>Jetzt teilen</button>
            <button className="btn-ghost" onClick={() => setPhase('idle')} style={{ fontSize: 12, padding: '6px 14px' }}>Abbrechen</button>
          </div>
        </div>
      )}
      {phase === 'running' && <span style={{ fontSize: 12, color: 'var(--fg-dim)' }}>Migriere … {progress}</span>}
      {phase === 'done' && (
        <div style={{ fontSize: 12.5, color: 'var(--fg)' }}>
          ✓ Geteilt. Beitritts-Code für dein Team: <strong style={{ fontFamily: 'var(--font-mono)' }}>{joinCode ?? '—'}</strong>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: tsc sauber.**

- [ ] **Step 3: Einbinden** — die Komponente an einer sinnvollen Stelle rendern: in den Workspace-/Einstellungen-Bereich (z. B. dort, wo `JoinCodeRow`/Workspace-Settings gezeigt werden, oder im `WorkspaceSwitcher`-Dropdown). Lies den vorhandenen Workspace-Settings-Bereich und füge `<ShareWorkspaceButton />` an passender Stelle ein (nur ein Einbindungspunkt; die Komponente versteckt sich selbst, wenn der aktive Workspace nicht lokal ist).

- [ ] **Step 4: tsc + volle Suite grün.**

- [ ] **Step 5: Commit**
```bash
git add src/components/workspace/ShareWorkspaceButton.tsx <einbindungsdatei>
git commit -m "feat(share): 'Workspace teilen' UI (confirm, progress, join code)"
```

---

## Abschluss-Verifikation Teil B

- [ ] `npx tsc --noEmit -p tsconfig.json` → sauber.
- [ ] `npx vitest run` → grün (inkl. aller Migrator- + Orchestrator-Tests).
- [ ] **Manuell (2 Logins):** lokalen Workspace mit Daten (Kunden, Rechnung mit Positionen + Nummer, Aufgabe, Notiz, Angebot) → „Workspace teilen" → Fortschritt läuft → Cloud-Workspace aktiv, Daten **inkl. Rechnungsnummern + Items** vorhanden → Beitritts-Code anzeigen → 2. Login tritt per Code bei → beide sehen + ändern alles; Team-Chat/Zuweisung live. Re-Run von „Teilen" (falls Abbruch) erzeugt keine Duplikate.

## Self-Review (gegen Spec §3/§3a/§3b)

- §3a dediziertes `migration-runner.ts`, Gateway-Switch umgangen, Mapper reused → Task 2–6 ✅.
- §3b Upsert-not-insert (Runner schreibt selbst per upsert) ✅; Nummern erhalten + keine RPC (Task 5) ✅; created_at erhalten (`scope`) ✅; items Delete+Insert (Task 5) ✅; company_settings Singleton-Mapping (Task 4) ✅; auftraege/zeiteintraege localStorage (Task 6) ✅; Sequenz-Continuity (Task 5 `bumpSequences`) ✅; redundante lazy-Migrationen entfernt (Task 7) ✅.
- §3 Reihenfolge in `ENTITIES` (FK) ✅; Flip erst nach Erfolg + Realtime via `loadWorkspaces`+`setActiveWorkspace` (Task 7) ✅; Join-Code (Task 7/8) ✅.
- **Offen/Folge:** Solo-Cloud-mit-Lokaldaten-Erkennung (§5) ist defensiv und für die Tester-Lage nicht nötig — separat, nicht in B. KPIs/Dateien/Automationen/Kampagnen → ②③④.
- **Implementer-Hinweis:** Jeder Migrator MUSS seine Cloud-Zielspalten + Mapper-Signatur gegen den echten Code/das Supabase-Schema prüfen (die Inventur-Tabelle ist die Vorlage); **kein unbekanntes Feld** an Supabase senden (sonst PostgREST-Fehler).

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-27-workspace-foundation-b-share-migration.md`. Zwei Optionen: 1) Subagent-Driven (empfohlen), 2) Inline. Welcher Ansatz?**
