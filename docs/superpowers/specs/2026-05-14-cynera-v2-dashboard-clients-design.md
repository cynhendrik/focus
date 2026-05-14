# Cynera Focus v2 — Sub-Projekt 2: Dashboard + Clients
**Date:** 2026-05-14
**Status:** Approved
**Branch:** feature/v2-redesign

---

## Vision

Dashboard und Clients werden von Mock-Daten auf echte workspace-isolierte Daten umgestellt. Alle Kunden-Sub-Module (Todos, Notizen, Zeiteinträge, Ablage) werden nach dem in Sub-Projekt 1 etablierten Pattern workspace-aware gemacht. Neu hinzu kommen ein E-Mail-Tab (zugeordnete Emails pro Kunde) und ein Activity-Log-Tab (chronologische Aktivitätshistorie pro Kunde).

---

## Architektur-Überblick

Gleicher Pattern wie Customer (Sub-Projekt 1, Task 14) — 4-mal angewandt:

```
Rust DB layer         TypeScript Service      Zustand Store
─────────────────     ──────────────────      ─────────────
todo.rs               todo.service.ts         todos.store.ts
  + workspace_id        + workspaceId           + init(customerId)
  + sync_queue          + createdBy             + upsert / remove
  + count_open_in_ws                            + (Dashboard: countOpen)

note.rs               note.service.ts         notes.store.ts
time_entry.rs         timeEntry.service.ts    timeEntries.store.ts
folder.rs             folder.service.ts       folders.store.ts (update)
```

Zusätzlich:
- `activity_log` — neues SQLite-Table (Migration v4), wird von todo/note/time_entry/email-assign automatisch befüllt
- `get_emails_by_customer` — neuer Tauri Command, liest aus bestehender `emails`-Tabelle

---

## Datenbankschema

### Migration v4 — activity_log

```sql
CREATE TABLE IF NOT EXISTS activity_log (
  id           TEXT PRIMARY KEY,
  customer_id  TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT '',
  action_type  TEXT NOT NULL,
  -- Werte: 'todo_created' | 'todo_updated' | 'todo_completed'
  --        | 'note_created' | 'time_logged' | 'email_assigned'
  subject      TEXT NOT NULL,
  -- z.B. Todo-Titel, Notiz-Preview (erste 80 Zeichen), "1h 30m", E-Mail-Betreff
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_log_customer ON activity_log(customer_id, created_at DESC);
```

`CURRENT_VERSION` wird von 3 auf 4 angehoben.

### Bestehende Tabellen (bereits via Migration v2 erweitert)

Todos, notes, kpis, time_entries, folders, files, chat_messages haben bereits:
```sql
workspace_id  TEXT NOT NULL DEFAULT ''
created_by    TEXT NOT NULL DEFAULT ''
pending_sync  INTEGER NOT NULL DEFAULT 0
```

Diese Spalten werden jetzt aktiv genutzt.

---

## Workspace-aware Pattern (pro Modul)

### Todos

**Rust `db/todo.rs`:**
- `get_by_customer(conn, customer_id, workspace_id)` — zusätzlicher `AND workspace_id = ?` Filter
- `upsert(conn, payload)` — setzt `workspace_id`, `created_by`, `pending_sync = 1`, schreibt in `sync_queue` und `activity_log`
- `delete(conn, id, workspace_id)` — workspace_id Guard, schreibt in `sync_queue`
- `count_open_in_workspace(conn, workspace_id)` — NEU: `SELECT COUNT(*) FROM todos WHERE status = 'open' AND workspace_id = ?`

**`UpsertTodoPayload`** erhält:
```rust
pub workspace_id: String,
pub created_by: String,
```

**Activity Log beim upsert:**
- Neu (id ist None): `action_type = 'todo_created'`, `subject = payload.title`
- Update (id ist Some + status = 'done'): `action_type = 'todo_completed'`, `subject = payload.title`
- Update (id ist Some + status != 'done'): `action_type = 'todo_updated'`, `subject = payload.title`

### Notes

**Rust `db/note.rs`:**
- `get_by_customer(conn, customer_id, workspace_id)` — workspace_id Filter
- `upsert(conn, payload)` — workspace_id + sync_queue + activity_log (`note_created`, subject = erste 80 Zeichen)
- `delete(conn, id, workspace_id)` — workspace_id Guard + sync_queue

### TimeEntries

**Rust `db/time_entry.rs`:**
- `get_by_customer(conn, customer_id, workspace_id)` — workspace_id Filter
- `add(conn, payload)` — workspace_id + sync_queue + activity_log (`time_logged`, subject = formatierte Dauer z.B. "1h 30m")
- `delete(conn, id, workspace_id)` — workspace_id Guard + sync_queue

### Folders / Files

**Rust `db/folder.rs`:**
- `get_folders(conn, customer_id, workspace_id)` — workspace_id Filter
- `create_folder(conn, payload)` — workspace_id + sync_queue
- `delete_folder(conn, id, workspace_id)` — workspace_id Guard + sync_queue
- Files analog

### Activity Log

**Neues Rust-Modul `db/activity_log.rs`:**
```rust
pub fn log(conn: &Connection, customer_id: &str, workspace_id: &str,
           action_type: &str, subject: &str) -> Result<(), AppError>
// Wird intern von todo::upsert, note::upsert, time_entry::add, email::assign aufgerufen

pub fn get_by_customer(conn: &Connection, customer_id: &str, workspace_id: &str)
    -> Result<Vec<ActivityEntry>, AppError>
// ORDER BY created_at DESC LIMIT 100
```

### E-Mails pro Kunde

**Neuer Tauri Command `commands/email_customer.rs`** (oder in bestehende email commands):
```rust
#[tauri::command]
pub async fn get_emails_by_customer(
    db: State<'_, EmailDb>,
    customer_id: String,
) -> Result<Vec<Email>, AppError>
// SELECT * FROM emails WHERE customer_id = ? ORDER BY date DESC LIMIT 50
```

`email::assign_customer` schreibt zusätzlich in `activity_log` (`email_assigned`, subject = E-Mail-Betreff).

---

## TypeScript Layer

### Neue Stores

**`src/store/todos.store.ts`**
```typescript
interface TodosState {
  todos: Todo[]
  isLoading: boolean
  customerId: string | null
  init: (customerId: string) => Promise<void>
  upsert: (payload: UpsertTodoPayload) => Promise<void>
  remove: (id: string) => Promise<void>
  countOpen: () => number  // für Dashboard: todos.filter(t => t.status === 'open').length
}
// Liest workspaceId aus useWorkspaceStore, userId aus useAuthStore
```

**`src/store/notes.store.ts`** — analog, `init(customerId)`

**`src/store/timeEntries.store.ts`** — analog, `init(customerId)`

### Aktualisierte Stores

**`src/store/folders.store.ts`** — `workspaceId` ergänzen (bestehende Datei)

### Neue Services

```
src/services/todo.service.ts      — invoke('get_todos', { customerId, workspaceId })
src/services/note.service.ts      — invoke('get_notes', { customerId, workspaceId })
src/services/timeEntry.service.ts — invoke('get_time_entries', { customerId, workspaceId })
src/services/activityLog.service.ts — invoke('get_activity_log', { customerId, workspaceId })
src/services/emailCustomer.service.ts — invoke('get_emails_by_customer', { customerId })
```

### Neue Typen

```
src/types/todo.types.ts       — Todo, UpsertTodoPayload (+ workspaceId, createdBy)
src/types/note.types.ts       — Note, UpsertNotePayload
src/types/timeEntry.types.ts  — TimeEntry, AddTimeEntryPayload
src/types/activityLog.types.ts — ActivityEntry { id, customerId, workspaceId, actionType, subject, createdAt }
```

---

## Dashboard-Änderungen

**StatCards:** 3 statt 4 (Time Today entfällt)

```
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  Aktive Clients  │  │  Offene Todos    │  │  This Week       │
│  (echt, customers│  │  (echt, workspace│  │  Revenue         │
│   store)         │  │   todos count)   │  │  (Mock €12.35K)  │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

**`DashboardRoute.tsx`:**
- `useCustomersStore` → Aktive Clients (bleibt)
- `useTodosStore` NEU: `countOpenInWorkspace()` via neuer Tauri Command
- StatCard "Time Today" wird entfernt
- Revenue-Chart bleibt Mock

**Neuer Tauri Command:** `count_open_todos(workspace_id: String) -> Result<u32>`

---

## CustomerView — Tab-Überarbeitung

**Entfernte Tabs:** Kommunikation (Chat), KPIs

**Neue Tabs:** Mail, Historie

**Tab-Reihenfolge:**
```
Dashboard | Workflow | Zeit | Ablage | Mail | Historie | Health | Social
```

**Mail-Tab (`CustomerMailTab.tsx`):**
- Listet Emails mit `customer_id = aktuellerKunde`
- Zeigt: Absender, Betreff, Datum, Gelesen-Badge
- Klick → E-Mail-Body (bestehender `email_get_body`)
- Leerer State: "Noch keine E-Mails zugeordnet. Emails können im Mail-Modul zugewiesen werden."

**Historie-Tab (`CustomerHistoryTab.tsx`):**
```
Heute
  ✅  Todo abgeschlossen — "Angebot erstellen"          10:23
  ✏️  Todo erstellt — "Follow-up anrufen"               09:15

Gestern
  📝  Notiz erstellt — "Kunde möchte Rabatt auf..."     14:02
  ⏱   Zeit eingetragen — 1h 30m                         09:15

11. Mai
  📧  E-Mail zugeordnet — "Re: Projektstart"            16:44
```

Gruppiert nach Datum, Icon + Typ + Subject + Uhrzeit. Kein Editieren.

---

## Ordnerstruktur (neue Dateien)

```
src-tauri/src/
  db/
    activity_log.rs           — NEU: log() + get_by_customer()
    migrations.rs             — CURRENT_VERSION = 4, Migration v4 ergänzen
  commands/
    todo.rs                   — workspace_id Parameter ergänzen
    note.rs                   — workspace_id Parameter ergänzen
    time_entry.rs             — workspace_id Parameter ergänzen
    folder.rs                 — workspace_id Parameter ergänzen
    activity_log.rs           — NEU: get_activity_log + count_open_todos
  db/
    todo.rs                   — workspace_id, sync_queue, activity_log
    note.rs                   — workspace_id, sync_queue, activity_log
    time_entry.rs             — workspace_id, sync_queue, activity_log
    folder.rs                 — workspace_id, sync_queue

src/
  store/
    todos.store.ts            — NEU
    notes.store.ts            — NEU
    timeEntries.store.ts      — NEU
    folders.store.ts          — workspace_id ergänzen (bestehend)
  services/
    todo.service.ts           — NEU
    note.service.ts           — NEU
    timeEntry.service.ts      — NEU
    activityLog.service.ts    — NEU
    emailCustomer.service.ts  — NEU
  types/
    todo.types.ts             — NEU (oder bestehend erweitern)
    note.types.ts             — NEU
    timeEntry.types.ts        — NEU
    activityLog.types.ts      — NEU
  routes/
    DashboardRoute.tsx        — 3 StatCards, echte Todos-Anzahl
  components/
    customer/
      CustomerMailTab.tsx     — NEU
      CustomerHistoryTab.tsx  — NEU
      CustomerView.jsx        — Tabs aktualisieren (Mail+Historie rein, Chat+KPI raus)
      CustomerHeader.jsx      — Tab-Labels aktualisieren
```

---

## Was nicht in Scope ist

- KPI-Tab und Chat-Tab implementieren
- Revenue-Chart mit echten Invoice-Daten
- Zeiterfassung-Timer auf dem Dashboard (Time Today)
- Realtime-Kollaboration (live updates für andere User)
- Aktivitäten löschen oder editieren
- E-Mails direkt aus dem Kunden-Tab versenden
