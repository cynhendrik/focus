# Notizen-Modul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notizen-Modul vollständig neu bauen — SQLite + Supabase-Sync, zwei Einstiegspunkte (globale Route + Kunden-Tab), Timeline mit datierten Notizen und pinbaren Dokumenten.

**Architecture:** SQLite-first (Tauri Rust commands) → sync_queue → Supabase. Zwei Tabellen: `note_entries` (Timeline-Notizen) und `note_docs` (pinbare Dokumente). `notebook.store` (localStorage) und `NotizPane.tsx` werden ersetzt.

**Tech Stack:** Rust/rusqlite, Tauri commands, Zustand, React 18, TipTap 3 (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-placeholder`, `@tiptap/extension-task-list`, `@tiptap/extension-task-item`), Lucide icons, inline styles.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src-tauri/src/db/migrations.rs` | Modify | Migration v21: note_entries + note_docs Tabellen |
| `src-tauri/src/db/note_entry.rs` | Create | CRUD für Timeline-Notizen |
| `src-tauri/src/db/note_doc.rs` | Create | CRUD für pinbare Dokumente |
| `src-tauri/src/db/mod.rs` | Modify | note_entry + note_doc Module hinzufügen |
| `src-tauri/src/commands/notes.rs` | Create | 8 Tauri commands |
| `src-tauri/src/commands/mod.rs` | Modify | notes Modul registrieren |
| `src-tauri/src/main.rs` | Modify | Commands in invoke_handler! registrieren |
| `src/types/notes-module.types.ts` | Create | NoteEntry + NoteDoc TypeScript-Typen |
| `src/store/notes-module.store.ts` | Create | Zustand store (ersetzt notebook.store) |
| `src/components/notes/NoteCard.tsx` | Create | Aufklappbare Notiz-Karte mit inline TipTap |
| `src/components/notes/NewNoteForm.tsx` | Create | Inline-Erstellungsformular |
| `src/components/notes/PinnedDocsRow.tsx` | Create | Angeheftete Dokument-Chips |
| `src/components/notes/NoteDocModal.tsx` | Create | Vollbild TipTap Dokument-Editor |
| `src/components/notes/CustomerNotesPane.tsx` | Create | Hauptansicht (Timeline + Docs) |
| `src/components/notes/CustomerNotesPanel.tsx` | Create | Kundenliste für globale Route |
| `src/routes/NotesRoute.tsx` | Create | Globale Notizen-Route |
| `src/components/customer/tabs/NotizPane.tsx` | Delete | Ersetzt durch CustomerNotesPane |
| `src/store/notebook.store.ts` | Delete | Ersetzt durch notes-module.store |
| `src/routes/CustomerRoute.tsx` | Modify | NotizPane → CustomerNotesPane |
| `src/components/customer/tabs/ArbeitenPane.tsx` | Modify | NotizPane → CustomerNotesPane |
| `src/components/layout/AppShell.tsx` | Modify | NotesRoute in Navigation einbinden |

---

## Task 1: SQLite Migration v21

**Files:**
- Modify: `src-tauri/src/db/migrations.rs`

- [ ] **Step 1: CURRENT_VERSION auf 21 erhöhen**

In `src-tauri/src/db/migrations.rs` Zeile 4 ändern:
```rust
const CURRENT_VERSION: u32 = 21;
```

- [ ] **Step 2: Migration v21 hinzufügen**

Im `match version`-Block in `fn apply` vor `_ => Ok(())` einfügen:
```rust
21 => {
    conn.execute_batch(r#"
        CREATE TABLE IF NOT EXISTS note_entries (
            id           TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            account_id   TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            title        TEXT,
            content      TEXT NOT NULL DEFAULT '',
            tags         TEXT NOT NULL DEFAULT '[]',
            created_by   TEXT NOT NULL,
            updated_by   TEXT,
            pending_sync INTEGER NOT NULL DEFAULT 0,
            created_at   TEXT NOT NULL,
            updated_at   TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_note_entries_account
            ON note_entries(account_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_note_entries_workspace
            ON note_entries(workspace_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS note_docs (
            id           TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            account_id   TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            title        TEXT NOT NULL DEFAULT 'Unbenanntes Dokument',
            content      TEXT NOT NULL DEFAULT '',
            created_by   TEXT NOT NULL,
            updated_by   TEXT,
            pending_sync INTEGER NOT NULL DEFAULT 0,
            created_at   TEXT NOT NULL,
            updated_at   TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_note_docs_account
            ON note_docs(account_id, created_at DESC);
    "#)?;
    Ok(())
}
```

- [ ] **Step 3: Tests für v21 schreiben**

Im `mod tests`-Block am Ende von `migrations.rs` hinzufügen:
```rust
#[test]
fn migration_v21_creates_note_tables() {
    let conn = in_memory_db();
    run(&conn).unwrap();
    for table in ["note_entries", "note_docs"] {
        assert!(
            table_exists_helper(&conn, table),
            "{table} fehlt nach v21"
        );
    }
    // note_entries: account_id FK cascade
    conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO accounts (id, workspace_id, created_by, name, created_at, updated_at)
         VALUES ('acc-n1','ws-1','u1','Test AG',?1,?1)",
        [&now],
    ).unwrap();
    conn.execute(
        "INSERT INTO note_entries (id, workspace_id, account_id, created_by, created_at, updated_at)
         VALUES ('ne1','ws-1','acc-n1','u1',?1,?1)",
        [&now],
    ).unwrap();
    conn.execute("DELETE FROM accounts WHERE id='acc-n1'", []).unwrap();
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM note_entries WHERE id='ne1'",
        [], |r| r.get(0),
    ).unwrap();
    assert_eq!(count, 0, "note_entries should CASCADE on account delete");
}

#[test]
fn migration_v21_runs_idempotently() {
    let conn = in_memory_db();
    run(&conn).unwrap();
    run(&conn).unwrap();
    assert_eq!(get_version(&conn).unwrap(), CURRENT_VERSION);
}
```

- [ ] **Step 4: Tests ausführen**

```bash
cd src-tauri && cargo test db::migrations::tests::migration_v21 -- --nocapture 2>&1 | tail -5
```

Expected: `test ... ok` für beide Tests.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/db/migrations.rs
git commit -m "feat(notes): migration v21 — note_entries + note_docs tables"
```

---

## Task 2: Rust DB Layer — note_entry.rs

**Files:**
- Create: `src-tauri/src/db/note_entry.rs`

- [ ] **Step 1: Datei erstellen**

```rust
// src-tauri/src/db/note_entry.rs
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::AppError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NoteEntry {
    pub id:           String,
    pub workspace_id: String,
    pub account_id:   String,
    pub title:        Option<String>,
    pub content:      String,
    pub tags:         String,  // JSON array string
    pub created_by:   String,
    pub updated_by:   Option<String>,
    pub created_at:   String,
    pub updated_at:   String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateNoteEntryPayload {
    pub workspace_id: String,
    pub account_id:   String,
    pub title:        Option<String>,
    pub content:      Option<String>,
    pub tags:         Option<String>,
    pub created_by:   String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateNoteEntryPayload {
    pub title:      Option<String>,
    pub content:    Option<String>,
    pub tags:       Option<String>,
    pub updated_by: Option<String>,
}

fn map_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<NoteEntry> {
    Ok(NoteEntry {
        id:           r.get(0)?,
        workspace_id: r.get(1)?,
        account_id:   r.get(2)?,
        title:        r.get(3)?,
        content:      r.get::<_, Option<String>>(4)?.unwrap_or_default(),
        tags:         r.get::<_, Option<String>>(5)?.unwrap_or_else(|| "[]".into()),
        created_by:   r.get(6)?,
        updated_by:   r.get(7)?,
        created_at:   r.get(8)?,
        updated_at:   r.get(9)?,
    })
}

const SELECT_COLS: &str =
    "id, workspace_id, account_id, title, content, tags,
     created_by, updated_by, created_at, updated_at";

pub fn insert(conn: &Connection, payload: CreateNoteEntryPayload) -> Result<NoteEntry, AppError> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        &format!("INSERT INTO note_entries
         (id, workspace_id, account_id, title, content, tags, created_by, pending_sync, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,1,?8,?8)"),
        rusqlite::params![
            id,
            payload.workspace_id,
            payload.account_id,
            payload.title,
            payload.content.unwrap_or_default(),
            payload.tags.unwrap_or_else(|| "[]".into()),
            payload.created_by,
            now,
        ],
    )?;
    conn.query_row(
        &format!("SELECT {SELECT_COLS} FROM note_entries WHERE id=?1"),
        [&id], map_row,
    ).map_err(AppError::from)
}

pub fn update(conn: &Connection, id: &str, payload: UpdateNoteEntryPayload) -> Result<NoteEntry, AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    let n = conn.execute(
        "UPDATE note_entries SET
           title      = COALESCE(?1, title),
           content    = COALESCE(?2, content),
           tags       = COALESCE(?3, tags),
           updated_by = ?4,
           pending_sync = 1,
           updated_at = ?5
         WHERE id = ?6",
        rusqlite::params![
            payload.title, payload.content, payload.tags,
            payload.updated_by, now, id,
        ],
    )?;
    if n == 0 { return Err(AppError::NotFound(format!("NoteEntry {id} not found"))); }
    conn.query_row(
        &format!("SELECT {SELECT_COLS} FROM note_entries WHERE id=?1"),
        [id], map_row,
    ).map_err(AppError::from)
}

pub fn delete(conn: &Connection, id: &str) -> Result<(), AppError> {
    let n = conn.execute("DELETE FROM note_entries WHERE id=?1", [id])?;
    if n == 0 { return Err(AppError::NotFound(format!("NoteEntry {id} not found"))); }
    Ok(())
}

pub fn get_by_account(conn: &Connection, account_id: &str) -> Result<Vec<NoteEntry>, AppError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {SELECT_COLS} FROM note_entries WHERE account_id=?1 ORDER BY created_at DESC"
    ))?;
    let rows = stmt.query_map([account_id], map_row)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
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

    fn seed_account(conn: &Connection, id: &str) {
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, created_at, updated_at)
             VALUES (?1,'ws-1','u-1','Test AG',?2,?2)",
            rusqlite::params![id, now],
        ).unwrap();
    }

    fn make_payload(account_id: &str) -> CreateNoteEntryPayload {
        CreateNoteEntryPayload {
            workspace_id: "ws-1".into(),
            account_id:   account_id.into(),
            title:        Some("Testnotiz".into()),
            content:      Some("<p>Inhalt</p>".into()),
            tags:         None,
            created_by:   "u-1".into(),
        }
    }

    #[test]
    fn insert_creates_entry() {
        let conn = setup();
        seed_account(&conn, "a1");
        let e = insert(&conn, make_payload("a1")).unwrap();
        assert_eq!(e.account_id, "a1");
        assert_eq!(e.content, "<p>Inhalt</p>");
        assert_eq!(e.tags, "[]");
    }

    #[test]
    fn get_by_account_returns_entries() {
        let conn = setup();
        seed_account(&conn, "a1");
        seed_account(&conn, "a2");
        insert(&conn, make_payload("a1")).unwrap();
        insert(&conn, make_payload("a1")).unwrap();
        insert(&conn, make_payload("a2")).unwrap();
        let entries = get_by_account(&conn, "a1").unwrap();
        assert_eq!(entries.len(), 2);
        assert!(get_by_account(&conn, "a2").unwrap().len() == 1);
        assert!(get_by_account(&conn, "a99").unwrap().is_empty());
    }

    #[test]
    fn update_changes_content() {
        let conn = setup();
        seed_account(&conn, "a1");
        let e = insert(&conn, make_payload("a1")).unwrap();
        let updated = update(&conn, &e.id, UpdateNoteEntryPayload {
            title:      None,
            content:    Some("<p>Geändert</p>".into()),
            tags:       Some(r#"["Follow-up"]"#.into()),
            updated_by: Some("u-2".into()),
        }).unwrap();
        assert_eq!(updated.content, "<p>Geändert</p>");
        assert_eq!(updated.tags, r#"["Follow-up"]"#);
        assert_eq!(updated.updated_by.as_deref(), Some("u-2"));
    }

    #[test]
    fn update_returns_not_found() {
        let conn = setup();
        let result = update(&conn, "nonexistent", UpdateNoteEntryPayload {
            title: None, content: Some("x".into()), tags: None, updated_by: None,
        });
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }

    #[test]
    fn delete_removes_entry() {
        let conn = setup();
        seed_account(&conn, "a1");
        let e = insert(&conn, make_payload("a1")).unwrap();
        delete(&conn, &e.id).unwrap();
        assert!(get_by_account(&conn, "a1").unwrap().is_empty());
    }

    #[test]
    fn delete_returns_not_found() {
        let conn = setup();
        assert!(matches!(delete(&conn, "nope"), Err(AppError::NotFound(_))));
    }
}
```

- [ ] **Step 2: Tests ausführen**

```bash
cd src-tauri && cargo test db::note_entry -- --nocapture 2>&1 | tail -10
```

Expected: alle 6 Tests `ok`.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/db/note_entry.rs
git commit -m "feat(notes): NoteEntry db layer with CRUD + tests"
```

---

## Task 3: Rust DB Layer — note_doc.rs

**Files:**
- Create: `src-tauri/src/db/note_doc.rs`

- [ ] **Step 1: Datei erstellen**

```rust
// src-tauri/src/db/note_doc.rs
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::AppError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NoteDoc {
    pub id:           String,
    pub workspace_id: String,
    pub account_id:   String,
    pub title:        String,
    pub content:      String,
    pub created_by:   String,
    pub updated_by:   Option<String>,
    pub created_at:   String,
    pub updated_at:   String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateNoteDocPayload {
    pub workspace_id: String,
    pub account_id:   String,
    pub title:        Option<String>,
    pub content:      Option<String>,
    pub created_by:   String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateNoteDocPayload {
    pub title:      Option<String>,
    pub content:    Option<String>,
    pub updated_by: Option<String>,
}

fn map_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<NoteDoc> {
    Ok(NoteDoc {
        id:           r.get(0)?,
        workspace_id: r.get(1)?,
        account_id:   r.get(2)?,
        title:        r.get::<_, Option<String>>(3)?.unwrap_or_else(|| "Unbenanntes Dokument".into()),
        content:      r.get::<_, Option<String>>(4)?.unwrap_or_default(),
        created_by:   r.get(5)?,
        updated_by:   r.get(6)?,
        created_at:   r.get(7)?,
        updated_at:   r.get(8)?,
    })
}

const SELECT_COLS: &str =
    "id, workspace_id, account_id, title, content,
     created_by, updated_by, created_at, updated_at";

pub fn insert(conn: &Connection, payload: CreateNoteDocPayload) -> Result<NoteDoc, AppError> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO note_docs
         (id, workspace_id, account_id, title, content, created_by, pending_sync, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,1,?7,?7)",
        rusqlite::params![
            id,
            payload.workspace_id,
            payload.account_id,
            payload.title.unwrap_or_else(|| "Unbenanntes Dokument".into()),
            payload.content.unwrap_or_default(),
            payload.created_by,
            now,
        ],
    )?;
    conn.query_row(
        &format!("SELECT {SELECT_COLS} FROM note_docs WHERE id=?1"),
        [&id], map_row,
    ).map_err(AppError::from)
}

pub fn update(conn: &Connection, id: &str, payload: UpdateNoteDocPayload) -> Result<NoteDoc, AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    let n = conn.execute(
        "UPDATE note_docs SET
           title      = COALESCE(?1, title),
           content    = COALESCE(?2, content),
           updated_by = ?3,
           pending_sync = 1,
           updated_at = ?4
         WHERE id = ?5",
        rusqlite::params![payload.title, payload.content, payload.updated_by, now, id],
    )?;
    if n == 0 { return Err(AppError::NotFound(format!("NoteDoc {id} not found"))); }
    conn.query_row(
        &format!("SELECT {SELECT_COLS} FROM note_docs WHERE id=?1"),
        [id], map_row,
    ).map_err(AppError::from)
}

pub fn delete(conn: &Connection, id: &str) -> Result<(), AppError> {
    let n = conn.execute("DELETE FROM note_docs WHERE id=?1", [id])?;
    if n == 0 { return Err(AppError::NotFound(format!("NoteDoc {id} not found"))); }
    Ok(())
}

pub fn get_by_account(conn: &Connection, account_id: &str) -> Result<Vec<NoteDoc>, AppError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {SELECT_COLS} FROM note_docs WHERE account_id=?1 ORDER BY updated_at DESC"
    ))?;
    let rows = stmt.query_map([account_id], map_row)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
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

    fn seed_account(conn: &Connection, id: &str) {
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, created_at, updated_at)
             VALUES (?1,'ws-1','u-1','Test AG',?2,?2)",
            rusqlite::params![id, now],
        ).unwrap();
    }

    fn make_payload(account_id: &str) -> CreateNoteDocPayload {
        CreateNoteDocPayload {
            workspace_id: "ws-1".into(),
            account_id:   account_id.into(),
            title:        Some("Onboarding".into()),
            content:      Some("<p>Schritt 1</p>".into()),
            created_by:   "u-1".into(),
        }
    }

    #[test]
    fn insert_creates_doc() {
        let conn = setup();
        seed_account(&conn, "a1");
        let d = insert(&conn, make_payload("a1")).unwrap();
        assert_eq!(d.title, "Onboarding");
        assert_eq!(d.account_id, "a1");
    }

    #[test]
    fn insert_default_title() {
        let conn = setup();
        seed_account(&conn, "a1");
        let d = insert(&conn, CreateNoteDocPayload {
            workspace_id: "ws-1".into(), account_id: "a1".into(),
            title: None, content: None, created_by: "u-1".into(),
        }).unwrap();
        assert_eq!(d.title, "Unbenanntes Dokument");
    }

    #[test]
    fn get_by_account_returns_docs() {
        let conn = setup();
        seed_account(&conn, "a1");
        seed_account(&conn, "a2");
        insert(&conn, make_payload("a1")).unwrap();
        insert(&conn, make_payload("a2")).unwrap();
        assert_eq!(get_by_account(&conn, "a1").unwrap().len(), 1);
        assert!(get_by_account(&conn, "a99").unwrap().is_empty());
    }

    #[test]
    fn update_changes_title_and_content() {
        let conn = setup();
        seed_account(&conn, "a1");
        let d = insert(&conn, make_payload("a1")).unwrap();
        let updated = update(&conn, &d.id, UpdateNoteDocPayload {
            title:      Some("Onboarding v2".into()),
            content:    Some("<p>Neu</p>".into()),
            updated_by: Some("u-2".into()),
        }).unwrap();
        assert_eq!(updated.title, "Onboarding v2");
        assert_eq!(updated.updated_by.as_deref(), Some("u-2"));
    }

    #[test]
    fn delete_removes_doc() {
        let conn = setup();
        seed_account(&conn, "a1");
        let d = insert(&conn, make_payload("a1")).unwrap();
        delete(&conn, &d.id).unwrap();
        assert!(get_by_account(&conn, "a1").unwrap().is_empty());
    }
}
```

- [ ] **Step 2: Tests ausführen**

```bash
cd src-tauri && cargo test db::note_doc -- --nocapture 2>&1 | tail -10
```

Expected: alle 5 Tests `ok`.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/db/note_doc.rs
git commit -m "feat(notes): NoteDoc db layer with CRUD + tests"
```

---

## Task 4: db/mod.rs + Commands

**Files:**
- Modify: `src-tauri/src/db/mod.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Create: `src-tauri/src/commands/notes.rs`

- [ ] **Step 1: db/mod.rs erweitern**

In `src-tauri/src/db/mod.rs` am Ende hinzufügen:
```rust
pub mod note_entry;
pub mod note_doc;
```

- [ ] **Step 2: commands/mod.rs erweitern**

In `src-tauri/src/commands/mod.rs` am Ende hinzufügen:
```rust
pub mod notes;
```

- [ ] **Step 3: commands/notes.rs erstellen**

```rust
// src-tauri/src/commands/notes.rs
use tauri::State;
use crate::{
    AppError,
    db::{
        pool::DbPool,
        note_entry::{NoteEntry, CreateNoteEntryPayload, UpdateNoteEntryPayload},
        note_doc::{NoteDoc, CreateNoteDocPayload, UpdateNoteDocPayload},
    },
};

// ── NoteEntry commands ────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_note_entries(db: State<'_, DbPool>, account_id: String) -> Result<Vec<NoteEntry>, AppError> {
    let conn = db.conn();
    crate::db::note_entry::get_by_account(&*conn, &account_id)
}

#[tauri::command]
pub fn create_note_entry(db: State<'_, DbPool>, payload: CreateNoteEntryPayload) -> Result<NoteEntry, AppError> {
    let conn = db.conn();
    crate::db::note_entry::insert(&*conn, payload)
}

#[tauri::command]
pub fn update_note_entry(db: State<'_, DbPool>, id: String, payload: UpdateNoteEntryPayload) -> Result<NoteEntry, AppError> {
    let conn = db.conn();
    crate::db::note_entry::update(&*conn, &id, payload)
}

#[tauri::command]
pub fn delete_note_entry(db: State<'_, DbPool>, id: String) -> Result<(), AppError> {
    let conn = db.conn();
    crate::db::note_entry::delete(&*conn, &id)
}

// ── NoteDoc commands ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_note_docs(db: State<'_, DbPool>, account_id: String) -> Result<Vec<NoteDoc>, AppError> {
    let conn = db.conn();
    crate::db::note_doc::get_by_account(&*conn, &account_id)
}

#[tauri::command]
pub fn create_note_doc(db: State<'_, DbPool>, payload: CreateNoteDocPayload) -> Result<NoteDoc, AppError> {
    let conn = db.conn();
    crate::db::note_doc::insert(&*conn, payload)
}

#[tauri::command]
pub fn update_note_doc(db: State<'_, DbPool>, id: String, payload: UpdateNoteDocPayload) -> Result<NoteDoc, AppError> {
    let conn = db.conn();
    crate::db::note_doc::update(&*conn, &id, payload)
}

#[tauri::command]
pub fn delete_note_doc(db: State<'_, DbPool>, id: String) -> Result<(), AppError> {
    let conn = db.conn();
    crate::db::note_doc::delete(&*conn, &id)
}
```

- [ ] **Step 4: Commands in main.rs registrieren**

In `src-tauri/src/main.rs` im `invoke_handler!`-Block vor dem schließenden `]` einfügen:
```rust
commands::notes::get_note_entries,
commands::notes::create_note_entry,
commands::notes::update_note_entry,
commands::notes::delete_note_entry,
commands::notes::get_note_docs,
commands::notes::create_note_doc,
commands::notes::update_note_doc,
commands::notes::delete_note_doc,
```

- [ ] **Step 5: Kompilieren**

```bash
cd src-tauri && cargo build 2>&1 | grep -E "^error" | head -20
```

Expected: keine Zeilen (Build erfolgreich).

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/db/mod.rs src-tauri/src/commands/mod.rs src-tauri/src/commands/notes.rs src-tauri/src/main.rs
git commit -m "feat(notes): Tauri commands für NoteEntry + NoteDoc"
```

---

## Task 5: TypeScript Types + Store

**Files:**
- Create: `src/types/notes-module.types.ts`
- Create: `src/store/notes-module.store.ts`

- [ ] **Step 1: Types erstellen**

```typescript
// src/types/notes-module.types.ts
export interface NoteEntry {
  id:          string
  workspaceId: string
  accountId:   string
  title:       string | null
  content:     string
  tags:        string[]   // parsed from JSON
  createdBy:   string
  updatedBy:   string | null
  createdAt:   string
  updatedAt:   string
}

export interface NoteDoc {
  id:          string
  workspaceId: string
  accountId:   string
  title:       string
  content:     string
  createdBy:   string
  updatedBy:   string | null
  createdAt:   string
  updatedAt:   string
}

export interface CreateNoteEntryPayload {
  workspaceId: string
  accountId:   string
  title?:      string
  content?:    string
  tags?:       string   // JSON string
  createdBy:   string
}

export interface UpdateNoteEntryPayload {
  title?:     string | null
  content?:   string
  tags?:      string   // JSON string
  updatedBy?: string
}

export interface CreateNoteDocPayload {
  workspaceId: string
  accountId:   string
  title?:      string
  content?:    string
  createdBy:   string
}

export interface UpdateNoteDocPayload {
  title?:     string
  content?:   string
  updatedBy?: string
}
```

- [ ] **Step 2: Store erstellen**

```typescript
// src/store/notes-module.store.ts
import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { log } from '@/lib/logger'
import type {
  NoteEntry, NoteDoc,
  CreateNoteEntryPayload, UpdateNoteEntryPayload,
  CreateNoteDocPayload, UpdateNoteDocPayload,
} from '@/types/notes-module.types'

// Tauri gibt tags als JSON-String zurück — parsen
function parseEntry(raw: NoteEntry & { tags: string }): NoteEntry {
  let tags: string[] = []
  try { tags = JSON.parse(raw.tags) } catch {}
  return { ...raw, tags }
}

interface NotesModuleState {
  entries:        NoteEntry[]
  docs:           NoteDoc[]
  loadingEntries: boolean
  loadingDocs:    boolean
  activeAccountId: string | null

  loadForAccount:  (accountId: string) => Promise<void>

  createEntry:     (payload: CreateNoteEntryPayload) => Promise<NoteEntry>
  updateEntry:     (id: string, patch: UpdateNoteEntryPayload) => Promise<void>
  deleteEntry:     (id: string) => Promise<void>

  createDoc:       (payload: CreateNoteDocPayload) => Promise<NoteDoc>
  updateDoc:       (id: string, patch: UpdateNoteDocPayload) => Promise<void>
  deleteDoc:       (id: string) => Promise<void>
}

export const useNotesModuleStore = create<NotesModuleState>()((set, get) => ({
  entries:         [],
  docs:            [],
  loadingEntries:  false,
  loadingDocs:     false,
  activeAccountId: null,

  loadForAccount: async (accountId) => {
    if (get().activeAccountId === accountId) return
    set({ loadingEntries: true, loadingDocs: true, activeAccountId: accountId })
    try {
      const [rawEntries, docs] = await Promise.all([
        invoke<(NoteEntry & { tags: string })[]>('get_note_entries', { accountId }),
        invoke<NoteDoc[]>('get_note_docs', { accountId }),
      ])
      set({ entries: rawEntries.map(parseEntry), docs, loadingEntries: false, loadingDocs: false })
    } catch (err) {
      log.error('Failed to load notes for account', { accountId, err })
      set({ loadingEntries: false, loadingDocs: false })
    }
  },

  createEntry: async (payload) => {
    const raw = await invoke<NoteEntry & { tags: string }>('create_note_entry', { payload })
    const entry = parseEntry(raw)
    set(s => ({ entries: [entry, ...s.entries] }))
    return entry
  },

  updateEntry: async (id, patch) => {
    const raw = await invoke<NoteEntry & { tags: string }>('update_note_entry', { id, payload: patch })
    const updated = parseEntry(raw)
    set(s => ({ entries: s.entries.map(e => e.id === id ? updated : e) }))
  },

  deleteEntry: async (id) => {
    await invoke<void>('delete_note_entry', { id })
    set(s => ({ entries: s.entries.filter(e => e.id !== id) }))
  },

  createDoc: async (payload) => {
    const doc = await invoke<NoteDoc>('create_note_doc', { payload })
    set(s => ({ docs: [doc, ...s.docs] }))
    return doc
  },

  updateDoc: async (id, patch) => {
    const updated = await invoke<NoteDoc>('update_note_doc', { id, payload: patch })
    set(s => ({ docs: s.docs.map(d => d.id === id ? updated : d) }))
  },

  deleteDoc: async (id) => {
    await invoke<void>('delete_note_doc', { id })
    set(s => ({ docs: s.docs.filter(d => d.id !== id) }))
  },
}))
```

- [ ] **Step 3: TypeScript prüfen**

```bash
npx tsc --noEmit 2>&1 | grep -E "notes-module" | head -10
```

Expected: keine Fehler.

- [ ] **Step 4: Commit**

```bash
git add src/types/notes-module.types.ts src/store/notes-module.store.ts
git commit -m "feat(notes): TypeScript types + Zustand store (notes-module)"
```

---

## Task 6: NoteCard Komponente

**Files:**
- Create: `src/components/notes/NoteCard.tsx`

- [ ] **Step 1: Komponente erstellen**

```tsx
// src/components/notes/NoteCard.tsx
import { useState, useRef, useEffect, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Trash2, Pin } from 'lucide-react'
import type { NoteEntry } from '@/types/notes-module.types'

interface Props {
  entry:    NoteEntry
  onUpdate: (patch: { title?: string | null; content?: string; tags?: string }) => void
  onDelete: () => void
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  if (diff < 86_400_000) return d.toLocaleTimeString('de', { hour: '2-digit', minute: '2-digit' })
  if (diff < 7 * 86_400_000) return ['So','Mo','Di','Mi','Do','Fr','Sa'][d.getDay()]
  return `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getFullYear()}`
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

const AVAILABLE_TAGS = ['Follow-up', 'Erstgespräch', 'Recherche', 'Angebot', 'Wichtig']

export function NoteCard({ entry, onUpdate, onDelete }: Props) {
  const [expanded, setExpanded]   = useState(false)
  const [title, setTitle]         = useState(entry.title ?? '')
  const [showTags, setShowTags]   = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2] } }),
      Placeholder.configure({ placeholder: 'Notizinhalt…' }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    editorProps: {
      attributes: {
        style: 'outline:none; font-size:13px; line-height:1.7; color:var(--fg); min-height:60px; font-family:inherit;',
      },
    },
    content: entry.content || '',
    onUpdate({ editor }) {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        onUpdate({ content: editor.getHTML() })
      }, 500)
    },
  }, [entry.id])

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  const saveTitle = useCallback((val: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => onUpdate({ title: val || null }), 500)
  }, [onUpdate])

  const toggleTag = (tag: string) => {
    const next = entry.tags.includes(tag)
      ? entry.tags.filter(t => t !== tag)
      : [...entry.tags, tag]
    onUpdate({ tags: JSON.stringify(next) })
  }

  const preview = stripHtml(entry.content).slice(0, 140)

  return (
    <div style={{
      background: 'var(--bg2)',
      border: `1px solid ${expanded ? 'rgba(181,240,35,0.2)' : 'rgba(255,255,255,0.07)'}`,
      borderRadius: 12, marginBottom: 10,
      transition: 'border-color 160ms',
    }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '11px 14px', cursor: 'pointer',
        }}
      >
        {/* Author dot */}
        <div style={{
          width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
          background: 'rgba(181,240,35,0.12)', color: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 700,
        }}>
          {entry.createdBy.slice(0, 2).toUpperCase()}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 600,
            color: entry.title ? 'var(--fg)' : 'var(--fg-dim)',
            fontStyle: entry.title ? 'normal' : 'italic',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {entry.title || 'Ohne Titel'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <span style={{ fontSize: 10, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>
              {fmtTime(entry.createdAt)}
            </span>
            {entry.tags.map(tag => (
              <span key={tag} style={{
                fontSize: 10, fontWeight: 600, fontFamily: 'var(--font-mono)',
                background: 'rgba(181,240,35,0.1)', color: 'var(--accent)',
                padding: '1px 6px', borderRadius: 99,
              }}>{tag}</span>
            ))}
          </div>
        </div>

        {/* Actions — visible on hover via CSS not possible with inline, so always show when expanded */}
        {expanded && (
          <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setShowTags(s => !s)}
              title="Tags"
              style={{
                width: 26, height: 26, borderRadius: 6, border: 'none',
                background: showTags ? 'rgba(181,240,35,0.1)' : 'transparent',
                color: showTags ? 'var(--accent)' : 'var(--fg-dim)',
                cursor: 'pointer', fontSize: 11, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >#</button>
            <button
              onClick={onDelete}
              title="Löschen"
              style={{
                width: 26, height: 26, borderRadius: 6, border: 'none',
                background: 'transparent', color: 'var(--fg-dim)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            ><Trash2 size={12} /></button>
          </div>
        )}
      </div>

      {/* Tag picker */}
      {expanded && showTags && (
        <div style={{
          padding: '6px 14px 10px 52px', display: 'flex', gap: 6, flexWrap: 'wrap',
        }}>
          {AVAILABLE_TAGS.map(tag => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              style={{
                padding: '3px 9px', borderRadius: 99, cursor: 'pointer', border: '1px solid',
                borderColor: entry.tags.includes(tag) ? 'var(--accent)' : 'rgba(255,255,255,0.1)',
                background: entry.tags.includes(tag) ? 'rgba(181,240,35,0.1)' : 'transparent',
                color: entry.tags.includes(tag) ? 'var(--accent)' : 'var(--fg-dim)',
                fontSize: 11, fontWeight: 600, fontFamily: 'inherit', transition: 'all 140ms',
              }}
            >{tag}</button>
          ))}
        </div>
      )}

      {/* Preview (collapsed) */}
      {!expanded && preview && (
        <div style={{
          padding: '0 14px 11px 52px', fontSize: 12.5,
          color: 'var(--fg-muted)', lineHeight: 1.6,
          overflow: 'hidden', display: '-webkit-box',
          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>
          {preview}
        </div>
      )}

      {/* Editor (expanded) */}
      {expanded && (
        <div style={{ padding: '4px 14px 14px 52px' }}>
          {/* Title input */}
          <input
            value={title}
            onChange={e => { setTitle(e.target.value); saveTitle(e.target.value) }}
            placeholder="Titel (optional)…"
            onClick={e => e.stopPropagation()}
            style={{
              display: 'block', width: '100%', border: 'none', background: 'transparent',
              fontSize: 14, fontWeight: 700, color: 'var(--fg)', outline: 'none',
              fontFamily: 'inherit', marginBottom: 8,
            }}
          />
          {/* Format toolbar */}
          <div style={{ display: 'flex', gap: 2, marginBottom: 8 }}>
            {[
              ['B', () => editor?.chain().focus().toggleBold().run(), { fontWeight: 700 }],
              ['I', () => editor?.chain().focus().toggleItalic().run(), { fontStyle: 'italic' }],
              ['H1', () => editor?.chain().focus().toggleHeading({ level: 1 }).run(), { fontWeight: 700, fontSize: 10 }],
              ['•', () => editor?.chain().focus().toggleBulletList().run(), {}],
              ['☐', () => editor?.chain().focus().toggleTaskList().run(), {}],
            ].map(([label, action, style]) => (
              <button
                key={label as string}
                onMouseDown={e => { e.preventDefault(); (action as () => void)() }}
                style={{
                  padding: '2px 7px', borderRadius: 5, border: 'none',
                  background: 'transparent', color: 'var(--fg-dim)', cursor: 'pointer',
                  fontSize: 11, fontFamily: 'inherit', transition: 'all 120ms',
                  ...(style as React.CSSProperties),
                }}
              >{label as string}</button>
            ))}
          </div>
          <div style={{
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 8, padding: '10px 12px',
          }}>
            <EditorContent editor={editor} />
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: TypeScript prüfen**

```bash
npx tsc --noEmit 2>&1 | grep "NoteCard" | head -10
```

Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/components/notes/NoteCard.tsx
git commit -m "feat(notes): NoteCard — aufklappbare Notiz-Karte mit TipTap"
```

---

## Task 7: NewNoteForm Komponente

**Files:**
- Create: `src/components/notes/NewNoteForm.tsx`

- [ ] **Step 1: Komponente erstellen**

```tsx
// src/components/notes/NewNoteForm.tsx
import { useState, useRef, useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'

interface Props {
  onSave:   (title: string | null, content: string) => Promise<void>
  onCancel: () => void
}

export function NewNoteForm({ onSave, onCancel }: Props) {
  const [title, setTitle]   = useState('')
  const [saving, setSaving] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Was wurde besprochen? Was ist wichtig?…' }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    editorProps: {
      attributes: {
        style: 'outline:none; font-size:13px; line-height:1.7; color:var(--fg); min-height:70px; font-family:inherit;',
      },
    },
    autofocus: true,
  })

  // Esc → cancel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onCancel() }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [onCancel])

  const handleSave = async () => {
    const content = editor?.getHTML() ?? ''
    if (!content || editor?.isEmpty) return
    setSaving(true)
    try {
      await onSave(title.trim() || null, content)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      background: 'var(--bg2)',
      border: '1px solid rgba(181,240,35,0.25)',
      borderRadius: 12, padding: '14px 16px', marginBottom: 10,
      boxShadow: '0 0 0 3px rgba(181,240,35,0.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
          background: 'rgba(181,240,35,0.12)', color: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 700,
        }}>HW</div>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Titel (optional)…"
          style={{
            flex: 1, border: 'none', background: 'transparent',
            fontSize: 13, fontWeight: 600, color: 'var(--fg)',
            outline: 'none', fontFamily: 'inherit',
          }}
        />
      </div>

      {/* Format toolbar */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 8 }}>
        {[
          ['B', () => editor?.chain().focus().toggleBold().run(), { fontWeight: 700 }],
          ['I', () => editor?.chain().focus().toggleItalic().run(), { fontStyle: 'italic' }],
          ['•', () => editor?.chain().focus().toggleBulletList().run(), {}],
          ['☐', () => editor?.chain().focus().toggleTaskList().run(), {}],
        ].map(([label, action, style]) => (
          <button
            key={label as string}
            onMouseDown={e => { e.preventDefault(); (action as () => void)() }}
            style={{
              padding: '2px 7px', borderRadius: 5, border: 'none',
              background: 'transparent', color: 'var(--fg-dim)', cursor: 'pointer',
              fontSize: 11, fontFamily: 'inherit',
              ...(style as React.CSSProperties),
            }}
          >{label as string}</button>
        ))}
      </div>

      <div style={{
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 8, padding: '10px 12px',
      }}>
        <EditorContent editor={editor} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
        <button
          onClick={onCancel}
          style={{
            padding: '5px 12px', borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.07)',
            background: 'rgba(255,255,255,0.04)', color: 'var(--fg-muted)',
            fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >Abbrechen</button>
        <button
          onClick={handleSave}
          disabled={saving || editor?.isEmpty}
          style={{
            padding: '5px 14px', borderRadius: 8, border: 'none',
            background: saving || editor?.isEmpty ? 'rgba(255,255,255,0.06)' : 'var(--accent)',
            color: saving || editor?.isEmpty ? 'var(--fg-dim)' : 'var(--accent-ink)',
            fontSize: 11, fontWeight: 700, cursor: saving || editor?.isEmpty ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
          }}
        >{saving ? 'Speichern…' : 'Speichern'}</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript prüfen**

```bash
npx tsc --noEmit 2>&1 | grep "NewNoteForm" | head -10
```

Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/components/notes/NewNoteForm.tsx
git commit -m "feat(notes): NewNoteForm — inline Erstellungsformular"
```

---

## Task 8: PinnedDocsRow + NoteDocModal

**Files:**
- Create: `src/components/notes/PinnedDocsRow.tsx`
- Create: `src/components/notes/NoteDocModal.tsx`

- [ ] **Step 1: NoteDocModal erstellen**

```tsx
// src/components/notes/NoteDocModal.tsx
import { useEffect, useState, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { X, Trash2 } from 'lucide-react'
import type { NoteDoc } from '@/types/notes-module.types'

interface Props {
  doc:      NoteDoc | null   // null = neues Dokument
  accountId: string
  onSave:   (title: string, content: string) => Promise<void>
  onDelete: (() => Promise<void>) | null
  onClose:  () => void
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function NoteDocModal({ doc, onSave, onDelete, onClose }: Props) {
  const [title, setTitle]   = useState(doc?.title ?? '')
  const [saving, setSaving] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder: 'Dokumentinhalt…' }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    editorProps: {
      attributes: {
        style: 'outline:none; font-size:13.5px; line-height:1.75; color:var(--fg); font-family:inherit; min-height:200px;',
      },
    },
    content: doc?.content ?? '',
    onUpdate({ editor }) {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        if (doc) onSave(title, editor.getHTML()).catch(() => {})
      }, 800)
    },
  }, [doc?.id])

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  // Esc → close (stopPropagation so it doesn't bubble to parent ESC handlers)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [onClose])

  const handleSave = async () => {
    if (!title.trim()) return
    setSaving(true)
    try { await onSave(title, editor?.getHTML() ?? '') }
    finally { setSaving(false); onClose() }
  }

  const handleDelete = async () => {
    if (!onDelete) return
    await onDelete()
    onClose()
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 720, maxHeight: '85vh',
          background: 'var(--bg2)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 16, display: 'flex', flexDirection: 'column',
          boxShadow: '0 40px 100px rgba(0,0,0,0.6)', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '13px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0,
        }}>
          <span style={{ fontSize: 14 }}>📋</span>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Dokumenttitel…"
            autoFocus={!doc}
            style={{
              flex: 1, border: 'none', background: 'transparent',
              fontSize: 15, fontWeight: 700, color: 'var(--fg)',
              outline: 'none', fontFamily: 'inherit', letterSpacing: '-0.02em',
            }}
          />
          {onDelete && (
            <button
              onClick={handleDelete}
              style={{
                width: 28, height: 28, borderRadius: 7, border: 'none',
                background: 'transparent', color: 'var(--fg-dim)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              title="Löschen"
            ><Trash2 size={13} /></button>
          )}
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 7, border: 'none',
              background: 'transparent', color: 'var(--fg-dim)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          ><X size={14} /></button>
        </div>

        {/* Toolbar */}
        <div style={{
          padding: '7px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)',
          display: 'flex', gap: 2, flexShrink: 0,
        }}>
          {[
            ['B', () => editor?.chain().focus().toggleBold().run(), { fontWeight: 700 }],
            ['I', () => editor?.chain().focus().toggleItalic().run(), { fontStyle: 'italic' }],
            ['H1', () => editor?.chain().focus().toggleHeading({ level: 1 }).run(), { fontWeight: 700, fontSize: 10 }],
            ['H2', () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), { fontWeight: 700, fontSize: 10 }],
            ['•', () => editor?.chain().focus().toggleBulletList().run(), {}],
            ['1.', () => editor?.chain().focus().toggleOrderedList().run(), {}],
            ['☐', () => editor?.chain().focus().toggleTaskList().run(), {}],
            ['<>', () => editor?.chain().focus().toggleCode().run(), { fontFamily: 'monospace' }],
          ].map(([label, action, style]) => (
            <button
              key={label as string}
              onMouseDown={e => { e.preventDefault(); (action as () => void)() }}
              style={{
                padding: '3px 8px', borderRadius: 5, border: 'none',
                background: 'transparent', color: 'var(--fg-dim)', cursor: 'pointer',
                fontSize: 11, fontFamily: 'inherit', transition: 'all 120ms',
                ...(style as React.CSSProperties),
              }}
            >{label as string}</button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: '18px 22px', overflowY: 'auto' }}>
          <EditorContent editor={editor} />
        </div>

        {/* Footer */}
        <div style={{
          padding: '11px 18px', borderTop: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 10, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>
            {doc ? `📌 Angeheftet · zuletzt ${fmtDate(doc.updatedAt)}` : 'Neues Dokument'}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                padding: '5px 12px', borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.07)',
                background: 'rgba(255,255,255,0.04)', color: 'var(--fg-muted)',
                fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >Schließen</button>
            {!doc && (
              <button
                onClick={handleSave}
                disabled={saving || !title.trim()}
                style={{
                  padding: '5px 14px', borderRadius: 8, border: 'none',
                  background: !title.trim() ? 'rgba(255,255,255,0.06)' : 'var(--accent)',
                  color: !title.trim() ? 'var(--fg-dim)' : 'var(--accent-ink)',
                  fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >{saving ? 'Erstellen…' : 'Erstellen'}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: PinnedDocsRow erstellen**

```tsx
// src/components/notes/PinnedDocsRow.tsx
import { useState } from 'react'
import type { NoteDoc } from '@/types/notes-module.types'
import { NoteDocModal } from './NoteDocModal'

interface Props {
  docs:      NoteDoc[]
  accountId: string
  onCreate:  (title: string, content: string) => Promise<void>
  onUpdate:  (id: string, title: string, content: string) => Promise<void>
  onDelete:  (id: string) => Promise<void>
}

export function PinnedDocsRow({ docs, accountId, onCreate, onUpdate, onDelete }: Props) {
  const [openDoc, setOpenDoc] = useState<NoteDoc | 'new' | null>(null)

  return (
    <>
      <div style={{ marginBottom: 28 }}>
        <div style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.14em',
          textTransform: 'uppercase', color: 'var(--fg-dim)',
          fontFamily: 'var(--font-mono)', marginBottom: 10,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span>📌 Angeheftet</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {docs.map(doc => (
            <button
              key={doc.id}
              onClick={() => setOpenDoc(doc)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', borderRadius: 9,
                border: '1px solid rgba(255,255,255,0.07)',
                background: 'var(--bg2)', cursor: 'pointer', transition: 'all 140ms',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.background = 'var(--bg3)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.background = 'var(--bg2)' }}
            >
              <span style={{ fontSize: 13 }}>📋</span>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg)' }}>{doc.title}</div>
              </div>
            </button>
          ))}

          <button
            onClick={() => setOpenDoc('new')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 12px', borderRadius: 9,
              border: '1px dashed rgba(255,255,255,0.1)',
              background: 'transparent', cursor: 'pointer', color: 'var(--fg-dim)',
              fontSize: 12, fontFamily: 'inherit', transition: 'all 140ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(181,240,35,0.3)'; e.currentTarget.style.color = 'var(--accent)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'var(--fg-dim)' }}
          >
            + Dokument
          </button>
        </div>
      </div>

      {openDoc !== null && (
        <NoteDocModal
          doc={openDoc === 'new' ? null : openDoc}
          accountId={accountId}
          onSave={async (title, content) => {
            if (openDoc === 'new') await onCreate(title, content)
            else await onUpdate(openDoc.id, title, content)
          }}
          onDelete={openDoc !== 'new' ? async () => { await onDelete(openDoc.id) } : null}
          onClose={() => setOpenDoc(null)}
        />
      )}
    </>
  )
}
```

- [ ] **Step 3: TypeScript prüfen**

```bash
npx tsc --noEmit 2>&1 | grep -E "NoteDocModal|PinnedDocsRow" | head -10
```

Expected: keine Fehler.

- [ ] **Step 4: Commit**

```bash
git add src/components/notes/NoteDocModal.tsx src/components/notes/PinnedDocsRow.tsx
git commit -m "feat(notes): NoteDocModal + PinnedDocsRow"
```

---

## Task 9: CustomerNotesPane

**Files:**
- Create: `src/components/notes/CustomerNotesPane.tsx`

- [ ] **Step 1: Komponente erstellen**

```tsx
// src/components/notes/CustomerNotesPane.tsx
import { useEffect, useState, useMemo } from 'react'
import { useNotesModuleStore } from '@/store/notes-module.store'
import { useWorkspaceStore }   from '@/store/workspace.store'
import { useAuthStore }        from '@/store/auth.store'
import { NoteCard }            from './NoteCard'
import { NewNoteForm }         from './NewNoteForm'
import { PinnedDocsRow }       from './PinnedDocsRow'

interface Props { accountId: string }

function fmtDayLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) {
    return `Heute · ${d.getDate()}. ${d.toLocaleDateString('de-DE', { month: 'long' })}`
  }
  if (d.toDateString() === yesterday.toDateString()) return 'Gestern'
  return `${d.getDate()}. ${d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}`
}

// Group entries by calendar day
function groupByDay(entries: ReturnType<typeof useNotesModuleStore.getState>['entries']) {
  const groups: { label: string; entries: typeof entries }[] = []
  const seen = new Map<string, number>()
  for (const e of entries) {
    const key = new Date(e.createdAt).toDateString()
    if (!seen.has(key)) {
      seen.set(key, groups.length)
      groups.push({ label: fmtDayLabel(e.createdAt), entries: [] })
    }
    groups[seen.get(key)!].entries.push(e)
  }
  return groups
}

export function CustomerNotesPane({ accountId }: Props) {
  const loadForAccount = useNotesModuleStore(s => s.loadForAccount)
  const entries        = useNotesModuleStore(s => s.entries)
  const docs           = useNotesModuleStore(s => s.docs)
  const createEntry    = useNotesModuleStore(s => s.createEntry)
  const updateEntry    = useNotesModuleStore(s => s.updateEntry)
  const deleteEntry    = useNotesModuleStore(s => s.deleteEntry)
  const createDoc      = useNotesModuleStore(s => s.createDoc)
  const updateDoc      = useNotesModuleStore(s => s.updateDoc)
  const deleteDoc      = useNotesModuleStore(s => s.deleteDoc)
  const loadingEntries = useNotesModuleStore(s => s.loadingEntries)

  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const userId      = useAuthStore(s => s.user?.id) ?? ''

  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    loadForAccount(accountId)
  }, [accountId, loadForAccount])

  const dayGroups = useMemo(() => groupByDay(entries), [entries])

  const handleCreateEntry = async (title: string | null, content: string) => {
    await createEntry({ workspaceId, accountId, title: title ?? undefined, content, createdBy: userId })
    setShowForm(false)
  }

  const handleCreateDoc = async (title: string, content: string) => {
    await createDoc({ workspaceId, accountId, title, content, createdBy: userId })
  }

  const handleUpdateDoc = async (id: string, title: string, content: string) => {
    await updateDoc(id, { title, content, updatedBy: userId })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        padding: '14px 28px 10px', flexShrink: 0,
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowForm(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 8, border: 'none',
              background: 'var(--accent)', color: 'var(--accent-ink)',
              fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >+ Notiz</button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px 48px' }}>
        {/* Pinned docs */}
        <PinnedDocsRow
          docs={docs}
          accountId={accountId}
          onCreate={handleCreateDoc}
          onUpdate={handleUpdateDoc}
          onDelete={id => deleteDoc(id)}
        />

        {/* Timeline section label */}
        <div style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.14em',
          textTransform: 'uppercase', color: 'var(--fg-dim)',
          fontFamily: 'var(--font-mono)', marginBottom: 14,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span>Verlauf</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
        </div>

        {/* New note form */}
        {showForm && (
          <div style={{ marginBottom: 4 }}>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)', marginBottom: 8,
            }}>Heute</div>
            <NewNoteForm onSave={handleCreateEntry} onCancel={() => setShowForm(false)} />
          </div>
        )}

        {/* Day groups */}
        {loadingEntries ? (
          <div style={{ color: 'var(--fg-dim)', fontSize: 12, padding: '20px 0' }}>Lädt…</div>
        ) : dayGroups.length === 0 && !showForm ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--fg-dim)' }}>
            <div style={{ fontSize: 28, marginBottom: 12, opacity: 0.25 }}>✎</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-muted)', marginBottom: 4 }}>
              Noch keine Notizen
            </div>
            <div style={{ fontSize: 12 }}>+ Notiz klicken um loszulegen</div>
          </div>
        ) : (
          dayGroups.map(group => (
            <div key={group.label} style={{ marginBottom: 24 }}>
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: 'var(--fg-dim)',
                fontFamily: 'var(--font-mono)', marginBottom: 8,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span>{group.label}</span>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.05)' }} />
              </div>
              {group.entries.map(entry => (
                <NoteCard
                  key={entry.id}
                  entry={entry}
                  onUpdate={patch => updateEntry(entry.id, { ...patch, updatedBy: userId })}
                  onDelete={() => deleteEntry(entry.id)}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript prüfen**

```bash
npx tsc --noEmit 2>&1 | grep "CustomerNotesPane" | head -10
```

Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/components/notes/CustomerNotesPane.tsx
git commit -m "feat(notes): CustomerNotesPane — Timeline + Pinned Docs Hauptansicht"
```

---

## Task 10: CustomerNotesPanel + NotesRoute

**Files:**
- Create: `src/components/notes/CustomerNotesPanel.tsx`
- Create: `src/routes/NotesRoute.tsx`

- [ ] **Step 1: CustomerNotesPanel erstellen**

```tsx
// src/components/notes/CustomerNotesPanel.tsx
import { useState, useMemo } from 'react'
import { useAccountsStore } from '@/store/accounts.store'
import { useNotesModuleStore } from '@/store/notes-module.store'

interface Props {
  selectedId: string | null
  onSelect:   (accountId: string) => void
}

export function CustomerNotesPanel({ selectedId, onSelect }: Props) {
  const accounts = useAccountsStore(s => s.accounts.filter(a => !a.isPrivate))
  const entries  = useNotesModuleStore(s => s.entries)
  const [search, setSearch] = useState('')

  // Count notes per account from the store — only for the selected account (loaded)
  // For counts we use a simple approach: show total entries count for selected, else stored last-known
  const filtered = useMemo(() =>
    accounts.filter(a =>
      a.name.toLowerCase().includes(search.toLowerCase())
    ).sort((a, b) => a.name.localeCompare(b.name, 'de')),
  [accounts, search])

  const entryCountForSelected = entries.length

  function initials(name: string): string {
    return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  }

  const COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#8b5cf6','#06b6d4','#f97316']
  function colorFor(name: string): string {
    let h = 0
    for (const c of name) h = (h * 31 + c.charCodeAt(0)) % COLORS.length
    return COLORS[h]
  }

  return (
    <div style={{
      width: 240, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.07)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{ padding: '16px 14px 10px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
        <div style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
          color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)', marginBottom: 8,
        }}>Kunden</div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Suchen…"
          style={{
            width: '100%', padding: '7px 10px', borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)',
            color: 'var(--fg)', fontSize: 12, outline: 'none', fontFamily: 'inherit',
          }}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
        {filtered.map(account => {
          const color = colorFor(account.name)
          const isActive = account.id === selectedId
          return (
            <div
              key={account.id}
              onClick={() => onSelect(account.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', borderRadius: 9, cursor: 'pointer',
                marginBottom: 2, transition: 'all 120ms',
                border: `1px solid ${isActive ? 'rgba(181,240,35,0.15)' : 'transparent'}`,
                background: isActive ? 'rgba(181,240,35,0.06)' : 'transparent',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
            >
              <div style={{
                width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                background: `${color}22`, color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 800,
              }}>
                {initials(account.name)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 12.5, fontWeight: 600,
                  color: isActive ? 'var(--accent)' : 'var(--fg)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{account.name}</div>
              </div>
              {isActive && entryCountForSelected > 0 && (
                <div style={{
                  fontSize: 10, fontFamily: 'var(--font-mono)',
                  background: 'rgba(181,240,35,0.12)', color: 'var(--accent)',
                  padding: '1px 6px', borderRadius: 99, flexShrink: 0,
                }}>{entryCountForSelected}</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: NotesRoute erstellen**

```tsx
// src/routes/NotesRoute.tsx
import { useState } from 'react'
import { CustomerNotesPanel } from '@/components/notes/CustomerNotesPanel'
import { CustomerNotesPane }  from '@/components/notes/CustomerNotesPane'

export function NotesRoute() {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <CustomerNotesPanel
        selectedId={selectedAccountId}
        onSelect={setSelectedAccountId}
      />

      <div style={{ flex: 1, overflow: 'hidden' }}>
        {selectedAccountId ? (
          <CustomerNotesPane accountId={selectedAccountId} />
        ) : (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100%', color: 'var(--fg-dim)',
          }}>
            <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.2 }}>✎</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-muted)', marginBottom: 4 }}>
              Kunden auswählen
            </div>
            <div style={{ fontSize: 12 }}>Links einen Kunden wählen um Notizen zu sehen</div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: TypeScript prüfen**

```bash
npx tsc --noEmit 2>&1 | grep -E "NotesRoute|CustomerNotesPanel" | head -10
```

Expected: keine Fehler.

- [ ] **Step 4: Commit**

```bash
git add src/components/notes/CustomerNotesPanel.tsx src/routes/NotesRoute.tsx
git commit -m "feat(notes): CustomerNotesPanel + NotesRoute — globale Notizen-Ansicht"
```

---

## Task 11: Navigation + CustomerRoute verdrahten

**Files:**
- Modify: `src/components/layout/AppShell.tsx` (oder wo die Sidebar-Navigation definiert ist)
- Modify: `src/routes/CustomerRoute.tsx`
- Modify: `src/components/customer/tabs/ArbeitenPane.tsx`

- [ ] **Step 1: AppShell prüfen**

```bash
grep -n "notizen\|focus\|notes\|setAppView\|appView" src/components/layout/AppShell.tsx | head -20
```

Finde den Ort wo die Sidebar-Navigation-Items definiert werden und wo die Route-Komponenten gerendert werden.

- [ ] **Step 2: NotesRoute in AppShell einbinden**

Füge in der AppShell-Datei den Import hinzu:
```tsx
import { NotesRoute } from '@/routes/NotesRoute'
```

Und im Route-Switch/Render-Abschnitt für die View `'notes'` (oder den entsprechenden Key):
```tsx
case 'notes': return <NotesRoute />
```

Füge den Nav-Item für Notizen in der Sidebar hinzu (exakter Code hängt von der AppShell-Struktur ab — folge dem Pattern der anderen Nav-Items).

- [ ] **Step 3: CustomerRoute aktualisieren**

In `src/routes/CustomerRoute.tsx`:
```tsx
// Alten Import entfernen:
// import { NotizPane } from '@/components/customer/tabs/NotizPane'

// Neuen Import hinzufügen:
import { CustomerNotesPane } from '@/components/notes/CustomerNotesPane'
```

Im Switch:
```tsx
// Alt:
case 'notizen': return <NotizPane customerId={customerId} />

// Neu:
case 'notizen': return <CustomerNotesPane accountId={customerId} />
```

- [ ] **Step 4: ArbeitenPane aktualisieren**

In `src/components/customer/tabs/ArbeitenPane.tsx`:
```tsx
// Alten Import entfernen:
// import { NotizPane } from './NotizPane'
// import { useNotebookStore } from '@/store/notebook.store'

// Neuen Import hinzufügen:
import { CustomerNotesPane } from '@/components/notes/CustomerNotesPane'
```

Im Switch:
```tsx
// Alt:
case 'notizen': return <NotizPane customerId={customerId} />

// Neu:
case 'notizen': return <CustomerNotesPane accountId={customerId} />
```

Den `useNotebookStore`-Aufruf in ArbeitenPane entfernen (war für den Notiz-Count — entweder weglassen oder durch `useNotesModuleStore` ersetzen wenn der Count noch gebraucht wird).

- [ ] **Step 5: Alte Dateien löschen**

```bash
rm src/components/customer/tabs/NotizPane.tsx
rm src/store/notebook.store.ts
```

- [ ] **Step 6: TypeScript vollständig prüfen**

```bash
npx tsc --noEmit 2>&1 | grep "error" | grep -v "node_modules" | head -20
```

Expected: 0 Fehler. Alle Referenzen auf `NotizPane` und `notebook.store` müssen weg sein.

- [ ] **Step 7: App starten und testen**

```bash
npm run tauri dev
```

Testchecklist:
- Sidebar zeigt "Notizen" Nav-Item ✓
- Klick öffnet globale NotesRoute mit Kundenliste links ✓
- Kunde auswählen → CustomerNotesPane rechts erscheint ✓
- Pinned Docs Row erscheint oben ✓
- "+ Dokument" → NoteDocModal öffnet ✓
- Dokument erstellen → erscheint in PinnedDocsRow ✓
- "+ Notiz" → NewNoteForm erscheint ✓
- Notiz speichern → erscheint in Timeline unter "Heute" ✓
- Notiz aufklappen → TipTap Editor editierbar ✓
- Änderung → wird nach 500ms auto-gespeichert ✓
- Kunden-Detail → Tab "Notizen" → gleiche CustomerNotesPane ✓
- Gleiche Notizen in beiden Ansichten sichtbar ✓

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(notes): Notizen-Modul vollständig — NotesRoute + CustomerRoute verdrahtet, alte NotizPane entfernt"
```
