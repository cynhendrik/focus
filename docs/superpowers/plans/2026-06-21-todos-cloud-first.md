# Todos cloud-first — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** `todos.store` übers bestehende `ActivitiesGateway` routen (Todos = activities type='task'), solo→Tauri / shared→Supabase, + Realtime. Kein DB-DDL.

**Architecture:** Erweitert die Activities-Scheibe. `pipeline.types` + Activity-Mapper um `assignee`, `ActivitiesGateway.getOpenTasks` neu, `todos.mapper` (aus `TodoService` ausgelagert), `todos.store` übers Gateway. `TodoService` aufgelöst.

**Tech Stack:** TypeScript, Zustand, supabase-js, Tauri invoke, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-21-todos-cloud-first-design.md`

**Nicht anfassen (WIP):** `src/App.tsx`, `src/components/leads/LeadDetailModal.tsx`, `src/routes/leverage/LeverageLeadsRoute.tsx`, `src-tauri/Cargo.toml`. Nie `git add -A`.

**Befehle:** `npx vitest run <pfad>`; voll `npm run test:run`; `npx tsc --noEmit`.

**Referenz-Fakten:**
- Todos = `activities` (type='task'). `get_open_tasks` (Rust) = `where workspace_id=X and type='task' and status='open' order by due_at asc nulls last`.
- `TodoService` (`src/services/todo.service.ts`) enthält die zu übernehmende Mapping-Logik: `activityToTodo`, `deriveBucket`, `normalizePriority`, `LEGACY_PRIORITY_MAP`, und den payload-JSON-Bau in `upsert`.
- `ActivitiesGateway` (`src/data/activities.gateway.ts`): hat `getByAccount/getByCustomer/getOpenFollowups/create/update/delete`. `create(payload)` und `update(id, payload & {payload?})` existieren.
- `activities.mapper.ts`: `activityRowToActivity`, `activityPayloadToRow(p,{id,now})`, `activityUpdateToPatch(p,now)`.
- `pipeline.types`: `Activity` (kein assignee), `CreateActivityPayload` (kein assignee), `UpdateActivityPayload` (title/body/status/dueAt).
- Todo/UpsertTodoPayload: `src/types/todo.types.ts`.

---

### Task 1: `assignee` durch die Activity-Schicht ziehen

**Files:** Modify `src/types/pipeline.types.ts`, `src/data/activities.mapper.ts`, `src/data/activities.mapper.test.ts`

- [ ] **Step 1: Failing tests anhängen** an `src/data/activities.mapper.test.ts`:

```ts
describe('activities.mapper — assignee', () => {
  it('activityPayloadToRow schreibt assignee', () => {
    const r = activityPayloadToRow(
      { workspaceId: 'ws1', createdBy: 'u1', accountId: 'a1', type: 'task', assignee: 'u2' } as any,
      { id: 'a1', now: '2026-06-01T00:00:00Z' },
    )
    expect(r.assignee).toBe('u2')
  })
  it('activityPayloadToRow ohne assignee → null', () => {
    const r = activityPayloadToRow(
      { workspaceId: 'ws1', createdBy: 'u1', accountId: 'a1', type: 'task' } as any,
      { id: 'a1', now: '2026-06-01T00:00:00Z' },
    )
    expect(r.assignee).toBeNull()
  })
  it('activityUpdateToPatch nimmt assignee nur wenn gesetzt', () => {
    expect(activityUpdateToPatch({ assignee: 'u2' } as any, 'NOW').assignee).toBe('u2')
    expect('assignee' in activityUpdateToPatch({ title: 'x' } as any, 'NOW')).toBe(false)
  })
  it('activityRowToActivity liest assignee', () => {
    const a = activityRowToActivity({ id: 'a1', workspace_id: 'ws1', created_by: 'u1', account_id: 'a1', type: 'task', payload: {}, status: 'open', assignee: 'u2', created_at: '', updated_at: '' })
    expect((a as any).assignee).toBe('u2')
  })
})
```

- [ ] **Step 2: Run, FAIL** — `npx vitest run src/data/activities.mapper.test.ts`

- [ ] **Step 3: Implement**

In `src/types/pipeline.types.ts`: zu `Activity` `assignee?: string` ergänzen; zu `CreateActivityPayload` `assignee?: string`; zu `UpdateActivityPayload` `assignee?: string`.

In `src/data/activities.mapper.ts`:
- `activityRowToActivity`: nach `dueAt` ergänzen → `assignee: r.assignee ?? undefined,`
- `activityPayloadToRow`: Param bleibt `CreateActivityPayload` (hat jetzt assignee); in der Row nach `due_at` ergänzen → `assignee: p.assignee ?? null,`
- `activityUpdateToPatch`: Param-Typ `UpdateActivityPayload & { payload?: string }` (assignee jetzt via UpdateActivityPayload); im Body ergänzen → `if (p.assignee !== undefined) patch.assignee = p.assignee`

- [ ] **Step 4: Run, PASS** — `npx vitest run src/data/activities.mapper.test.ts` (+ bestehende grün)
- [ ] **Step 5: Commit** `git add src/types/pipeline.types.ts src/data/activities.mapper.ts src/data/activities.mapper.test.ts && git commit -m "feat(data): carry assignee through activity mappers"`

---

### Task 2: `ActivitiesGateway.getOpenTasks`

**Files:** Modify `src/data/activities.gateway.ts`, `src/data/activities.gateway.test.ts`

- [ ] **Step 1: Failing test anhängen**:

```ts
describe('ActivitiesGateway.getOpenTasks', () => {
  beforeEach(() => vi.clearAllMocks())
  it('solo → invoke(get_open_tasks)', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => false } as any)
    vi.mocked(invoke).mockResolvedValueOnce([])
    await ActivitiesGateway.getOpenTasks('ws1')
    expect(invoke).toHaveBeenCalledWith('get_open_tasks', { workspaceId: 'ws1' })
  })
  it('shared → supabase activities mit type=task + status=open', async () => {
    vi.mocked(useWorkspaceStore.getState).mockReturnValue({ isActiveWorkspaceShared: () => true } as any)
    await ActivitiesGateway.getOpenTasks('ws1')
    expect(supabase.from).toHaveBeenCalledWith('activities')
    expect(chain.eq).toHaveBeenCalledWith('type', 'task')
    expect(chain.eq).toHaveBeenCalledWith('status', 'open')
  })
})
```

- [ ] **Step 2: Run, FAIL**
- [ ] **Step 3: Implement** — in `ActivitiesGateway` (nach `getOpenFollowups`) ergänzen:

```ts
  async getOpenTasks(workspaceId: string): Promise<Activity[]> {
    if (!shared()) return invoke<Activity[]>('get_open_tasks', { workspaceId })
    const { data, error } = await supabase.from('activities').select('*')
      .eq('workspace_id', workspaceId).eq('type', 'task').eq('status', 'open')
      .order('due_at', { ascending: true, nullsFirst: false })
    if (error) fail(error)
    return (data ?? []).map(activityRowToActivity)
  },
```

- [ ] **Step 4: Run, PASS** — `npx vitest run src/data/activities.gateway.test.ts`
- [ ] **Step 5: Commit** `git add src/data/activities.gateway.ts src/data/activities.gateway.test.ts && git commit -m "feat(data): ActivitiesGateway.getOpenTasks"`

---

### Task 3: `todos.mapper.ts` (aus TodoService auslagern)

**Files:** Create `src/data/todos.mapper.ts`, `src/data/todos.mapper.test.ts`

- [ ] **Step 1: Failing test** — `src/data/todos.mapper.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { activityToTodo, todoToCreatePayload, todoToUpdatePayload } from './todos.mapper'
import type { Activity } from '@/types/pipeline.types'

const taskAct: Activity = {
  id: 't1', workspaceId: 'ws1', createdBy: 'u1', accountId: 'c1', type: 'task',
  title: 'Anrufen', status: 'open', dueAt: '2026-07-01', assignee: 'u2',
  payload: JSON.stringify({ priority: 'p1', bucket: 'today', tags: ['x'], checklist: [], scheduledAt: '2026-07-01T09:00:00Z' }),
  createdAt: '2026-01-01', updatedAt: '2026-01-02',
} as any

describe('todos.mapper', () => {
  it('activityToTodo: payload-Felder + status + assignee', () => {
    const t = activityToTodo(taskAct)
    expect(t.id).toBe('t1'); expect(t.customerId).toBe('c1'); expect(t.title).toBe('Anrufen')
    expect(t.priority).toBe('p1'); expect(t.bucket).toBe('today'); expect(t.tags).toEqual(['x'])
    expect(t.dueDate).toBe('2026-07-01'); expect(t.assignee).toBe('u2'); expect(t.status).toBe('open')
  })
  it('activityToTodo: Legacy-Priority high→p1, defaults bei kaputtem payload', () => {
    expect(activityToTodo({ ...taskAct, payload: JSON.stringify({ priority: 'high' }) } as any).priority).toBe('p1')
    expect(activityToTodo({ ...taskAct, payload: 'kaputt' } as any).priority).toBe('p3')
  })
  it('todoToCreatePayload: type=task, assignee, payload-JSON', () => {
    const p = todoToCreatePayload(
      { customerId: 'c1', title: 'T', priority: 'p2', tags: ['a'], dueDate: '2026-07-01', assignee: 'u2' },
      { workspaceId: 'ws1', createdBy: 'u1' },
    )
    expect(p.type).toBe('task'); expect(p.accountId).toBe('c1'); expect(p.assignee).toBe('u2'); expect(p.dueAt).toBe('2026-07-01')
    const pl = JSON.parse(p.payload!)
    expect(pl.priority).toBe('p2'); expect(pl.tags).toEqual(['a'])
  })
  it('todoToUpdatePayload: title/status/dueAt/assignee + payload-JSON', () => {
    const p = todoToUpdatePayload({ id: 't1', customerId: 'c1', title: 'T2', status: 'done', dueDate: '2026-07-02', assignee: 'u3', priority: 'p1' })
    expect(p.title).toBe('T2'); expect(p.status).toBe('done'); expect(p.dueAt).toBe('2026-07-02'); expect(p.assignee).toBe('u3')
    expect(JSON.parse(p.payload!).priority).toBe('p1')
  })
})
```

- [ ] **Step 2: Run, FAIL**
- [ ] **Step 3: Implement** — `src/data/todos.mapper.ts`. Übernimm `activityToTodo`, `deriveBucket`, `normalizePriority`, `LEGACY_PRIORITY_MAP` **1:1 aus `src/services/todo.service.ts`** (Activity-Typ-Import auf `@/types/pipeline.types` umstellen; `a.payload` kann undefined sein → `JSON.parse(a.payload ?? '{}')`; `a.assignee` lesen). Plus:

```ts
import type { Activity, CreateActivityPayload, UpdateActivityPayload } from '@/types/pipeline.types'
import type { Todo, UpsertTodoPayload, TodoBucket, TodoPriority } from '@/types/todo.types'

// LEGACY_PRIORITY_MAP, normalizePriority, deriveBucket, activityToTodo: 1:1 aus todo.service.ts
// (activityToTodo: payload via JSON.parse(a.payload ?? '{}'); customerId: a.accountId; assignee: a.assignee)

function buildTaskPayloadJson(p: UpsertTodoPayload): string {
  const status = p.status ?? 'open'
  const bucket = p.bucket ?? deriveBucket(status, p.scheduledAt)
  return JSON.stringify({
    checklist: p.checklist ?? [], tags: p.tags ?? [], priority: p.priority ?? 'p3', bucket,
    scheduledAt: p.scheduledAt ?? null, plannedMinutes: p.plannedMinutes ?? null,
    notes: p.notes ?? null, aiSummary: p.aiSummary ?? null, calendarEventId: p.calendarEventId ?? null,
    source: p.source ?? null, actionType: p.actionType ?? null, sourceRef: p.sourceRef ?? null,
    is_follow_up: false,
  })
}

export function todoToCreatePayload(
  p: UpsertTodoPayload, ctx: { workspaceId: string; createdBy: string },
): CreateActivityPayload {
  return {
    workspaceId: ctx.workspaceId, createdBy: ctx.createdBy, accountId: p.customerId ?? '',
    type: 'task', title: p.title, status: p.status ?? 'open', dueAt: p.dueDate ?? undefined,
    assignee: p.assignee ?? undefined, payload: buildTaskPayloadJson(p),
  }
}

export function todoToUpdatePayload(
  p: UpsertTodoPayload,
): UpdateActivityPayload & { payload: string } {
  return {
    title: p.title, status: p.status ?? 'open', dueAt: p.dueDate ?? undefined,
    assignee: p.assignee ?? undefined, payload: buildTaskPayloadJson(p),
  }
}
```

Hinweis: `CreateActivityPayload`/`UpdateActivityPayload` haben nach Task 1 `assignee?`. `accountId` ist in `CreateActivityPayload` non-optional → bei kundenlosen Todos `''` setzen (wie `p.customerId ?? ''`).

- [ ] **Step 4: Run, PASS** — `npx vitest run src/data/todos.mapper.test.ts`
- [ ] **Step 5: Commit** `git add src/data/todos.mapper.ts src/data/todos.mapper.test.ts && git commit -m "feat(data): todos.mapper (activity<->todo, extracted)"`

---

### Task 4: `todos.store` übers Gateway + TodoService auflösen

**Files:** Modify `src/store/todos.store.ts`, `src/store/todos.store.test.ts` (neu falls nicht vorhanden); evtl. `git rm src/services/todo.service.ts`

- [ ] **Step 1: Store umstellen** — in `src/store/todos.store.ts`:
  - Imports: `TodoService` raus; rein `import { ActivitiesGateway } from '@/data/activities.gateway'`, `import { activityToTodo, todoToCreatePayload, todoToUpdatePayload } from '@/data/todos.mapper'`.
  - `loadAll(workspaceId)`: `const acts = await ActivitiesGateway.getOpenTasks(workspaceId); set({ allTodos: acts.map(activityToTodo) })`
  - `loadForCustomer(customerId)`: `const acts = await ActivitiesGateway.getByAccount(customerId); const todos = acts.filter(a => a.type === 'task').map(activityToTodo)` (Rest der Merge-Logik unverändert). `currentCustomerId` setzen (siehe Task 5).
  - `upsert(payload)`: workspaceId/createdBy aus den Stores; bei `payload.id` → `const a = await ActivitiesGateway.update(payload.id, todoToUpdatePayload(payload))` sonst `const a = await ActivitiesGateway.create(todoToCreatePayload(payload, { workspaceId, createdBy }))`; `const updated = activityToTodo(a)`; State-Update unverändert.
  - `remove(id)`: `await ActivitiesGateway.delete(id)` (deleteLinkedEvent-Logik bleibt).
  - `deleteTodoLinkedToEvent`: `TodoService.delete(...)` → `ActivitiesGateway.delete(...)`.
  - Convenience-Methoden (complete/postpone/setBucket/…) rufen weiter `get().upsert(...)` → unverändert.

- [ ] **Step 2: Test** — `src/store/todos.store.test.ts` (Gateway mocken):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/data/activities.gateway', () => ({ ActivitiesGateway: { getOpenTasks: vi.fn(), getByAccount: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() } }))
vi.mock('@/store/calendar.store', () => ({ useCalendarStore: { getState: () => ({ upsert: vi.fn(), remove: vi.fn() }) } }))
vi.mock('@/store/workspace.store', () => ({ useWorkspaceStore: { getState: () => ({ activeWorkspaceId: 'ws1' }) } }))
vi.mock('@/store/auth.store', () => ({ useAuthStore: { getState: () => ({ user: { id: 'u1' } }) } }))

import { ActivitiesGateway } from '@/data/activities.gateway'
import { useTodosStore } from './todos.store'

const act = { id: 't1', workspaceId: 'ws1', createdBy: 'u1', accountId: 'c1', type: 'task', title: 'T', status: 'open', payload: '{}', createdAt: '', updatedAt: '' }

describe('useTodosStore', () => {
  beforeEach(() => { vi.clearAllMocks(); useTodosStore.setState({ todos: [], allTodos: [], isLoading: false, error: null }) })
  it('loadAll lädt offene Tasks übers Gateway', async () => {
    vi.mocked(ActivitiesGateway.getOpenTasks).mockResolvedValueOnce([act] as any)
    await useTodosStore.getState().loadAll('ws1')
    expect(ActivitiesGateway.getOpenTasks).toHaveBeenCalledWith('ws1')
    expect(useTodosStore.getState().allTodos).toHaveLength(1)
  })
  it('upsert (neu) ruft create', async () => {
    vi.mocked(ActivitiesGateway.create).mockResolvedValueOnce(act as any)
    await useTodosStore.getState().upsert({ title: 'T' })
    expect(ActivitiesGateway.create).toHaveBeenCalled()
  })
  it('remove ruft delete', async () => {
    vi.mocked(ActivitiesGateway.delete).mockResolvedValueOnce(undefined)
    useTodosStore.setState({ todos: [{ id: 't1' } as any], allTodos: [{ id: 't1' } as any], isLoading: false, error: null })
    await useTodosStore.getState().remove('t1')
    expect(ActivitiesGateway.delete).toHaveBeenCalledWith('t1')
    expect(useTodosStore.getState().allTodos).toHaveLength(0)
  })
})
```

- [ ] **Step 3: TodoService-Consumer prüfen** — `git grep -n "TodoService" -- src/`. Wenn nur noch `todos.store` (jetzt entfernt) → `git rm src/services/todo.service.ts` (+ Test falls vorhanden). Andere Consumer → übers Gateway/Store routen oder Service belassen; im Report vermerken. KEINE WIP-Dateien.

- [ ] **Step 4: Verify** — `npx tsc --noEmit` + `npx vitest run src/data/ src/store/` grün; `git grep -n "TodoService" -- src/` keine toten Importe.
- [ ] **Step 5: Commit** `git add src/store/todos.store.ts src/store/todos.store.test.ts src/services && git commit -m "feat(store): todos.store via ActivitiesGateway; drop TodoService"`

---

### Task 5: Realtime — Todos mitladen

**Files:** Modify `src/store/todos.store.ts`, `src/core/sync/useWorkspaceRealtime.ts`

- [ ] **Step 1: `currentCustomerId` im todos.store** — Feld `currentCustomerId: string | null` (init null), in `loadForCustomer` setzen (`set({ currentCustomerId: customerId, ... })`).

- [ ] **Step 2: Realtime-Handler** — im `activities`-Subscription-Handler in `useWorkspaceRealtime.ts` zusätzlich:
```ts
useTodosStore.getState().loadAll(activeWorkspaceId)
const todoState = useTodosStore.getState()
if (todoState.currentCustomerId) todoState.loadForCustomer(todoState.currentCustomerId)
```
`useTodosStore` statisch oben importieren.

- [ ] **Step 3: Verify** — `npx tsc --noEmit` + `npx vitest run src/core/sync/ src/store/` grün.
- [ ] **Step 4: Commit** `git add src/store/todos.store.ts src/core/sync/useWorkspaceRealtime.ts && git commit -m "feat(sync): realtime reload of todos"`

---

### Task 6: Verifikation

- [ ] **Step 1: Voll** — `npm run test:run` grün.
- [ ] **Step 2: Typecheck** — `npx tsc --noEmit`; `git grep -n "TodoService" -- src/` keine toten Importe.
- [ ] **Step 3: Manuell (User)** im geteilten Workspace: To-do anlegen/abschließen/zuweisen; offene Tasks + Kunden-Tasks laden; in 2. Instanz live. Solo unverändert.

---

## Self-Review Notes
- **Spec-Abdeckung:** assignee (T1), getOpenTasks (T2), todos.mapper (T3), Store+TodoService-Auflösung (T4), Realtime (T5). Kein DDL (Spec). Out-of-scope (Kalender/Deadlines/Legacy-todos-Tabelle) unberührt.
- **Typ-Konsistenz:** pipeline.types um `assignee?` erweitert → Gateway create/update + Mapper tragen assignee; `activityToTodo` liest `a.assignee`. `todoToCreatePayload`/`todoToUpdatePayload` liefern `payload`-JSON + assignee.
- **Risiko:** Kalender-Sync (todos↔calendar_events) bleibt lokal bis zur Kalender-Scheibe (Spec out-of-scope).
