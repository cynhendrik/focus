# Accounts/Kunden cloud-first — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `accounts.store` und `customers.store` über `AccountsGateway` routen (solo→Tauri / shared→Supabase), damit Cloud-Rechnungen gültige `account_id`s referenzieren und der FK-Fehler `invoices_account_id_fkey` verschwindet.

**Architecture:** Ein Gateway (`AccountsGateway`) als einziger Cloud-Schreibpfad auf die `accounts`-Tabelle. Beide Stores sind Views auf dieselben Daten (ein Kunde *ist* ein Account); `customers.store` mappt `Account↔Customer` über reine Mapper. Realtime spiegelt Nicht-Lead-Account-Änderungen in beide Stores. `CustomerService` wird aufgelöst, seine Mapper wandern nach `customers.mapper.ts`.

**Tech Stack:** TypeScript, React, Zustand, Supabase-js, Tauri (`@tauri-apps/api/core` `invoke`), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-21-accounts-customers-cloud-first-design.md`

**WICHTIG — nicht anfassen:** `src/App.tsx`, `src/components/leads/LeadDetailModal.tsx`, `src/routes/leverage/LeverageLeadsRoute.tsx` sind uncommittete User-WIP. `App.tsx` braucht **keine** Änderung (Stores routen intern übers Gateway; `init()`/`initCustomers()`/`useWorkspaceRealtime()` sind bereits verdrahtet). Nie `git add -A` — immer nur die in der jeweiligen Task genannten Dateien stagen.

**Test-Befehle:** `npx vitest run <pfad>` für einzelne Dateien, `npm run test:run` für alles. Typecheck: `npx tsc --noEmit`.

---

### Task 1: Supabase-`accounts`-Schema verifizieren (Orchestrator/Mensch)

Dieser Schritt läuft **nicht** im Subagenten — er braucht Zugriff auf den Supabase SQL Editor (Projekt `mqbjmquscjtytpjebosw`). Er stellt sicher, dass die Mapper die richtige Spalten-Repräsentation treffen.

- [ ] **Step 1: Spaltentypen abfragen**

Im Supabase SQL Editor ausführen:

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'accounts'
  and column_name in (
    'account_type','tags','goals','social_links','score_factors',
    'is_private','lead_score','health_score','vat_id','archived_at',
    'primary_deal_id','created_by'
  )
order by column_name;
```

- [ ] **Step 2: Ergebnis festhalten & Mapper-Annahmen prüfen**

Der Plan nimmt an: `tags`/`goals`/`score_factors` = `jsonb`, `social_links` = `text`, `account_type` = `text`, `is_private` = `boolean` ODER `smallint`. Die Mapper sind defensiv (lesen Array **oder** JSON-String; `is_private` via `=== true || === 1`).

Falls `tags`/`goals`/`score_factors` **text** statt jsonb sind: im **Schreib**-Mapper (`accountPayloadToRow`, Task 3) `tags`/`goals` mit `JSON.stringify(...)` umhüllen. Lesen bleibt unverändert (defensiv). Notiere das Ergebnis hier im Plan, falls eine Anpassung nötig ist.

- [ ] **Step 3: Bestätigen, dass `account_type` existiert**

Falls die Spalte fehlt: `alter table public.accounts add column account_type text;` (sollte aus dem Leads-Pilot bereits existieren — nur verifizieren).

---

### Task 2: `customers.mapper.ts` — reine Mapper (aus CustomerService herauslösen)

**Files:**
- Create: `src/data/customers.mapper.ts`
- Test: `src/data/customers.mapper.test.ts`

- [ ] **Step 1: Failing test schreiben**

`src/data/customers.mapper.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { accountToCustomer, customerPayloadToAccountPayload } from './customers.mapper'
import type { Account } from '@/types/account.types'

const account: Account = {
  id: 'a1', workspaceId: 'ws1', createdBy: 'u1', name: 'ACME AG',
  kind: 'company', status: 'prospect', priority: 'vip',
  tags: ['x'], goals: ['g'], isPrivate: false, socialLinks: '{}',
  leadScore: 75, scoreFactors: { qualified_meeting: 25 },
  email: 'a@b.de', phone: '123', vatId: 'DE123',
  archivedAt: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z',
}

describe('customers.mapper', () => {
  it('accountToCustomer übersetzt Status/Priority und Firma', () => {
    const c = accountToCustomer(account)
    expect(c.company).toBe('ACME AG')        // kind=company → company gesetzt
    expect(c.status).toBe('lead')            // prospect → lead
    expect(c.priority).toBe('high')          // vip → high
    expect(c.leadScore).toBe(75)
    expect(c.scoreFactors).toEqual({ qualified_meeting: 25 })
    expect(c.vatId).toBe('DE123')
    expect(c.archivedAt).toBeNull()
  })

  it('accountToCustomer mappt churned → lost', () => {
    expect(accountToCustomer({ ...account, status: 'churned' }).status).toBe('lost')
  })

  it('customerPayloadToAccountPayload übersetzt zurück', () => {
    const p = customerPayloadToAccountPayload({
      workspaceId: 'ws1', createdBy: 'u1', name: 'ACME AG',
      company: 'ACME AG', status: 'lead', priority: 'high', email: 'a@b.de',
    })
    expect(p.kind).toBe('company')           // company gesetzt → company
    expect(p.status).toBe('prospect')        // lead → prospect
    expect(p.priority).toBe('high')
    expect(p.name).toBe('ACME AG')
  })

  it('customerPayloadToAccountPayload ohne company → individual', () => {
    const p = customerPayloadToAccountPayload({ workspaceId: 'ws1', createdBy: 'u1', name: 'Max' })
    expect(p.kind).toBe('individual')
  })
})
```

- [ ] **Step 2: Test laufen lassen, FAIL erwarten**

Run: `npx vitest run src/data/customers.mapper.test.ts`
Expected: FAIL — Modul `./customers.mapper` existiert nicht.

- [ ] **Step 3: Mapper implementieren**

`src/data/customers.mapper.ts`:

```ts
import type { Account, UpsertAccountPayload, AccountStatus, AccountPriority } from '@/types/account.types'
import type { Customer, UpsertCustomerPayload } from '@/types/customer.types'

/** Account-Domänentyp → Customer-View. */
export function accountToCustomer(a: Account): Customer {
  return {
    id: a.id,
    name: a.name,
    company: a.kind === 'company' ? a.name : undefined,
    email: a.email,
    phone: a.phone,
    vatId: a.vatId,
    status: (a.status === 'prospect' ? 'lead' : a.status === 'churned' ? 'lost' : a.status) as Customer['status'],
    priority: (a.priority === 'vip' ? 'high' : a.priority) as Customer['priority'],
    tags: a.tags,
    isPrivate: a.isPrivate,
    workspaceId: a.workspaceId,
    industry: a.industry,
    goals: a.goals,
    socialLinks: a.socialLinks,
    internalNotes: a.internalNotes,
    street: a.street,
    zip: a.zip,
    city: a.city,
    country: a.country,
    leadScore: a.leadScore,
    scoreFactors: a.scoreFactors,
    archivedAt: a.archivedAt ?? null,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  }
}

/** Customer-Upsert-Payload → Account-Upsert-Payload. */
export function customerPayloadToAccountPayload(p: UpsertCustomerPayload): UpsertAccountPayload {
  return {
    id: p.id,
    workspaceId: p.workspaceId,
    createdBy: p.createdBy,
    name: p.name,
    kind: p.company ? 'company' : 'individual',
    industry: p.industry,
    status: (p.status === 'lead' ? 'prospect' : p.status === 'lost' ? 'churned' : p.status) as AccountStatus | undefined,
    priority: p.priority as AccountPriority | undefined,
    tags: p.tags,
    goals: p.goals,
    internalNotes: p.internalNotes,
    socialLinks: p.socialLinks,
    street: p.street,
    zip: p.zip,
    city: p.city,
    country: p.country,
    email: p.email,
    phone: p.phone,
    vatId: p.vatId,
  }
}
```

- [ ] **Step 4: Test laufen lassen, PASS erwarten**

Run: `npx vitest run src/data/customers.mapper.test.ts`
Expected: PASS (4 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/data/customers.mapper.ts src/data/customers.mapper.test.ts
git commit -m "feat(data): customers.mapper (account<->customer, extracted)"
```

---

### Task 3: `accounts.mapper.ts` — Row↔Account-Mapper ergänzen

**Files:**
- Modify: `src/data/accounts.mapper.ts`
- Test: `src/data/accounts.mapper.test.ts`

- [ ] **Step 1: Failing tests anhängen**

Ans Ende von `src/data/accounts.mapper.test.ts` anfügen (Import-Zeile oben ergänzen):

```ts
import { accountRowToAccount, accountPayloadToRow } from './accounts.mapper'

describe('accounts.mapper — generic account', () => {
  const arow = {
    id: 'a1', workspace_id: 'ws1', created_by: 'u1', name: 'ACME AG',
    kind: 'company', industry: 'IT', website: null, status: 'aktiv', priority: 'normal',
    tags: ['vip'], goals: ['wachsen'], health_score: null, internal_notes: null,
    is_private: false, social_links: '{}', primary_deal_id: null,
    lead_score: 12, score_factors: { strong_interest: 50 },
    street: null, zip: null, city: null, country: null,
    email: 'a@b.de', phone: null, vat_id: 'DE1', archived_at: null,
    account_type: 'client',
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z',
  }

  it('accountRowToAccount mappt snake_case → camelCase', () => {
    const a = accountRowToAccount(arow)
    expect(a.workspaceId).toBe('ws1')
    expect(a.createdBy).toBe('u1')
    expect(a.kind).toBe('company')
    expect(a.tags).toEqual(['vip'])
    expect(a.goals).toEqual(['wachsen'])
    expect(a.scoreFactors).toEqual({ strong_interest: 50 })
    expect(a.isPrivate).toBe(false)
    expect(a.vatId).toBe('DE1')
    expect(a.pipelinePhase).toBeUndefined()   // kein Deals-JOIN in der Cloud
  })

  it('accountRowToAccount liest tags/score_factors auch als JSON-String (text-Spalten)', () => {
    const a = accountRowToAccount({ ...arow, tags: '["a","b"]', score_factors: '{"x":1}' })
    expect(a.tags).toEqual(['a', 'b'])
    expect(a.scoreFactors).toEqual({ x: 1 })
  })

  it('accountRowToAccount: is_private smallint 1 → true', () => {
    expect(accountRowToAccount({ ...arow, is_private: 1 }).isPrivate).toBe(true)
  })

  it('accountPayloadToRow setzt account_type=client, created_by, defaults', () => {
    const r = accountPayloadToRow(
      { workspaceId: 'ws1', createdBy: 'u1', name: 'ACME AG' },
      { id: 'a1', now: '2026-01-03T00:00:00Z' },
    )
    expect(r.id).toBe('a1')
    expect(r.account_type).toBe('client')
    expect(r.created_by).toBe('u1')
    expect(r.kind).toBe('company')      // default
    expect(r.status).toBe('aktiv')      // default
    expect(r.priority).toBe('normal')   // default
    expect(r.updated_at).toBe('2026-01-03T00:00:00Z')
  })

  it('accountPayloadToRow enthält kein created_at (DB-Default)', () => {
    const r = accountPayloadToRow(
      { workspaceId: 'ws1', createdBy: 'u1', name: 'X' },
      { id: 'a1', now: '2026-01-03T00:00:00Z' },
    )
    expect(r).not.toHaveProperty('created_at')
    expect(r).not.toHaveProperty('pipeline_phase')
  })
})
```

- [ ] **Step 2: Test laufen lassen, FAIL erwarten**

Run: `npx vitest run src/data/accounts.mapper.test.ts`
Expected: FAIL — `accountRowToAccount`/`accountPayloadToRow` nicht exportiert.

- [ ] **Step 3: Mapper + Helfer in `src/data/accounts.mapper.ts` ergänzen**

Oben den Typ-Import ergänzen und ans Dateiende anhängen:

```ts
import type { Account, UpsertAccountPayload, AccountKind, AccountStatus, AccountPriority } from '@/types/account.types'

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[]
  if (typeof v === 'string') {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : [] } catch { return [] }
  }
  return []
}

function asNumberRecord(v: unknown): Record<string, number> {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, number>
  if (typeof v === 'string') {
    try { const p = JSON.parse(v); return p && typeof p === 'object' ? p : {} } catch { return {} }
  }
  return {}
}

/** Supabase-`accounts`-Zeile (account_type != 'lead') → Account-Domänentyp. */
export function accountRowToAccount(r: any): Account {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    createdBy: r.created_by,
    name: r.name,
    kind: (r.kind ?? 'company') as AccountKind,
    industry: r.industry ?? undefined,
    website: r.website ?? undefined,
    status: (r.status ?? 'aktiv') as AccountStatus,
    priority: (r.priority ?? 'normal') as AccountPriority,
    tags: asStringArray(r.tags),
    goals: asStringArray(r.goals),
    healthScore: r.health_score ?? undefined,
    internalNotes: r.internal_notes ?? undefined,
    isPrivate: r.is_private === true || r.is_private === 1,
    socialLinks: typeof r.social_links === 'string' ? r.social_links : JSON.stringify(r.social_links ?? {}),
    primaryDealId: r.primary_deal_id ?? undefined,
    leadScore: r.lead_score ?? 0,
    scoreFactors: asNumberRecord(r.score_factors),
    street: r.street ?? undefined,
    zip: r.zip ?? undefined,
    city: r.city ?? undefined,
    country: r.country ?? undefined,
    pipelinePhase: undefined,
    pipelinePhaseLabel: undefined,
    email: r.email ?? undefined,
    phone: r.phone ?? undefined,
    vatId: r.vat_id ?? undefined,
    archivedAt: r.archived_at ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

/** UpsertAccountPayload → `accounts`-Row; setzt account_type='client'. */
export function accountPayloadToRow(
  p: UpsertAccountPayload,
  ctx: { id: string; now: string },
): Record<string, unknown> {
  return {
    id: ctx.id,
    workspace_id: p.workspaceId,
    created_by: p.createdBy,
    name: p.name,
    kind: p.kind ?? 'company',
    account_type: 'client',
    industry: p.industry ?? null,
    website: p.website ?? null,
    status: p.status ?? 'aktiv',
    priority: p.priority ?? 'normal',
    tags: p.tags ?? [],
    goals: p.goals ?? [],
    internal_notes: p.internalNotes ?? null,
    social_links: p.socialLinks ?? '{}',
    primary_deal_id: p.primaryDealId ?? null,
    street: p.street ?? null,
    zip: p.zip ?? null,
    city: p.city ?? null,
    country: p.country ?? null,
    email: p.email ?? null,
    phone: p.phone ?? null,
    vat_id: p.vatId ?? null,
    updated_at: ctx.now,
  }
}
```

> Hinweis (siehe Task 1): Falls `tags`/`goals` in Supabase **text** sind, hier `tags: JSON.stringify(p.tags ?? [])` und `goals: JSON.stringify(p.goals ?? [])` verwenden.

- [ ] **Step 4: Test laufen lassen, PASS erwarten**

Run: `npx vitest run src/data/accounts.mapper.test.ts`
Expected: PASS (bestehende Lead-Tests + 5 neue).

- [ ] **Step 5: Commit**

```bash
git add src/data/accounts.mapper.ts src/data/accounts.mapper.test.ts
git commit -m "feat(data): accountRowToAccount + accountPayloadToRow mappers"
```

---

### Task 4: `AccountsGateway` — generische Account-Methoden

**Files:**
- Modify: `src/data/accounts.gateway.ts`
- Test: `src/data/accounts.gateway.test.ts`

- [ ] **Step 1: Failing tests anhängen**

In `src/data/accounts.gateway.test.ts`: oben den Tauri-`invoke`-Mock ergänzen und neue Tests anhängen.

Oben bei den `vi.mock`-Blöcken ergänzen:

```ts
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
```

Den Supabase-Chain-Mock um `upsert`/`single` erweitern (ersetze den bestehenden `supaChain`):

```ts
const supaChain: any = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  or: vi.fn().mockReturnThis(),
  order: vi.fn().mockResolvedValue({ data: [], error: null }),
  update: vi.fn().mockReturnThis(),
  upsert: vi.fn().mockReturnThis(),
  in: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({ data: { id: 'a1', workspace_id: 'ws1', created_by: 'u1', name: 'X', account_type: 'client', created_at: '', updated_at: '' }, error: null }),
  then: (resolve: (v: { error: null }) => unknown) => resolve({ error: null }),
}
```

Neue Tests (am Dateiende, vor der schließenden `})` des describe — oder in eigenem describe):

```ts
import { invoke } from '@tauri-apps/api/core'

describe('AccountsGateway generic accounts', () => {
  beforeEach(() => vi.clearAllMocks())

  it('getAccounts (solo) ruft invoke(get_accounts)', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => false } as any)
    vi.mocked(invoke).mockResolvedValueOnce([])
    await AccountsGateway.getAccounts('ws1')
    expect(invoke).toHaveBeenCalledWith('get_accounts', { workspaceId: 'ws1' })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('getAccounts (shared) liest aus supabase.accounts mit Lead-Ausschluss', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => true } as any)
    await AccountsGateway.getAccounts('ws1')
    expect(supabase.from).toHaveBeenCalledWith('accounts')
    expect(supaChain.or).toHaveBeenCalledWith('account_type.is.null,account_type.neq.lead')
    expect(invoke).not.toHaveBeenCalled()
  })

  it('upsertAccount (solo) ruft invoke(upsert_account)', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => false } as any)
    vi.mocked(invoke).mockResolvedValueOnce({ id: 'a1' })
    await AccountsGateway.upsertAccount({ workspaceId: 'ws1', createdBy: 'u1', name: 'X' })
    expect(invoke).toHaveBeenCalledWith('upsert_account', { payload: expect.objectContaining({ name: 'X' }) })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('upsertAccount (shared) schreibt nach supabase.accounts', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => true } as any)
    await AccountsGateway.upsertAccount({ workspaceId: 'ws1', createdBy: 'u1', name: 'X' })
    expect(supabase.from).toHaveBeenCalledWith('accounts')
    expect(supaChain.upsert).toHaveBeenCalled()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('setArchived (solo) ruft invoke(cmd_set_account_archived)', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => false } as any)
    vi.mocked(invoke).mockResolvedValueOnce({ id: 'a1' })
    await AccountsGateway.setArchived('a1', true)
    expect(invoke).toHaveBeenCalledWith('cmd_set_account_archived', { id: 'a1', archived: true })
  })
})
```

- [ ] **Step 2: Test laufen lassen, FAIL erwarten**

Run: `npx vitest run src/data/accounts.gateway.test.ts`
Expected: FAIL — `getAccounts`/`upsertAccount`/`setArchived` existieren nicht.

- [ ] **Step 3: Gateway-Methoden in `src/data/accounts.gateway.ts` ergänzen**

Imports oben erweitern:

```ts
import { invoke } from '@tauri-apps/api/core'
import { accountRowToAccount, accountPayloadToRow } from './accounts.mapper'
import type { Account, UpsertAccountPayload } from '@/types/account.types'
```

Im `AccountsGateway`-Objekt diese Methoden ergänzen (vor der schließenden `}`):

```ts
  async getAccounts(workspaceId: string): Promise<Account[]> {
    if (!shared()) return invoke<Account[]>('get_accounts', { workspaceId })
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('workspace_id', workspaceId)
      .or('account_type.is.null,account_type.neq.lead')
      .order('name', { ascending: true })
    if (error) throw new Error(error.message)
    return (data ?? []).map(accountRowToAccount).filter(a => !a.isPrivate)
  },

  async upsertAccount(payload: UpsertAccountPayload): Promise<Account> {
    if (!shared()) return invoke<Account>('upsert_account', { payload })
    const id = payload.id ?? crypto.randomUUID()
    const now = new Date().toISOString()
    const row = accountPayloadToRow(payload, { id, now })
    const { data, error } = await supabase
      .from('accounts')
      .upsert(row, { onConflict: 'id' })
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return accountRowToAccount(data)
  },

  async setArchived(id: string, archived: boolean): Promise<Account> {
    if (!shared()) return invoke<Account>('cmd_set_account_archived', { id, archived })
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('accounts')
      .update({ archived_at: archived ? now : null, updated_at: now })
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return accountRowToAccount(data)
  },

  async setPrimaryDeal(accountId: string, dealId: string | null): Promise<Account> {
    if (!shared()) return invoke<Account>('cmd_set_primary_deal', { accountId, dealId })
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('accounts')
      .update({ primary_deal_id: dealId, updated_at: now })
      .eq('id', accountId)
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return accountRowToAccount(data)
  },
```

> `deleteAccount(id, workspaceId)` existiert bereits und wird wiederverwendet (solo: `delete_account`-Command; shared: Supabase-Delete).

- [ ] **Step 4: Test laufen lassen, PASS erwarten**

Run: `npx vitest run src/data/accounts.gateway.test.ts`
Expected: PASS (bestehende Lead-Routing-Tests + 5 neue).

- [ ] **Step 5: Commit**

```bash
git add src/data/accounts.gateway.ts src/data/accounts.gateway.test.ts
git commit -m "feat(data): AccountsGateway generic account CRUD (solo/shared)"
```

---

### Task 5: `accounts.store` über das Gateway routen

**Files:**
- Modify: `src/store/accounts.store.ts`
- Test: `src/store/accounts.store.test.ts` (neu)

- [ ] **Step 1: Failing test schreiben**

`src/store/accounts.store.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/data/accounts.gateway', () => ({
  AccountsGateway: {
    getAccounts: vi.fn(),
    upsertAccount: vi.fn(),
    deleteAccount: vi.fn(),
    setPrimaryDeal: vi.fn(),
  },
}))
vi.mock('@/store/workspace.store', () => ({
  useWorkspaceStore: { getState: () => ({ activeWorkspaceId: 'ws1' }) },
}))
vi.mock('@/store/auth.store', () => ({
  useAuthStore: { getState: () => ({ user: { id: 'u1' } }) },
}))

import { AccountsGateway } from '@/data/accounts.gateway'
import { useAccountsStore } from './accounts.store'
import type { Account } from '@/types/account.types'

const acc: Account = {
  id: 'a1', workspaceId: 'ws1', createdBy: 'u1', name: 'ACME',
  kind: 'company', status: 'aktiv', priority: 'normal', tags: [], goals: [],
  isPrivate: false, socialLinks: '{}', leadScore: 0, scoreFactors: {},
  archivedAt: null, createdAt: '', updatedAt: '',
}

describe('useAccountsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAccountsStore.setState({ accounts: [], isLoading: false })
  })

  it('init lädt Accounts über das Gateway', async () => {
    vi.mocked(AccountsGateway.getAccounts).mockResolvedValueOnce([acc])
    await useAccountsStore.getState().init()
    expect(AccountsGateway.getAccounts).toHaveBeenCalledWith('ws1')
    expect(useAccountsStore.getState().accounts).toEqual([acc])
  })

  it('upsert ruft Gateway und fügt in die Liste ein', async () => {
    vi.mocked(AccountsGateway.upsertAccount).mockResolvedValueOnce(acc)
    await useAccountsStore.getState().upsert({ name: 'ACME' })
    expect(AccountsGateway.upsertAccount).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'ACME', workspaceId: 'ws1', createdBy: 'u1' }),
    )
    expect(useAccountsStore.getState().accounts).toHaveLength(1)
  })

  it('remove ruft Gateway und entfernt aus der Liste', async () => {
    vi.mocked(AccountsGateway.deleteAccount).mockResolvedValueOnce(undefined)
    useAccountsStore.setState({ accounts: [acc], isLoading: false })
    await useAccountsStore.getState().remove('a1')
    expect(AccountsGateway.deleteAccount).toHaveBeenCalledWith('a1', 'ws1')
    expect(useAccountsStore.getState().accounts).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Test laufen lassen, FAIL erwarten**

Run: `npx vitest run src/store/accounts.store.test.ts`
Expected: FAIL — Store ruft noch `invoke`, nicht das Gateway.

- [ ] **Step 3: `src/store/accounts.store.ts` umschreiben**

Komplette Datei ersetzen:

```ts
import { create } from 'zustand'
import { AccountsGateway } from '@/data/accounts.gateway'
import { useWorkspaceStore } from './workspace.store'
import { useAuthStore } from './auth.store'
import { log } from '@/lib/logger'
import type { Account, UpsertAccountPayload } from '@/types/account.types'
import type { AppError } from '@/types/error.types'
import { isAppError, formatError } from '@/types/error.types'

interface AccountsState {
  accounts: Account[]
  isLoading: boolean
  error: AppError | null
  init: () => Promise<void>
  upsert: (payload: Omit<UpsertAccountPayload, 'workspaceId' | 'createdBy'> & { id?: string }) => Promise<Account>
  remove: (id: string) => Promise<void>
  setPrimaryDeal: (accountId: string, dealId: string | null) => Promise<void>
}

function upsertById(list: Account[], updated: Account): Account[] {
  const idx = list.findIndex(a => a.id === updated.id)
  if (idx >= 0) { const next = [...list]; next[idx] = updated; return next }
  return [...list, updated]
}

function toAppError(err: unknown): AppError {
  return isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
}

export const useAccountsStore = create<AccountsState>()((set) => ({
  accounts: [],
  isLoading: false,
  error: null,

  init: async () => {
    const workspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? ''
    set({ isLoading: true, error: null })
    try {
      const accounts = await AccountsGateway.getAccounts(workspaceId)
      set({ accounts, isLoading: false })
    } catch (err) {
      const error = toAppError(err)
      set({ isLoading: false, error })
      log.error('Failed to load accounts', { error })
    }
  },

  upsert: async (payload) => {
    const workspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? ''
    const createdBy = useAuthStore.getState().user?.id ?? ''
    const updated = await AccountsGateway.upsertAccount({ ...payload, workspaceId, createdBy })
    set(s => ({ accounts: upsertById(s.accounts, updated) }))
    return updated
  },

  remove: async (id) => {
    const workspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? ''
    await AccountsGateway.deleteAccount(id, workspaceId)
    set(s => ({ accounts: s.accounts.filter(a => a.id !== id) }))
  },

  setPrimaryDeal: async (accountId, dealId) => {
    const updated = await AccountsGateway.setPrimaryDeal(accountId, dealId)
    set(s => ({ accounts: upsertById(s.accounts, updated) }))
  },
}))
```

- [ ] **Step 4: Test laufen lassen, PASS erwarten**

Run: `npx vitest run src/store/accounts.store.test.ts`
Expected: PASS (3 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/store/accounts.store.ts src/store/accounts.store.test.ts
git commit -m "feat(store): accounts.store routes through AccountsGateway"
```

---

### Task 6: `customers.store` über das Gateway routen; `CustomerService` auflösen

**Files:**
- Modify: `src/store/customers.store.ts`
- Modify: `src/store/customers.store.test.ts`
- Delete: `src/services/customer.service.ts`, `src/services/customer.service.test.ts`

- [ ] **Step 1: Test umschreiben (Gateway statt Service mocken)**

`src/store/customers.store.test.ts` komplett ersetzen:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/data/accounts.gateway', () => ({
  AccountsGateway: {
    getAccounts: vi.fn(),
    upsertAccount: vi.fn(),
    deleteAccount: vi.fn(),
    setArchived: vi.fn(),
  },
}))
vi.mock('@/store/mail.store', () => ({
  useMailStore: { getState: () => ({ rematchCustomers: vi.fn().mockResolvedValue(undefined) }) },
}))
vi.mock('@/store/workspace.store', () => ({
  useWorkspaceStore: { getState: () => ({ activeWorkspaceId: 'ws-1' }) },
}))
vi.mock('@/store/auth.store', () => ({
  useAuthStore: { getState: () => ({ user: { id: 'u-1' } }) },
}))

import { AccountsGateway } from '@/data/accounts.gateway'
import type { Account } from '@/types/account.types'

const acc: Account = {
  id: 'c1', workspaceId: 'ws-1', createdBy: 'u-1', name: 'ACME AG',
  kind: 'company', status: 'aktiv', priority: 'normal', tags: [], goals: [],
  isPrivate: false, socialLinks: '{}', leadScore: 0, scoreFactors: {},
  archivedAt: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
}

describe('useCustomersStore', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { useCustomersStore } = await import('./customers.store')
    useCustomersStore.setState({ customers: [], isLoading: false, error: null })
  })

  it('init lädt Accounts übers Gateway und mappt zu Customer', async () => {
    vi.mocked(AccountsGateway.getAccounts).mockResolvedValueOnce([acc])
    const { useCustomersStore } = await import('./customers.store')
    await useCustomersStore.getState().init()
    expect(AccountsGateway.getAccounts).toHaveBeenCalledWith('ws-1')
    expect(useCustomersStore.getState().customers[0].id).toBe('c1')
    expect(useCustomersStore.getState().customers[0].company).toBe('ACME AG')
  })

  it('upsert ruft Gateway und fügt Customer hinzu', async () => {
    vi.mocked(AccountsGateway.upsertAccount).mockResolvedValueOnce(acc)
    const { useCustomersStore } = await import('./customers.store')
    await useCustomersStore.getState().upsert({ name: 'ACME AG' })
    expect(AccountsGateway.upsertAccount).toHaveBeenCalled()
    expect(useCustomersStore.getState().customers).toHaveLength(1)
  })

  it('remove ruft Gateway und entfernt Customer', async () => {
    vi.mocked(AccountsGateway.deleteAccount).mockResolvedValueOnce(undefined)
    const { useCustomersStore } = await import('./customers.store')
    const { accountToCustomer } = await import('@/data/customers.mapper')
    useCustomersStore.setState({ customers: [accountToCustomer(acc)], isLoading: false, error: null })
    await useCustomersStore.getState().remove('c1')
    expect(AccountsGateway.deleteAccount).toHaveBeenCalledWith('c1', 'ws-1')
    expect(useCustomersStore.getState().customers).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Test laufen lassen, FAIL erwarten**

Run: `npx vitest run src/store/customers.store.test.ts`
Expected: FAIL — Store importiert noch `CustomerService`.

- [ ] **Step 3: `src/store/customers.store.ts` umschreiben**

Ersetze Imports und die vier Methoden (Rest der Datei bleibt). Neue Imports oben:

```ts
import { AccountsGateway } from '@/data/accounts.gateway'
import { accountToCustomer, customerPayloadToAccountPayload } from '@/data/customers.mapper'
```

Entferne `import { CustomerService } from '@/services/customer.service'`.

Methoden ersetzen:

```ts
  init: async () => {
    const workspaceId = getWorkspaceId()
    set({ isLoading: true, error: null })
    try {
      const accounts = await AccountsGateway.getAccounts(workspaceId)
      const customers = accounts.map(accountToCustomer)
      set({ customers, isLoading: false })
      log.info('Customers loaded', { count: customers.length })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
      log.error('Failed to load customers', { error })
    }
  },

  upsert: async (payload) => {
    const workspaceId = getWorkspaceId()
    const createdBy = getCreatedBy()
    try {
      const account = await AccountsGateway.upsertAccount(
        customerPayloadToAccountPayload({ ...payload, workspaceId, createdBy }),
      )
      const updated = accountToCustomer(account)
      set(s => ({ customers: upsertById(s.customers, updated) }))
      {
        const refs = useCustomersStore.getState().customers
          .map(c => ({ id: c.id, email: c.email ?? null }))
        void useMailStore.getState().rematchCustomers(JSON.stringify(refs)).catch(() => {})
      }
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error })
      log.error('Failed to upsert customer', { error })
      throw err
    }
  },

  remove: async (id) => {
    const workspaceId = getWorkspaceId()
    try {
      await AccountsGateway.deleteAccount(id, workspaceId)
      set(s => ({ customers: s.customers.filter(c => c.id !== id) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error })
      log.error('Failed to delete customer', { id, error })
      throw err
    }
  },

  setArchived: async (id, archived) => {
    try {
      const account = await AccountsGateway.setArchived(id, archived)
      const updated = accountToCustomer(account)
      set(s => ({ customers: upsertById(s.customers, updated) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error })
      log.error('Failed to (un)archive customer', { id, archived, error })
      throw err
    }
  },
```

- [ ] **Step 4: `CustomerService` löschen**

```bash
git rm src/services/customer.service.ts src/services/customer.service.test.ts
```

- [ ] **Step 5: Test laufen lassen, PASS erwarten**

Run: `npx vitest run src/store/customers.store.test.ts`
Expected: PASS (3 Tests).

- [ ] **Step 6: Commit**

```bash
git add src/store/customers.store.ts src/store/customers.store.test.ts
git commit -m "feat(store): customers.store via AccountsGateway; drop CustomerService"
```

---

### Task 7: Realtime — Nicht-Lead-Accounts in beide Stores spiegeln

**Files:**
- Create: `src/core/sync/accountsRealtime.ts`
- Test: `src/core/sync/accountsRealtime.test.ts`
- Modify: `src/core/sync/useWorkspaceRealtime.ts`

- [ ] **Step 1: Failing test schreiben**

`src/core/sync/accountsRealtime.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/data/accounts.gateway', () => ({ AccountsGateway: {} }))

import { useLeadsStore } from '@/store/leads.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useCustomersStore } from '@/store/customers.store'
import { applyAccountsRealtimeChange } from './accountsRealtime'

const clientRow = {
  id: 'a1', workspace_id: 'ws1', created_by: 'u1', name: 'ACME',
  kind: 'company', status: 'aktiv', priority: 'normal', tags: [], goals: [],
  is_private: false, social_links: '{}', lead_score: 0, score_factors: {},
  account_type: 'client', archived_at: null, created_at: '', updated_at: '',
}

describe('applyAccountsRealtimeChange', () => {
  beforeEach(() => {
    useLeadsStore.setState({ leads: [], isLoading: false, error: null })
    useAccountsStore.setState({ accounts: [], isLoading: false, error: null } as any)
    useCustomersStore.setState({ customers: [], isLoading: false, error: null })
  })

  it('INSERT eines client-Accounts landet in accounts UND customers', () => {
    applyAccountsRealtimeChange({ eventType: 'INSERT', new: clientRow, old: null })
    expect(useAccountsStore.getState().accounts).toHaveLength(1)
    expect(useCustomersStore.getState().customers).toHaveLength(1)
    expect(useCustomersStore.getState().customers[0].id).toBe('a1')
  })

  it('Wechsel zu account_type=lead entfernt aus accounts/customers und fügt in leads', () => {
    useAccountsStore.setState({ accounts: [{ id: 'a1' } as any], isLoading: false, error: null } as any)
    useCustomersStore.setState({ customers: [{ id: 'a1' } as any], isLoading: false, error: null })
    applyAccountsRealtimeChange({
      eventType: 'UPDATE',
      new: { ...clientRow, account_type: 'lead', lead_status: 'neu', pipeline_stage: 'inbox', lead_source: 'manual' },
      old: clientRow,
    })
    expect(useAccountsStore.getState().accounts).toHaveLength(0)
    expect(useCustomersStore.getState().customers).toHaveLength(0)
    expect(useLeadsStore.getState().leads).toHaveLength(1)
  })

  it('DELETE entfernt aus allen drei Stores', () => {
    useAccountsStore.setState({ accounts: [{ id: 'a1' } as any], isLoading: false, error: null } as any)
    useCustomersStore.setState({ customers: [{ id: 'a1' } as any], isLoading: false, error: null })
    applyAccountsRealtimeChange({ eventType: 'DELETE', new: null, old: { id: 'a1' } })
    expect(useAccountsStore.getState().accounts).toHaveLength(0)
    expect(useCustomersStore.getState().customers).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Test laufen lassen, FAIL erwarten**

Run: `npx vitest run src/core/sync/accountsRealtime.test.ts`
Expected: FAIL — `./accountsRealtime` existiert nicht.

- [ ] **Step 3: `src/core/sync/accountsRealtime.ts` implementieren**

```ts
import { useLeadsStore } from '@/store/leads.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useCustomersStore } from '@/store/customers.store'
import { accountRowToLead, accountRowToAccount } from '@/data/accounts.mapper'
import { accountToCustomer } from '@/data/customers.mapper'

interface AccountChange { eventType: string; new: any; old: any }

function removeFromLeads(id: string) {
  useLeadsStore.setState(s => ({ leads: s.leads.filter(l => l.id !== id) }))
}
function removeFromAccountsAndCustomers(id: string) {
  useAccountsStore.setState(s => ({ accounts: s.accounts.filter(a => a.id !== id) }))
  useCustomersStore.setState(s => ({ customers: s.customers.filter(c => c.id !== id) }))
}

/** Wendet eine Realtime-Änderung der `accounts`-Tabelle auf leads/accounts/customers an. */
export function applyAccountsRealtimeChange(payload: AccountChange) {
  const newRow = payload.new
  const oldRow = payload.old
  const goneId: string | undefined = newRow?.id ?? oldRow?.id

  if (payload.eventType === 'DELETE') {
    if (goneId) { removeFromLeads(goneId); removeFromAccountsAndCustomers(goneId) }
    return
  }
  if (!newRow) return

  if (newRow.account_type === 'lead') {
    const lead = accountRowToLead(newRow)
    useLeadsStore.setState(s => {
      const exists = s.leads.some(l => l.id === lead.id)
      return { leads: exists ? s.leads.map(l => l.id === lead.id ? lead : l) : [lead, ...s.leads] }
    })
    removeFromAccountsAndCustomers(lead.id)
    return
  }

  // Nicht-Lead (client / null). Private Accounts erscheinen nicht in geteilten Listen.
  if (newRow.is_private === true || newRow.is_private === 1) {
    if (goneId) { removeFromLeads(goneId); removeFromAccountsAndCustomers(goneId) }
    return
  }
  const account = accountRowToAccount(newRow)
  useAccountsStore.setState(s => {
    const exists = s.accounts.some(a => a.id === account.id)
    return { accounts: exists ? s.accounts.map(a => a.id === account.id ? account : a) : [...s.accounts, account] }
  })
  const customer = accountToCustomer(account)
  useCustomersStore.setState(s => {
    const exists = s.customers.some(c => c.id === customer.id)
    return { customers: exists ? s.customers.map(c => c.id === customer.id ? customer : c) : [...s.customers, customer] }
  })
  removeFromLeads(account.id)
}
```

- [ ] **Step 4: Test laufen lassen, PASS erwarten**

Run: `npx vitest run src/core/sync/accountsRealtime.test.ts`
Expected: PASS (3 Tests).

- [ ] **Step 5: `useWorkspaceRealtime.ts` den Handler nutzen lassen**

In `src/core/sync/useWorkspaceRealtime.ts`:

Import ergänzen, alten `accountRowToLead`-Import entfernen:

```ts
import { applyAccountsRealtimeChange } from './accountsRealtime'
```

(Die Zeile `import { accountRowToLead } from '@/data/accounts.mapper'` löschen.)

Den gesamten Inline-Handler des `accounts`-Channels (der `(payload) => { ... }`-Block, Zeilen ~22–40) ersetzen durch:

```ts
        (payload) => applyAccountsRealtimeChange(payload as any),
```

Der `finance`-Channel-Block darunter bleibt unverändert.

- [ ] **Step 6: Vollen Testlauf + Typecheck**

Run: `npx vitest run src/core/sync/ && npx tsc --noEmit`
Expected: PASS, keine Typfehler.

- [ ] **Step 7: Commit**

```bash
git add src/core/sync/accountsRealtime.ts src/core/sync/accountsRealtime.test.ts src/core/sync/useWorkspaceRealtime.ts
git commit -m "feat(sync): realtime mirrors non-lead accounts into accounts+customers"
```

---

### Task 8: Verifikation (Typecheck, voller Testlauf, Live-Test)

**Files:** keine.

- [ ] **Step 1: Voller Testlauf**

Run: `npm run test:run`
Expected: alle Tests grün (vorher 243 + neue Mapper/Gateway/Store/Realtime-Tests; `customer.service.test.ts` ist entfernt).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler. Insbesondere keine verwaisten Importe von `@/services/customer.service`.

Run zur Sicherheit: `git grep -n "customer.service"` → darf nur in `docs/` Treffer liefern.

- [ ] **Step 3: Manueller Live-Test (geteilter Workspace)**

Voraussetzung: zwei Logins (`team@cultera.de` als Owner, `hendrikwehe@fn.de` als Member) im geteilten Workspace „CULTERA AGENCY".

Prüfen:
1. **FK-Blocker weg:** Im geteilten Workspace Kunde anlegen → Rechnungs-Formular öffnen → Kunde erscheint im Picker → Rechnung-Entwurf speichern → **kein** `invoices_account_id_fkey`-Fehler.
2. **Konvertierung:** Lead → Kunde machen → Kunde erscheint sofort in der Kundenliste (kein „Verschwinden").
3. **Realtime:** In Instanz A Kunde anlegen/ändern → erscheint live in Instanz B (Accounts- und Kundenliste).
4. **Solo unverändert:** In einem Solo-Workspace Kunden lesen/anlegen/archivieren funktioniert wie zuvor.

- [ ] **Step 4: Abschluss-Notiz**

Falls Task 1 eine Mapper-Anpassung ergab (text statt jsonb), hier vermerken, dass sie eingebaut wurde.

---

## Self-Review Notes

- **Spec-Abdeckung:** Architektur (Task 4–6), Mapper-Auslagerung (Task 2), Row↔Account-Mapper (Task 3), Filterregel `account_type.is.null,neq.lead` (Task 4), Write `account_type:'client'` (Task 3), Realtime in beide Stores (Task 7), Fehlerbehandlung-Angleichung in `accounts.store` (Task 5), Tests (jede Task), Schema-Vorabcheck (Task 1). Erfolgskriterien → Task 8.
- **App.tsx:** bewusst nicht angefasst (WIP + keine Änderung nötig).
- **Typ-Konsistenz:** `getAccounts`/`upsertAccount`/`setArchived`/`setPrimaryDeal`/`deleteAccount` durchgängig gleich benannt in Gateway, Stores, Tests und Realtime. `accountToCustomer`/`customerPayloadToAccountPayload`/`accountRowToAccount`/`accountPayloadToRow` konsistent.
- **Out of scope:** Deals/Pipeline cloud, company_settings, Entwurf-Gating, GoBD-Atomarität.
```
