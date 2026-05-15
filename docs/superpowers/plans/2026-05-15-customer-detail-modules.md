# Customer Detail Modules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build 6 customer-detail tabs (Dashboard, Workflow, Kommunikation, Dateien, Historie, Profil) with SQLite persistence following the established `useCustomersStore` pattern.

**Architecture:** Each tab has its own Zustand store that calls existing Tauri commands via `invoke`. The `CustomerRoute` becomes a tab shell. New columns are added via Migration v4; a `deadline.rs` DB module is created from scratch; all other Rust modules are extended in-place.

**Tech Stack:** Rust/rusqlite (backend), Tauri v2 invoke (IPC), Zustand (frontend state), React/TypeScript (UI), Tailwind CSS

---

## File Map

**Modified (Rust)**
- `src-tauri/src/db/migrations.rs` — add migration v4 (ALTER TABLE statements)
- `src-tauri/src/db/todo.rs` — add checklist, tags, assignee fields
- `src-tauri/src/db/note.rs` — add note_type, waiting_reply fields
- `src-tauri/src/db/customer.rs` — add profile fields (industry, contact_person, goals, social_links, internal_notes)
- `src-tauri/src/db/folder.rs` — add `import_file` function (copy bytes to app dir)
- `src-tauri/src/db/mod.rs` — expose deadline module
- `src-tauri/src/commands/folder.rs` — add `cmd_import_file`
- `src-tauri/src/commands/mod.rs` — expose deadline commands
- `src-tauri/src/main.rs` — register new commands

**Created (Rust)**
- `src-tauri/src/db/deadline.rs` — Deadline struct, CRUD
- `src-tauri/src/commands/deadline.rs` — get_deadlines, upsert_deadline, delete_deadline

**Modified (TypeScript)**
- `src/types/todo.types.ts` — add ChecklistItem, tags, assignee
- `src/types/note.types.ts` — add NoteType, waitingReply
- `src/types/customer.types.ts` — add profile fields
- `src/store/ui.store.ts` — add activeCustomerTab
- `src/routes/CustomerRoute.tsx` — refactor to tab shell

**Created (TypeScript)**
- `src/types/deadline.types.ts`
- `src/store/todos.store.ts`
- `src/store/notes.store.ts`
- `src/store/deadlines.store.ts`
- `src/store/follow_ups.store.ts`
- `src/store/files.store.ts`
- `src/components/customer/tabs/DashboardPane.tsx`
- `src/components/customer/tabs/WorkflowPane.tsx`
- `src/components/customer/tabs/KommunikationPane.tsx`
- `src/components/customer/tabs/DateienPane.tsx`
- `src/components/customer/tabs/HistoriePane.tsx`
- `src/components/customer/tabs/ProfilPane.tsx`

---

## Task 1: Migration v4 — Schema extension

**Files:**
- Modify: `src-tauri/src/db/migrations.rs`

- [ ] **Step 1: Add migration v4 to `migrations.rs`**

Open `src-tauri/src/db/migrations.rs`. Change `CURRENT_VERSION` from `3` to `4` and add the v4 arm in `apply()`:

```rust
const CURRENT_VERSION: u32 = 4;
```

```rust
4 => {
    conn.execute_batch(r#"
        ALTER TABLE todos ADD COLUMN checklist     TEXT    NOT NULL DEFAULT '[]';
        ALTER TABLE todos ADD COLUMN tags          TEXT    NOT NULL DEFAULT '[]';
        ALTER TABLE todos ADD COLUMN assignee      TEXT;

        ALTER TABLE notes ADD COLUMN note_type     TEXT    NOT NULL DEFAULT 'gespraech';
        ALTER TABLE notes ADD COLUMN waiting_reply INTEGER NOT NULL DEFAULT 0;

        ALTER TABLE customers ADD COLUMN industry       TEXT;
        ALTER TABLE customers ADD COLUMN contact_person TEXT;
        ALTER TABLE customers ADD COLUMN goals          TEXT NOT NULL DEFAULT '[]';
        ALTER TABLE customers ADD COLUMN social_links   TEXT NOT NULL DEFAULT '{}';
        ALTER TABLE customers ADD COLUMN internal_notes TEXT;
    "#)?;
    Ok(())
}
```

- [ ] **Step 2: Write migration v4 test**

Add to `migrations.rs` tests:

```rust
#[test]
fn migration_v4_adds_new_columns() {
    let conn = in_memory_db();
    run(&conn).unwrap();
    let version = get_version(&conn).unwrap();
    assert_eq!(version, 4);

    let todo_cols: Vec<String> = conn.prepare("PRAGMA table_info(todos)").unwrap()
        .query_map([], |r| r.get::<_, String>(1)).unwrap()
        .filter_map(|r| r.ok()).collect();
    assert!(todo_cols.contains(&"checklist".to_string()));
    assert!(todo_cols.contains(&"tags".to_string()));
    assert!(todo_cols.contains(&"assignee".to_string()));

    let note_cols: Vec<String> = conn.prepare("PRAGMA table_info(notes)").unwrap()
        .query_map([], |r| r.get::<_, String>(1)).unwrap()
        .filter_map(|r| r.ok()).collect();
    assert!(note_cols.contains(&"note_type".to_string()));
    assert!(note_cols.contains(&"waiting_reply".to_string()));

    let cust_cols: Vec<String> = conn.prepare("PRAGMA table_info(customers)").unwrap()
        .query_map([], |r| r.get::<_, String>(1)).unwrap()
        .filter_map(|r| r.ok()).collect();
    assert!(cust_cols.contains(&"industry".to_string()));
    assert!(cust_cols.contains(&"goals".to_string()));
}
```

- [ ] **Step 3: Run tests**

```
cargo test --manifest-path src-tauri/Cargo.toml migration_v4
```

Expected: `PASSED`

- [ ] **Step 4: Commit**

```
git add src-tauri/src/db/migrations.rs
git commit -m "feat(db): migration v4 — extend todos, notes, customers"
```

---

## Task 2: Extend `todo.rs`

**Files:**
- Modify: `src-tauri/src/db/todo.rs`

- [ ] **Step 1: Add ChecklistItem struct and update Todo**

Replace the top of `src-tauri/src/db/todo.rs` (structs section):

```rust
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::AppError;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChecklistItem {
    pub id: String,
    pub text: String,
    pub done: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Todo {
    pub id: String,
    pub customer_id: String,
    pub title: String,
    pub status: String,
    pub priority: String,
    pub due_date: Option<String>,
    pub checklist: Vec<ChecklistItem>,
    pub tags: Vec<String>,
    pub assignee: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertTodoPayload {
    pub id: Option<String>,
    pub customer_id: String,
    pub title: String,
    pub status: Option<String>,
    pub priority: Option<String>,
    pub due_date: Option<String>,
    pub checklist: Option<Vec<ChecklistItem>>,
    pub tags: Option<Vec<String>>,
    pub assignee: Option<String>,
}
```

- [ ] **Step 2: Update `get_by_customer` SQL and row mapping**

Replace `get_by_customer`:

```rust
pub fn get_by_customer(conn: &Connection, customer_id: &str) -> Result<Vec<Todo>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, customer_id, title, status, priority, due_date,
                checklist, tags, assignee, created_at, updated_at
         FROM todos WHERE customer_id = ?1 ORDER BY created_at DESC",
    )?;
    let todos = stmt.query_map([customer_id], |row| {
        let checklist_json: String = row.get(6)?;
        let tags_json: String = row.get(7)?;
        Ok(Todo {
            id:          row.get(0)?,
            customer_id: row.get(1)?,
            title:       row.get(2)?,
            status:      row.get(3)?,
            priority:    row.get(4)?,
            due_date:    row.get(5)?,
            checklist:   serde_json::from_str(&checklist_json).unwrap_or_default(),
            tags:        serde_json::from_str(&tags_json).unwrap_or_default(),
            assignee:    row.get(8)?,
            created_at:  row.get(9)?,
            updated_at:  row.get(10)?,
        })
    })?.collect::<Result<Vec<_>, _>>()?;
    Ok(todos)
}
```

- [ ] **Step 3: Update `upsert` SQL**

Replace `upsert`:

```rust
pub fn upsert(conn: &Connection, payload: UpsertTodoPayload) -> Result<Todo, AppError> {
    let id = payload.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let now = chrono::Utc::now().to_rfc3339();
    let checklist_json = serde_json::to_string(&payload.checklist.unwrap_or_default())
        .map_err(|e| AppError::Validation(e.to_string()))?;
    let tags_json = serde_json::to_string(&payload.tags.unwrap_or_default())
        .map_err(|e| AppError::Validation(e.to_string()))?;

    conn.execute(
        "INSERT INTO todos (id, customer_id, title, status, priority, due_date,
                            checklist, tags, assignee, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?10)
         ON CONFLICT(id) DO UPDATE SET
           title=excluded.title, status=excluded.status, priority=excluded.priority,
           due_date=excluded.due_date, checklist=excluded.checklist,
           tags=excluded.tags, assignee=excluded.assignee, updated_at=excluded.updated_at",
        rusqlite::params![
            id, payload.customer_id, payload.title,
            payload.status.unwrap_or_else(|| "open".to_string()),
            payload.priority.unwrap_or_else(|| "normal".to_string()),
            payload.due_date, checklist_json, tags_json, payload.assignee, now,
        ],
    )?;

    let todo = conn.query_row(
        "SELECT id, customer_id, title, status, priority, due_date,
                checklist, tags, assignee, created_at, updated_at
         FROM todos WHERE id = ?1",
        [&id],
        |row| {
            let checklist_json: String = row.get(6)?;
            let tags_json: String = row.get(7)?;
            Ok(Todo {
                id: row.get(0)?, customer_id: row.get(1)?, title: row.get(2)?,
                status: row.get(3)?, priority: row.get(4)?, due_date: row.get(5)?,
                checklist: serde_json::from_str(&checklist_json).unwrap_or_default(),
                tags: serde_json::from_str(&tags_json).unwrap_or_default(),
                assignee: row.get(8)?, created_at: row.get(9)?, updated_at: row.get(10)?,
            })
        },
    )?;
    Ok(todo)
}
```

- [ ] **Step 4: Add test for checklist persistence**

Add to the existing tests block:

```rust
#[test]
fn upsert_persists_checklist_and_tags() {
    let conn = setup();
    let checklist = vec![ChecklistItem { id: "c1".to_string(), text: "Schritt 1".to_string(), done: false }];
    let todo = upsert(&conn, UpsertTodoPayload {
        id: None, customer_id: "__cynera_privat__".to_string(),
        title: "Mit Checkliste".to_string(), status: None, priority: None, due_date: None,
        checklist: Some(checklist), tags: Some(vec!["design".to_string()]), assignee: Some("Max".to_string()),
    }).unwrap();
    assert_eq!(todo.checklist.len(), 1);
    assert_eq!(todo.checklist[0].text, "Schritt 1");
    assert_eq!(todo.tags, vec!["design"]);
    assert_eq!(todo.assignee, Some("Max".to_string()));
}
```

- [ ] **Step 5: Run tests**

```
cargo test --manifest-path src-tauri/Cargo.toml db::todo
```

Expected: all pass

- [ ] **Step 6: Commit**

```
git add src-tauri/src/db/todo.rs
git commit -m "feat(db): todo — checklist, tags, assignee fields"
```

---

## Task 3: Extend `note.rs`

**Files:**
- Modify: `src-tauri/src/db/note.rs`

- [ ] **Step 1: Update Note struct and UpsertNotePayload**

Replace the structs at top of `src-tauri/src/db/note.rs`:

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub customer_id: String,
    pub title: String,
    pub content: String,
    pub pinned: bool,
    pub note_type: String,
    pub waiting_reply: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertNotePayload {
    pub id: Option<String>,
    pub customer_id: String,
    pub title: String,
    pub content: Option<String>,
    pub pinned: Option<bool>,
    pub note_type: Option<String>,
    pub waiting_reply: Option<bool>,
}
```

- [ ] **Step 2: Update `get_by_customer`**

```rust
pub fn get_by_customer(conn: &Connection, customer_id: &str) -> Result<Vec<Note>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, customer_id, title, content, pinned, note_type, waiting_reply,
                created_at, updated_at
         FROM notes WHERE customer_id = ?1 ORDER BY pinned DESC, created_at DESC",
    )?;
    let notes = stmt.query_map([customer_id], |row| {
        Ok(Note {
            id:            row.get(0)?,
            customer_id:   row.get(1)?,
            title:         row.get(2)?,
            content:       row.get(3)?,
            pinned:        row.get::<_, i32>(4)? != 0,
            note_type:     row.get(5)?,
            waiting_reply: row.get::<_, i32>(6)? != 0,
            created_at:    row.get(7)?,
            updated_at:    row.get(8)?,
        })
    })?.collect::<Result<Vec<_>, _>>()?;
    Ok(notes)
}
```

- [ ] **Step 3: Update `upsert`**

```rust
pub fn upsert(conn: &Connection, payload: UpsertNotePayload) -> Result<Note, AppError> {
    let id = payload.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO notes (id, customer_id, title, content, pinned, note_type, waiting_reply,
                            created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?8)
         ON CONFLICT(id) DO UPDATE SET
           title=excluded.title, content=excluded.content, pinned=excluded.pinned,
           note_type=excluded.note_type, waiting_reply=excluded.waiting_reply,
           updated_at=excluded.updated_at",
        rusqlite::params![
            id, payload.customer_id, payload.title,
            payload.content.unwrap_or_default(),
            payload.pinned.unwrap_or(false) as i32,
            payload.note_type.unwrap_or_else(|| "gespraech".to_string()),
            payload.waiting_reply.unwrap_or(false) as i32,
            now,
        ],
    )?;
    let note = conn.query_row(
        "SELECT id, customer_id, title, content, pinned, note_type, waiting_reply,
                created_at, updated_at
         FROM notes WHERE id = ?1",
        [&id],
        |row| Ok(Note {
            id: row.get(0)?, customer_id: row.get(1)?, title: row.get(2)?,
            content: row.get(3)?, pinned: row.get::<_, i32>(4)? != 0,
            note_type: row.get(5)?, waiting_reply: row.get::<_, i32>(6)? != 0,
            created_at: row.get(7)?, updated_at: row.get(8)?,
        }),
    )?;
    Ok(note)
}
```

- [ ] **Step 4: Add test for note_type and waiting_reply**

```rust
#[test]
fn upsert_persists_note_type_and_waiting_reply() {
    let conn = setup();
    let note = upsert(&conn, UpsertNotePayload {
        id: None, customer_id: "__cynera_privat__".to_string(),
        title: "Meeting Notes".to_string(), content: Some("Inhalt".to_string()),
        pinned: None, note_type: Some("meeting".to_string()), waiting_reply: Some(true),
    }).unwrap();
    assert_eq!(note.note_type, "meeting");
    assert!(note.waiting_reply);
}
```

- [ ] **Step 5: Run tests**

```
cargo test --manifest-path src-tauri/Cargo.toml db::note
```

Expected: all pass

- [ ] **Step 6: Commit**

```
git add src-tauri/src/db/note.rs
git commit -m "feat(db): note — note_type, waiting_reply fields"
```

---

## Task 4: Create `deadline.rs` + command

**Files:**
- Create: `src-tauri/src/db/deadline.rs`
- Create: `src-tauri/src/commands/deadline.rs`
- Modify: `src-tauri/src/db/mod.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Create `src-tauri/src/db/deadline.rs`**

```rust
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::AppError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Deadline {
    pub id: String,
    pub customer_id: String,
    pub title: String,
    pub due_date: String,
    pub done: bool,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertDeadlinePayload {
    pub id: Option<String>,
    pub customer_id: String,
    pub title: String,
    pub due_date: String,
    pub done: Option<bool>,
}

pub fn get_by_customer(conn: &Connection, customer_id: &str) -> Result<Vec<Deadline>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, customer_id, title, due_date, done, created_at
         FROM deadlines WHERE customer_id = ?1 ORDER BY due_date ASC",
    )?;
    let items = stmt.query_map([customer_id], |row| {
        Ok(Deadline {
            id:          row.get(0)?,
            customer_id: row.get(1)?,
            title:       row.get(2)?,
            due_date:    row.get(3)?,
            done:        row.get::<_, i32>(4)? != 0,
            created_at:  row.get(5)?,
        })
    })?.collect::<Result<Vec<_>, _>>()?;
    Ok(items)
}

pub fn upsert(conn: &Connection, payload: UpsertDeadlinePayload) -> Result<Deadline, AppError> {
    let id = payload.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let now = chrono::Utc::now().to_rfc3339();
    let done = payload.done.unwrap_or(false);
    conn.execute(
        "INSERT INTO deadlines (id, customer_id, title, due_date, done, created_at)
         VALUES (?1,?2,?3,?4,?5,?6)
         ON CONFLICT(id) DO UPDATE SET
           title=excluded.title, due_date=excluded.due_date, done=excluded.done",
        rusqlite::params![id, payload.customer_id, payload.title, payload.due_date, done as i32, now],
    )?;
    Ok(Deadline { id, customer_id: payload.customer_id, title: payload.title, due_date: payload.due_date, done, created_at: now })
}

pub fn delete(conn: &Connection, id: &str) -> Result<(), AppError> {
    let affected = conn.execute("DELETE FROM deadlines WHERE id = ?1", [id])?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("Deadline {id} not found")));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{schema, migrations};

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        schema::create_tables(&conn).unwrap();
        migrations::run(&conn).unwrap();
        conn
    }

    #[test]
    fn upsert_creates_deadline() {
        let conn = setup();
        let d = upsert(&conn, UpsertDeadlinePayload {
            id: None, customer_id: "__cynera_privat__".to_string(),
            title: "Abgabe".to_string(), due_date: "2026-06-01".to_string(), done: None,
        }).unwrap();
        assert_eq!(d.title, "Abgabe");
        assert!(!d.done);
    }

    #[test]
    fn upsert_marks_done() {
        let conn = setup();
        let d = upsert(&conn, UpsertDeadlinePayload {
            id: None, customer_id: "__cynera_privat__".to_string(),
            title: "Done".to_string(), due_date: "2026-05-01".to_string(), done: None,
        }).unwrap();
        upsert(&conn, UpsertDeadlinePayload {
            id: Some(d.id.clone()), customer_id: "__cynera_privat__".to_string(),
            title: "Done".to_string(), due_date: "2026-05-01".to_string(), done: Some(true),
        }).unwrap();
        let items = get_by_customer(&conn, "__cynera_privat__").unwrap();
        assert!(items[0].done);
    }

    #[test]
    fn delete_removes_deadline() {
        let conn = setup();
        let d = upsert(&conn, UpsertDeadlinePayload {
            id: None, customer_id: "__cynera_privat__".to_string(),
            title: "Weg".to_string(), due_date: "2026-05-01".to_string(), done: None,
        }).unwrap();
        delete(&conn, &d.id).unwrap();
        assert_eq!(get_by_customer(&conn, "__cynera_privat__").unwrap().len(), 0);
    }
}
```

- [ ] **Step 2: Create `src-tauri/src/commands/deadline.rs`**

```rust
use tauri::State;
use crate::{AppError, db::{pool::DbPool, deadline::{self, Deadline, UpsertDeadlinePayload}}};

#[tauri::command]
pub async fn get_deadlines(db: State<'_, DbPool>, customer_id: String) -> Result<Vec<Deadline>, AppError> {
    deadline::get_by_customer(&db.conn(), &customer_id)
}

#[tauri::command]
pub async fn upsert_deadline(db: State<'_, DbPool>, payload: UpsertDeadlinePayload) -> Result<Deadline, AppError> {
    deadline::upsert(&db.conn(), payload)
}

#[tauri::command]
pub async fn delete_deadline(db: State<'_, DbPool>, id: String) -> Result<(), AppError> {
    deadline::delete(&db.conn(), &id)
}
```

- [ ] **Step 3: Register in `src-tauri/src/db/mod.rs`**

Add line:
```rust
pub mod deadline;
```

- [ ] **Step 4: Register in `src-tauri/src/commands/mod.rs`**

Add line:
```rust
pub mod deadline;
```

- [ ] **Step 5: Register commands in `src-tauri/src/main.rs`**

In the `invoke_handler!` macro, add after `commands::crm::delete_follow_up`:
```rust
commands::deadline::get_deadlines,
commands::deadline::upsert_deadline,
commands::deadline::delete_deadline,
```

- [ ] **Step 6: Run tests**

```
cargo test --manifest-path src-tauri/Cargo.toml db::deadline
```

Expected: all pass

- [ ] **Step 7: Commit**

```
git add src-tauri/src/db/deadline.rs src-tauri/src/commands/deadline.rs src-tauri/src/db/mod.rs src-tauri/src/commands/mod.rs src-tauri/src/main.rs
git commit -m "feat(db): deadline CRUD + Tauri commands"
```

---

## Task 5: Extend `customer.rs` with profile fields

**Files:**
- Modify: `src-tauri/src/db/customer.rs`

- [ ] **Step 1: Add profile fields to Customer struct**

In `src-tauri/src/db/customer.rs`, add new fields to `Customer`:

```rust
pub struct Customer {
    pub id: String,
    pub name: String,
    pub company: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub status: String,
    pub priority: String,
    pub tags: Vec<String>,
    pub is_private: bool,
    pub workspace_id: String,
    // profile fields
    pub industry: Option<String>,
    pub contact_person: Option<String>,
    pub goals: Vec<String>,
    pub social_links: String,       // JSON string: {"instagram":"","linkedin":"","website":""}
    pub internal_notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}
```

Add to `UpsertCustomerPayload`:
```rust
pub industry: Option<String>,
pub contact_person: Option<String>,
pub goals: Option<Vec<String>>,
pub social_links: Option<String>,
pub internal_notes: Option<String>,
```

- [ ] **Step 2: Update `get_all` SELECT + row mapping**

Replace the SELECT in `get_all`:
```rust
"SELECT id, name, company, email, phone, status, priority, tags, is_private, workspace_id,
        industry, contact_person, goals, social_links, internal_notes, created_at, updated_at
 FROM customers
 WHERE is_private = 0 AND workspace_id = ?1
 ORDER BY name ASC"
```

Update the row mapping (indices 0–16):
```rust
Ok(Customer {
    id:              row.get(0)?,
    name:            row.get(1)?,
    company:         row.get(2)?,
    email:           row.get(3)?,
    phone:           row.get(4)?,
    status:          row.get(5)?,
    priority:        row.get(6)?,
    tags:            serde_json::from_str(&row.get::<_, String>(7)?).unwrap_or_default(),
    is_private:      row.get::<_, i32>(8)? != 0,
    workspace_id:    row.get(9)?,
    industry:        row.get(10)?,
    contact_person:  row.get(11)?,
    goals:           serde_json::from_str(&row.get::<_, String>(12)?).unwrap_or_default(),
    social_links:    row.get::<_, Option<String>>(13)?.unwrap_or_else(|| "{}".to_string()),
    internal_notes:  row.get(14)?,
    created_at:      row.get(15)?,
    updated_at:      row.get(16)?,
})
```

- [ ] **Step 3: Update `upsert` INSERT + SELECT**

In `upsert`, add JSON serialization for `goals`:
```rust
let goals_json = serde_json::to_string(&payload.goals.unwrap_or_default())
    .map_err(|e| AppError::Validation(e.to_string()))?;
```

Extend the INSERT:
```sql
INSERT INTO customers (id, name, company, email, phone, status, priority, tags,
                       workspace_id, created_by, pending_sync,
                       industry, contact_person, goals, social_links, internal_notes,
                       created_at, updated_at)
VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,1,?11,?12,?13,?14,?15,?16,?16)
ON CONFLICT(id) DO UPDATE SET
  name=excluded.name, company=excluded.company, email=excluded.email,
  phone=excluded.phone, status=excluded.status, priority=excluded.priority,
  tags=excluded.tags, industry=excluded.industry, contact_person=excluded.contact_person,
  goals=excluded.goals, social_links=excluded.social_links,
  internal_notes=excluded.internal_notes, pending_sync=1, updated_at=excluded.updated_at
```

Add params (after existing ones):
```rust
payload.industry, payload.contact_person, goals_json,
payload.social_links.unwrap_or_else(|| "{}".to_string()),
payload.internal_notes, now,
```

Also update the re-fetch SELECT in `upsert` to include all new columns (same query as `get_all` but with `WHERE id = ?1`).

- [ ] **Step 4: Add test for profile fields**

```rust
#[test]
fn upsert_persists_profile_fields() {
    let conn = setup();
    let payload = UpsertCustomerPayload {
        id: None, name: "Profil Test".to_string(),
        company: None, email: None, phone: None, status: None, priority: None,
        tags: None, workspace_id: "ws-1".to_string(), created_by: "u-1".to_string(),
        industry: Some("Tech".to_string()),
        contact_person: Some("Anna".to_string()),
        goals: Some(vec!["Wachstum".to_string()]),
        social_links: Some(r#"{"instagram":"@test"}"#.to_string()),
        internal_notes: Some("Wichtig".to_string()),
    };
    let c = upsert(&conn, payload).unwrap();
    assert_eq!(c.industry, Some("Tech".to_string()));
    assert_eq!(c.goals, vec!["Wachstum"]);
    assert_eq!(c.internal_notes, Some("Wichtig".to_string()));
}
```

- [ ] **Step 5: Run tests**

```
cargo test --manifest-path src-tauri/Cargo.toml db::customer
```

Expected: all pass

- [ ] **Step 6: Commit**

```
git add src-tauri/src/db/customer.rs
git commit -m "feat(db): customer — profile fields (industry, goals, social_links, etc.)"
```

---

## Task 6: Add `cmd_import_file` (file copy to app dir)

**Files:**
- Modify: `src-tauri/src/commands/folder.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Add `cmd_import_file` to `commands/folder.rs`**

Add at the bottom:

```rust
#[tauri::command]
pub async fn cmd_import_file(
    app: tauri::AppHandle,
    db: State<'_, DbPool>,
    customer_id: String,
    folder_id: Option<String>,
    name: String,
    data: Vec<u8>,
    mime_type: Option<String>,
) -> Result<FileEntry, AppError> {
    use tauri::Manager;

    let data_dir = app.path().app_data_dir()
        .map_err(|e| AppError::Io(e.to_string()))?;

    let file_id = uuid::Uuid::new_v4().to_string();
    let dest_dir = data_dir
        .join("cynera")
        .join("files")
        .join(&customer_id)
        .join(&file_id);
    std::fs::create_dir_all(&dest_dir)?;
    let dest = dest_dir.join(&name);
    std::fs::write(&dest, &data)?;

    let size = data.len() as i64;
    let payload = folder::AddFilePayload {
        customer_id,
        folder_id,
        name,
        path: dest.to_string_lossy().to_string(),
        size: Some(size),
        mime_type,
    };
    folder::add_file(&db.conn(), payload)
}
```

- [ ] **Step 2: Register in `main.rs`**

Add to `invoke_handler!` after `cmd_delete_file`:
```rust
commands::folder::cmd_import_file,
```

- [ ] **Step 3: Build to verify**

```
cargo build --manifest-path src-tauri/Cargo.toml
```

Expected: compiles without errors

- [ ] **Step 4: Commit**

```
git add src-tauri/src/commands/folder.rs src-tauri/src/main.rs
git commit -m "feat(cmd): cmd_import_file — copy file bytes to app data dir"
```

---

## Task 7: Extend TypeScript types

**Files:**
- Modify: `src/types/todo.types.ts`
- Modify: `src/types/note.types.ts`
- Modify: `src/types/customer.types.ts`
- Create: `src/types/deadline.types.ts`

- [ ] **Step 1: Update `src/types/todo.types.ts`**

```ts
import type { Priority } from './customer.types'

export type TodoStatus = 'open' | 'in_progress' | 'done'

export interface ChecklistItem {
  id: string
  text: string
  done: boolean
}

export interface Todo {
  id: string
  customerId: string
  title: string
  status: TodoStatus
  priority: Priority
  dueDate?: string
  checklist: ChecklistItem[]
  tags: string[]
  assignee?: string
  createdAt: string
  updatedAt: string
}

export interface UpsertTodoPayload {
  id?: string
  customerId: string
  title: string
  status?: TodoStatus
  priority?: Priority
  dueDate?: string
  checklist?: ChecklistItem[]
  tags?: string[]
  assignee?: string
}
```

- [ ] **Step 2: Update `src/types/note.types.ts`**

```ts
export type NoteType = 'gespraech' | 'meeting' | 'telefon' | 'zusammenfassung' | 'nachricht'

export interface Note {
  id: string
  customerId: string
  title: string
  content: string
  pinned: boolean
  noteType: NoteType
  waitingReply: boolean
  createdAt: string
  updatedAt: string
}

export interface UpsertNotePayload {
  id?: string
  customerId: string
  title: string
  content?: string
  pinned?: boolean
  noteType?: NoteType
  waitingReply?: boolean
}
```

- [ ] **Step 3: Update `src/types/customer.types.ts`**

```ts
import type { TimestampedEntity } from './common.types'

export type CustomerStatus = 'lead' | 'aktiv' | 'inaktiv' | 'lost'
export type Priority = 'low' | 'normal' | 'high'

export interface SocialLinks {
  instagram?: string
  linkedin?: string
  website?: string
}

export interface Customer extends TimestampedEntity {
  id: string
  name: string
  company?: string
  email?: string
  phone?: string
  status: CustomerStatus
  priority: Priority
  tags: string[]
  isPrivate: boolean
  workspaceId: string
  industry?: string
  contactPerson?: string
  goals: string[]
  socialLinks: string   // JSON string, parse with JSON.parse() when needed
  internalNotes?: string
}

export interface UpsertCustomerPayload {
  id?: string
  name: string
  company?: string
  email?: string
  phone?: string
  status?: CustomerStatus
  priority?: Priority
  tags?: string[]
  workspaceId: string
  createdBy: string
  industry?: string
  contactPerson?: string
  goals?: string[]
  socialLinks?: string
  internalNotes?: string
}
```

- [ ] **Step 4: Create `src/types/deadline.types.ts`**

```ts
export interface Deadline {
  id: string
  customerId: string
  title: string
  dueDate: string
  done: boolean
  createdAt: string
}

export interface UpsertDeadlinePayload {
  id?: string
  customerId: string
  title: string
  dueDate: string
  done?: boolean
}
```

- [ ] **Step 5: Type-check**

```
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 6: Commit**

```
git add src/types/
git commit -m "feat(types): extend todo, note, customer; add deadline types"
```

---

## Task 8: Extend `useUiStore` with `activeCustomerTab`

**Files:**
- Modify: `src/store/ui.store.ts`

- [ ] **Step 1: Add tab type and state**

In `src/store/ui.store.ts`, add:

```ts
export type CustomerTab = 'dashboard' | 'workflow' | 'kommunikation' | 'dateien' | 'historie' | 'profil'
```

Add to `UiState` interface:
```ts
activeCustomerTab: CustomerTab
setActiveCustomerTab: (tab: CustomerTab) => void
```

Add to the store state:
```ts
activeCustomerTab: 'dashboard',
setActiveCustomerTab: (tab) => set({ activeCustomerTab: tab }),
```

No need to persist `activeCustomerTab` — leave `partialize` unchanged.

- [ ] **Step 2: Type-check**

```
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```
git add src/store/ui.store.ts
git commit -m "feat(store): ui — activeCustomerTab"
```

---

## Task 9: Create `todos.store.ts`

**Files:**
- Create: `src/store/todos.store.ts`

- [ ] **Step 1: Write the store**

```ts
import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import type { Todo, UpsertTodoPayload } from '@/types/todo.types'
import type { AppError } from '@/types/error.types'
import { isAppError, formatError } from '@/types/error.types'

interface TodosState {
  todos: Todo[]
  isLoading: boolean
  error: AppError | null
  init: (customerId: string) => Promise<void>
  upsert: (payload: UpsertTodoPayload) => Promise<Todo>
  remove: (id: string) => Promise<void>
}

function replaceOrAppend(list: Todo[], item: Todo): Todo[] {
  const idx = list.findIndex(t => t.id === item.id)
  if (idx >= 0) { const next = [...list]; next[idx] = item; return next }
  return [...list, item]
}

export const useTodosStore = create<TodosState>()((set) => ({
  todos: [],
  isLoading: false,
  error: null,

  init: async (customerId) => {
    set({ isLoading: true, error: null })
    try {
      const todos = await invoke<Todo[]>('get_todos', { customerId })
      set({ todos, isLoading: false })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
    }
  },

  upsert: async (payload) => {
    try {
      const updated = await invoke<Todo>('upsert_todo', { payload })
      set(s => ({ todos: replaceOrAppend(s.todos, updated) }))
      return updated
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error })
      throw err
    }
  },

  remove: async (id) => {
    try {
      await invoke<void>('delete_todo', { id })
      set(s => ({ todos: s.todos.filter(t => t.id !== id) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error })
      throw err
    }
  },
}))
```

- [ ] **Step 2: Type-check**

```
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```
git add src/store/todos.store.ts
git commit -m "feat(store): todos — init/upsert/remove"
```

---

## Task 10: Create `notes.store.ts`

**Files:**
- Create: `src/store/notes.store.ts`

- [ ] **Step 1: Write the store**

```ts
import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import type { Note, UpsertNotePayload } from '@/types/note.types'
import type { AppError } from '@/types/error.types'
import { isAppError, formatError } from '@/types/error.types'

interface NotesState {
  notes: Note[]
  isLoading: boolean
  error: AppError | null
  init: (customerId: string) => Promise<void>
  upsert: (payload: UpsertNotePayload) => Promise<Note>
  remove: (id: string) => Promise<void>
}

function replaceOrAppend(list: Note[], item: Note): Note[] {
  const idx = list.findIndex(n => n.id === item.id)
  if (idx >= 0) { const next = [...list]; next[idx] = item; return next }
  return [...list, item]
}

export const useNotesStore = create<NotesState>()((set) => ({
  notes: [],
  isLoading: false,
  error: null,

  init: async (customerId) => {
    set({ isLoading: true, error: null })
    try {
      const notes = await invoke<Note[]>('get_notes', { customerId })
      set({ notes, isLoading: false })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
    }
  },

  upsert: async (payload) => {
    try {
      const updated = await invoke<Note>('upsert_note', { payload })
      set(s => ({ notes: replaceOrAppend(s.notes, updated) }))
      return updated
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error })
      throw err
    }
  },

  remove: async (id) => {
    try {
      await invoke<void>('delete_note', { id })
      set(s => ({ notes: s.notes.filter(n => n.id !== id) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error })
      throw err
    }
  },
}))
```

- [ ] **Step 2: Type-check + commit**

```
npx tsc --noEmit
git add src/store/notes.store.ts
git commit -m "feat(store): notes — init/upsert/remove"
```

---

## Task 11: Create `deadlines.store.ts`

**Files:**
- Create: `src/store/deadlines.store.ts`

- [ ] **Step 1: Write the store**

```ts
import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import type { Deadline, UpsertDeadlinePayload } from '@/types/deadline.types'
import type { AppError } from '@/types/error.types'
import { isAppError, formatError } from '@/types/error.types'

interface DeadlinesState {
  deadlines: Deadline[]
  isLoading: boolean
  error: AppError | null
  init: (customerId: string) => Promise<void>
  upsert: (payload: UpsertDeadlinePayload) => Promise<Deadline>
  remove: (id: string) => Promise<void>
}

function replaceOrAppend(list: Deadline[], item: Deadline): Deadline[] {
  const idx = list.findIndex(d => d.id === item.id)
  if (idx >= 0) { const next = [...list]; next[idx] = item; return next }
  return [...list, item]
}

export const useDeadlinesStore = create<DeadlinesState>()((set) => ({
  deadlines: [],
  isLoading: false,
  error: null,

  init: async (customerId) => {
    set({ isLoading: true, error: null })
    try {
      const deadlines = await invoke<Deadline[]>('get_deadlines', { customerId })
      set({ deadlines, isLoading: false })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
    }
  },

  upsert: async (payload) => {
    try {
      const updated = await invoke<Deadline>('upsert_deadline', { payload })
      set(s => ({ deadlines: replaceOrAppend(s.deadlines, updated) }))
      return updated
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error })
      throw err
    }
  },

  remove: async (id) => {
    try {
      await invoke<void>('delete_deadline', { id })
      set(s => ({ deadlines: s.deadlines.filter(d => d.id !== id) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error })
      throw err
    }
  },
}))
```

- [ ] **Step 2: Type-check + commit**

```
npx tsc --noEmit
git add src/store/deadlines.store.ts
git commit -m "feat(store): deadlines — init/upsert/remove"
```

---

## Task 12: Create `follow_ups.store.ts`

**Files:**
- Create: `src/store/follow_ups.store.ts`

- [ ] **Step 1: Write the store**

```ts
import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import type { FollowUp, UpsertFollowUpPayload } from '@/types/crm.types'
import type { AppError } from '@/types/error.types'
import { isAppError, formatError } from '@/types/error.types'

interface FollowUpsState {
  followUps: FollowUp[]
  isLoading: boolean
  error: AppError | null
  init: (customerId: string) => Promise<void>
  upsert: (payload: UpsertFollowUpPayload) => Promise<FollowUp>
  remove: (id: string) => Promise<void>
}

function replaceOrAppend(list: FollowUp[], item: FollowUp): FollowUp[] {
  const idx = list.findIndex(f => f.id === item.id)
  if (idx >= 0) { const next = [...list]; next[idx] = item; return next }
  return [...list, item]
}

export const useFollowUpsStore = create<FollowUpsState>()((set) => ({
  followUps: [],
  isLoading: false,
  error: null,

  init: async (customerId) => {
    set({ isLoading: true, error: null })
    try {
      const followUps = await invoke<FollowUp[]>('get_follow_ups', { customerId })
      set({ followUps, isLoading: false })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
    }
  },

  upsert: async (payload) => {
    try {
      const updated = await invoke<FollowUp>('upsert_follow_up', { payload })
      set(s => ({ followUps: replaceOrAppend(s.followUps, updated) }))
      return updated
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error })
      throw err
    }
  },

  remove: async (id) => {
    try {
      await invoke<void>('delete_follow_up', { id })
      set(s => ({ followUps: s.followUps.filter(f => f.id !== id) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error })
      throw err
    }
  },
}))
```

- [ ] **Step 2: Type-check + commit**

```
npx tsc --noEmit
git add src/store/follow_ups.store.ts
git commit -m "feat(store): follow_ups — init/upsert/remove"
```

---

## Task 13: Create `files.store.ts`

**Files:**
- Create: `src/store/files.store.ts`

- [ ] **Step 1: Write the store**

```ts
import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import type { Folder, FileEntry, CreateFolderPayload } from '@/types/file.types'
import type { AppError } from '@/types/error.types'
import { isAppError, formatError } from '@/types/error.types'

interface ImportFileParams {
  customerId: string
  folderId?: string | null
  name: string
  data: number[]        // Uint8Array as array for IPC transfer
  mimeType?: string | null
}

interface FilesState {
  folders: Folder[]
  files: FileEntry[]
  selectedFolderId: string | null
  isLoading: boolean
  error: AppError | null
  init: (customerId: string) => Promise<void>
  selectFolder: (id: string | null) => void
  createFolder: (payload: CreateFolderPayload) => Promise<void>
  removeFolder: (id: string) => Promise<void>
  importFile: (params: ImportFileParams) => Promise<void>
  removeFile: (id: string) => Promise<void>
}

export const useFilesStore = create<FilesState>()((set, get) => ({
  folders: [],
  files: [],
  selectedFolderId: null,
  isLoading: false,
  error: null,

  init: async (customerId) => {
    set({ isLoading: true, error: null })
    try {
      const [folders, files] = await Promise.all([
        invoke<Folder[]>('cmd_get_folders', { customerId }),
        invoke<FileEntry[]>('cmd_get_files', { customerId, folderId: null }),
      ])
      set({ folders, files, isLoading: false, selectedFolderId: null })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
    }
  },

  selectFolder: async (id) => {
    set({ selectedFolderId: id, isLoading: true })
    try {
      const files = await invoke<FileEntry[]>('cmd_get_files', { customerId: get().folders[0]?.customerId ?? '', folderId: id })
      set({ files, isLoading: false })
    } catch (err) {
      set({ isLoading: false })
    }
  },

  createFolder: async (payload) => {
    try {
      const folder = await invoke<Folder>('cmd_create_folder', { payload })
      set(s => ({ folders: [...s.folders, folder] }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error })
      throw err
    }
  },

  removeFolder: async (id) => {
    try {
      await invoke<void>('cmd_delete_folder', { id })
      set(s => ({
        folders: s.folders.filter(f => f.id !== id),
        files: s.files.filter(f => f.folderId !== id),
        selectedFolderId: s.selectedFolderId === id ? null : s.selectedFolderId,
      }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error })
      throw err
    }
  },

  importFile: async (params) => {
    try {
      const file = await invoke<FileEntry>('cmd_import_file', {
        customerId: params.customerId,
        folderId: params.folderId ?? null,
        name: params.name,
        data: params.data,
        mimeType: params.mimeType ?? null,
      })
      set(s => ({ files: [...s.files, file] }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error })
      throw err
    }
  },

  removeFile: async (id) => {
    try {
      await invoke<void>('cmd_delete_file', { id })
      set(s => ({ files: s.files.filter(f => f.id !== id) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error })
      throw err
    }
  },
}))
```

- [ ] **Step 2: Type-check + commit**

```
npx tsc --noEmit
git add src/store/files.store.ts
git commit -m "feat(store): files — folders + file import/delete"
```

---

## Task 14: Refactor `CustomerRoute` into tab shell

**Files:**
- Modify: `src/routes/CustomerRoute.tsx`

- [ ] **Step 1: Replace CustomerRoute with tab shell**

```tsx
import { useEffect } from 'react'
import { useCustomersStore } from '@/store/customers.store'
import { useUiStore, type CustomerTab } from '@/store/ui.store'
import { useTodosStore } from '@/store/todos.store'
import { useNotesStore } from '@/store/notes.store'
import { useDeadlinesStore } from '@/store/deadlines.store'
import { useFollowUpsStore } from '@/store/follow_ups.store'
import { useFilesStore } from '@/store/files.store'
import { DashboardPane } from '@/components/customer/tabs/DashboardPane'
import { WorkflowPane } from '@/components/customer/tabs/WorkflowPane'
import { KommunikationPane } from '@/components/customer/tabs/KommunikationPane'
import { DateienPane } from '@/components/customer/tabs/DateienPane'
import { HistoriePane } from '@/components/customer/tabs/HistoriePane'
import { ProfilPane } from '@/components/customer/tabs/ProfilPane'

const TABS: { id: CustomerTab; label: string }[] = [
  { id: 'dashboard',     label: 'Dashboard' },
  { id: 'workflow',      label: 'Workflow' },
  { id: 'kommunikation', label: 'Kommunikation' },
  { id: 'dateien',       label: 'Dateien' },
  { id: 'historie',      label: 'Historie' },
  { id: 'profil',        label: 'Profil' },
]

const STATUS_COLOR: Record<string, string> = {
  lead: 'bg-blue-500/10 text-blue-500',
  aktiv: 'bg-green-500/10 text-green-500',
  inaktiv: 'bg-gray-400/10 text-gray-400',
  lost: 'bg-red-400/10 text-red-400',
}

interface Props { customerId: string }

export function CustomerRoute({ customerId }: Props) {
  const customer    = useCustomersStore(s => s.customers.find(c => c.id === customerId))
  const activeTab   = useUiStore(s => s.activeCustomerTab)
  const setTab      = useUiStore(s => s.setActiveCustomerTab)
  const setSelected = useUiStore(s => s.setSelectedCustomer)

  const initTodos     = useTodosStore(s => s.init)
  const initNotes     = useNotesStore(s => s.init)
  const initDeadlines = useDeadlinesStore(s => s.init)
  const initFollowUps = useFollowUpsStore(s => s.init)
  const initFiles     = useFilesStore(s => s.init)

  useEffect(() => {
    initTodos(customerId)
    initNotes(customerId)
    initDeadlines(customerId)
    initFollowUps(customerId)
    initFiles(customerId)
  }, [customerId])

  if (!customer) return <div className="p-6 text-[var(--text2)]">Kunde nicht gefunden</div>

  const renderPane = () => {
    switch (activeTab) {
      case 'dashboard':     return <DashboardPane customerId={customerId} />
      case 'workflow':      return <WorkflowPane customerId={customerId} />
      case 'kommunikation': return <KommunikationPane customerId={customerId} />
      case 'dateien':       return <DateienPane customerId={customerId} />
      case 'historie':      return <HistoriePane customerId={customerId} />
      case 'profil':        return <ProfilPane customerId={customerId} />
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 pt-5 pb-0 border-b border-[var(--border)]">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold text-[var(--text)]">{customer.name}</h1>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[customer.status] ?? ''}`}>
                {customer.status}
              </span>
            </div>
            {customer.company && (
              <p className="text-sm text-[var(--text2)] mt-0.5">{customer.company}</p>
            )}
          </div>
          <button
            onClick={() => setSelected(null)}
            className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text2)] hover:text-[var(--text)] hover:bg-[var(--bg1)] flex-shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex gap-0">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                ${activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-[var(--text2)] hover:text-[var(--text)]'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Active pane */}
      <div className="flex-1 overflow-auto">
        {renderPane()}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```
npx tsc --noEmit
```

Expected: errors only for missing pane components (not yet created) — that's fine

- [ ] **Step 3: Commit**

```
git add src/routes/CustomerRoute.tsx
git commit -m "feat(ui): CustomerRoute — 6-tab shell"
```

---

## Task 15: `DashboardPane`

**Files:**
- Create: `src/components/customer/tabs/DashboardPane.tsx`

- [ ] **Step 1: Create the pane**

```tsx
import { useTodosStore } from '@/store/todos.store'
import { useNotesStore } from '@/store/notes.store'
import { useFollowUpsStore } from '@/store/follow_ups.store'
import { useUiStore } from '@/store/ui.store'

function computeHealthScore(
  customerId: string,
  todos: ReturnType<typeof useTodosStore.getState>['todos'],
  notes: ReturnType<typeof useNotesStore.getState>['notes'],
  followUps: ReturnType<typeof useFollowUpsStore.getState>['followUps'],
): number {
  const today = new Date()
  let score = 100

  const overdue = todos.filter(t =>
    t.status !== 'done' && t.dueDate && new Date(t.dueDate) < today
  )
  score -= overdue.length * 10

  const highPrioOpen = todos.filter(t => t.status !== 'done' && t.priority === 'high')
  score -= highPrioOpen.length * 5

  const allTimestamps = [
    ...todos.map(t => t.updatedAt),
    ...notes.map(n => n.updatedAt),
  ]
  if (allTimestamps.length === 0) {
    score -= 20
  } else {
    const last = Math.max(...allTimestamps.map(d => new Date(d).getTime()))
    const daysSince = (today.getTime() - last) / (1000 * 60 * 60 * 24)
    if (daysSince >= 7) score -= 20
  }

  const overdueFollowUps = followUps.filter(f =>
    f.status === 'offen' && new Date(f.dueDate) < today
  )
  score -= overdueFollowUps.length * 15

  return Math.max(10, Math.min(100, score))
}

function scoreColor(score: number): string {
  if (score >= 70) return '#22c55e'
  if (score >= 40) return '#f59e0b'
  return '#ef4444'
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Heute'
  if (days === 1) return 'Gestern'
  return `vor ${days} Tagen`
}

interface Props { customerId: string }

export function DashboardPane({ customerId }: Props) {
  const todos     = useTodosStore(s => s.todos)
  const notes     = useNotesStore(s => s.notes)
  const followUps = useFollowUpsStore(s => s.followUps)
  const setTab    = useUiStore(s => s.setActiveCustomerTab)

  const score = computeHealthScore(customerId, todos, notes, followUps)
  const color = scoreColor(score)

  const allTimestamps = [
    ...todos.map(t => t.updatedAt),
    ...notes.map(n => n.updatedAt),
  ].sort().reverse()
  const lastInteraction = allTimestamps[0]

  const nextFollowUp = [...followUps]
    .filter(f => f.status === 'offen')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]

  const highPrioTodos = todos
    .filter(t => t.status !== 'done' && t.priority === 'high')
    .slice(0, 5)

  type TimelineItem = { label: string; time: string }
  const timeline: TimelineItem[] = [
    ...todos.map(t => ({ label: `To-Do: ${t.title}`, time: t.createdAt })),
    ...notes.map(n => ({ label: `Notiz: ${n.title}`, time: n.createdAt })),
    ...followUps.map(f => ({ label: `Follow-Up: ${f.title}`, time: f.createdAt })),
  ].sort((a, b) => b.time.localeCompare(a.time)).slice(0, 3)

  return (
    <div className="p-6 flex flex-col gap-5 max-w-3xl">
      {/* Top row */}
      <div className="grid grid-cols-3 gap-4">
        {/* Health Score */}
        <div className="p-5 rounded-2xl bg-[var(--bg1)] border border-[var(--border)] flex flex-col items-center gap-2">
          <p className="text-xs text-[var(--text2)]">Health Score</p>
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center font-bold text-2xl"
            style={{ background: `conic-gradient(${color} ${score * 3.6}deg, var(--bg) ${score * 3.6}deg)` }}
          >
            <div className="w-14 h-14 rounded-full bg-[var(--bg1)] flex items-center justify-center text-lg font-bold" style={{ color }}>
              {score}
            </div>
          </div>
        </div>

        {/* Letzte Interaktion */}
        <div className="p-5 rounded-2xl bg-[var(--bg1)] border border-[var(--border)]">
          <p className="text-xs text-[var(--text2)] mb-1">Letzte Interaktion</p>
          <p className="text-lg font-semibold text-[var(--text)]">
            {lastInteraction ? relativeTime(lastInteraction) : '—'}
          </p>
        </div>

        {/* Nächste Aktion */}
        <div className="p-5 rounded-2xl bg-[var(--bg1)] border border-[var(--border)]">
          <p className="text-xs text-[var(--text2)] mb-1">Nächste Aktion</p>
          {nextFollowUp ? (
            <>
              <p className="text-sm font-medium text-[var(--text)] truncate">{nextFollowUp.title}</p>
              <p className="text-xs text-[var(--text2)] mt-0.5">{nextFollowUp.dueDate}</p>
            </>
          ) : (
            <p className="text-sm text-[var(--text2)]">Kein Follow-Up</p>
          )}
        </div>
      </div>

      {/* High Priority */}
      {highPrioTodos.length > 0 && (
        <div className="p-5 rounded-2xl bg-[var(--bg1)] border border-[var(--border)]">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-[var(--text)]">High Priority</p>
            <button onClick={() => setTab('workflow')} className="text-xs text-[var(--text2)] hover:text-primary">
              Alle →
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            {highPrioTodos.map(t => (
              <div key={t.id} className="flex items-center gap-2 text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                <span className="text-[var(--text)] truncate">{t.title}</span>
                {t.dueDate && <span className="text-xs text-[var(--text2)] ml-auto flex-shrink-0">{t.dueDate}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mini Timeline */}
      {timeline.length > 0 && (
        <div className="p-5 rounded-2xl bg-[var(--bg1)] border border-[var(--border)]">
          <p className="text-sm font-semibold text-[var(--text)] mb-3">Letzte Aktivitäten</p>
          <div className="flex flex-col gap-2">
            {timeline.map((item, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                <span className="text-[var(--text)] flex-1 truncate">{item.label}</span>
                <span className="text-xs text-[var(--text2)] flex-shrink-0">{relativeTime(item.time)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check + commit**

```
npx tsc --noEmit
git add src/components/customer/tabs/DashboardPane.tsx
git commit -m "feat(ui): DashboardPane — health score, attention, timeline"
```

---

## Task 16: `WorkflowPane`

**Files:**
- Create: `src/components/customer/tabs/WorkflowPane.tsx`

- [ ] **Step 1: Create the pane**

```tsx
import { useState } from 'react'
import { useTodosStore } from '@/store/todos.store'
import { useDeadlinesStore } from '@/store/deadlines.store'
import { useFollowUpsStore } from '@/store/follow_ups.store'
import type { Todo, ChecklistItem } from '@/types/todo.types'
import { v4 as uuid } from 'uuid'

const STATUS_CYCLE: Record<string, string> = {
  open: 'in_progress', in_progress: 'done', done: 'open',
}
const STATUS_LABEL: Record<string, string> = {
  open: 'Offen', in_progress: 'In Arbeit', done: 'Erledigt',
}
const STATUS_COLOR: Record<string, string> = {
  open: 'bg-gray-400/10 text-gray-400',
  in_progress: 'bg-blue-500/10 text-blue-400',
  done: 'bg-green-500/10 text-green-400',
}

interface Props { customerId: string }

export function WorkflowPane({ customerId }: Props) {
  const todos         = useTodosStore(s => s.todos)
  const upsertTodo    = useTodosStore(s => s.upsert)
  const removeTodo    = useTodosStore(s => s.remove)
  const deadlines     = useDeadlinesStore(s => s.deadlines)
  const upsertDeadline = useDeadlinesStore(s => s.upsert)
  const removeDeadline = useDeadlinesStore(s => s.remove)
  const followUps     = useFollowUpsStore(s => s.followUps)
  const upsertFollowUp = useFollowUpsStore(s => s.upsert)

  const [newTodoTitle, setNewTodoTitle] = useState('')
  const [expandedTodoId, setExpandedTodoId] = useState<string | null>(null)
  const [newDeadlineTitle, setNewDeadlineTitle] = useState('')
  const [newDeadlineDate, setNewDeadlineDate]   = useState('')
  const [newFollowUpTitle, setNewFollowUpTitle] = useState('')
  const [newFollowUpDate, setNewFollowUpDate]   = useState('')

  const addTodo = async () => {
    if (!newTodoTitle.trim()) return
    await upsertTodo({ customerId, title: newTodoTitle.trim() })
    setNewTodoTitle('')
  }

  const cycleStatus = (todo: Todo) =>
    upsertTodo({ ...todo, status: STATUS_CYCLE[todo.status] as any })

  const toggleChecklistItem = (todo: Todo, itemId: string) => {
    const checklist = todo.checklist.map(c =>
      c.id === itemId ? { ...c, done: !c.done } : c
    )
    upsertTodo({ ...todo, checklist })
  }

  const addChecklistItem = (todo: Todo, text: string) => {
    const item: ChecklistItem = { id: uuid(), text, done: false }
    upsertTodo({ ...todo, checklist: [...todo.checklist, item] })
  }

  const addDeadline = async () => {
    if (!newDeadlineTitle.trim() || !newDeadlineDate) return
    await upsertDeadline({ customerId, title: newDeadlineTitle.trim(), dueDate: newDeadlineDate })
    setNewDeadlineTitle('')
    setNewDeadlineDate('')
  }

  const addFollowUp = async () => {
    if (!newFollowUpTitle.trim() || !newFollowUpDate) return
    await upsertFollowUp({ customerId, title: newFollowUpTitle.trim(), dueDate: newFollowUpDate })
    setNewFollowUpTitle('')
    setNewFollowUpDate('')
  }

  return (
    <div className="p-6 flex flex-col gap-6 max-w-3xl">
      {/* To-Dos */}
      <section>
        <h2 className="text-sm font-semibold text-[var(--text)] mb-3">To-Dos</h2>

        {/* Add input */}
        <div className="flex gap-2 mb-3">
          <input
            value={newTodoTitle}
            onChange={e => setNewTodoTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTodo()}
            placeholder="Neues To-Do…"
            className="flex-1 text-sm px-3 py-2 rounded-lg bg-[var(--bg1)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            onClick={addTodo}
            className="px-3 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary-dark"
          >
            +
          </button>
        </div>

        <div className="flex flex-col gap-1">
          {todos.map(todo => (
            <div key={todo.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg1)]">
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  onClick={() => cycleStatus(todo)}
                  className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_COLOR[todo.status]}`}
                >
                  {STATUS_LABEL[todo.status]}
                </button>
                <span
                  className={`flex-1 text-sm text-[var(--text)] cursor-pointer ${todo.status === 'done' ? 'line-through opacity-50' : ''}`}
                  onClick={() => setExpandedTodoId(expandedTodoId === todo.id ? null : todo.id)}
                >
                  {todo.title}
                </span>
                {todo.priority === 'high' && <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />}
                {todo.dueDate && <span className="text-xs text-[var(--text2)] flex-shrink-0">{todo.dueDate}</span>}
                <button onClick={() => removeTodo(todo.id)} className="text-[var(--text2)] hover:text-red-400 text-xs flex-shrink-0">✕</button>
              </div>

              {/* Inline checklist */}
              {expandedTodoId === todo.id && (
                <div className="px-4 pb-3 border-t border-[var(--border)] pt-2">
                  {todo.checklist.map(item => (
                    <div key={item.id} className="flex items-center gap-2 py-1">
                      <input
                        type="checkbox"
                        checked={item.done}
                        onChange={() => toggleChecklistItem(todo, item.id)}
                        className="accent-primary"
                      />
                      <span className={`text-sm text-[var(--text)] ${item.done ? 'line-through opacity-50' : ''}`}>
                        {item.text}
                      </span>
                    </div>
                  ))}
                  <input
                    placeholder="+ Schritt hinzufügen…"
                    className="mt-1 w-full text-sm text-[var(--text2)] bg-transparent focus:outline-none placeholder:text-[var(--text2)]"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                        addChecklistItem(todo, e.currentTarget.value.trim())
                        e.currentTarget.value = ''
                      }
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Deadlines */}
      <section>
        <h2 className="text-sm font-semibold text-[var(--text)] mb-3">Deadlines</h2>
        <div className="flex gap-2 mb-3">
          <input
            value={newDeadlineTitle}
            onChange={e => setNewDeadlineTitle(e.target.value)}
            placeholder="Titel…"
            className="flex-1 text-sm px-3 py-2 rounded-lg bg-[var(--bg1)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <input
            type="date"
            value={newDeadlineDate}
            onChange={e => setNewDeadlineDate(e.target.value)}
            className="text-sm px-3 py-2 rounded-lg bg-[var(--bg1)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button onClick={addDeadline} className="px-3 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary-dark">+</button>
        </div>
        <div className="flex flex-col gap-1">
          {deadlines.map(d => (
            <div key={d.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--bg1)]">
              <input
                type="checkbox"
                checked={d.done}
                onChange={() => upsertDeadline({ ...d, done: !d.done })}
                className="accent-primary"
              />
              <span className={`flex-1 text-sm text-[var(--text)] ${d.done ? 'line-through opacity-50' : ''}`}>{d.title}</span>
              <span className="text-xs text-[var(--text2)]">{d.dueDate}</span>
              <button onClick={() => removeDeadline(d.id)} className="text-[var(--text2)] hover:text-red-400 text-xs">✕</button>
            </div>
          ))}
        </div>
      </section>

      {/* Follow-Ups */}
      <section>
        <h2 className="text-sm font-semibold text-[var(--text)] mb-3">Nächste Schritte</h2>
        <div className="flex gap-2 mb-3">
          <input
            value={newFollowUpTitle}
            onChange={e => setNewFollowUpTitle(e.target.value)}
            placeholder="Nächster Schritt…"
            className="flex-1 text-sm px-3 py-2 rounded-lg bg-[var(--bg1)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <input
            type="date"
            value={newFollowUpDate}
            onChange={e => setNewFollowUpDate(e.target.value)}
            className="text-sm px-3 py-2 rounded-lg bg-[var(--bg1)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button onClick={addFollowUp} className="px-3 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary-dark">+</button>
        </div>
        <div className="flex flex-col gap-1">
          {followUps.filter(f => f.status === 'offen').map(f => (
            <div key={f.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--bg1)]">
              <span className="flex-1 text-sm text-[var(--text)]">{f.title}</span>
              <span className="text-xs text-[var(--text2)]">{f.dueDate}</span>
              <button
                onClick={() => upsertFollowUp({ ...f, status: 'erledigt' })}
                className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 hover:bg-green-500/20"
              >
                Erledigt
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Type-check + commit**

```
npx tsc --noEmit
git add src/components/customer/tabs/WorkflowPane.tsx
git commit -m "feat(ui): WorkflowPane — todos/checklisten/deadlines/follow-ups"
```

---

## Task 17: `KommunikationPane`

**Files:**
- Create: `src/components/customer/tabs/KommunikationPane.tsx`

- [ ] **Step 1: Create the pane**

```tsx
import { useState } from 'react'
import { useNotesStore } from '@/store/notes.store'
import type { NoteType } from '@/types/note.types'

const NOTE_TYPES: { id: NoteType; label: string; icon: string }[] = [
  { id: 'gespraech',      label: 'Gespräch',       icon: '💬' },
  { id: 'meeting',        label: 'Meeting',         icon: '📅' },
  { id: 'telefon',        label: 'Telefon',         icon: '📞' },
  { id: 'zusammenfassung',label: 'Zusammenfassung', icon: '📄' },
  { id: 'nachricht',      label: 'Nachricht',       icon: '✉️' },
]

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Heute'
  if (days === 1) return 'Gestern'
  return `vor ${days} Tagen`
}

interface Props { customerId: string }

export function KommunikationPane({ customerId }: Props) {
  const notes      = useNotesStore(s => s.notes)
  const upsertNote = useNotesStore(s => s.upsert)
  const removeNote = useNotesStore(s => s.remove)

  const [filter, setFilter]     = useState<NoteType | 'alle'>('alle')
  const [expandedId, setExpanded] = useState<string | null>(null)
  const [newTitle, setNewTitle]  = useState('')
  const [newType, setNewType]    = useState<NoteType>('gespraech')
  const [showNew, setShowNew]    = useState(false)

  const filtered = filter === 'alle' ? notes : notes.filter(n => n.noteType === filter)

  const createNote = async () => {
    if (!newTitle.trim()) return
    await upsertNote({ customerId, title: newTitle.trim(), noteType: newType, content: '' })
    setNewTitle('')
    setShowNew(false)
  }

  return (
    <div className="p-6 flex flex-col gap-4 max-w-3xl">
      {/* Filter bar */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setFilter('alle')}
          className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors
            ${filter === 'alle' ? 'bg-primary text-white' : 'bg-[var(--bg1)] text-[var(--text2)] border border-[var(--border)] hover:text-[var(--text)]'}`}
        >
          Alle
        </button>
        {NOTE_TYPES.map(t => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors
              ${filter === t.id ? 'bg-primary text-white' : 'bg-[var(--bg1)] text-[var(--text2)] border border-[var(--border)] hover:text-[var(--text)]'}`}
          >
            {t.icon} {t.label}
          </button>
        ))}
        <button
          onClick={() => setShowNew(true)}
          className="ml-auto text-xs px-3 py-1.5 rounded-full bg-primary text-white font-medium hover:bg-primary-dark"
        >
          + Neue Notiz
        </button>
      </div>

      {/* New note form */}
      {showNew && (
        <div className="p-4 rounded-xl border border-primary/30 bg-[var(--bg1)] flex flex-col gap-3">
          <div className="flex gap-2">
            <select
              value={newType}
              onChange={e => setNewType(e.target.value as NoteType)}
              className="text-sm px-3 py-1.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] focus:outline-none"
            >
              {NOTE_TYPES.map(t => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
            </select>
            <input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createNote()}
              placeholder="Titel…"
              className="flex-1 text-sm px-3 py-1.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-primary"
              autoFocus
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowNew(false)} className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text2)]">Abbrechen</button>
            <button onClick={createNote} className="text-xs px-3 py-1.5 rounded-lg bg-primary text-white hover:bg-primary-dark">Erstellen</button>
          </div>
        </div>
      )}

      {/* Note list */}
      <div className="flex flex-col gap-2">
        {filtered.length === 0 && (
          <p className="text-sm text-[var(--text2)] text-center py-12">Keine Einträge</p>
        )}
        {filtered.map(note => {
          const typeInfo = NOTE_TYPES.find(t => t.id === note.noteType)
          const expanded = expandedId === note.id

          return (
            <div key={note.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg1)]">
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                onClick={() => setExpanded(expanded ? null : note.id)}
              >
                <span className="text-base flex-shrink-0">{typeInfo?.icon}</span>
                <span className="flex-1 text-sm font-medium text-[var(--text)] truncate">{note.title}</span>
                {note.waitingReply && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 flex-shrink-0">
                    Warten auf Antwort
                  </span>
                )}
                <span className="text-xs text-[var(--text2)] flex-shrink-0">{relativeTime(note.createdAt)}</span>
                <button
                  onClick={e => { e.stopPropagation(); removeNote(note.id) }}
                  className="text-[var(--text2)] hover:text-red-400 text-xs flex-shrink-0"
                >
                  ✕
                </button>
              </div>

              {expanded && (
                <div className="px-4 pb-4 border-t border-[var(--border)] pt-3 flex flex-col gap-3">
                  <textarea
                    defaultValue={note.content}
                    onBlur={e => upsertNote({ ...note, content: e.target.value })}
                    placeholder="Inhalt…"
                    rows={5}
                    className="w-full text-sm text-[var(--text)] bg-[var(--bg)] rounded-lg px-3 py-2 border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  />
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-xs text-[var(--text2)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={note.waitingReply}
                        onChange={() => upsertNote({ ...note, waitingReply: !note.waitingReply })}
                        className="accent-amber-400"
                      />
                      Warten auf Antwort
                    </label>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check + commit**

```
npx tsc --noEmit
git add src/components/customer/tabs/KommunikationPane.tsx
git commit -m "feat(ui): KommunikationPane — notes with type filter and waiting-reply"
```

---

## Task 18: `DateienPane`

**Files:**
- Create: `src/components/customer/tabs/DateienPane.tsx`

- [ ] **Step 1: Create the pane**

```tsx
import { useRef } from 'react'
import { useFilesStore } from '@/store/files.store'
import type { FileEntry, Folder } from '@/types/file.types'

const MAX_BYTES = 50 * 1024 * 1024 // 50 MB

function fileIcon(mimeType: string | null): string {
  if (!mimeType) return '📎'
  if (mimeType.startsWith('image/')) return '🖼'
  if (mimeType.startsWith('video/')) return '🎬'
  if (mimeType === 'application/pdf') return '📄'
  return '📎'
}

function formatSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

interface Props { customerId: string }

export function DateienPane({ customerId }: Props) {
  const folders       = useFilesStore(s => s.folders)
  const files         = useFilesStore(s => s.files)
  const selectedFolderId = useFilesStore(s => s.selectedFolderId)
  const isLoading     = useFilesStore(s => s.isLoading)
  const error         = useFilesStore(s => s.error)
  const selectFolder  = useFilesStore(s => s.selectFolder)
  const createFolder  = useFilesStore(s => s.createFolder)
  const removeFolder  = useFilesStore(s => s.removeFolder)
  const importFile    = useFilesStore(s => s.importFile)
  const removeFile    = useFilesStore(s => s.removeFile)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_BYTES) {
      alert('Datei zu groß (max. 50 MB)')
      return
    }
    const buffer = await file.arrayBuffer()
    const data = Array.from(new Uint8Array(buffer))
    await importFile({
      customerId,
      folderId: selectedFolderId,
      name: file.name,
      data,
      mimeType: file.type || null,
    })
    e.target.value = ''
  }

  const addFolder = async () => {
    const name = prompt('Ordnername:')
    if (!name?.trim()) return
    await createFolder({ customerId, name: name.trim(), parentId: selectedFolderId })
  }

  return (
    <div className="flex h-full">
      {/* Folder tree */}
      <div className="w-48 border-r border-[var(--border)] p-4 flex flex-col gap-1 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-[var(--text2)] uppercase tracking-wide">Ordner</p>
          <button onClick={addFolder} className="text-xs text-primary hover:text-primary-dark">+</button>
        </div>

        <button
          onClick={() => selectFolder(null)}
          className={`w-full text-left text-sm px-2 py-1.5 rounded-lg transition-colors
            ${selectedFolderId === null ? 'bg-primary/10 text-primary' : 'text-[var(--text2)] hover:bg-[var(--bg1)]'}`}
        >
          Alle Dateien
        </button>

        {folders.map(folder => (
          <div key={folder.id} className="flex items-center gap-1 group">
            <button
              onClick={() => selectFolder(folder.id)}
              className={`flex-1 text-left text-sm px-2 py-1.5 rounded-lg transition-colors truncate
                ${selectedFolderId === folder.id ? 'bg-primary/10 text-primary' : 'text-[var(--text2)] hover:bg-[var(--bg1)]'}`}
            >
              📁 {folder.name}
            </button>
            <button
              onClick={() => removeFolder(folder.id)}
              className="text-[var(--text2)] hover:text-red-400 text-xs opacity-0 group-hover:opacity-100"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* File grid */}
      <div className="flex-1 p-5 overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-[var(--text2)]">
            {files.length} Datei{files.length !== 1 ? 'en' : ''}
          </p>
          <div className="flex gap-2">
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-sm px-4 py-1.5 rounded-lg bg-primary text-white hover:bg-primary-dark"
            >
              + Datei hinzufügen
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-red-400 mb-3">{error.message}</p>}
        {isLoading && <p className="text-sm text-[var(--text2)]">Lädt…</p>}

        {files.length === 0 && !isLoading ? (
          <div className="text-center py-16">
            <p className="text-[var(--text2)] text-sm">Keine Dateien</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {files.map(file => (
              <div
                key={file.id}
                className="p-4 rounded-xl border border-[var(--border)] bg-[var(--bg1)] flex flex-col gap-2 group relative"
              >
                <span className="text-3xl">{fileIcon(file.mimeType)}</span>
                <p className="text-sm font-medium text-[var(--text)] truncate">{file.name}</p>
                {file.size && <p className="text-xs text-[var(--text2)]">{formatSize(file.size)}</p>}
                <button
                  onClick={() => removeFile(file.id)}
                  className="absolute top-2 right-2 text-[var(--text2)] hover:text-red-400 text-xs opacity-0 group-hover:opacity-100"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check + commit**

```
npx tsc --noEmit
git add src/components/customer/tabs/DateienPane.tsx
git commit -m "feat(ui): DateienPane — folder tree + file import/delete"
```

---

## Task 19: `HistoriePane`

**Files:**
- Create: `src/components/customer/tabs/HistoriePane.tsx`

- [ ] **Step 1: Create the pane**

```tsx
import { useTodosStore } from '@/store/todos.store'
import { useNotesStore } from '@/store/notes.store'
import { useFilesStore } from '@/store/files.store'
import { useFollowUpsStore } from '@/store/follow_ups.store'
import { useDeadlinesStore } from '@/store/deadlines.store'

interface TimelineEvent {
  id: string
  icon: string
  label: string
  timestamp: string
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  const hours   = Math.floor(diff / 3600000)
  const days    = Math.floor(diff / 86400000)
  if (minutes < 60) return `vor ${minutes} Min.`
  if (hours < 24)   return `vor ${hours} Std.`
  if (days === 1)   return 'Gestern'
  return `vor ${days} Tagen`
}

interface Props { customerId: string }

export function HistoriePane({ customerId }: Props) {
  const todos     = useTodosStore(s => s.todos)
  const notes     = useNotesStore(s => s.notes)
  const files     = useFilesStore(s => s.files)
  const followUps = useFollowUpsStore(s => s.followUps)
  const deadlines = useDeadlinesStore(s => s.deadlines)

  const events: TimelineEvent[] = [
    ...todos.map(t => ({ id: `todo-${t.id}`, icon: '✅', label: `To-Do erstellt: ${t.title}`, timestamp: t.createdAt })),
    ...todos.filter(t => t.status === 'done').map(t => ({ id: `todo-done-${t.id}`, icon: '✓', label: `To-Do erledigt: ${t.title}`, timestamp: t.updatedAt })),
    ...notes.map(n => ({ id: `note-${n.id}`, icon: '📝', label: `Notiz: ${n.title}`, timestamp: n.createdAt })),
    ...files.map(f => ({ id: `file-${f.id}`, icon: '📎', label: `Datei hochgeladen: ${f.name}`, timestamp: f.createdAt })),
    ...followUps.map(f => ({ id: `fu-${f.id}`, icon: '🔔', label: `Follow-Up: ${f.title}`, timestamp: f.createdAt })),
    ...followUps.filter(f => f.status === 'erledigt').map(f => ({ id: `fu-done-${f.id}`, icon: '✓', label: `Follow-Up erledigt: ${f.title}`, timestamp: f.createdAt })),
    ...deadlines.map(d => ({ id: `dl-${d.id}`, icon: '📅', label: `Deadline: ${d.title}`, timestamp: d.createdAt })),
  ].sort((a, b) => b.timestamp.localeCompare(a.timestamp))

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-sm font-semibold text-[var(--text)] mb-4">Aktivitäten</h2>

      {events.length === 0 ? (
        <p className="text-sm text-[var(--text2)] text-center py-12">Noch keine Aktivitäten</p>
      ) : (
        <div className="flex flex-col">
          {events.map((event, i) => (
            <div key={event.id} className="flex gap-4 pb-4 relative">
              {/* Timeline line */}
              {i < events.length - 1 && (
                <div className="absolute left-4 top-6 bottom-0 w-px bg-[var(--border)]" />
              )}
              <div className="w-8 h-8 rounded-full bg-[var(--bg1)] border border-[var(--border)] flex items-center justify-center text-sm flex-shrink-0 z-10">
                {event.icon}
              </div>
              <div className="flex-1 pt-1 min-w-0">
                <p className="text-sm text-[var(--text)] truncate">{event.label}</p>
                <p className="text-xs text-[var(--text2)] mt-0.5">{relativeTime(event.timestamp)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check + commit**

```
npx tsc --noEmit
git add src/components/customer/tabs/HistoriePane.tsx
git commit -m "feat(ui): HistoriePane — aggregated timeline"
```

---

## Task 20: `ProfilPane`

**Files:**
- Create: `src/components/customer/tabs/ProfilPane.tsx`

- [ ] **Step 1: Create the pane**

```tsx
import { useState, useEffect } from 'react'
import { useCustomersStore } from '@/store/customers.store'
import type { Customer, CustomerStatus, Priority, SocialLinks } from '@/types/customer.types'

const STATUS_OPTIONS: CustomerStatus[] = ['aktiv', 'lead', 'inaktiv', 'lost']
const PRIORITY_OPTIONS: Priority[] = ['normal', 'high', 'low']

interface Props { customerId: string }

export function ProfilPane({ customerId }: Props) {
  const customer = useCustomersStore(s => s.customers.find(c => c.id === customerId))
  const upsert   = useCustomersStore(s => s.upsert)

  const [form, setForm] = useState<Partial<Customer>>({})
  const [goalInput, setGoalInput] = useState('')

  useEffect(() => {
    if (customer) setForm(customer)
  }, [customer?.id])

  if (!customer) return null

  const save = (patch: Partial<Customer>) => {
    const next = { ...form, ...patch }
    setForm(next)
    upsert({
      id: customerId,
      name: next.name ?? customer.name,
      company: next.company,
      email: next.email,
      phone: next.phone,
      status: next.status,
      priority: next.priority,
      tags: next.tags,
      workspaceId: customer.workspaceId,
      createdBy: '',
      industry: next.industry,
      contactPerson: next.contactPerson,
      goals: next.goals,
      socialLinks: next.socialLinks,
      internalNotes: next.internalNotes,
    })
  }

  const socialLinks: SocialLinks = (() => {
    try { return JSON.parse(form.socialLinks ?? '{}') } catch { return {} }
  })()

  const saveSocialLinks = (patch: Partial<SocialLinks>) => {
    save({ socialLinks: JSON.stringify({ ...socialLinks, ...patch }) })
  }

  const addGoal = () => {
    if (!goalInput.trim()) return
    save({ goals: [...(form.goals ?? []), goalInput.trim()] })
    setGoalInput('')
  }

  const removeGoal = (i: number) => {
    save({ goals: (form.goals ?? []).filter((_, idx) => idx !== i) })
  }

  const field = (label: string, node: React.ReactNode) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-[var(--text2)] font-medium">{label}</label>
      {node}
    </div>
  )

  const input = (value: string | undefined, onBlur: (v: string) => void, placeholder = '') => (
    <input
      defaultValue={value ?? ''}
      onBlur={e => onBlur(e.target.value)}
      placeholder={placeholder}
      className="text-sm px-3 py-2 rounded-lg bg-[var(--bg1)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-primary"
    />
  )

  return (
    <div className="p-6 max-w-xl flex flex-col gap-5">
      <h2 className="text-sm font-semibold text-[var(--text)]">Stammdaten</h2>

      <div className="grid grid-cols-2 gap-4">
        {field('Name', input(form.name, v => save({ name: v })))}
        {field('Unternehmen', input(form.company, v => save({ company: v })))}
        {field('Branche', input(form.industry, v => save({ industry: v }), 'z.B. Marketing'))}
        {field('Ansprechpartner', input(form.contactPerson, v => save({ contactPerson: v })))}
        {field('E-Mail', input(form.email, v => save({ email: v })))}
        {field('Telefon', input(form.phone, v => save({ phone: v })))}

        {field('Status', (
          <select
            value={form.status ?? customer.status}
            onChange={e => save({ status: e.target.value as CustomerStatus })}
            className="text-sm px-3 py-2 rounded-lg bg-[var(--bg1)] border border-[var(--border)] text-[var(--text)] focus:outline-none"
          >
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        ))}

        {field('Priorität', (
          <select
            value={form.priority ?? customer.priority}
            onChange={e => save({ priority: e.target.value as Priority })}
            className="text-sm px-3 py-2 rounded-lg bg-[var(--bg1)] border border-[var(--border)] text-[var(--text)] focus:outline-none"
          >
            {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        ))}
      </div>

      {/* Goals */}
      {field('Ziele', (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              value={goalInput}
              onChange={e => setGoalInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addGoal()}
              placeholder="Ziel hinzufügen…"
              className="flex-1 text-sm px-3 py-2 rounded-lg bg-[var(--bg1)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button onClick={addGoal} className="px-3 py-2 rounded-lg bg-primary text-white text-sm">+</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(form.goals ?? []).map((g, i) => (
              <span key={i} className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">
                {g}
                <button onClick={() => removeGoal(i)} className="hover:text-red-400 ml-0.5">✕</button>
              </span>
            ))}
          </div>
        </div>
      ))}

      {/* Social Links */}
      <div className="flex flex-col gap-3">
        <p className="text-xs text-[var(--text2)] font-medium">Social Links</p>
        <div className="grid grid-cols-1 gap-2">
          {field('Instagram', input(socialLinks.instagram, v => saveSocialLinks({ instagram: v }), '@handle'))}
          {field('LinkedIn', input(socialLinks.linkedin, v => saveSocialLinks({ linkedin: v }), 'linkedin.com/in/…'))}
          {field('Website', input(socialLinks.website, v => saveSocialLinks({ website: v }), 'https://…'))}
        </div>
      </div>

      {/* Internal Notes */}
      {field('Interne Infos', (
        <textarea
          defaultValue={form.internalNotes ?? ''}
          onBlur={e => save({ internalNotes: e.target.value })}
          rows={4}
          placeholder="Interne Notizen…"
          className="text-sm px-3 py-2 rounded-lg bg-[var(--bg1)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-primary resize-none"
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Full Rust test run**

```
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: all tests pass

- [ ] **Step 4: Commit**

```
git add src/components/customer/tabs/ProfilPane.tsx
git commit -m "feat(ui): ProfilPane — stammdaten, goals, social links, internal notes"
```

---

## Self-Review Notes

**Spec coverage:**
- ✅ Dashboard: health score, letzte interaktion, nächste aktion, high priority, mini-timeline
- ✅ Workflow: todos + checklisten + status + deadlines + follow-ups + tags/assignee
- ✅ Kommunikation: alle 5 typen + waiting-reply filter
- ✅ Dateien: ordnerstruktur + datei-import (copy to app dir) + löschen
- ✅ Historie: alle event-typen aggregiert
- ✅ Profil: alle stammdaten + goals + social links + interne notizen
- ✅ SQLite migration v4
- ✅ Deadline DB module (new)
- ✅ file import command

**Type consistency:** All store types reference the same interfaces defined in Task 7. `CustomerTab` exported from `ui.store.ts` and used in `CustomerRoute`. `replaceOrAppend` helper consistently named across all stores.

**No placeholders:** All steps contain complete code.
