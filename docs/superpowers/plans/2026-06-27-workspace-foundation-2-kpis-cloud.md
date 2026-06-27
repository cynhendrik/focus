# ② KPIs cloud-first — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kunden-KPIs cloud-fähig machen (eigene Supabase-Tabelle + RLS + Realtime + dual-path Gateway), den `kpis.store` darüber routen, und KPIs in den „Teilen"-Migrations-Runner aufnehmen — damit im geteilten Workspace **beide** Mitglieder dieselben KPIs sehen/bearbeiten.

**Architecture:** Identisches cloud-first-Muster wie `calendar`/`note_entries`: `if (!isActiveWorkspaceShared()) → lokal (KpiService/SQLite) else → Supabase`. Domain-`Kpi.customerId` ↔ Cloud-Spalte `account_id` (wie `customers`↔`accounts`). Migration `0022` legt die Cloud-Tabelle an (idempotent, RLS `is_workspace_member`, Realtime). Der bestehende `migration-runner` bekommt `migrateKpis` (liest via `cmd_dump_table('kpis', …)`).

**Tech Stack:** TypeScript (strict), React, Zustand, Supabase/Postgres, Vitest. Tests kolokiert; `npx vitest run`, `npx tsc --noEmit -p tsconfig.json`. Migration via Management-API/PAT gegen `mqbjmquscjtytpjebosw` (wird vom Controller angewandt).

## Global Constraints

- **Programm-Kontext:** baut auf ①a+①b (lokal-Standard + Teilen-Migration). Spec: `docs/superpowers/specs/2026-06-27-local-default-workspace-cloud-sharing-design.md` (Teilprojekt ②).
- **Lokales `kpis`-Schema (post-v5, live):** `id text pk, workspace_id text, created_by text, account_id text REFERENCES accounts(id) ON DELETE CASCADE, label text, value real, unit text, target real, period text, pending_sync int, updated_at text`. **Kein `created_at`.**
- **Domain-Typ `Kpi`** nutzt `customerId` (= cloud `account_id`). Mapper bildet das ab (wie `customers.mapper`/`accounts`).
- **Cloud-Tabelle `kpis` hat `created_by`** (von dieser Migration angelegt) → Migrator nutzt `scope()` mit created_by. **Kein `created_at`** (wie lokal) → Migrator gibt created_at NICHT mit.
- **dual-path Gateway** nach Vorlage `src/data/calendar.gateway.ts`: `shared()` aus `useWorkspaceStore.getState().isActiveWorkspaceShared()`; `fail(error)` Helper; lokaler Zweig delegiert an `KpiService`.
- **RLS** wie `note_entries` (0017): `for all using (is_workspace_member(workspace_id)) with check (is_workspace_member(workspace_id))`. Realtime: `replica identity full` + `alter publication supabase_realtime add table public.kpis`.
- **`tsc` sauber + Tests grün.** UI deutsch. Supabase-Client `@/lib/supabase`.

## File Structure

- `supabase/migrations/0022_kpis_cloud.sql` — Cloud-Tabelle + RLS + Realtime. (Create; Controller wendet an)
- `src/data/kpis.mapper.ts` (+ `.test.ts`) — `kpiRowToKpi` / `kpiPayloadToRow`. (Create)
- `src/data/kpis.gateway.ts` — dual-path `getByCustomer`/`upsert`/`delete`. (Create)
- `src/store/kpis.store.ts` — über Gateway statt KpiService routen. (Modify)
- `src/core/sync/useWorkspaceRealtime.ts` — kpis-Subscription. (Modify)
- `src/data/migration-runner.ts` (+ `.test.ts`) — `migrateKpis` + in `ENTITIES`. (Modify)

---

## Task 1: Migration `0022_kpis_cloud.sql`

**Files:**
- Create: `supabase/migrations/0022_kpis_cloud.sql`

**Interfaces:**
- Produces: Cloud-Tabelle `public.kpis` (+ RLS + Realtime).

- [ ] **Step 1: Migrationsdatei schreiben**
```sql
-- 0022_kpis_cloud.sql — Kunden-KPIs cloud-first (Teilprojekt ② der Workspace-Sharing-Suite).
-- Spalten spiegeln die lokale post-v5 SQLite-Tabelle (account_id → accounts, kein created_at).
create table if not exists public.kpis (
  id            text primary key,
  workspace_id  text not null,
  created_by    uuid not null,
  account_id    text not null references public.accounts(id) on delete cascade,
  label         text not null,
  value         double precision,
  unit          text,
  target        double precision,
  period        text,
  updated_at    text not null default (now())::text
);
create index if not exists kpis_account_idx on public.kpis (account_id);

alter table public.kpis enable row level security;
drop policy if exists "workspace member" on public.kpis;
create policy "workspace member" on public.kpis
  for all using (is_workspace_member(workspace_id)) with check (is_workspace_member(workspace_id));

alter table public.kpis replica identity full;
alter publication supabase_realtime add table public.kpis;
```

- [ ] **Step 2: Commit** (Anwendung übernimmt der Controller via PAT)
```bash
git add supabase/migrations/0022_kpis_cloud.sql
git commit -m "feat(kpis): migration 0022 cloud kpis table + RLS + realtime"
```

---

## Task 2: `kpis.mapper.ts` + Tests

**Files:**
- Create: `src/data/kpis.mapper.ts`
- Test: `src/data/kpis.mapper.test.ts`

**Interfaces:**
- Consumes: `Kpi`, `UpsertKpiPayload` (`@/types/kpi.types`).
- Produces: `kpiRowToKpi(r: any): Kpi`; `kpiPayloadToRow(p: UpsertKpiPayload, ctx: { id: string; workspaceId: string; createdBy: string; now: string }): Record<string, unknown>`.

- [ ] **Step 1: Failing test `src/data/kpis.mapper.test.ts`**
```ts
import { describe, it, expect } from 'vitest'
import { kpiRowToKpi, kpiPayloadToRow } from './kpis.mapper'

describe('kpiRowToKpi', () => {
  it('maps account_id → customerId and snake→camel', () => {
    const k = kpiRowToKpi({ id: 'k1', workspace_id: 'w', created_by: 'u', account_id: 'a1', label: 'MRR', value: 5, unit: '€', target: 10, period: 'M', updated_at: 'T' })
    expect(k).toEqual({ id: 'k1', customerId: 'a1', label: 'MRR', value: 5, unit: '€', target: 10, period: 'M', updatedAt: 'T' })
  })
  it('null-ish numerics become undefined', () => {
    const k = kpiRowToKpi({ id: 'k1', account_id: 'a1', label: 'X', value: null, unit: null, target: null, period: null, updated_at: 'T' })
    expect(k.value).toBeUndefined(); expect(k.unit).toBeUndefined()
  })
})

describe('kpiPayloadToRow', () => {
  it('maps customerId → account_id, sets audit fields, no created_at', () => {
    const row = kpiPayloadToRow(
      { id: 'k1', customerId: 'a1', label: 'MRR', value: 5 },
      { id: 'k1', workspaceId: 'w', createdBy: 'u', now: 'T' },
    )
    expect(row).toMatchObject({ id: 'k1', workspace_id: 'w', created_by: 'u', account_id: 'a1', label: 'MRR', value: 5, updated_at: 'T' })
    expect(row).not.toHaveProperty('created_at')
  })
})
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run src/data/kpis.mapper.test.ts`).

- [ ] **Step 3: `src/data/kpis.mapper.ts`**
```ts
import type { Kpi, UpsertKpiPayload } from '@/types/kpi.types'

/** Supabase-`kpis`-Zeile → Kpi (account_id → customerId). */
export function kpiRowToKpi(r: any): Kpi {
  return {
    id:         r.id,
    customerId: r.account_id,
    label:      r.label,
    value:      r.value ?? undefined,
    unit:       r.unit ?? undefined,
    target:     r.target ?? undefined,
    period:     r.period ?? undefined,
    updatedAt:  r.updated_at,
  }
}

/** UpsertKpiPayload → `kpis`-Row (customerId → account_id). Kein created_at (wie lokal). */
export function kpiPayloadToRow(
  p: UpsertKpiPayload,
  ctx: { id: string; workspaceId: string; createdBy: string; now: string },
): Record<string, unknown> {
  return {
    id:           ctx.id,
    workspace_id: ctx.workspaceId,
    created_by:   ctx.createdBy,
    account_id:   p.customerId,
    label:        p.label,
    value:        p.value ?? null,
    unit:         p.unit ?? null,
    target:       p.target ?? null,
    period:       p.period ?? null,
    updated_at:   ctx.now,
  }
}
```

- [ ] **Step 4: Run → PASS. Step 5: tsc sauber. Step 6: Commit**
```bash
git add src/data/kpis.mapper.ts src/data/kpis.mapper.test.ts
git commit -m "feat(kpis): mapper (account_id<->customerId) + tests"
```

---

## Task 3: `kpis.gateway.ts` (dual-path)

**Files:**
- Create: `src/data/kpis.gateway.ts`

**Interfaces:**
- Consumes: `supabase`, `useWorkspaceStore`, `KpiService`, `kpiRowToKpi`/`kpiPayloadToRow`, `useAuthStore`.
- Produces: `KpisGateway` mit `getByCustomer(accountId, workspaceId)`, `upsert(payload, workspaceId)`, `delete(id, workspaceId)`.

- [ ] **Step 1: `src/data/kpis.gateway.ts`** (Muster: `calendar.gateway.ts`)
```ts
import { invoke } from '@tauri-apps/api/core'
import { supabase } from '@/lib/supabase'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { kpiRowToKpi, kpiPayloadToRow } from './kpis.mapper'
import type { Kpi, UpsertKpiPayload } from '@/types/kpi.types'

function shared(): boolean { return useWorkspaceStore.getState().isActiveWorkspaceShared() }
function fail(error: { message?: string; details?: string; hint?: string; code?: string } | null): never {
  const e = error ?? {}
  const msg = [e.message, e.details, e.hint].filter(Boolean).join(' — ') || 'Unbekannter Supabase-Fehler'
  throw new Error(e.code ? `${msg} (${e.code})` : msg)
}

export const KpisGateway = {
  async getByCustomer(accountId: string): Promise<Kpi[]> {
    if (!shared()) return invoke<Kpi[]>('get_kpis', { customerId: accountId })
    const { data, error } = await supabase.from('kpis').select('*').eq('account_id', accountId)
    if (error) fail(error)
    return (data ?? []).map(kpiRowToKpi)
  },

  async upsert(payload: UpsertKpiPayload): Promise<Kpi> {
    if (!shared()) return invoke<Kpi>('upsert_kpi', { payload })
    const id = payload.id ?? crypto.randomUUID()
    const workspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? ''
    const createdBy = useAuthStore.getState().user?.id ?? ''
    const row = kpiPayloadToRow(payload, { id, workspaceId, createdBy, now: new Date().toISOString() })
    const { data, error } = await supabase.from('kpis').upsert(row, { onConflict: 'id' }).select('*').single()
    if (error) fail(error)
    return kpiRowToKpi(data)
  },

  async delete(id: string): Promise<void> {
    if (!shared()) { await invoke<void>('delete_kpi', { id }); return }
    const { error } = await supabase.from('kpis').delete().eq('id', id)
    if (error) fail(error)
  },
}
```

- [ ] **Step 2: tsc sauber. Step 3: Commit**
```bash
git add src/data/kpis.gateway.ts
git commit -m "feat(kpis): dual-path gateway (local KpiService / cloud supabase)"
```

---

## Task 4: `kpis.store` über Gateway routen

**Files:**
- Modify: `src/store/kpis.store.ts`

**Interfaces:**
- Consumes: `KpisGateway` statt `KpiService`.

- [ ] **Step 1: Import + Aufrufe ersetzen** — in `src/store/kpis.store.ts`:
  - Import `import { KpisGateway } from '@/data/kpis.gateway'` (statt `KpiService`).
  - `loadForCustomer`: `await KpisGateway.getByCustomer(customerId)`.
  - `upsert`: `await KpisGateway.upsert(payload)`.
  - `remove`: `await KpisGateway.delete(id)`.
  (Struktur/Fehlerbehandlung unverändert; nur die drei Aufrufe.)

- [ ] **Step 2: tsc sauber. Step 3: Bestehende Tests grün** (`npx vitest run`). **Step 4: Commit**
```bash
git add src/store/kpis.store.ts
git commit -m "feat(kpis): route kpis store through dual-path gateway"
```

---

## Task 5: Realtime-Subscription für `kpis`

**Files:**
- Modify: `src/core/sync/useWorkspaceRealtime.ts`

**Interfaces:**
- Consumes: `useKpisStore` (currentCustomerId-äquivalent), bestehendes Channel-Muster.

- [ ] **Step 1: Subscription ergänzen** — im selben `.channel('ws-accounts-…')`-Aufbau (wo die anderen workspace-scoped `.on(...)` hängen), vor `.subscribe(...)`:
```ts
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'kpis', filter: `workspace_id=eq.${activeWorkspaceId}` },
        () => {
          const ks = useKpisStore.getState()
          // KPIs sind kunden-scoped; aktuell geladenen Kunden live nachladen.
          const accId = (ks as any).currentAccountId ?? null
          if (accId) ks.loadForCustomer(accId)
        },
      )
```
Import oben ergänzen: `import { useKpisStore } from '@/store/kpis.store'`.
**Hinweis:** Falls `kpis.store` keinen „aktuell geladenen Kunden" hält, in Task 4 ein Feld `currentCustomerId` ergänzen (in `loadForCustomer` setzen) und hier darauf zugreifen — andernfalls den geladenen Kunden über die bestehende Kunden-Selektion (`useUiStore.selectedCustomerId`) bestimmen. Der Implementer wählt den im Code vorhandenen, konsistenten Weg und dokumentiert ihn.

- [ ] **Step 2: tsc sauber. Step 3: Bestehende Tests grün. Step 4: Commit**
```bash
git add src/core/sync/useWorkspaceRealtime.ts src/store/kpis.store.ts
git commit -m "feat(kpis): realtime subscription for kpis"
```

---

## Task 6: `migrateKpis` im Migrations-Runner

**Files:**
- Modify: `src/data/migration-runner.ts`
- Test: `src/data/migration-runner.test.ts`

**Interfaces:**
- Consumes: `cmd_dump_table` (Rust, existiert), `upsertRows`, `scope`, `MigrationCtx`.
- Produces: `migrateKpis(ctx): Promise<number>`; in `ENTITIES` direkt **nach `accounts`** (FK `account_id → accounts`).

- [ ] **Step 1: Failing test** — in `migration-runner.test.ts` (Muster wie note_folders: raw dump → re-scope → allowlist):
```ts
it('migrateKpis dumps workspace kpis and re-scopes (account_id link kept, no created_at)', async () => {
  vi.mocked(invoke).mockImplementation(async (cmd: string, args: any) =>
    cmd === 'cmd_dump_table' && args.table === 'kpis'
      ? [{ id: 'k1', workspace_id: 'L', created_by: 'old', account_id: 'a1', label: 'MRR', value: 5, unit: '€', target: 10, period: 'M', updated_at: 'T', pending_sync: 0 }]
      : [])
  const n = await migrateKpis({ localWsId: 'L', cloudWsId: 'C', uid: 'U' })
  expect(n).toBe(1)
  const row = upsertMock.mock.calls.at(-1)![0][0]
  expect(row).toMatchObject({ id: 'k1', workspace_id: 'C', created_by: 'U', account_id: 'a1', label: 'MRR', updated_at: 'T' })
  expect(row).not.toHaveProperty('pending_sync')   // local-only column excluded
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implementierung** — in `migration-runner.ts`:
```ts
const KPI_CLOUD_COLS = new Set(['id','workspace_id','created_by','account_id','label','value','unit','target','period','updated_at'])

export async function migrateKpis(ctx: MigrationCtx): Promise<number> {
  const raw = await invoke<any[]>('cmd_dump_table', { table: 'kpis', workspaceId: ctx.localWsId })
  const rows = raw.map(r => {
    const row: Record<string, unknown> = {}
    for (const k of Object.keys(r)) if (KPI_CLOUD_COLS.has(k)) row[k] = r[k]
    row.workspace_id = ctx.cloudWsId
    row.created_by = ctx.uid
    return row   // updated_at bleibt aus der Rohzeile erhalten; kein created_at
  })
  await upsertRows('kpis', rows)
  return rows.length
}
```
In `ENTITIES` direkt nach dem `accounts`-Eintrag einfügen: `{ name: 'kpis', run: migrateKpis }`.
(Allowlist-Projektion wie note_folders/note_entries; `pending_sync` u. a. lokale Spalten fallen weg. `scope()` wird hier nicht genutzt, weil wir Rohzeilen projizieren — das Re-scope passiert manuell, analog note_*.)

- [ ] **Step 4: Run → PASS. Step 5: tsc sauber. Step 6: Bestehende Tests grün. Step 7: Commit**
```bash
git add src/data/migration-runner.ts src/data/migration-runner.test.ts
git commit -m "feat(kpis): migrateKpis in share migration runner (after accounts)"
```

---

## Abschluss-Verifikation ②

- [ ] `npx tsc --noEmit -p tsconfig.json` → sauber.
- [ ] `npx vitest run` → grün (inkl. kpis-Mapper + migrateKpis-Tests).
- [ ] Migration `0022` vom Controller live angewandt + verifiziert (Tabelle + RLS-Policy + Realtime-Publication vorhanden).
- [ ] **Manuell:** im lokalen Workspace KPI an einem Kunden anlegen → „Workspace teilen" → KPI ist in der Cloud beim Kunden vorhanden; 2. Login sieht/ändert sie live.

## Self-Review (gegen Spec ②)
- Cloud-Tabelle + RLS + Realtime (Task 1/5) ✅; dual-path Gateway + Mapper (Task 2/3) ✅; Store geroutet (Task 4) ✅; in Migration aufgenommen (Task 6) ✅.
- Naming `customerId`↔`account_id` im Mapper gekapselt; cloud `kpis` hat `created_by` (Migration), kein `created_at` (wie lokal) → Migrator gibt created_at nicht mit.
- FK-Reihenfolge: kpis nach accounts.

## Execution Handoff
**Plan gespeichert unter `docs/superpowers/plans/2026-06-27-workspace-foundation-2-kpis-cloud.md`. Subagent-Driven (empfohlen) oder Inline?**
