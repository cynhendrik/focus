# Activities cloud-first — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Notizen + Aktivitäts-Timeline + Follow-ups übers neue `ActivitiesGateway` routen (solo→Tauri / shared→Supabase) + Realtime, sodass sie im geteilten Workspace funktionieren.

**Architecture:** Spiegelt Accounts/Customers: ein `ActivitiesGateway` über die `activities`-Tabelle, zwei Store-Views (`useNotesStore`, `useActivitiesStore`) via Mapper. RLS ist schon workspace-scoped (kein DDL).

**Tech Stack:** TypeScript, Zustand, supabase-js, Tauri invoke, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-21-activities-cloud-first-design.md`

**Nicht anfassen (WIP):** `src/App.tsx`, `src/components/leads/LeadDetailModal.tsx`, `src/routes/leverage/LeverageLeadsRoute.tsx`, `src-tauri/Cargo.toml`. Nie `git add -A`.

**Befehle:** `npx vitest run <pfad>`; voll `npm run test:run`; `npx tsc --noEmit`.

**Referenz-Fakten:**
- `activities`-Spalten: id, workspace_id, created_by, account_id, contact_id, deal_id, customer_id, type, title, body, payload(jsonb default {}), status(default open), due_at, assignee, outcome, direction, email_id, pending_sync(default 0), created_at(NOT NULL **kein** Default), updated_at(NOT NULL **kein** Default).
- Typen aus `@/types/pipeline.types`: `Activity` (id, workspaceId, createdBy, accountId, customerId?, type, title?, body?, payload?, status, dueAt?, createdAt, updatedAt); `CreateActivityPayload` (workspaceId, createdBy, accountId, customerId?, type, title?, body?, payload?, durationMinutes?, status?, dueAt?, direction?); `UpdateActivityPayload` (title?, body?, status?, dueAt?).
- `Note`/`UpsertNotePayload` aus `@/types/note.types`. Note-Mapping-Logik steht aktuell in `src/services/note.service.ts` (`activityToNote` + der Payload-Bau in `upsert`).
- Tauri-Commands: `get_activities_by_account {accountId}`, `get_activities_by_customer {customerId}`, `get_open_followups {workspaceId}`, `create_activity {payload}`, `update_activity {id, payload}`, `delete_activity {id}`.
- Follow-up-Query (Rust): `where workspace_id=X and type='followup' and status='open' order by due_at asc nulls last, created_at asc`.
- `shared()`/`fail()`-Muster wie in `finance.gateway.ts`.

---

### Task 1: `activities.mapper.ts`

**Files:** Create `src/data/activities.mapper.ts`, `src/data/activities.mapper.test.ts`

- [ ] **Step 1: Failing test** — `src/data/activities.mapper.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { activityRowToActivity, activityPayloadToRow, activityUpdateToPatch } from './activities.mapper'

const row = {
  id: 'a1', workspace_id: 'ws1', created_by: 'u1', account_id: 'acc1', customer_id: 'acc1',
  type: 'note', title: 'T', body: 'B', payload: { note_type: 'gespraech', pinned: true },
  status: 'open', due_at: null, created_at: '2026-01-01', updated_at: '2026-01-02',
}

describe('activities.mapper', () => {
  it('activityRowToActivity: snake→camel, payload jsonb→String', () => {
    const a = activityRowToActivity(row)
    expect(a.workspaceId).toBe('ws1')
    expect(a.accountId).toBe('acc1')
    expect(a.customerId).toBe('acc1')
    expect(a.type).toBe('note')
    expect(typeof a.payload).toBe('string')
    expect(JSON.parse(a.payload!)).toEqual({ note_type: 'gespraech', pinned: true })
    expect(a.createdAt).toBe('2026-01-01')
  })
  it('activityRowToActivity: payload als String wird durchgereicht', () => {
    const a = activityRowToActivity({ ...row, payload: '{"x":1}' })
    expect(a.payload).toBe('{"x":1}')
  })
  it('activityPayloadToRow: payload String→Objekt, created_at+updated_at gesetzt, beide ID-Spalten', () => {
    const r = activityPayloadToRow(
      { workspaceId: 'ws1', createdBy: 'u1', accountId: 'acc1', type: 'note', title: 'T', body: 'B', payload: '{"pinned":true}' },
      { id: 'a1', now: '2026-06-01T00:00:00Z' },
    )
    expect(r.id).toBe('a1')
    expect(r.account_id).toBe('acc1')
    expect(r.customer_id).toBeNull()           // kein customerId im Payload → null (mirror local)
    expect(r.payload).toEqual({ pinned: true }) // Objekt für jsonb
    expect(r.status).toBe('open')              // default
    expect(r.created_at).toBe('2026-06-01T00:00:00Z')
    expect(r.updated_at).toBe('2026-06-01T00:00:00Z')
  })
  it('activityPayloadToRow: customerId wird übernommen wenn vorhanden', () => {
    const r = activityPayloadToRow(
      { workspaceId: 'ws1', createdBy: 'u1', accountId: 'acc1', customerId: 'cust1', type: 'call' },
      { id: 'a1', now: '2026-06-01T00:00:00Z' },
    )
    expect(r.customer_id).toBe('cust1')
  })
  it('activityUpdateToPatch: nur gesetzte Felder + updated_at', () => {
    const p = activityUpdateToPatch({ status: 'done' }, '2026-06-02T00:00:00Z')
    expect(p).toEqual({ status: 'done', updated_at: '2026-06-02T00:00:00Z' })
  })
})
```

- [ ] **Step 2: Run, FAIL** — `npx vitest run src/data/activities.mapper.test.ts`

- [ ] **Step 3: Implement** — `src/data/activities.mapper.ts`:

```ts
import type { Activity, CreateActivityPayload, UpdateActivityPayload } from '@/types/pipeline.types'

function parseObj(s?: string): Record<string, unknown> {
  if (!s) return {}
  try { const p = JSON.parse(s); return p && typeof p === 'object' && !Array.isArray(p) ? p : {} } catch { return {} }
}

/** Supabase-`activities`-Zeile → Activity (payload jsonb→String). */
export function activityRowToActivity(r: any): Activity {
  return {
    id: r.id, workspaceId: r.workspace_id, createdBy: r.created_by,
    accountId: r.account_id ?? '', customerId: r.customer_id ?? undefined,
    type: r.type, title: r.title ?? undefined, body: r.body ?? undefined,
    payload: typeof r.payload === 'string' ? r.payload : JSON.stringify(r.payload ?? {}),
    status: r.status ?? 'open', dueAt: r.due_at ?? undefined,
    createdAt: r.created_at, updatedAt: r.updated_at,
  }
}

/** CreateActivityPayload → activities-Row (payload String→jsonb-Objekt; created_at/updated_at gesetzt). */
export function activityPayloadToRow(
  p: CreateActivityPayload, ctx: { id: string; now: string },
): Record<string, unknown> {
  return {
    id: ctx.id, workspace_id: p.workspaceId, created_by: p.createdBy,
    account_id: p.accountId, customer_id: p.customerId ?? null,
    type: p.type, title: p.title ?? null, body: p.body ?? null,
    payload: parseObj(p.payload), status: p.status ?? 'open', due_at: p.dueAt ?? null,
    created_at: ctx.now, updated_at: ctx.now,
  }
}

/** UpdateActivityPayload → Patch (nur gesetzte Felder; payload String→Objekt; + updated_at). */
export function activityUpdateToPatch(
  p: UpdateActivityPayload & { payload?: string }, now: string,
): Record<string, unknown> {
  const patch: Record<string, unknown> = { updated_at: now }
  if (p.title !== undefined) patch.title = p.title
  if (p.body !== undefined) patch.body = p.body
  if (p.status !== undefined) patch.status = p.status
  if (p.dueAt !== undefined) patch.due_at = p.dueAt
  if (p.payload !== undefined) patch.payload = parseObj(p.payload)
  return patch
}
```

- [ ] **Step 4: Run, PASS** — `npx vitest run src/data/activities.mapper.test.ts`
- [ ] **Step 5: Commit** `git add src/data/activities.mapper.ts src/data/activities.mapper.test.ts && git commit -m "feat(data): activities mapper (row<->Activity, jsonb payload)"`

---

### Task 2: `notes.mapper.ts` (aus NoteService auslagern)

**Files:** Create `src/data/notes.mapper.ts`, `src/data/notes.mapper.test.ts`

- [ ] **Step 1: Failing test** — `src/data/notes.mapper.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { activityToNote, notePayloadToActivityPayload } from './notes.mapper'
import type { Activity } from '@/types/pipeline.types'

const act: Activity = {
  id: 'n1', workspaceId: 'ws1', createdBy: 'u1', accountId: 'c1', type: 'note',
  title: 'Titel', body: 'Inhalt', payload: '{"note_type":"telefon","waiting_reply":true,"pinned":true}',
  status: 'open', createdAt: '2026-01-01', updatedAt: '2026-01-02',
}

describe('notes.mapper', () => {
  it('activityToNote: liest note_type/waiting_reply/pinned aus payload', () => {
    const n = activityToNote(act)
    expect(n.id).toBe('n1')
    expect(n.customerId).toBe('c1')
    expect(n.title).toBe('Titel')
    expect(n.content).toBe('Inhalt')
    expect(n.noteType).toBe('telefon')
    expect(n.waitingReply).toBe(true)
    expect(n.pinned).toBe(true)
  })
  it('activityToNote: defaults bei leerem/ungültigem payload', () => {
    const n = activityToNote({ ...act, payload: 'kaputt' })
    expect(n.noteType).toBe('gespraech'); expect(n.pinned).toBe(false); expect(n.waitingReply).toBe(false)
  })
  it('notePayloadToActivityPayload: type=note, body=content, payload-JSON, account_id aus customerId', () => {
    const p = notePayloadToActivityPayload(
      { customerId: 'c1', title: 'T', content: 'Inhalt', noteType: 'meeting', pinned: true, waitingReply: false },
      { workspaceId: 'ws1', createdBy: 'u1' },
    )
    expect(p.type).toBe('note')
    expect(p.accountId).toBe('c1')
    expect(p.title).toBe('T')
    expect(p.body).toBe('Inhalt')
    expect(JSON.parse(p.payload!)).toEqual({ note_type: 'meeting', waiting_reply: false, pinned: true })
  })
})
```

- [ ] **Step 2: Run, FAIL**
- [ ] **Step 3: Implement** — `src/data/notes.mapper.ts` (Logik aus `note.service.ts` übernehmen):

```ts
import type { Activity, CreateActivityPayload } from '@/types/pipeline.types'
import type { Note, UpsertNotePayload } from '@/types/note.types'

/** Activity (type='note') → Note-View. */
export function activityToNote(a: Activity): Note {
  let noteType: Note['noteType'] = 'gespraech'
  let waitingReply = false
  let pinned = false
  try {
    const p = JSON.parse(a.payload ?? '{}')
    noteType = p.note_type ?? 'gespraech'
    waitingReply = p.waiting_reply ?? false
    pinned = p.pinned ?? false
  } catch { /* defaults */ }
  return {
    id: a.id, customerId: a.accountId ?? '', title: a.title ?? '', content: a.body ?? '',
    pinned, noteType, waitingReply, createdAt: a.createdAt, updatedAt: a.updatedAt,
  }
}

/** UpsertNotePayload → CreateActivityPayload (type='note'). */
export function notePayloadToActivityPayload(
  p: UpsertNotePayload, ctx: { workspaceId: string; createdBy: string },
): CreateActivityPayload {
  return {
    workspaceId: ctx.workspaceId, createdBy: ctx.createdBy, accountId: p.customerId,
    type: 'note', title: p.title, body: p.content ?? undefined,
    payload: JSON.stringify({
      note_type: p.noteType ?? 'gespraech',
      waiting_reply: p.waitingReply ?? false,
      pinned: p.pinned ?? false,
    }),
  }
}
```

- [ ] **Step 4: Run, PASS**
- [ ] **Step 5: Commit** `git add src/data/notes.mapper.ts src/data/notes.mapper.test.ts && git commit -m "feat(data): notes.mapper (activity<->note, extracted)"`

---

### Task 3: `activities.gateway.ts`

**Files:** Create `src/data/activities.gateway.ts`, `src/data/activities.gateway.test.ts`

- [ ] **Step 1: Failing test** — `src/data/activities.gateway.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@/store/workspace.store', () => ({ useWorkspaceStore: { getState: vi.fn() } }))
const chain: any = {
  select: vi.fn(() => chain), eq: vi.fn(() => chain),
  order: vi.fn().mockResolvedValue({ data: [], error: null }),
  insert: vi.fn(() => chain), update: vi.fn(() => chain), delete: vi.fn(() => chain),
  single: vi.fn().mockResolvedValue({ data: { id: 'a1', workspace_id: 'ws1', account_id: 'acc1', type: 'note', status: 'open', payload: {}, created_at: '', updated_at: '' }, error: null }),
  then: (resolve: (v: { error: null }) => unknown) => resolve({ error: null }),
}
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(() => chain) } }))

import { invoke } from '@tauri-apps/api/core'
import { useWorkspaceStore } from '@/store/workspace.store'
import { supabase } from '@/lib/supabase'
import { ActivitiesGateway } from './activities.gateway'

const solo = () => vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => false } as any)
const sharedM = () => vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => true } as any)

describe('ActivitiesGateway', () => {
  beforeEach(() => vi.clearAllMocks())

  it('getByAccount solo→invoke / shared→supabase(account_id)', async () => {
    solo(); vi.mocked(invoke).mockResolvedValueOnce([])
    await ActivitiesGateway.getByAccount('acc1')
    expect(invoke).toHaveBeenCalledWith('get_activities_by_account', { accountId: 'acc1' })
    sharedM(); await ActivitiesGateway.getByAccount('acc1')
    expect(supabase.from).toHaveBeenCalledWith('activities')
    expect(chain.eq).toHaveBeenCalledWith('account_id', 'acc1')
  })
  it('getByCustomer shared filtert customer_id', async () => {
    sharedM(); await ActivitiesGateway.getByCustomer('c1')
    expect(chain.eq).toHaveBeenCalledWith('customer_id', 'c1')
  })
  it('getOpenFollowups shared filtert workspace+type=followup+status=open', async () => {
    sharedM(); await ActivitiesGateway.getOpenFollowups('ws1')
    expect(chain.eq).toHaveBeenCalledWith('workspace_id', 'ws1')
    expect(chain.eq).toHaveBeenCalledWith('type', 'followup')
    expect(chain.eq).toHaveBeenCalledWith('status', 'open')
  })
  it('create solo→invoke / shared→supabase insert', async () => {
    const payload = { workspaceId: 'ws1', createdBy: 'u1', accountId: 'acc1', type: 'note' as const }
    solo(); vi.mocked(invoke).mockResolvedValueOnce({ id: 'a1' })
    await ActivitiesGateway.create(payload)
    expect(invoke).toHaveBeenCalledWith('create_activity', { payload })
    sharedM(); await ActivitiesGateway.create(payload)
    expect(supabase.from).toHaveBeenCalledWith('activities')
    expect(chain.insert).toHaveBeenCalled()
  })
  it('delete shared→supabase delete', async () => {
    sharedM(); await ActivitiesGateway.delete('a1')
    expect(supabase.from).toHaveBeenCalledWith('activities')
    expect(chain.delete).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run, FAIL**
- [ ] **Step 3: Implement** — `src/data/activities.gateway.ts`:

```ts
import { invoke } from '@tauri-apps/api/core'
import { supabase } from '@/lib/supabase'
import { useWorkspaceStore } from '@/store/workspace.store'
import { activityRowToActivity, activityPayloadToRow, activityUpdateToPatch } from './activities.mapper'
import type { Activity, CreateActivityPayload, UpdateActivityPayload } from '@/types/pipeline.types'

function shared(): boolean {
  return useWorkspaceStore.getState().isActiveWorkspaceShared()
}
function fail(error: { message?: string; details?: string; hint?: string; code?: string } | null): never {
  const e = error ?? {}
  const msg = [e.message, e.details, e.hint].filter(Boolean).join(' — ') || 'Unbekannter Supabase-Fehler'
  throw new Error(e.code ? `${msg} (${e.code})` : msg)
}

export const ActivitiesGateway = {
  async getByAccount(accountId: string): Promise<Activity[]> {
    if (!shared()) return invoke<Activity[]>('get_activities_by_account', { accountId })
    const { data, error } = await supabase.from('activities').select('*')
      .eq('account_id', accountId).order('created_at', { ascending: false })
    if (error) fail(error)
    return (data ?? []).map(activityRowToActivity)
  },

  async getByCustomer(customerId: string): Promise<Activity[]> {
    if (!shared()) return invoke<Activity[]>('get_activities_by_customer', { customerId })
    const { data, error } = await supabase.from('activities').select('*')
      .eq('customer_id', customerId).order('created_at', { ascending: false })
    if (error) fail(error)
    return (data ?? []).map(activityRowToActivity)
  },

  async getOpenFollowups(workspaceId: string): Promise<Activity[]> {
    if (!shared()) return invoke<Activity[]>('get_open_followups', { workspaceId })
    const { data, error } = await supabase.from('activities').select('*')
      .eq('workspace_id', workspaceId).eq('type', 'followup').eq('status', 'open')
      .order('due_at', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true })
    if (error) fail(error)
    return (data ?? []).map(activityRowToActivity)
  },

  async create(payload: CreateActivityPayload): Promise<Activity> {
    if (!shared()) return invoke<Activity>('create_activity', { payload })
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const row = activityPayloadToRow(payload, { id, now })
    const { data, error } = await supabase.from('activities').insert(row).select('*').single()
    if (error) fail(error)
    return activityRowToActivity(data)
  },

  async update(id: string, payload: UpdateActivityPayload): Promise<Activity> {
    if (!shared()) return invoke<Activity>('update_activity', { id, payload })
    const now = new Date().toISOString()
    const patch = activityUpdateToPatch(payload, now)
    const { data, error } = await supabase.from('activities').update(patch).eq('id', id).select('*').single()
    if (error) fail(error)
    return activityRowToActivity(data)
  },

  async delete(id: string): Promise<void> {
    if (!shared()) { await invoke<void>('delete_activity', { id }); return }
    const { error } = await supabase.from('activities').delete().eq('id', id)
    if (error) fail(error)
  },
}
```

- [ ] **Step 4: Run, PASS** — `npx vitest run src/data/activities.gateway.test.ts`
- [ ] **Step 5: Commit** `git add src/data/activities.gateway.ts src/data/activities.gateway.test.ts && git commit -m "feat(data): ActivitiesGateway (solo/shared)"`

---

### Task 4: Stores übers Gateway

**Files:** Modify `src/store/activities.store.ts`, `src/store/notes.store.ts`, `src/store/notes.store.test.ts`

- [ ] **Step 1: `activities.store.ts` umstellen** — `ActivitiesService` → `ActivitiesGateway`:
  - `loadForCustomer`: `ActivitiesGateway.getByCustomer(customerId)`
  - `loadOpenFollowups`: `ActivitiesGateway.getOpenFollowups(workspaceId)`
  - `create`: `ActivitiesGateway.create(payload)`
  - `update`: `ActivitiesGateway.update(id, payload)`
  - `remove`: `ActivitiesGateway.delete(id)`
  - Import `ActivitiesService` entfernen, `ActivitiesGateway` (`@/data/activities.gateway`) importieren. `useCrmStore.loadLastActivity`-Aufruf in `create` bleibt (out of scope).

- [ ] **Step 2: `notes.store.ts` umstellen** — auf `ActivitiesGateway` + `notes.mapper`:
  - Import: `import { ActivitiesGateway } from '@/data/activities.gateway'` und `import { activityToNote, notePayloadToActivityPayload } from '@/data/notes.mapper'`; `useWorkspaceStore`/`useAuthStore` für workspaceId/createdBy.
  - `loadForCustomer(customerId)`: `const acts = await ActivitiesGateway.getByAccount(customerId); set({ notes: acts.filter(a => a.type === 'note').map(activityToNote) })`
  - `upsert(payload)`: bei `payload.id` → `ActivitiesGateway.update(payload.id, { title: payload.title, body: payload.content, payload: JSON.stringify({ note_type: payload.noteType ?? 'gespraech', waiting_reply: payload.waitingReply ?? false, pinned: payload.pinned ?? false }) })` → `activityToNote`; sonst → `ActivitiesGateway.create(notePayloadToActivityPayload(payload, { workspaceId, createdBy }))` → `activityToNote`. Liste über `upsertById` aktualisieren.
  - `remove(id)`: `ActivitiesGateway.delete(id)`.
  - `NoteService`-Import entfernen.

- [ ] **Step 3: `notes.store.test.ts` anpassen** — Gateway mocken statt NoteService:

```ts
vi.mock('@/data/activities.gateway', () => ({
  ActivitiesGateway: { getByAccount: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
}))
vi.mock('@/store/workspace.store', () => ({ useWorkspaceStore: { getState: () => ({ activeWorkspaceId: 'ws1' }) } }))
vi.mock('@/store/auth.store', () => ({ useAuthStore: { getState: () => ({ user: { id: 'u1' } }) } }))
```
Tests: `loadForCustomer` mappt nur `type==='note'` Activities zu Notes; `upsert` (neu) ruft `create`; `remove` ruft `delete`. (Bestehende Testfälle entsprechend auf die neue Mock-Basis umschreiben.)

- [ ] **Step 4: Andere Consumer prüfen** — `git grep -n "NoteService\|ActivitiesService" -- src/`. Wenn `NoteService`/`ActivitiesService` außer in den Stores nirgends mehr genutzt werden, die Service-Dateien + ihre Tests löschen (`git rm`) und ggf. `services/index.ts` bereinigen. Werden sie noch woanders (read-only) genutzt, dort belassen und im Report vermerken. KEINE WIP-Dateien anfassen.

- [ ] **Step 5: Verify** — `npx tsc --noEmit` und `npx vitest run src/data/ src/store/` → grün. `git grep -n "NoteService\|ActivitiesService" -- src/` final prüfen (keine toten Importe).

- [ ] **Step 6: Commit** `git add -A -- src/store src/services src/data && git commit -m "feat(store): notes+activities stores route through ActivitiesGateway"` (nur diese Pfade; WIP nicht enthalten).

---

### Task 5: Realtime

**Files:** Modify `src/core/sync/useWorkspaceRealtime.ts`

- [ ] **Step 1: `activities` zum Finance-/Realtime-Channel hinzufügen** — im `finance`-Channel-Block (oder einem neuen `.on`) eine Subscription auf `table: 'activities', filter: workspace_id=eq.${activeWorkspaceId}` ergänzen, die bei Änderung die offenen Activities/Notes neu lädt. Da Activities pro Kunde geladen werden, beim Event die Follow-ups neu laden und — falls ein Kunde/Lead offen ist — dessen Timeline:

```ts
.on('postgres_changes', { event: '*', schema: 'public', table: 'activities', filter: `workspace_id=eq.${activeWorkspaceId}` },
    () => {
      const { useActivitiesStore } = require('@/store/activities.store') as typeof import('@/store/activities.store')
      useActivitiesStore.getState().loadOpenFollowups(activeWorkspaceId)
    })
```

Hinweis: Falls dynamische `require` im Projekt nicht üblich sind (ESM), stattdessen statisch oben importieren wie die anderen Stores im File. Die Timeline-Neuladung eines geöffneten Kunden ist optional (Follow-ups-Reload genügt als Minimal-Realtime; Kunden-Detail lädt beim Öffnen ohnehin neu) — im Plan reicht der Follow-ups-Reload.

- [ ] **Step 2: Verify** — `npx tsc --noEmit` und `npx vitest run src/core/sync/` → grün.
- [ ] **Step 3: Commit** `git add src/core/sync/useWorkspaceRealtime.ts && git commit -m "feat(sync): realtime reload of activities/followups"`

---

### Task 6: Verifikation

- [ ] **Step 1: Voll** — `npm run test:run` → grün.
- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` → keine Fehler; `git grep -n "NoteService" -- src/` → keine toten Importe.
- [ ] **Step 3: Manuell (User)** im geteilten Workspace: Notiz an Lead/Kunde anlegen/ändern/löschen; Timeline lädt; Follow-up offen sichtbar; in 2. Instanz erscheint die Änderung. Solo unverändert.

---

## Self-Review Notes
- **Spec-Abdeckung:** Mapper (T1), Note-Mapper (T2), Gateway 6 Methoden (T3), Stores (T4), Realtime (T5), Tests je Task. RLS kein DDL (Spec). Out-of-scope (loadLastActivity/Notiz-Modul/todos) unberührt.
- **Typ-Konsistenz:** `activityRowToActivity`/`activityPayloadToRow`/`activityUpdateToPatch`, Gateway-Signaturen = Store-Aufrufe (pipeline.types). `customer_id = customerId ?? null` (mirror local).
- **Risiko:** `customer_id`-null bei Notizen → Notizen erscheinen in `getByAccount` (NoteService-Pfad), nicht zwingend in `getByCustomer`-Timeline — genau wie lokal heute. `loadLastActivity` bleibt lokal (Spec).
