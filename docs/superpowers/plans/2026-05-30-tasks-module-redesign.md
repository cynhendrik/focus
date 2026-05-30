# Tasks-Modul Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tasks-Modul komplett umbauen zu 3-Tab-Layout (Liste/Board/Fokus) mit erweitertem Datenmodell, TipTap-Composer mit Prefix-Syntax und gemockter AI-Zusammenfassung.

**Architecture:** Backend bleibt `activities` mit `type='task'`; neue Felder gehen in `payload`-JSON. `account_id` wird `Option<String>` für Tasks ohne Kunde. Frontend bekommt komplett neue `tasks/` Komponenten-Gruppe, alte `focus/`-Welt fliegt raus.

**Tech Stack:** TypeScript · React 18 · Zustand · TipTap 3 · `@dnd-kit` · Tauri · Rust/rusqlite · Vitest

**Spec:** `docs/superpowers/specs/2026-05-30-tasks-module-redesign-design.md`

---

## Phase 0 — Backend: `account_id` nullable

Damit Tasks ohne Kunde existieren können, muss `activities.account_id` `Option<String>` werden. Betrifft SQL-Schema, Migration, Rust-Structs und alle Lesezugriffe.

### Task 0.1: Schema-Änderung `account_id` nullable

**Files:**
- Modify: `src-tauri/src/db/schema.rs:80-101`
- Modify: `src-tauri/src/db/migrations.rs` (neue Migration anhängen)

- [ ] **Step 1: Schema in `create_tables` anpassen**

In `src-tauri/src/db/schema.rs` die `activities`-Definition:

```rust
// vorher:  account_id      TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
// nachher:
        CREATE TABLE IF NOT EXISTS activities (
            id              TEXT PRIMARY KEY,
            workspace_id    TEXT NOT NULL DEFAULT '',
            created_by      TEXT NOT NULL DEFAULT '',
            account_id      TEXT REFERENCES accounts(id) ON DELETE CASCADE,
            contact_id      TEXT REFERENCES contacts(id) ON DELETE SET NULL,
            deal_id         TEXT REFERENCES deals(id) ON DELETE SET NULL,
            customer_id     TEXT,
            type            TEXT NOT NULL,
            title           TEXT,
            body            TEXT,
            payload         TEXT NOT NULL DEFAULT '{}',
            status          TEXT NOT NULL DEFAULT 'open',
            due_at          TEXT,
            assignee        TEXT,
            outcome         TEXT,
            direction       TEXT,
            email_id        TEXT,
            pending_sync    INTEGER NOT NULL DEFAULT 0,
            created_at      TEXT NOT NULL,
            updated_at      TEXT NOT NULL
        );
```

- [ ] **Step 2: Migration-Block für bestehende DBs anhängen**

Die letzte Migration-Versionsnummer in `migrations.rs` finden (suche `set_version` Aufrufe). Eine neue Migration nach der höchsten existierenden Version anhängen. Beispiel-Pattern (Versions-Nummer anpassen):

```rust
// In migrations.rs, am Ende der run() Funktion vor Ok(()) und vor anderen finals:
let current_version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
if current_version < N {  // N = next version number
    // SQLite kann NOT NULL nicht via ALTER entfernen → Table-Rebuild
    conn.execute_batch(r#"
        CREATE TABLE activities_new (
            id              TEXT PRIMARY KEY,
            workspace_id    TEXT NOT NULL DEFAULT '',
            created_by      TEXT NOT NULL DEFAULT '',
            account_id      TEXT REFERENCES accounts(id) ON DELETE CASCADE,
            contact_id      TEXT REFERENCES contacts(id) ON DELETE SET NULL,
            deal_id         TEXT REFERENCES deals(id) ON DELETE SET NULL,
            customer_id     TEXT,
            type            TEXT NOT NULL,
            title           TEXT,
            body            TEXT,
            payload         TEXT NOT NULL DEFAULT '{}',
            status          TEXT NOT NULL DEFAULT 'open',
            due_at          TEXT,
            assignee        TEXT,
            outcome         TEXT,
            direction       TEXT,
            email_id        TEXT,
            pending_sync    INTEGER NOT NULL DEFAULT 0,
            created_at      TEXT NOT NULL,
            updated_at      TEXT NOT NULL
        );
        INSERT INTO activities_new SELECT * FROM activities;
        DROP TABLE activities;
        ALTER TABLE activities_new RENAME TO activities;
        CREATE INDEX IF NOT EXISTS idx_activities_account
            ON activities(account_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_activities_deal
            ON activities(deal_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_activities_contact
            ON activities(contact_id, created_at DESC);
    "#)?;
    conn.execute_batch(&format!("PRAGMA user_version = {}", N))?;
}
```

Hinweis: Den genauen Migration-Container und Versions-Tracking-Stil aus den existierenden Migrationen in `migrations.rs` übernehmen — die Datei nutzt eigene `set_version`-/Block-Patterns, nicht zwingend `PRAGMA user_version`. Schau dir die jüngste Migration (z.B. v5) als Vorlage an und mache dieselbe Form.

- [ ] **Step 3: Existierende Schema-Tests laufen lassen**

Run: `cd src-tauri && cargo test schema::tests`
Expected: PASS — der `new_tables_created_in_schema` Test prüft nur Tabellenexistenz, das passt weiter.

- [ ] **Step 4: Neuer Migrationstest**

Nach den bestehenden Tests in `migrations.rs` anhängen:

```rust
#[test]
fn migration_makes_activities_account_id_nullable() {
    let conn = rusqlite::Connection::open_in_memory().unwrap();
    conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
    create_tables(&conn).unwrap();
    // Insert a task with NULL account_id should now work
    let result = conn.execute(
        "INSERT INTO activities (id, workspace_id, created_by, account_id, type, payload, status, created_at, updated_at)
         VALUES ('t1', 'ws-1', 'u-1', NULL, 'task', '{}', 'open', '2026-01-01', '2026-01-01')",
        [],
    );
    assert!(result.is_ok(), "Should accept NULL account_id: {:?}", result);
}
```

Run: `cargo test migration_makes_activities_account_id_nullable`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/db/schema.rs src-tauri/src/db/migrations.rs
git commit -m "refactor(db): make activities.account_id nullable for customer-less tasks"
```

---

### Task 0.2: Rust-Structs auf `Option<String>` umstellen

**Files:**
- Modify: `src-tauri/src/db/activity.rs` (Struct `Activity`, `CreateActivityPayload`, alle Reads)
- Modify: `src-tauri/src/commands/activity.rs` (CRM-Event-Aufrufe)
- Modify: `src-tauri/src/activity_engine/mod.rs` (falls account_id-Logik vorhanden)

- [ ] **Step 1: `Activity` Struct anpassen**

In `src-tauri/src/db/activity.rs`:

```rust
// vorher:
//   pub account_id: String,
// nachher:
pub struct Activity {
    pub id: String,
    pub workspace_id: String,
    pub created_by: String,
    pub account_id: Option<String>,   // ← Option
    pub contact_id: Option<String>,
    // ...rest unverändert
}

pub struct CreateActivityPayload {
    pub workspace_id: String,
    pub created_by: String,
    pub account_id: Option<String>,   // ← Option
    pub contact_id: Option<String>,
    // ...rest unverändert
}
```

- [ ] **Step 2: `map_row` und `insert` SQL-Bindings anpassen**

In `src-tauri/src/db/activity.rs` `map_row`:

```rust
fn map_row(r: &Row) -> rusqlite::Result<Activity> {
    Ok(Activity {
        id: r.get(0)?,
        workspace_id: r.get(1)?,
        created_by: r.get(2)?,
        account_id: r.get(3)?,   // rusqlite mapped Option<String> auto bei NULL
        contact_id: r.get(4)?,
        deal_id: r.get(5)?,
        // ... rest unverändert (Indices anpassen falls nötig)
    })
}
```

In `insert`-Funktion: `payload.account_id` ist jetzt `Option<String>`, rusqlite bindet das korrekt via `params![payload.account_id, ...]`. Kein Code-Change nötig wenn `params!` schon Option-aware ist (default-Verhalten).

- [ ] **Step 3: CRM-Event-Calls absichern**

In `src-tauri/src/commands/activity.rs`, Zeilen 16-21 und 35-40:

```rust
// vorher:
//   if let Some(outcome) = &activity.outcome {
//       engine::evaluate(&*conn, engine::CrmEvent::ActivityOutcome {
//           account_id: activity.account_id.clone(),
//           ...

// nachher: nur evaluieren wenn account_id vorhanden
    if let (Some(outcome), Some(account_id)) = (&activity.outcome, &activity.account_id) {
        engine::evaluate(&*conn, engine::CrmEvent::ActivityOutcome {
            account_id:   account_id.clone(),
            workspace_id: activity.workspace_id.clone(),
            outcome:      outcome.clone(),
        })?;
    }
```

- [ ] **Step 4: Compile-Errors fixen**

Run: `cd src-tauri && cargo check`
Expected: Liste von Compile-Errors auf Stellen die `account_id` als `String` nutzten. Jeden Fehler einzeln fixen (Pattern: `.account_id` → `.account_id.as_deref()` oder `.account_id.clone()` mit Option-Handling).

Typische Hotspots:
- `src-tauri/src/db/activity.rs` `update`/`insert`/`get_by_account` Funktionen
- `src-tauri/src/activity_engine/mod.rs`
- `src-tauri/src/engine/rules.rs` falls Aktivitäten verarbeitet werden

Run: `cargo check` nach jedem Fix bis grün.

- [ ] **Step 5: Tests laufen lassen**

Run: `cd src-tauri && cargo test`
Expected: alle PASS. Existierende Tests die `account_id: "a1".into()` setzen, brauchen jetzt `account_id: Some("a1".into())`.

Test-Failures durchgehen und Test-Setup-Helpers anpassen:

```rust
// alt:
//   account_id: "a1".into(),
// neu:
account_id: Some("a1".into()),
```

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/db/activity.rs src-tauri/src/commands/activity.rs src-tauri/src/activity_engine/mod.rs src-tauri/src/engine/rules.rs
git commit -m "refactor(activities): account_id is now Option<String>"
```

---

### Task 0.3: TypeScript `Activity`-Type angleichen

**Files:**
- Modify: `src/types/activity.types.ts`

- [ ] **Step 1: `accountId` optional machen**

```ts
// vorher:
//   accountId: string
// nachher:
export interface Activity {
  id: string
  workspaceId: string
  createdBy: string
  accountId?: string   // ← optional
  // ...rest
}

export interface CreateActivityPayload {
  // ...
  accountId?: string   // ← optional
  // ...
}
```

- [ ] **Step 2: Compile-Errors fixen**

Run: `npm run typecheck`
Expected: TS-Errors an Stellen die `activity.accountId` unconditional nutzen. Mit Optional-Chaining oder Fallback fixen.

- [ ] **Step 3: Commit**

```bash
git add src/types/activity.types.ts
git commit -m "refactor(activities): accountId is now optional in TS types"
```

---

## Phase 1 — Datenmodell & Services

### Task 1.1: `Todo` Type erweitern

**Files:**
- Modify: `src/types/todo.types.ts`

- [ ] **Step 1: Neue Types definieren**

Komplett ersetzen mit:

```ts
export type TodoPriority = 'p1' | 'p2' | 'p3' | 'p4'
export type TodoBucket   = 'backlog' | 'today' | 'in_progress' | 'done'
export type TodoStatus   = 'open' | 'in_progress' | 'done'

export interface ChecklistItem {
  id: string
  text: string
  done: boolean
}

export interface Todo {
  id: string
  customerId?: string
  title: string
  status: TodoStatus
  priority: TodoPriority
  bucket: TodoBucket
  scheduledAt?: string
  plannedMinutes?: number
  dueDate?: string
  notes?: string
  aiSummary?: string
  checklist: ChecklistItem[]
  tags: string[]
  assignee?: string
  createdAt: string
  updatedAt: string
}

export interface UpsertTodoPayload {
  id?: string
  customerId?: string
  title: string
  status?: TodoStatus
  priority?: TodoPriority
  bucket?: TodoBucket
  scheduledAt?: string
  plannedMinutes?: number
  dueDate?: string
  notes?: string
  aiSummary?: string
  checklist?: ChecklistItem[]
  tags?: string[]
  assignee?: string
}
```

- [ ] **Step 2: Typecheck nicht laufen lassen — Service folgt gleich**

Andere Files brechen jetzt, das ist OK. Wir fixen sie in Task 1.2.

- [ ] **Step 3: Commit (als WIP)**

```bash
git add src/types/todo.types.ts
git commit -m "feat(todos): extend Todo type with bucket, scheduledAt, plannedMinutes, notes, aiSummary"
```

---

### Task 1.2: `TodoService` an neues Modell anpassen

**Files:**
- Modify: `src/services/todo.service.ts`

- [ ] **Step 1: Helper für Priority-Migration anlegen**

```ts
import { invoke } from '@tauri-apps/api/core'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import type { Todo, UpsertTodoPayload, TodoPriority, TodoBucket } from '@/types/todo.types'
import type { Activity } from '@/types/activity.types'

const LEGACY_PRIORITY_MAP: Record<string, TodoPriority> = {
  high:   'p1',
  normal: 'p3',
  low:    'p4',
}

function normalizePriority(raw: unknown): TodoPriority {
  if (raw === 'p1' || raw === 'p2' || raw === 'p3' || raw === 'p4') return raw
  if (typeof raw === 'string' && raw in LEGACY_PRIORITY_MAP) return LEGACY_PRIORITY_MAP[raw]
  return 'p3'
}

function deriveBucket(status: string, scheduledAt: string | undefined): TodoBucket {
  if (status === 'done')          return 'done'
  if (status === 'in_progress')   return 'in_progress'
  if (scheduledAt) {
    const today = new Date().toISOString().slice(0, 10)
    if (scheduledAt.slice(0, 10) === today) return 'today'
  }
  return 'backlog'
}
```

- [ ] **Step 2: `activityToTodo` anpassen**

```ts
function activityToTodo(a: Activity): Todo {
  let checklist: Todo['checklist'] = []
  let tags: string[] = []
  let rawPriority: unknown = 'normal'
  let bucket: TodoBucket | undefined
  let scheduledAt: string | undefined
  let plannedMinutes: number | undefined
  let notes: string | undefined
  let aiSummary: string | undefined

  try {
    const p = JSON.parse(a.payload)
    checklist      = Array.isArray(p.checklist) ? p.checklist : []
    tags           = Array.isArray(p.tags) ? p.tags : []
    rawPriority    = p.priority
    bucket         = p.bucket
    scheduledAt    = p.scheduledAt
    plannedMinutes = typeof p.plannedMinutes === 'number' ? p.plannedMinutes : undefined
    notes          = typeof p.notes === 'string' ? p.notes : undefined
    aiSummary      = typeof p.aiSummary === 'string' ? p.aiSummary : undefined
  } catch {}

  const status: Todo['status'] = a.status === 'done'
    ? 'done'
    : a.status === 'in_progress' ? 'in_progress' : 'open'
  const priority = normalizePriority(rawPriority)

  return {
    id: a.id,
    customerId: a.accountId,
    title: a.title ?? '',
    status,
    priority,
    bucket: bucket ?? deriveBucket(status, scheduledAt),
    scheduledAt,
    plannedMinutes,
    dueDate: a.dueAt,
    notes,
    aiSummary,
    checklist,
    tags,
    assignee: a.assignee,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  }
}
```

- [ ] **Step 3: `upsert` anpassen**

```ts
export const TodoService = {
  async getAll(workspaceId: string): Promise<Todo[]> {
    const activities = await invoke<Activity[]>('get_open_tasks', { workspaceId })
    return activities.map(activityToTodo)
  },

  async getByCustomer(customerId: string): Promise<Todo[]> {
    const activities = await invoke<Activity[]>('get_activities_by_account', { accountId: customerId })
    return activities.filter(a => a.type === 'task').map(activityToTodo)
  },

  async upsert(payload: UpsertTodoPayload): Promise<Todo> {
    const status: 'open' | 'done' | 'in_progress' = payload.status ?? 'open'
    const scheduledAt = payload.scheduledAt
    const bucket = payload.bucket ?? deriveBucket(status, scheduledAt)

    const activityPayload = JSON.stringify({
      checklist:      payload.checklist ?? [],
      tags:           payload.tags ?? [],
      priority:       payload.priority ?? 'p3',
      bucket,
      scheduledAt:    scheduledAt ?? null,
      plannedMinutes: payload.plannedMinutes ?? null,
      notes:          payload.notes ?? null,
      aiSummary:      payload.aiSummary ?? null,
      is_follow_up:   false,
    })

    if (payload.id) {
      const updated = await invoke<Activity>('update_activity', {
        id: payload.id,
        payload: {
          title:    payload.title,
          status:   status,
          dueAt:    payload.dueDate ?? null,
          assignee: payload.assignee ?? null,
          payload:  activityPayload,
        },
      })
      return activityToTodo(updated)
    }
    const workspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? ''
    const createdBy = useAuthStore.getState().user?.id ?? ''
    const created = await invoke<Activity>('create_activity', {
      payload: {
        accountId:   payload.customerId,     // jetzt optional, undefined ist OK
        workspaceId,
        createdBy,
        type:        'task',
        title:       payload.title,
        status:      status,
        dueAt:       payload.dueDate ?? null,
        assignee:    payload.assignee ?? null,
        payload:     activityPayload,
      },
    })
    return activityToTodo(created)
  },

  delete(id: string): Promise<void> {
    return invoke<void>('delete_activity', { id })
  },
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: Error wegen `NewTaskModal.tsx` (es ruft `upsert` mit `priority: 'normal'` auf) und `TasksRoute.tsx` (alter Inhalt). NewTaskModal fixen wir in nächstem Schritt, TasksRoute wird sowieso später ersetzt.

- [ ] **Step 5: `NewTaskModal` an neue Priorities anpassen**

In `src/components/customer/NewTaskModal.tsx` Zeilen 25-29:

```ts
// vorher:
//   const PRIORITIES: { value: 'low' | 'normal' | 'high'; label: string }[] = [
//     { value: 'low',    label: 'Niedrig' },
//     { value: 'normal', label: 'Mittel'  },
//     { value: 'high',   label: 'Hoch'    },
//   ]

const PRIORITIES: { value: 'p1' | 'p2' | 'p3' | 'p4'; label: string }[] = [
  { value: 'p1', label: 'Dringend' },
  { value: 'p2', label: 'Hoch'     },
  { value: 'p3', label: 'Normal'   },
  { value: 'p4', label: 'Niedrig'  },
]
```

Und das State-Tuple:

```ts
// vorher:
//   const [priority, setPriority] = useState<'low' | 'normal' | 'high'>('normal')
const [priority, setPriority] = useState<'p1' | 'p2' | 'p3' | 'p4'>('p3')
```

Und das `reset()`:

```ts
const reset = () => {
  setTitle('')
  setDueDate('')
  setPriority('p3')   // ← war 'normal'
  setTag('')
  setChecklist([])
  setNewStep('')
}
```

- [ ] **Step 6: Typecheck nochmal**

Run: `npm run typecheck`
Expected: Errors nur noch in `src/routes/TasksRoute.tsx` (das wird in Phase 3 komplett ersetzt). Andere Errors müssen weg sein.

- [ ] **Step 7: Commit**

```bash
git add src/services/todo.service.ts src/components/customer/NewTaskModal.tsx
git commit -m "feat(todos): TodoService maps new payload fields, NewTaskModal uses p1-p4"
```

---

### Task 1.3: `todos.store` neue Aktionen

**Files:**
- Modify: `src/store/todos.store.ts`

- [ ] **Step 1: Store-Interface erweitern und neue Aktionen implementieren**

Komplett ersetzen:

```ts
import { create } from 'zustand'
import { TodoService } from '@/services/todo.service'
import { log } from '@/lib/logger'
import type { Todo, UpsertTodoPayload, TodoBucket, TodoPriority } from '@/types/todo.types'
import type { AppError } from '@/types/error.types'
import { isAppError, formatError } from '@/types/error.types'

interface TodosState {
  todos: Todo[]
  allTodos: Todo[]
  isLoading: boolean
  error: AppError | null

  loadForCustomer: (customerId: string) => Promise<void>
  loadAll: (workspaceId: string) => Promise<void>
  upsert: (payload: UpsertTodoPayload) => Promise<Todo>
  remove: (id: string) => Promise<void>

  // neue Aktionen
  complete:        (id: string) => Promise<void>
  postpone:        (id: string) => Promise<void>
  setBucket:       (id: string, bucket: TodoBucket) => Promise<void>
  setScheduledAt:  (id: string, iso: string | undefined) => Promise<void>
  setPriority:     (id: string, priority: TodoPriority) => Promise<void>
  toggleChecklist: (id: string, itemId: string) => Promise<void>
  updateNotes:     (id: string, notes: string) => Promise<void>
}

function upsertById(list: Todo[], updated: Todo): Todo[] {
  const idx = list.findIndex(t => t.id === updated.id)
  if (idx >= 0) { const next = [...list]; next[idx] = updated; return next }
  return [...list, updated]
}

function todoToPayload(t: Todo): UpsertTodoPayload {
  return {
    id: t.id,
    customerId:     t.customerId,
    title:          t.title,
    status:         t.status,
    priority:       t.priority,
    bucket:         t.bucket,
    scheduledAt:    t.scheduledAt,
    plannedMinutes: t.plannedMinutes,
    dueDate:        t.dueDate,
    notes:          t.notes,
    aiSummary:      t.aiSummary,
    checklist:      t.checklist,
    tags:           t.tags,
    assignee:       t.assignee,
  }
}

export const useTodosStore = create<TodosState>()((set, get) => ({
  todos: [],
  allTodos: [],
  isLoading: false,
  error: null,

  loadAll: async (workspaceId) => {
    try {
      const allTodos = await TodoService.getAll(workspaceId)
      set({ allTodos })
    } catch (err) {
      log.error('Failed to load all todos', { err })
    }
  },

  loadForCustomer: async (customerId) => {
    set({ isLoading: true, error: null })
    try {
      const todos = await TodoService.getByCustomer(customerId)
      set({ todos, isLoading: false })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
      log.error('Failed to load todos', { error })
    }
  },

  upsert: async (payload) => {
    try {
      const updated = await TodoService.upsert(payload)
      set(s => ({
        todos:    upsertById(s.todos, updated),
        allTodos: upsertById(s.allTodos, updated),
      }))
      return updated
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  remove: async (id) => {
    try {
      await TodoService.delete(id)
      set(s => ({
        todos:    s.todos.filter(t => t.id !== id),
        allTodos: s.allTodos.filter(t => t.id !== id),
      }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  complete: async (id) => {
    const current = get().allTodos.find(t => t.id === id)
    if (!current) return
    await get().upsert({ ...todoToPayload(current), status: 'done', bucket: 'done' })
  },

  postpone: async (id) => {
    const current = get().allTodos.find(t => t.id === id)
    if (!current) return
    const nextDate = new Date()
    nextDate.setDate(nextDate.getDate() + 1)
    nextDate.setHours(9, 0, 0, 0)
    await get().upsert({
      ...todoToPayload(current),
      scheduledAt: nextDate.toISOString(),
      bucket: 'backlog',
    })
  },

  setBucket: async (id, bucket) => {
    const current = get().allTodos.find(t => t.id === id)
    if (!current) return
    let status = current.status
    let scheduledAt = current.scheduledAt
    if (bucket === 'done')        status = 'done'
    if (bucket === 'in_progress') status = 'in_progress'
    if (bucket === 'today' && !scheduledAt) {
      const t = new Date(); t.setHours(9, 0, 0, 0)
      scheduledAt = t.toISOString()
    }
    if (bucket === 'backlog' || bucket === 'today' || bucket === 'in_progress') {
      if (bucket !== 'today' && bucket !== 'in_progress') status = 'open'
    }
    await get().upsert({ ...todoToPayload(current), bucket, status, scheduledAt })
  },

  setScheduledAt: async (id, iso) => {
    const current = get().allTodos.find(t => t.id === id)
    if (!current) return
    await get().upsert({ ...todoToPayload(current), scheduledAt: iso })
  },

  setPriority: async (id, priority) => {
    const current = get().allTodos.find(t => t.id === id)
    if (!current) return
    await get().upsert({ ...todoToPayload(current), priority })
  },

  toggleChecklist: async (id, itemId) => {
    const current = get().allTodos.find(t => t.id === id)
    if (!current) return
    const nextChecklist = current.checklist.map(c =>
      c.id === itemId ? { ...c, done: !c.done } : c
    )
    await get().upsert({ ...todoToPayload(current), checklist: nextChecklist })
  },

  updateNotes: async (id, notes) => {
    const current = get().allTodos.find(t => t.id === id)
    if (!current) return
    await get().upsert({ ...todoToPayload(current), notes })
  },
}))
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: Errors nur in `TasksRoute.tsx` und ggf. anderen Stellen die alte Todo-Fields nutzen — alles unter Phase 3.

- [ ] **Step 3: Commit**

```bash
git add src/store/todos.store.ts
git commit -m "feat(todos): store actions for bucket, schedule, priority, checklist, notes"
```

---

## Phase 2 — Pure-Logic mit Tests

### Task 2.1: `prefix-parser.ts` mit Unit-Tests

**Files:**
- Create: `src/components/tasks/prefix-parser.ts`
- Create: `src/components/tasks/prefix-parser.test.ts`

- [ ] **Step 1: Failing-Test schreiben**

```ts
// src/components/tasks/prefix-parser.test.ts
import { describe, it, expect } from 'vitest'
import { parseTaskText } from './prefix-parser'

describe('parseTaskText', () => {
  it('parses plain title', () => {
    const r = parseTaskText('Brand Guidelines')
    expect(r.title).toBe('Brand Guidelines')
    expect(r.priority).toBeUndefined()
    expect(r.tags).toEqual([])
  })

  it('parses ! as p2', () => {
    const r = parseTaskText('! Kunde anrufen')
    expect(r.priority).toBe('p2')
    expect(r.title).toBe('Kunde anrufen')
  })

  it('parses !! as p1', () => {
    const r = parseTaskText('!! Dringende Sache')
    expect(r.priority).toBe('p1')
    expect(r.title).toBe('Dringende Sache')
  })

  it('parses ~30m as 30 minutes', () => {
    const r = parseTaskText('~30m Mail beantworten')
    expect(r.plannedMinutes).toBe(30)
    expect(r.title).toBe('Mail beantworten')
  })

  it('parses ~1h as 60 minutes', () => {
    const r = parseTaskText('~1h Code Review')
    expect(r.plannedMinutes).toBe(60)
  })

  it('parses ~1.5h as 90 minutes', () => {
    const r = parseTaskText('~1.5h Sprint Planning')
    expect(r.plannedMinutes).toBe(90)
  })

  it('parses #tag and #another', () => {
    const r = parseTaskText('#call #wichtig Onboarding-Call')
    expect(r.tags).toEqual(['call', 'wichtig'])
    expect(r.title).toBe('Onboarding-Call')
  })

  it('parses @10:00 as today at given time', () => {
    const r = parseTaskText('@10:00 Brand Guidelines')
    expect(r.scheduledAt).toBeDefined()
    const d = new Date(r.scheduledAt!)
    expect(d.getHours()).toBe(10)
    expect(d.getMinutes()).toBe(0)
    const today = new Date().toISOString().slice(0, 10)
    expect(r.scheduledAt!.slice(0, 10)).toBe(today)
  })

  it('parses @morgen as tomorrow 09:00', () => {
    const r = parseTaskText('@morgen Statuscall')
    expect(r.scheduledAt).toBeDefined()
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    expect(r.scheduledAt!.slice(0, 10)).toBe(tomorrow.toISOString().slice(0, 10))
  })

  it('parses +Kunde as customerHint', () => {
    const r = parseTaskText('+TechCorp Statusupdate')
    expect(r.customerHint).toBe('TechCorp')
    expect(r.title).toBe('Statusupdate')
  })

  it('parses combined tokens', () => {
    const r = parseTaskText('!! ~45m @10:00 #call +TechCorp Brand Guidelines')
    expect(r.priority).toBe('p1')
    expect(r.plannedMinutes).toBe(45)
    expect(r.scheduledAt).toBeDefined()
    expect(r.tags).toEqual(['call'])
    expect(r.customerHint).toBe('TechCorp')
    expect(r.title).toBe('Brand Guidelines')
  })

  it('does not parse ! inside word', () => {
    const r = parseTaskText('Test! Wichtig')
    expect(r.priority).toBeUndefined()
    expect(r.title).toBe('Test! Wichtig')
  })

  it('returns empty title when only tokens', () => {
    const r = parseTaskText('!! ~30m #foo')
    expect(r.title).toBe('')
  })

  it('handles trailing whitespace', () => {
    const r = parseTaskText('  ! Test  ')
    expect(r.priority).toBe('p2')
    expect(r.title).toBe('Test')
  })
})
```

- [ ] **Step 2: Run und sehen dass es failt**

Run: `npm test -- src/components/tasks/prefix-parser.test.ts --run`
Expected: FAIL (Module not found).

- [ ] **Step 3: `prefix-parser.ts` implementieren**

```ts
// src/components/tasks/prefix-parser.ts
import type { TodoPriority } from '@/types/todo.types'

export interface TaskDraft {
  title: string
  priority?: TodoPriority
  plannedMinutes?: number
  scheduledAt?: string
  tags: string[]
  customerHint?: string
}

const RE_PRIORITY = /^(!{1,2})$/
const RE_DURATION = /^~(\d+(?:\.\d+)?)(m|h)$/i
const RE_TIME     = /^@(\d{1,2}):(\d{2})$/
const RE_DATE_ISO = /^@(\d{4}-\d{2}-\d{2})$/
const RE_TAG      = /^#([\p{L}\p{N}_-]+)$/u
const RE_CUSTOMER = /^\+([\p{L}\p{N}_-]+)$/u

const WEEKDAY_MAP: Record<string, number> = {
  mo: 1, di: 2, mi: 3, do: 4, fr: 5, sa: 6, so: 0,
}

function todayAt(hour: number, minute: number): string {
  const d = new Date()
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

function tomorrowAt(hour = 9, minute = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

function nextWeekday(target: number): string {
  const d = new Date()
  const diff = (target - d.getDay() + 7) % 7 || 7
  d.setDate(d.getDate() + diff)
  d.setHours(9, 0, 0, 0)
  return d.toISOString()
}

function parseAtKeyword(value: string): string | undefined {
  const lower = value.toLowerCase()
  if (lower === 'heute')  return todayAt(new Date().getHours() + 1, 0)
  if (lower === 'morgen') return tomorrowAt()
  if (lower in WEEKDAY_MAP) return nextWeekday(WEEKDAY_MAP[lower])
  return undefined
}

export function parseTaskText(input: string): TaskDraft {
  const draft: TaskDraft = { title: '', tags: [] }
  const titleParts: string[] = []

  for (const token of input.trim().split(/\s+/)) {
    if (!token) continue

    if (RE_PRIORITY.test(token)) {
      draft.priority = token === '!!' ? 'p1' : 'p2'
      continue
    }
    const dur = token.match(RE_DURATION)
    if (dur) {
      const value = parseFloat(dur[1])
      draft.plannedMinutes = dur[2].toLowerCase() === 'h'
        ? Math.round(value * 60)
        : Math.round(value)
      continue
    }
    const tm = token.match(RE_TIME)
    if (tm) {
      draft.scheduledAt = todayAt(parseInt(tm[1], 10), parseInt(tm[2], 10))
      continue
    }
    const iso = token.match(RE_DATE_ISO)
    if (iso) {
      const d = new Date(iso[1] + 'T09:00:00')
      draft.scheduledAt = d.toISOString()
      continue
    }
    if (token.startsWith('@')) {
      const kw = parseAtKeyword(token.slice(1))
      if (kw) { draft.scheduledAt = kw; continue }
    }
    const tag = token.match(RE_TAG)
    if (tag) {
      draft.tags.push(tag[1])
      continue
    }
    const cust = token.match(RE_CUSTOMER)
    if (cust) {
      draft.customerHint = cust[1]
      continue
    }
    titleParts.push(token)
  }

  draft.title = titleParts.join(' ')
  return draft
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test -- src/components/tasks/prefix-parser.test.ts --run`
Expected: alle PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/tasks/prefix-parser.ts src/components/tasks/prefix-parser.test.ts
git commit -m "feat(tasks): prefix-parser for !/~/@/#/+ inline syntax"
```

---

### Task 2.2: `useFocusStack` Hook

**Files:**
- Create: `src/hooks/useFocusStack.ts`

- [ ] **Step 1: Hook implementieren**

```ts
// src/hooks/useFocusStack.ts
import { useMemo, useState, useCallback } from 'react'
import { useTodosStore } from '@/store/todos.store'
import type { Todo, TodoPriority } from '@/types/todo.types'

const PRIO_ORDER: Record<TodoPriority, number> = { p1: 0, p2: 1, p3: 2, p4: 3 }

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

function isToday(t: Todo): boolean {
  if (t.bucket === 'today' || t.bucket === 'in_progress') return true
  if (t.scheduledAt && t.scheduledAt.slice(0, 10) === todayDateString()) return true
  return false
}

function sortFocus(a: Todo, b: Todo): number {
  const p = PRIO_ORDER[a.priority] - PRIO_ORDER[b.priority]
  if (p !== 0) return p
  const sa = a.scheduledAt ?? ''
  const sb = b.scheduledAt ?? ''
  if (sa !== sb) return sa.localeCompare(sb)
  return a.createdAt.localeCompare(b.createdAt)
}

export interface FocusStackApi {
  stack: Todo[]
  currentIndex: number
  current: Todo | undefined
  total: number
  completedToday: number
  prev:     () => void
  skip:     () => void
  complete: () => Promise<void>
  postpone: () => Promise<void>
}

export function useFocusStack(): FocusStackApi {
  const allTodos = useTodosStore(s => s.allTodos)
  const complete = useTodosStore(s => s.complete)
  const postpone = useTodosStore(s => s.postpone)

  const stack = useMemo(
    () => allTodos.filter(t => isToday(t) && t.status !== 'done').sort(sortFocus),
    [allTodos],
  )
  const completedToday = useMemo(
    () => allTodos.filter(t => t.status === 'done' && t.updatedAt.slice(0, 10) === todayDateString()).length,
    [allTodos],
  )

  const [currentIndex, setCurrentIndex] = useState(0)

  const safeIndex = stack.length === 0 ? 0 : Math.min(currentIndex, stack.length - 1)
  const current = stack[safeIndex]

  const prev = useCallback(() => {
    setCurrentIndex(i => Math.max(0, i - 1))
  }, [])

  const skip = useCallback(() => {
    setCurrentIndex(i => {
      if (stack.length === 0) return 0
      return (i + 1) % stack.length
    })
  }, [stack.length])

  const completeAction = useCallback(async () => {
    if (!current) return
    await complete(current.id)
    // Index bleibt — der erledigte Task verschwindet, nachfolgender rückt nach.
  }, [current, complete])

  const postponeAction = useCallback(async () => {
    if (!current) return
    await postpone(current.id)
  }, [current, postpone])

  return {
    stack,
    currentIndex: safeIndex,
    current,
    total: stack.length,
    completedToday,
    prev,
    skip,
    complete: completeAction,
    postpone: postponeAction,
  }
}
```

- [ ] **Step 2: Test schreiben für Sortier-Helper (export sortFocus für Test)**

Hook-Test wäre umfangreich (Render + Store-Mock). Stattdessen testen wir die reine Sort-Funktion. Helper ans Hook-File exportieren:

In `src/hooks/useFocusStack.ts` `export` vor `function isToday` und `function sortFocus` setzen:

```ts
export function isToday(t: Todo): boolean { ... }
export function sortFocus(a: Todo, b: Todo): number { ... }
```

Test-File anlegen:

```ts
// src/hooks/useFocusStack.test.ts
import { describe, it, expect } from 'vitest'
import { sortFocus, isToday } from './useFocusStack'
import type { Todo } from '@/types/todo.types'

function makeTodo(p: Partial<Todo> & { id: string }): Todo {
  return {
    id: p.id,
    title: 'x',
    status: 'open',
    priority: 'p3',
    bucket: 'today',
    checklist: [],
    tags: [],
    createdAt: '2026-05-30T00:00:00',
    updatedAt: '2026-05-30T00:00:00',
    ...p,
  }
}

describe('sortFocus', () => {
  it('sorts p1 before p2', () => {
    const a = makeTodo({ id: 'a', priority: 'p2' })
    const b = makeTodo({ id: 'b', priority: 'p1' })
    expect([a, b].sort(sortFocus).map(t => t.id)).toEqual(['b', 'a'])
  })

  it('sorts within same priority by scheduledAt asc', () => {
    const a = makeTodo({ id: 'a', priority: 'p2', scheduledAt: '2026-05-30T15:00' })
    const b = makeTodo({ id: 'b', priority: 'p2', scheduledAt: '2026-05-30T09:00' })
    expect([a, b].sort(sortFocus).map(t => t.id)).toEqual(['b', 'a'])
  })

  it('falls back to createdAt when scheduledAt equal', () => {
    const a = makeTodo({ id: 'a', priority: 'p2', createdAt: '2026-05-30T10:00' })
    const b = makeTodo({ id: 'b', priority: 'p2', createdAt: '2026-05-30T09:00' })
    expect([a, b].sort(sortFocus).map(t => t.id)).toEqual(['b', 'a'])
  })
})

describe('isToday', () => {
  it('returns true when bucket is today', () => {
    expect(isToday(makeTodo({ id: 'a', bucket: 'today' }))).toBe(true)
  })

  it('returns true when bucket is in_progress', () => {
    expect(isToday(makeTodo({ id: 'a', bucket: 'in_progress' }))).toBe(true)
  })

  it('returns true when scheduledAt is today', () => {
    const todayIso = new Date().toISOString()
    expect(isToday(makeTodo({ id: 'a', bucket: 'backlog', scheduledAt: todayIso }))).toBe(true)
  })

  it('returns false when bucket is backlog without scheduledAt today', () => {
    expect(isToday(makeTodo({ id: 'a', bucket: 'backlog' }))).toBe(false)
  })
})
```

- [ ] **Step 3: Tests laufen lassen**

Run: `npm test -- src/hooks/useFocusStack.test.ts --run`
Expected: alle PASS.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useFocusStack.ts src/hooks/useFocusStack.test.ts
git commit -m "feat(tasks): useFocusStack hook with priority+time sorting"
```

---

## Phase 3 — UI-Komponenten

### Task 3.1: `ui.store.ts` `tasksTab` State

**Files:**
- Modify: `src/store/ui.store.ts`

- [ ] **Step 1: Tasks-Tab State hinzufügen**

`tasksTab` Eigenschaft und Setter ergänzen:

```ts
// finde den State-Type (z.B. interface UiState { ... })
// ergänze:
  tasksTab: 'list' | 'board' | 'focus'
  setTasksTab: (tab: 'list' | 'board' | 'focus') => void

// im create() initial:
  tasksTab: 'list',
  setTasksTab: (tab) => set({ tasksTab: tab }),
```

Wenn ui.store schon `persist` nutzt, ist Auto-Persistenz inklusive. Wenn nicht, ist es OK — localStorage-Save kann via Side-Effect erfolgen.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (für ui.store).

- [ ] **Step 3: Commit**

```bash
git add src/store/ui.store.ts
git commit -m "feat(ui): tasksTab state for Liste|Board|Fokus tab switching"
```

---

### Task 3.2: `TasksHeader` Komponente

**Files:**
- Create: `src/components/tasks/TasksHeader.tsx`

- [ ] **Step 1: Komponente implementieren**

```tsx
// src/components/tasks/TasksHeader.tsx
import { useUiStore } from '@/store/ui.store'
import { Sparkles, List, LayoutGrid, Target } from 'lucide-react'

interface Props {
  total: number
  completedToday: number
  plannedHours: number
  onOpenCyPanel: () => void
}

const TABS = [
  { id: 'list',  label: 'Liste', icon: List       },
  { id: 'board', label: 'Board', icon: LayoutGrid },
  { id: 'focus', label: 'Fokus', icon: Target     },
] as const

export function TasksHeader({ total, completedToday, plannedHours, onOpenCyPanel }: Props) {
  const tasksTab    = useUiStore(s => s.tasksTab)
  const setTasksTab = useUiStore(s => s.setTasksTab)

  const denominator = Math.max(total, 1)
  const ringPct = Math.min(100, (completedToday / denominator) * 100)

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 18,
      padding: '14px 0 20px',
    }}>
      {/* Ring */}
      <div style={{ position: 'relative', width: 60, height: 60, flexShrink: 0 }}>
        <svg width="60" height="60" viewBox="0 0 60 60">
          <circle cx="30" cy="30" r="26" fill="none"
            stroke="oklch(50% 0 0 / 0.15)" strokeWidth="4" />
          <circle cx="30" cy="30" r="26" fill="none"
            stroke="var(--accent)" strokeWidth="4"
            strokeDasharray={`${(ringPct / 100) * 163.36} 163.36`}
            strokeLinecap="round"
            transform="rotate(-90 30 30)"
            style={{ transition: 'stroke-dasharray 400ms' }} />
        </svg>
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 600, color: 'var(--fg)',
          fontFamily: 'var(--font-mono)',
        }}>
          {completedToday}/{total}
        </div>
      </div>

      {/* Stats */}
      <div style={{ flex: 1 }}>
        <div className="card-label" style={{ marginBottom: 4 }}>TAGESPLAN</div>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600,
          letterSpacing: '-0.02em', lineHeight: 1.1, margin: 0,
        }}>
          {total - completedToday} Aufgaben offen
        </h1>
        <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--fg-muted)' }}>
          ⏱ {plannedHours.toFixed(1)}h eingeplant · {total} gesamt
        </div>
      </div>

      {/* Cy-Button */}
      <button
        onClick={onOpenCyPanel}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 16px', borderRadius: 99,
          background: 'var(--accent-soft)', color: 'var(--accent-ink)',
          fontSize: 13, fontWeight: 600,
          border: '1px solid var(--accent)',
        }}
      >
        <Sparkles size={14} />
        Cy · Tag planen
      </button>

      {/* Tab-Switcher */}
      <div style={{
        display: 'inline-flex', gap: 2, padding: 3, borderRadius: 99,
        background: 'oklch(50% 0 0 / 0.06)', border: '1px solid var(--border)',
      }}>
        {TABS.map(t => {
          const active = tasksTab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTasksTab(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 99,
                fontSize: 12.5, fontWeight: 600,
                background: active ? 'var(--accent)' : 'transparent',
                color: active ? 'var(--accent-ink)' : 'var(--fg-muted)',
                transition: 'background 180ms, color 180ms',
              }}
            >
              <t.icon size={13} />
              {t.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/tasks/TasksHeader.tsx
git commit -m "feat(tasks): TasksHeader with progress ring, stats, Cy-btn, tab switcher"
```

---

### Task 3.3: `TaskComposer` mit TipTap

**Files:**
- Create: `src/components/tasks/TaskComposer.tsx`

- [ ] **Step 1: Composer implementieren**

```tsx
// src/components/tasks/TaskComposer.tsx
import { useEffect, useMemo, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { useTodosStore } from '@/store/todos.store'
import { useCustomersStore } from '@/store/customers.store'
import { parseTaskText } from './prefix-parser'
import { Plus, Send } from 'lucide-react'

const PRIO_LABEL: Record<string, string> = {
  p1: 'Dringend', p2: 'Hoch', p3: 'Normal', p4: 'Niedrig',
}

export function TaskComposer() {
  const upsert    = useTodosStore(s => s.upsert)
  const customers = useCustomersStore(s => s.customers)
  const [text, setText] = useState('')

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false, bulletList: false, orderedList: false,
        listItem: false, blockquote: false, codeBlock: false,
        horizontalRule: false,
      }),
      Placeholder.configure({
        placeholder: 'Was muss erledigt werden? "!! ~45m @10:00 #call +TechCorp …"',
      }),
    ],
    content: '',
    onUpdate: ({ editor }) => setText(editor.getText()),
    editorProps: {
      attributes: {
        class: 'tasks-composer-editor',
        style: 'outline:none; min-height:24px; padding:8px 4px; font-size:14px; color:var(--fg);',
      },
    },
  })

  const draft = useMemo(() => parseTaskText(text), [text])

  // Customer-Hint → reale customerId resolven (case-insensitive contains)
  const resolvedCustomerId = useMemo(() => {
    if (!draft.customerHint) return undefined
    const lower = draft.customerHint.toLowerCase()
    const match = customers.find(c => c.name.toLowerCase().includes(lower))
    return match?.id
  }, [draft.customerHint, customers])

  const submit = async () => {
    if (!editor) return
    if (!draft.title.trim() && !draft.customerHint && !draft.tags.length) return
    await upsert({
      title:          draft.title.trim() || '(ohne Titel)',
      priority:       draft.priority ?? 'p3',
      scheduledAt:    draft.scheduledAt,
      plannedMinutes: draft.plannedMinutes,
      tags:           draft.tags,
      customerId:     resolvedCustomerId,
      bucket:         draft.scheduledAt && draft.scheduledAt.slice(0, 10) === new Date().toISOString().slice(0, 10)
                      ? 'today' : 'backlog',
    })
    editor.commands.clearContent()
    setText('')
  }

  useEffect(() => {
    if (!editor) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey && editor.isFocused) {
        e.preventDefault()
        submit()
      }
    }
    const dom = editor.view.dom as HTMLElement
    dom.addEventListener('keydown', handler)
    return () => dom.removeEventListener('keydown', handler)
  }, [editor, draft, resolvedCustomerId])

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 10,
      padding: '14px 16px',
      background: 'var(--surface-2)', borderRadius: 14,
      border: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'oklch(50% 0 0 / 0.06)', color: 'var(--fg-muted)',
          flexShrink: 0, marginTop: 4,
        }}>
          <Plus size={14} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <EditorContent editor={editor} />
        </div>
        <button
          onClick={submit}
          disabled={!draft.title.trim() && !draft.tags.length}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 99,
            background: 'var(--accent)', color: 'var(--accent-ink)',
            fontSize: 12.5, fontWeight: 600,
            opacity: (draft.title.trim() || draft.tags.length) ? 1 : 0.4,
            cursor: (draft.title.trim() || draft.tags.length) ? 'pointer' : 'not-allowed',
            flexShrink: 0,
          }}
        >
          Hinzufügen
          <Send size={12} />
        </button>
      </div>

      {/* Live-Chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 11.5 }}>
        {draft.scheduledAt && (
          <Chip color="accent">
            📅 {new Date(draft.scheduledAt).toLocaleDateString('de', { day: '2-digit', month: 'short' })}
            {' · '}
            {new Date(draft.scheduledAt).toLocaleTimeString('de', { hour: '2-digit', minute: '2-digit' })}
          </Chip>
        )}
        {draft.priority && <Chip color="warn">● {PRIO_LABEL[draft.priority]}</Chip>}
        {draft.plannedMinutes && <Chip color="muted">⏱ {draft.plannedMinutes}m</Chip>}
        {draft.tags.map(t => <Chip key={t} color="muted">#{t}</Chip>)}
        {draft.customerHint && (
          <Chip color={resolvedCustomerId ? 'accent' : 'danger'}>
            +{draft.customerHint}
            {!resolvedCustomerId && ' (nicht gefunden)'}
          </Chip>
        )}
        {!draft.scheduledAt && !draft.priority && !draft.plannedMinutes && !draft.tags.length && !draft.customerHint && (
          <span style={{ color: 'var(--fg-dim)', fontSize: 11 }}>
            ! Priorität · ~Zeit · @ wann · # Tag · + Kunde
          </span>
        )}
      </div>
    </div>
  )
}

function Chip({ children, color }: { children: React.ReactNode; color: 'accent' | 'warn' | 'muted' | 'danger' }) {
  const bg = color === 'accent' ? 'var(--accent-soft)'
            : color === 'warn'  ? 'oklch(85% 0.13 60 / 0.18)'
            : color === 'danger' ? 'oklch(70% 0.18 25 / 0.18)'
            : 'oklch(50% 0 0 / 0.08)'
  const fg = color === 'accent' ? 'var(--accent-ink)'
            : color === 'warn'  ? 'oklch(50% 0.15 60)'
            : color === 'danger' ? 'oklch(50% 0.2 25)'
            : 'var(--fg-muted)'
  return (
    <span style={{
      padding: '3px 9px', borderRadius: 99,
      background: bg, color: fg, fontWeight: 600,
      fontSize: 11, letterSpacing: '0.01em',
    }}>
      {children}
    </span>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/tasks/TaskComposer.tsx
git commit -m "feat(tasks): TipTap-based composer with live prefix-syntax chips"
```

---

### Task 3.4: `TaskRow` + `TaskRowExpanded`

**Files:**
- Create: `src/components/tasks/TaskRow.tsx`

- [ ] **Step 1: TaskRow Komponente**

Eine Datei für beide Zustände (collapsed + expanded), via Toggle.

```tsx
// src/components/tasks/TaskRow.tsx
import { useState } from 'react'
import { useTodosStore } from '@/store/todos.store'
import { useCustomersStore } from '@/store/customers.store'
import type { Todo, TodoPriority } from '@/types/todo.types'
import { Trash2 } from 'lucide-react'

const PRIO_COLOR: Record<TodoPriority, string> = {
  p1: 'oklch(60% 0.2 25)',
  p2: 'oklch(70% 0.18 50)',
  p3: 'oklch(80% 0.15 90)',
  p4: 'oklch(55% 0 0)',
}
const PRIO_LABEL: Record<TodoPriority, string> = {
  p1: 'P1', p2: 'P2', p3: 'P3', p4: 'P4',
}

interface Props { todo: Todo }

export function TaskRow({ todo }: Props) {
  const [open, setOpen] = useState(false)
  const customers       = useCustomersStore(s => s.customers)
  const complete        = useTodosStore(s => s.complete)
  const remove          = useTodosStore(s => s.remove)
  const toggleChecklist = useTodosStore(s => s.toggleChecklist)
  const upsert          = useTodosStore(s => s.upsert)

  const customer = todo.customerId ? customers.find(c => c.id === todo.customerId) : undefined
  const doneCount = todo.checklist.filter(c => c.done).length

  const onToggleDone = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (todo.status === 'done') {
      // restore to open
      upsert({
        id: todo.id, customerId: todo.customerId, title: todo.title,
        status: 'open', bucket: 'backlog', priority: todo.priority,
        scheduledAt: todo.scheduledAt, plannedMinutes: todo.plannedMinutes,
        notes: todo.notes, aiSummary: todo.aiSummary,
        checklist: todo.checklist, tags: todo.tags,
      })
    } else {
      complete(todo.id)
    }
  }

  const timeLabel = todo.scheduledAt
    ? new Date(todo.scheduledAt).toLocaleTimeString('de', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div
      onClick={() => setOpen(o => !o)}
      style={{
        position: 'relative',
        display: 'flex', flexDirection: 'column',
        padding: '12px 14px',
        background: 'var(--surface-2)',
        border: '1px solid var(--border)', borderRadius: 12,
        cursor: 'pointer',
        marginBottom: 8,
        opacity: todo.status === 'done' ? 0.6 : 1,
      }}
    >
      {/* Linkstrich = Priorität */}
      <div style={{
        position: 'absolute', left: 0, top: 8, bottom: 8, width: 3,
        borderRadius: 99,
        background: PRIO_COLOR[todo.priority],
      }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={onToggleDone}
          style={{
            width: 18, height: 18, borderRadius: 99,
            border: `1.5px solid ${todo.status === 'done' ? 'var(--accent)' : 'var(--border-strong)'}`,
            background: todo.status === 'done' ? 'var(--accent)' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            fontSize: 10, color: 'var(--accent-ink)',
          }}
        >
          {todo.status === 'done' ? '✓' : ''}
        </button>

        <span style={{
          flex: 1, fontSize: 13.5, fontWeight: 500,
          color: 'var(--fg)',
          textDecoration: todo.status === 'done' ? 'line-through' : 'none',
        }}>
          {todo.title}
        </span>

        <span style={{
          fontSize: 10, fontWeight: 700,
          padding: '2px 6px', borderRadius: 6,
          background: `${PRIO_COLOR[todo.priority]}22`,
          color: PRIO_COLOR[todo.priority],
        }}>
          {PRIO_LABEL[todo.priority]}
        </span>

        {timeLabel && (
          <span style={{
            fontSize: 11.5, color: 'var(--fg-muted)',
            fontFamily: 'var(--font-mono)',
          }}>
            {timeLabel}
          </span>
        )}

        {todo.checklist.length > 0 && (
          <span style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>
            {doneCount}/{todo.checklist.length}
          </span>
        )}

        {todo.plannedMinutes && (
          <span style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>
            {todo.plannedMinutes}m
          </span>
        )}
      </div>

      {/* Tags + Customer Footer */}
      {((todo.tags.length > 0) || customer) && (
        <div style={{
          display: 'flex', gap: 8, marginTop: 6, marginLeft: 28,
          fontSize: 11, color: 'var(--fg-dim)',
        }}>
          {customer && <span>● {customer.name}</span>}
          {todo.tags.map(t => <span key={t}>#{t}</span>)}
        </div>
      )}

      {/* Expanded */}
      {open && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            marginTop: 12, marginLeft: 28,
            paddingTop: 12, borderTop: '1px dashed var(--border)',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}
        >
          {todo.checklist.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="card-label">Teilschritte</div>
              {todo.checklist.map(item => (
                <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={() => toggleChecklist(todo.id, item.id)}
                  />
                  <span style={{ textDecoration: item.done ? 'line-through' : 'none', color: item.done ? 'var(--fg-muted)' : 'var(--fg)' }}>
                    {item.text}
                  </span>
                </label>
              ))}
            </div>
          )}

          {todo.notes && (
            <div>
              <div className="card-label">Notiz</div>
              <div style={{
                fontSize: 12.5, lineHeight: 1.5, color: 'var(--fg-2)',
                padding: '8px 10px', borderRadius: 8,
                background: 'oklch(50% 0 0 / 0.04)',
              }}>
                {todo.notes}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => remove(todo.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 11, color: 'var(--fg-dim)',
                padding: '4px 8px', borderRadius: 6,
                background: 'transparent',
              }}
            >
              <Trash2 size={12} />
              Löschen
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/tasks/TaskRow.tsx
git commit -m "feat(tasks): TaskRow with inline-expansion for checklist + notes"
```

---

### Task 3.5: `TasksListView`

**Files:**
- Create: `src/components/tasks/TasksListView.tsx`

- [ ] **Step 1: Liste-View mit Sektionen**

```tsx
// src/components/tasks/TasksListView.tsx
import { useMemo, useState } from 'react'
import { useTodosStore } from '@/store/todos.store'
import { TaskRow } from './TaskRow'
import { TaskComposer } from './TaskComposer'
import type { Todo } from '@/types/todo.types'

type GroupBy = 'time' | 'priority'

function dayDiff(iso: string | undefined): number | null {
  if (!iso) return null
  const date = new Date(iso); date.setHours(0, 0, 0, 0)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.round((date.getTime() - today.getTime()) / 86_400_000)
}

function timeSection(t: Todo): string {
  const d = dayDiff(t.scheduledAt)
  if (t.status === 'done') return 'erledigt'
  if (d === 0)             return 'heute'
  if (d === 1)             return 'morgen'
  if (d !== null && d >= 2 && d <= 6) return 'woche'
  if (d !== null && d > 6) return 'spaeter'
  return 'backlog'
}

const TIME_SECTIONS: { id: string; label: string }[] = [
  { id: 'heute',    label: 'Heute' },
  { id: 'morgen',   label: 'Morgen' },
  { id: 'woche',    label: 'Diese Woche' },
  { id: 'spaeter',  label: 'Später' },
  { id: 'backlog',  label: 'Backlog' },
  { id: 'erledigt', label: 'Erledigt' },
]

const PRIORITY_SECTIONS = [
  { id: 'p1', label: 'P1 — Dringend' },
  { id: 'p2', label: 'P2 — Hoch'     },
  { id: 'p3', label: 'P3 — Normal'   },
  { id: 'p4', label: 'P4 — Niedrig'  },
]

export function TasksListView() {
  const todos = useTodosStore(s => s.allTodos)
  const [groupBy, setGroupBy] = useState<GroupBy>('time')

  const grouped = useMemo(() => {
    const map: Record<string, Todo[]> = {}
    for (const t of todos) {
      const key = groupBy === 'time' ? timeSection(t) : t.priority
      ;(map[key] ??= []).push(t)
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => {
        const sa = a.scheduledAt ?? ''
        const sb = b.scheduledAt ?? ''
        if (sa !== sb) return sa.localeCompare(sb)
        return a.priority.localeCompare(b.priority)
      })
    }
    return map
  }, [todos, groupBy])

  const openCount = todos.filter(t => t.status !== 'done').length
  const doneCount = todos.filter(t => t.status === 'done').length

  const sections = groupBy === 'time' ? TIME_SECTIONS : PRIORITY_SECTIONS

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <TaskComposer />

      {/* Toolbar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontSize: 11.5,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="card-label">Gruppieren</span>
          <button
            onClick={() => setGroupBy('time')}
            style={{
              padding: '4px 10px', borderRadius: 99, fontSize: 11.5, fontWeight: 600,
              background: groupBy === 'time' ? 'var(--accent)' : 'transparent',
              color:      groupBy === 'time' ? 'var(--accent-ink)' : 'var(--fg-muted)',
            }}
          >Zeit</button>
          <button
            onClick={() => setGroupBy('priority')}
            style={{
              padding: '4px 10px', borderRadius: 99, fontSize: 11.5, fontWeight: 600,
              background: groupBy === 'priority' ? 'var(--accent)' : 'transparent',
              color:      groupBy === 'priority' ? 'var(--accent-ink)' : 'var(--fg-muted)',
            }}
          >Priorität</button>
        </div>
        <span style={{ color: 'var(--fg-muted)' }}>
          {openCount} offen · {doneCount} erledigt
        </span>
      </div>

      {/* Sektionen */}
      {sections.map(sec => {
        const items = grouped[sec.id] ?? []
        if (items.length === 0) return null
        return (
          <div key={sec.id}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              marginBottom: 8,
            }}>
              <h3 style={{
                fontSize: 13.5, fontWeight: 700,
                color: sec.id === 'erledigt' ? 'var(--fg-muted)' : 'var(--fg)',
                margin: 0,
              }}>
                {sec.label}
              </h3>
              <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{items.length}</span>
            </div>
            {items.map(t => <TaskRow key={t.id} todo={t} />)}
          </div>
        )
      })}

      {todos.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--fg-dim)', fontSize: 13 }}>
          Noch keine Tasks. Tippe oben deinen ersten ein.
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/tasks/TasksListView.tsx
git commit -m "feat(tasks): TasksListView with time/priority grouping"
```

---

### Task 3.6: `TaskBoardCard` + `TasksBoardView` mit DnD

**Files:**
- Create: `src/components/tasks/TaskBoardCard.tsx`
- Create: `src/components/tasks/TasksBoardView.tsx`

- [ ] **Step 1: BoardCard**

```tsx
// src/components/tasks/TaskBoardCard.tsx
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { Todo, TodoPriority } from '@/types/todo.types'

const PRIO_COLOR: Record<TodoPriority, string> = {
  p1: 'oklch(60% 0.2 25)',
  p2: 'oklch(70% 0.18 50)',
  p3: 'oklch(80% 0.15 90)',
  p4: 'oklch(55% 0 0)',
}
const PRIO_LABEL: Record<TodoPriority, string> = {
  p1: 'P1', p2: 'P2', p3: 'P3', p4: 'P4',
}

export function TaskBoardCard({ todo }: { todo: Todo }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: todo.id,
    data: { todo },
  })
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: 12,
    cursor: 'grab',
    fontSize: 12.5,
    display: 'flex', flexDirection: 'column', gap: 6,
  }

  const doneCount = todo.checklist.filter(c => c.done).length
  const time = todo.scheduledAt
    ? new Date(todo.scheduledAt).toLocaleTimeString('de', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{
          fontSize: 10, fontWeight: 700,
          padding: '2px 6px', borderRadius: 6,
          background: `${PRIO_COLOR[todo.priority]}22`,
          color: PRIO_COLOR[todo.priority],
        }}>
          {PRIO_LABEL[todo.priority]}
        </span>
        {time && <span style={{ fontSize: 11, color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)' }}>{time}</span>}
      </div>
      <div style={{
        fontWeight: 600, color: 'var(--fg)',
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
        textDecoration: todo.status === 'done' ? 'line-through' : 'none',
      }}>
        {todo.title}
      </div>
      <div style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--fg-dim)' }}>
        {todo.checklist.length > 0 && <span>{doneCount}/{todo.checklist.length}</span>}
        {todo.plannedMinutes && <span>⏱ {todo.plannedMinutes}m</span>}
        {todo.tags.map(t => <span key={t}>#{t}</span>)}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: BoardView**

```tsx
// src/components/tasks/TasksBoardView.tsx
import { useMemo } from 'react'
import { DndContext, useDroppable, type DragEndEvent } from '@dnd-kit/core'
import { useTodosStore } from '@/store/todos.store'
import type { Todo, TodoBucket } from '@/types/todo.types'
import { TaskBoardCard } from './TaskBoardCard'
import { TaskComposer } from './TaskComposer'

const COLUMNS: { id: TodoBucket; label: string; hint: string }[] = [
  { id: 'backlog',     label: 'Backlog',    hint: 'Alles offene' },
  { id: 'today',       label: 'Heute',      hint: 'Heute geplant' },
  { id: 'in_progress', label: 'In Arbeit',  hint: 'Gerade dran' },
  { id: 'done',        label: 'Erledigt',   hint: 'Geschafft' },
]

function DropColumn({
  id, label, hint, items,
}: { id: TodoBucket; label: string; hint: string; items: Todo[] }) {
  const { isOver, setNodeRef } = useDroppable({ id })
  const visible = id === 'done' ? items.slice(-10) : items
  return (
    <div
      ref={setNodeRef}
      style={{
        flex: 1, minWidth: 0,
        background: isOver ? 'var(--accent-soft)' : 'oklch(50% 0 0 / 0.03)',
        border: '1px solid var(--border)',
        borderRadius: 14, padding: 12,
        display: 'flex', flexDirection: 'column', gap: 10,
        transition: 'background 180ms',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <h4 style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>{label}</h4>
          <p style={{ fontSize: 10.5, color: 'var(--fg-dim)', margin: 0, marginTop: 2 }}>{hint}</p>
        </div>
        <span style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>{items.length}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 60 }}>
        {visible.length === 0 && (
          <div style={{
            border: '1px dashed var(--border)', borderRadius: 10,
            padding: 12, textAlign: 'center',
            fontSize: 11, color: 'var(--fg-dim)',
          }}>
            – hierher ziehen –
          </div>
        )}
        {visible.map(t => <TaskBoardCard key={t.id} todo={t} />)}
      </div>
    </div>
  )
}

export function TasksBoardView() {
  const todos     = useTodosStore(s => s.allTodos)
  const setBucket = useTodosStore(s => s.setBucket)

  const byBucket = useMemo(() => {
    const map: Record<TodoBucket, Todo[]> = {
      backlog: [], today: [], in_progress: [], done: [],
    }
    for (const t of todos) (map[t.bucket] ??= []).push(t)
    return map
  }, [todos])

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over) return
    const newBucket = e.over.id as TodoBucket
    setBucket(String(e.active.id), newBucket)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <TaskComposer />
      <DndContext onDragEnd={onDragEnd}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
          {COLUMNS.map(col => (
            <DropColumn key={col.id} {...col} items={byBucket[col.id] ?? []} />
          ))}
        </div>
      </DndContext>
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/tasks/TaskBoardCard.tsx src/components/tasks/TasksBoardView.tsx
git commit -m "feat(tasks): TasksBoardView with 4-column kanban + dnd-kit"
```

---

### Task 3.7: `TaskFocusCard` + `TasksFocusView`

**Files:**
- Create: `src/components/tasks/TaskFocusCard.tsx`
- Create: `src/components/tasks/TasksFocusView.tsx`

- [ ] **Step 1: FocusCard (große Karte)**

```tsx
// src/components/tasks/TaskFocusCard.tsx
import { useTodosStore } from '@/store/todos.store'
import { useCustomersStore } from '@/store/customers.store'
import type { Todo, TodoPriority } from '@/types/todo.types'
import { Sparkles } from 'lucide-react'

const PRIO_COLOR: Record<TodoPriority, string> = {
  p1: 'oklch(60% 0.2 25)',
  p2: 'oklch(70% 0.18 50)',
  p3: 'oklch(80% 0.15 90)',
  p4: 'oklch(55% 0 0)',
}
const PRIO_LABEL: Record<TodoPriority, string> = {
  p1: 'Dringend', p2: 'Hoch', p3: 'Normal', p4: 'Niedrig',
}

export function TaskFocusCard({ todo }: { todo: Todo }) {
  const customers       = useCustomersStore(s => s.customers)
  const toggleChecklist = useTodosStore(s => s.toggleChecklist)
  const customer = todo.customerId ? customers.find(c => c.id === todo.customerId) : undefined
  const time = todo.scheduledAt
    ? new Date(todo.scheduledAt).toLocaleString('de', {
        weekday: 'short', day: '2-digit', month: 'short',
        hour: '2-digit', minute: '2-digit',
      })
    : null
  const doneCount = todo.checklist.filter(c => c.done).length

  return (
    <div style={{
      position: 'relative',
      background: 'var(--surface-2)',
      borderLeft: `4px solid ${PRIO_COLOR[todo.priority]}`,
      borderRadius: 18,
      padding: '28px 32px',
      display: 'flex', flexDirection: 'column', gap: 22,
      boxShadow: '0 8px 30px -10px oklch(0% 0 0 / 0.25)',
    }}>
      <div style={{ display: 'flex', gap: 10, fontSize: 11.5, alignItems: 'center' }}>
        <span style={{ color: PRIO_COLOR[todo.priority], fontWeight: 700 }}>
          ● {PRIO_LABEL[todo.priority]}
        </span>
        {time && <span style={{ color: 'var(--fg-muted)' }}>{time}</span>}
        {customer && <span style={{ color: 'var(--accent-ink)' }}>● {customer.name}</span>}
        {todo.aiSummary && <span style={{ color: 'var(--accent)', fontWeight: 600 }}>● Cy vorbereitet</span>}
      </div>

      <h1 style={{
        fontFamily: 'var(--font-display)',
        fontSize: 36, fontWeight: 600,
        letterSpacing: '-0.02em', lineHeight: 1.05, margin: 0,
      }}>
        {todo.title}
      </h1>

      {todo.aiSummary && (
        <div style={{
          background: 'var(--accent-soft)',
          border: '1px solid var(--accent)',
          borderRadius: 12,
          padding: '14px 18px',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 11, fontWeight: 700,
            color: 'var(--accent-ink)',
            textTransform: 'uppercase', letterSpacing: '0.08em',
            marginBottom: 6,
          }}>
            <Sparkles size={12} />
            Cy · Vorbereitet
          </div>
          <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--fg)', margin: 0 }}>
            {todo.aiSummary}
          </p>
        </div>
      )}

      {todo.checklist.length > 0 && (
        <div>
          <div className="card-label" style={{ marginBottom: 10 }}>
            Teilschritte · {doneCount}/{todo.checklist.length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {todo.checklist.map(item => (
              <label key={item.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                fontSize: 15, cursor: 'pointer',
                color: item.done ? 'var(--fg-muted)' : 'var(--fg)',
              }}>
                <button
                  onClick={() => toggleChecklist(todo.id, item.id)}
                  style={{
                    width: 22, height: 22, borderRadius: 99,
                    border: `1.5px solid ${item.done ? 'var(--accent)' : 'var(--border-strong)'}`,
                    background: item.done ? 'var(--accent)' : 'transparent',
                    color: 'var(--accent-ink)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, fontSize: 12,
                  }}
                >
                  {item.done ? '✓' : ''}
                </button>
                <span style={{ textDecoration: item.done ? 'line-through' : 'none' }}>
                  {item.text}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: FocusView**

```tsx
// src/components/tasks/TasksFocusView.tsx
import { useEffect } from 'react'
import { useFocusStack } from '@/hooks/useFocusStack'
import { TaskFocusCard } from './TaskFocusCard'
import { ChevronLeft, ChevronRight, Check, Clock } from 'lucide-react'

export function TasksFocusView() {
  const stack = useFocusStack()
  const { current, currentIndex, total, prev, skip, complete, postpone } = stack

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === ' ')          { e.preventDefault(); complete() }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); prev() }
      if (e.key === 'ArrowRight') { e.preventDefault(); skip() }
      if (e.key.toLowerCase() === 'm') { e.preventDefault(); postpone() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [complete, prev, skip, postpone])

  if (total === 0) {
    return (
      <div style={{
        textAlign: 'center', padding: '96px 24px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
      }}>
        <div style={{ fontSize: 48 }}>🙌</div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600, margin: 0 }}>
          Tag geschafft!
        </h2>
        <p style={{ fontSize: 14, color: 'var(--fg-muted)', margin: 0 }}>
          Keine offenen Aufgaben für heute. Wechsle zu Liste oder Board.
        </p>
      </div>
    )
  }
  if (!current) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 800, margin: '0 auto' }}>
      {/* Pagination */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--fg-dim)', letterSpacing: '0.08em' }}>
          AUFGABE {currentIndex + 1} VON {total}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          {Array.from({ length: total }).map((_, i) => (
            <div key={i} style={{
              width: 8, height: 8, borderRadius: 99,
              background: i === currentIndex ? 'var(--accent)' : 'oklch(50% 0 0 / 0.15)',
            }} />
          ))}
        </div>
      </div>

      <TaskFocusCard todo={current} />

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button
          onClick={prev}
          disabled={currentIndex === 0}
          style={{
            width: 44, height: 44, borderRadius: 99,
            background: 'oklch(50% 0 0 / 0.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--fg-muted)',
            opacity: currentIndex === 0 ? 0.4 : 1,
          }}
          aria-label="Zurück"
        >
          <ChevronLeft size={18} />
        </button>

        <button
          onClick={complete}
          style={{
            flex: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '14px 24px', borderRadius: 99,
            background: 'var(--accent)', color: 'var(--accent-ink)',
            fontSize: 14, fontWeight: 700,
            boxShadow: '0 8px 24px -10px var(--accent-glow)',
          }}
        >
          <Check size={16} />
          Erledigt · weiter
          <span style={{ marginLeft: 8, fontSize: 10, opacity: 0.7, fontFamily: 'var(--font-mono)' }}>SPACE</span>
        </button>

        <button
          onClick={postpone}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '12px 18px', borderRadius: 99,
            background: 'oklch(50% 0 0 / 0.08)',
            color: 'var(--fg)',
            fontSize: 13, fontWeight: 600,
          }}
        >
          <Clock size={14} />
          Morgen
          <span style={{ fontSize: 10, opacity: 0.6, fontFamily: 'var(--font-mono)' }}>M</span>
        </button>

        <button
          onClick={skip}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 13, color: 'var(--fg-muted)',
            padding: '12px 16px',
          }}
        >
          Überspringen
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/tasks/TaskFocusCard.tsx src/components/tasks/TasksFocusView.tsx
git commit -m "feat(tasks): TasksFocusView with one-card stack + keyboard nav"
```

---

### Task 3.8: `CyPlanPanel` Mock Slide-In

**Files:**
- Create: `src/components/tasks/CyPlanPanel.tsx`

- [ ] **Step 1: Slide-In implementieren**

```tsx
// src/components/tasks/CyPlanPanel.tsx
import { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, X } from 'lucide-react'
import { useTodosStore } from '@/store/todos.store'
import type { Todo, TodoPriority } from '@/types/todo.types'

const PRIO_ORDER: Record<TodoPriority, number> = { p1: 0, p2: 1, p3: 2, p4: 3 }

const REASON_BY_PRIO: Record<TodoPriority, string> = {
  p1: 'Dringend — sollte als erstes erledigt werden, blockiert sonst andere Themen.',
  p2: 'Wichtig — heute angesetzt, einfacher Win.',
  p3: 'Routine — wenn Zeit übrig, gut für den Fluss.',
  p4: 'Wenn-Zeit-Slot — niedrige Priorität, kein Stress.',
}

interface Props { open: boolean; onClose: () => void }

export function CyPlanPanel({ open, onClose }: Props) {
  const todos = useTodosStore(s => s.allTodos)
  const todayPlan = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return todos
      .filter(t => t.status !== 'done' && (t.bucket === 'today' || t.scheduledAt?.slice(0, 10) === today))
      .sort((a, b) => {
        const p = PRIO_ORDER[a.priority] - PRIO_ORDER[b.priority]
        if (p !== 0) return p
        return (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? '')
      })
  }, [todos])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 60 }}
          />
          <motion.div
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            style={{
              position: 'fixed', right: 0, top: 0, bottom: 0,
              width: 'min(440px, 92vw)',
              background: 'var(--bg)',
              borderLeft: '1px solid var(--border)',
              zIndex: 70,
              padding: '28px 26px',
              overflowY: 'auto',
              display: 'flex', flexDirection: 'column', gap: 18,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>
                  <Sparkles size={12} /> CY · TAG GEPLANT
                </div>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 600, margin: '6px 0 0' }}>
                  Dein Fahrplan für heute
                </h2>
              </div>
              <button onClick={onClose} style={{
                width: 32, height: 32, borderRadius: 10,
                background: 'oklch(50% 0 0 / 0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <X size={14} />
              </button>
            </div>

            {todayPlan.length === 0 ? (
              <p style={{ color: 'var(--fg-muted)', fontSize: 13 }}>
                Keine Tasks für heute. Setze welche in Liste oder Board.
              </p>
            ) : todayPlan.map((t, i) => (
              <div key={t.id} style={{
                display: 'flex', flexDirection: 'column', gap: 6,
                padding: '14px 16px',
                background: 'var(--surface-2)',
                borderRadius: 12,
                border: '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: 99,
                    background: 'var(--accent)', color: 'var(--accent-ink)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700,
                  }}>{i + 1}</span>
                  <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--fg)' }}>{t.title}</span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.5, margin: '4px 0 0', paddingLeft: 30 }}>
                  {REASON_BY_PRIO[t.priority]}
                </p>
              </div>
            ))}

            <button style={{
              marginTop: 'auto',
              padding: '12px 18px', borderRadius: 99,
              background: 'var(--accent)', color: 'var(--accent-ink)',
              fontSize: 13, fontWeight: 700,
              opacity: 0.5, cursor: 'not-allowed',
            }} title="Demnächst">
              Plan übernehmen
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/tasks/CyPlanPanel.tsx
git commit -m "feat(tasks): CyPlanPanel — mocked AI day-planner slide-in"
```

---

### Task 3.9: `TasksRoute` Rewrite

**Files:**
- Modify: `src/routes/TasksRoute.tsx` (komplett ersetzen)

- [ ] **Step 1: Neue Route schreiben**

Komplett ersetzen:

```tsx
// src/routes/TasksRoute.tsx
import { useEffect, useMemo, useState } from 'react'
import { useTodosStore } from '@/store/todos.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useUiStore } from '@/store/ui.store'
import { TasksHeader } from '@/components/tasks/TasksHeader'
import { TasksListView } from '@/components/tasks/TasksListView'
import { TasksBoardView } from '@/components/tasks/TasksBoardView'
import { TasksFocusView } from '@/components/tasks/TasksFocusView'
import { CyPlanPanel } from '@/components/tasks/CyPlanPanel'

export function TasksRoute() {
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId)
  const loadAll     = useTodosStore(s => s.loadAll)
  const allTodos    = useTodosStore(s => s.allTodos)
  const tasksTab    = useUiStore(s => s.tasksTab)

  const [cyOpen, setCyOpen] = useState(false)

  useEffect(() => {
    if (workspaceId) loadAll(workspaceId)
  }, [workspaceId, loadAll])

  const total = allTodos.filter(t => t.status !== 'done').length + 0
  const completedToday = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return allTodos.filter(t => t.status === 'done' && t.updatedAt.slice(0, 10) === today).length
  }, [allTodos])
  const plannedHours = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return allTodos
      .filter(t => t.status !== 'done' && (t.bucket === 'today' || t.scheduledAt?.slice(0, 10) === today))
      .reduce((sum, t) => sum + (t.plannedMinutes ?? 0), 0) / 60
  }, [allTodos])

  return (
    <div className="main-inner">
      <TasksHeader
        total={total + completedToday}
        completedToday={completedToday}
        plannedHours={plannedHours}
        onOpenCyPanel={() => setCyOpen(true)}
      />

      {tasksTab === 'list'  && <TasksListView />}
      {tasksTab === 'board' && <TasksBoardView />}
      {tasksTab === 'focus' && <TasksFocusView />}

      <CyPlanPanel open={cyOpen} onClose={() => setCyOpen(false)} />
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS — die alte TasksRoute-fehler sollten weg sein.

- [ ] **Step 3: Commit**

```bash
git add src/routes/TasksRoute.tsx
git commit -m "feat(tasks): rewrite TasksRoute as 3-tab container (Liste/Board/Fokus)"
```

---

## Phase 4 — Sample-Daten & Cleanup

### Task 4.1: Seed Sample AI-Summaries

**Files:**
- Create: `src/lib/seed-ai-summaries.ts`
- Modify: `src/App.tsx` (oder Einstiegspunkt der App-Initialisierung)

- [ ] **Step 1: Seed-Helper**

```ts
// src/lib/seed-ai-summaries.ts
import { useTodosStore } from '@/store/todos.store'

const SEED_FLAG = 'cynera.tasks.ai-summary-seeded.v1'

const SAMPLE_SUMMARIES = [
  'Letzter Stand: erste Iteration vorbereitet, Kunde hat Feedback zur Farbpalette gegeben. Heute: Reinarbeiten und finale Version vorschlagen.',
  'Kontext: Kunde wartet seit 2 Tagen auf Rückmeldung. Heute kurz anrufen, offene Fragen klären, danach mit Designupdate weitermachen.',
  'Vorbereitung Call: Agenda-Punkte sammeln, vorherige Notizen sichten, Beispiele aus letzter Woche bereithalten.',
  'Ablage: alle relevanten Dokumente liegen im Workspace-Ordner. Heute strukturieren und an Kunde freigeben.',
  'Nachfassen: Angebot ging vor einer Woche raus, höflicher Reminder ohne Druck, offen für Rückfragen.',
]

export async function seedSampleAiSummaries() {
  if (typeof window === 'undefined') return
  if (localStorage.getItem(SEED_FLAG)) return

  const store = useTodosStore.getState()
  const candidates = store.allTodos.filter(t => t.status !== 'done' && !t.aiSummary).slice(0, SAMPLE_SUMMARIES.length)
  if (candidates.length === 0) return

  for (let i = 0; i < candidates.length; i++) {
    const t = candidates[i]
    await store.upsert({
      id: t.id, customerId: t.customerId, title: t.title,
      status: t.status, priority: t.priority, bucket: t.bucket,
      scheduledAt: t.scheduledAt, plannedMinutes: t.plannedMinutes,
      dueDate: t.dueDate, notes: t.notes,
      aiSummary: SAMPLE_SUMMARIES[i],
      checklist: t.checklist, tags: t.tags, assignee: t.assignee,
    })
  }

  localStorage.setItem(SEED_FLAG, '1')
}
```

- [ ] **Step 2: Call beim App-Start nach Load**

Finde `App.tsx` Hauptkomponente (`src/App.tsx`). Ergänze einen `useEffect`, der nach `loadAll` einmalig den Seed läuft:

```tsx
// in App.tsx oder wo todos initial geladen werden:
import { seedSampleAiSummaries } from '@/lib/seed-ai-summaries'

// ... in einem useEffect nach loadAll:
useEffect(() => {
  if (!workspaceId) return
  loadAll(workspaceId).then(() => seedSampleAiSummaries())
}, [workspaceId, loadAll])
```

Wenn `App.tsx` schon ein `loadAll`-`useEffect` hat, einfach `.then(() => seedSampleAiSummaries())` anhängen.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/seed-ai-summaries.ts src/App.tsx
git commit -m "feat(tasks): seed sample aiSummary on first load for demo"
```

---

### Task 4.2: Alte Focus-Komponenten + FocusStore löschen

**Files:**
- Delete: `src/store/focus.store.ts`
- Delete: `src/types/focus.types.ts`
- Delete: `src/components/focus/FocusArea.tsx`
- Delete: `src/components/focus/Section.tsx`
- Delete: `src/components/focus/TaskCard.tsx`
- Delete: `src/components/focus/FocusMode.jsx`

- [ ] **Step 1: Vor dem Löschen: Imports prüfen**

Run: `grep -rn "from '@/store/focus.store'" src/`
Run: `grep -rn "from '@/types/focus.types'" src/`
Run: `grep -rn "components/focus/FocusArea" src/`
Run: `grep -rn "components/focus/Section" src/`
Run: `grep -rn "components/focus/TaskCard" src/`
Run: `grep -rn "components/focus/FocusMode" src/`

Expected: Treffer nur in den zu löschenden Files selbst oder in alten TasksRoute-Stellen (die wir schon ersetzt haben). Wenn doch echte Imports auftauchen — diese Imports vorher entfernen.

`FocusAiPane.tsx` bleibt erhalten — nicht löschen.

- [ ] **Step 2: Files löschen**

```bash
rm src/store/focus.store.ts
rm src/types/focus.types.ts
rm src/components/focus/FocusArea.tsx
rm src/components/focus/Section.tsx
rm src/components/focus/TaskCard.tsx
rm src/components/focus/FocusMode.jsx
```

(Auf Windows mit PowerShell: `Remove-Item` statt `rm`. Oder via `git rm`.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS — falls Fehler, die offending Imports entfernen.

- [ ] **Step 4: Tests**

Run: `npm test -- --run`
Expected: alle PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(tasks): remove obsolete FocusStore + FocusArea (replaced by Todo-based tasks)"
```

---

## Phase 5 — Verifikation

### Task 5.1: Full-Verify

- [ ] **Step 1: Backend-Tests**

Run: `cd src-tauri && cargo test`
Expected: alle PASS.

- [ ] **Step 2: Frontend-Tests**

Run: `npm test -- --run`
Expected: alle PASS.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS, keine Errors.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: erfolgreicher Build, kein Error.

- [ ] **Step 5: App starten (manuell)**

Run: `npm run tauri dev` (oder den projekt-spezifischen Dev-Command)
Expected: App startet ohne Crash.

Manuelle Checks:
1. Klick auf `Tasks` in Sidebar → 3-Tab-Layout sichtbar
2. Tab-Wechsel zwischen Liste/Board/Fokus funktioniert + persistiert nach Reload
3. Composer: tippe `!! ~30m @10:00 #call +<Kundenname> Test-Task` → Chips zeigen Werte → Enter erstellt Task in 'Heute'
4. Liste: Task erscheint in Heute-Sektion mit P1, Time, Tag, Customer-Hinweis
5. Klick auf Row → expandiert → zeigt Notizen-Block (falls vorhanden)
6. Checkbox-Klick → Task rutscht in Erledigt-Sektion
7. Board-Tab: 4 Spalten sichtbar, Drag&Drop zwischen Spalten ändert bucket
8. Fokus-Tab: aktuelle Task groß angezeigt, Pagination zeigt Total
9. Fokus: Space-Taste = erledigt + weiter, M-Taste = morgen, →/← = skip/prev
10. Cy-Button öffnet Slide-In mit gemockten Begründungen

Falls Probleme: vor Commit fixen.

- [ ] **Step 6: Final-Commit (falls Fixes)**

```bash
git add -A
git commit -m "fix(tasks): polishing after manual verification"
```

(Nur wenn nötig. Wenn alles direkt funktioniert: kein Extra-Commit.)

---

## Done-Kriterien (Akzeptanz-Checks aus dem Spec)

- [ ] Tasks-Sidebar-Item führt zu neuem 3-Tab-Layout
- [ ] Tab-Persistenz über Reload
- [ ] Composer parst `!!`, `!`, `~Xm`, `@HH:MM`, `@morgen`, `#tag`, `+Kunde` live als Chips
- [ ] Enter im Composer erstellt Task mit korrekten Werten
- [ ] Liste zeigt Sektionen (Heute/Morgen/Diese Woche/Später/Backlog/Erledigt)
- [ ] Klick auf Row in Liste = inline-Expansion
- [ ] Checkbox-Toggle in Liste = status done
- [ ] Board: DnD zwischen 4 Spalten, Side-Effects korrekt
- [ ] Fokus-View: Stack = heute, sortiert P1>P2>P3 + Uhrzeit
- [ ] Fokus: Erledigt · weiter, Morgen, Überspringen, ← zurück funktional
- [ ] Fokus: Tastatur-Bindings (Space, ←/→, M)
- [ ] Cy-Panel öffnet Slide-In mit Mock-Inhalt
- [ ] AI-Summary erscheint im Fokus-Card
- [ ] Migration: existierende Todos werden umgeschrieben (`high`→`p1` etc.) via Service-Mapping
- [ ] `customerId` jetzt optional — customer-lose Tasks anlegbar
- [ ] Alte Focus-Komponenten + Stores entfernt
