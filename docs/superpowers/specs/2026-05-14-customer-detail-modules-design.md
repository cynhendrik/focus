# Customer Detail Modules — Design Spec

**Date:** 2026-05-14  
**Branch:** feature/v2-redesign  
**Scope:** 6-Tab Customer Detail View inside `CustomerRoute`

---

## Overview

Replace the current sparse `CustomerRoute` (header + WorkflowPane) with a full 6-tab detail view per customer. Each tab is an independent module with its own store and Rust command set, following the established `useCustomersStore` pattern.

---

## Architecture

### Tab Shell

`CustomerRoute` becomes a thin shell:

```
CustomerRoute
├── CustomerHeader    — name, status badge, edit button (unchanged)
├── TabBar            — 6 horizontal tabs
└── ActivePane        — mounted per tab
    ├── DashboardPane
    ├── WorkflowPane
    ├── KommunikationPane
    ├── DateienPane
    ├── HistoriePane
    └── ProfilPane
```

Tab state lives in `useUiStore` as:
```ts
activeCustomerTab: 'dashboard' | 'workflow' | 'kommunikation' | 'dateien' | 'historie' | 'profil'
```

### Store Map

| Store | Rust Commands | Data |
|---|---|---|
| `useTodosStore` | `get_todos`, `upsert_todo`, `delete_todo` | Todos + checklist |
| `useNotesStore` | `get_notes`, `upsert_note`, `delete_note` | All communication notes |
| `useDeadlinesStore` | `get_deadlines`, `upsert_deadline`, `delete_deadline` | Deadlines |
| `useFollowUpsStore` | `get_follow_ups`, `upsert_follow_up`, `delete_follow_up` | Follow-ups |
| `useFilesStore` | `get_files`, `import_file`, `delete_file`, `get_folders`, `upsert_folder`, `delete_folder` | Files + folders |
| `useCustomersStore` | `upsert_customer` (extended) | Stammdaten (extended) |

`HistoriePane` and `DashboardPane` have no own stores — they read from all other stores.

Each store follows the same pattern as `useCustomersStore`:
- `init(customerId)` — loads data for the active customer
- Re-init on `customerId` change
- Error state as `AppError | null`

---

## Schema Changes — Migration v4

All changes are additive `ALTER TABLE` statements. No new tables.

### `todos`
```sql
ALTER TABLE todos ADD COLUMN checklist TEXT NOT NULL DEFAULT '[]';
-- JSON: [{ "id": "uuid", "text": "string", "done": false }]

ALTER TABLE todos ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
-- JSON: ["string"]

ALTER TABLE todos ADD COLUMN assignee TEXT;
-- free text, nullable
```

### `notes`
```sql
ALTER TABLE notes ADD COLUMN type TEXT NOT NULL DEFAULT 'gespraech';
-- 'gespraech' | 'meeting' | 'telefon' | 'zusammenfassung' | 'nachricht'

ALTER TABLE notes ADD COLUMN waiting_reply INTEGER NOT NULL DEFAULT 0;
```

### `customers`
```sql
ALTER TABLE customers ADD COLUMN industry TEXT;
ALTER TABLE customers ADD COLUMN contact_person TEXT;
ALTER TABLE customers ADD COLUMN goals TEXT NOT NULL DEFAULT '[]';
-- JSON: ["string"]

ALTER TABLE customers ADD COLUMN social_links TEXT NOT NULL DEFAULT '{}';
-- JSON: { "instagram": "", "linkedin": "", "website": "" }

ALTER TABLE customers ADD COLUMN internal_notes TEXT;
```

---

## Module Designs

### 1. DashboardPane

No own store. Aggregates from all other stores for the active customer.

**Sections:**
- **Health Score Ring** — circular progress, color-coded green/yellow/red. Computed live, not persisted.
- **Letzte Interaktion** — max(`updated_at`) across todos, notes, follow-ups
- **Nächste Aktion** — next open follow-up by `due_date`
- **High Priority Items** — up to 5 open todos where `priority = 'high'`
- **Mini-Timeline** — last 3 events across all modules (see Historie for event types)

**Health Score Formula (base 100, min 10):**
```
- Overdue todos (due_date < today, status != 'done'):  -10 each
- High-priority open todos:                            -5 each
- No note or todo in 7+ days:                          -20
- Overdue follow-ups:                                  -15 each
```

---

### 2. WorkflowPane

Stores: `useTodosStore`, `useDeadlinesStore`, `useFollowUpsStore`

**Todos section:**
- List with status toggle: `open → in_progress → done`
- Each row: title, priority badge, due date, assignee, tags
- Inline checklist expansion on click — sub-items with checkbox
- Add todo via inline input at top of list

**Deadlines section:**
- Separate block below todos
- Each deadline: title, due date, done checkbox

**Follow-Ups section ("Nächste Schritte"):**
- List of open follow-ups ordered by due date
- Each: title, due date, priority, done button

---

### 3. KommunikationPane

Store: `useNotesStore`

**Layout:**
- Type filter bar: Alle / Gespräch / Meeting / Telefon / Zusammenfassung / Nachricht
- Note list filtered by selected type
- Each note card: title, type badge, timestamp, "Warten auf Antwort" indicator if `waiting_reply = 1`
- Click to expand: full content textarea, editable inline
- New note: select type → title input → content textarea → save

**Note types map to icons:**
- `gespraech` → chat bubble
- `meeting` → calendar
- `telefon` → phone
- `zusammenfassung` → document
- `nachricht` → envelope

---

### 4. DateienPane

Store: `useFilesStore`

**Layout:**
- Left: folder tree (collapsible, `folders` table)
- Right: file grid for selected folder

**Upload flow:**
1. User clicks "Datei hinzufügen"
2. Tauri `dialog::open` → user picks file
3. File copied to `{app_data_dir}/cynera/files/{customer_id}/{file_id}/{filename}`
4. Record inserted into `files` table with internal path
5. File appears in grid immediately

**Open/Download:**
- Tauri `shell::open` with the stored internal path

**File type categories** (by mime_type):
- Bilder: `image/*`
- Videos: `video/*`
- PDFs: `application/pdf`
- Sonstige: everything else

**Large file threshold:** Files > 50 MB are stored by path reference only (no copy).

---

### 5. HistoriePane

No own store. Aggregates events from all stores for the active customer.

**Event types:**

| Type | Source | Description |
|---|---|---|
| `todo_created` | todos | "To-Do erstellt: {title}" |
| `todo_done` | todos | "To-Do erledigt: {title}" |
| `note_created` | notes | "Notiz erstellt: {title}" |
| `file_uploaded` | files | "Datei hochgeladen: {name}" |
| `follow_up_done` | follow_ups | "Follow-Up erledigt: {title}" |
| `deadline_reached` | deadlines | "Deadline erreicht: {title}" |

**Display:**
- Flat chronological list, newest first
- Each entry: icon + text + relative timestamp ("vor 2 Stunden", "gestern")
- No editing — read-only view

Events are derived from `created_at` / `updated_at` timestamps. No separate events table.

---

### 6. ProfilPane

Store: `useCustomersStore` (extended)

**Editable fields:**
- Name, Branche, Ansprechpartner, E-Mail, Telefon
- Status (aktiv / inaktiv / lead / lost)
- Priorität (normal / high)

**Goals:** Tag-style input — add/remove strings from `goals` JSON array

**Social Links:** Three inputs — Instagram, LinkedIn, Website (stored in `social_links` JSON)

**Interne Notizen:** Freetext textarea, auto-saved on blur

**Tags/Kategorien:** Tag input, stored in existing `customers.tags`

---

## File Structure

```
src/
  store/
    todos.store.ts
    notes.store.ts
    deadlines.store.ts
    follow_ups.store.ts
    files.store.ts
  components/customer/
    CustomerRoute.tsx         (refactored: tab shell)
    tabs/
      DashboardPane.tsx
      WorkflowPane.tsx
      KommunikationPane.tsx
      DateienPane.tsx
      HistoriePane.tsx
      ProfilPane.tsx

src-tauri/src/
  db/
    todo.rs
    note.rs
    deadline.rs
    follow_up.rs
    file.rs
    migrations.rs             (migration v4 added)
  commands/
    todo.rs
    note.rs
    deadline.rs
    follow_up.rs
    file.rs
```

---

## Out of Scope

- Real-time sync for new modules (sync_queue integration deferred)
- AI features (AiPanel)
- Social media integration
- Email integration within customer detail
- Time tracking module (existing `time_entries` table untouched for now)
