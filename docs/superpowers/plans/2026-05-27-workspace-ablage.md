# Workspace-Ablage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Workspace-weite Dateiablage mit Ordnerstruktur, automatischer Rechnung-Ablage bei Freigabe, In-App-PDF-Viewer und Download.

**Architecture:** Neue SQLite-Tabellen `workspace_folders`/`workspace_files` (Migration v14) isoliert von der bestehenden kundenbezogenen Ablage. Rust-Commands für CRUD + auto-save. Frontend: neuer `AppView 'ablage'`, eigene Route, Zustand-Store, in-App Blob-URL-Viewer.

**Tech Stack:** Rust/Tauri (rusqlite, uuid, chrono), React/TypeScript, Zustand, @react-pdf/renderer (bereits installiert), Tailwind CSS / CSS-Variablen des Projekts.

---

## Dateistruktur

**Neu anlegen:**
- `src-tauri/src/db/workspace_ablage.rs` — DB-Structs + Queries
- `src-tauri/src/commands/workspace_ablage.rs` — Tauri-Commands
- `src/types/workspace-ablage.types.ts` — TS-Typen
- `src/services/workspace-ablage.service.ts` — invoke-Wrapper
- `src/store/workspace-ablage.store.ts` — Zustand-Store
- `src/routes/AblageRoute.tsx` — Top-Level-Route
- `src/components/ablage/FilePreviewModal.tsx` — In-App-Viewer

**Modifizieren:**
- `src-tauri/src/db/migrations.rs` — v14 hinzufügen, CURRENT_VERSION → 14
- `src-tauri/src/db/schema.rs` — workspace_folders/files Tables ergänzen
- `src-tauri/src/db/mod.rs` — `pub mod workspace_ablage;`
- `src-tauri/src/commands/mod.rs` — `pub mod workspace_ablage;`
- `src-tauri/src/main.rs` — neue Commands registrieren
- `src/store/ui.store.ts` — `'ablage'` zu `AppView` hinzufügen
- `src/components/layout/NavSidebar.tsx` — Ablage-Eintrag
- `src/App.tsx` — `'ablage'` case + Import
- `src/components/finance/InvoicePDF.tsx` — `getInvoicePdfBytes` exportieren
- `src/routes/FinanceRoute.tsx` — Auto-Ablage bei Freigabe

---

## Task 1: DB-Migration v14

**Files:**
- Modify: `src-tauri/src/db/migrations.rs`
- Modify: `src-tauri/src/db/schema.rs`

- [ ] **Schritt 1: Failing-Test schreiben**

Füge am Ende des `tests`-Moduls in `src-tauri/src/db/migrations.rs` ein:

```rust
#[test]
fn migration_v14_creates_workspace_ablage_tables() {
    let conn = in_memory_db();
    run(&conn).unwrap();
    for table in ["workspace_folders", "workspace_files"] {
        assert!(table_exists_helper(&conn, table), "{table} fehlt nach v14");
    }
    let ws_file_cols: Vec<String> = conn
        .prepare("PRAGMA table_info(workspace_files)").unwrap()
        .query_map([], |r| r.get::<_, String>(1)).unwrap()
        .filter_map(|r| r.ok()).collect();
    assert!(ws_file_cols.contains(&"source_type".to_string()), "source_type fehlt");
    assert!(ws_file_cols.contains(&"source_id".to_string()), "source_id fehlt");
}
```

- [ ] **Schritt 2: Test laufen lassen — erwartet FAIL**

```powershell
cd src-tauri
cargo test migration_v14_creates_workspace_ablage_tables 2>&1 | Select-String -Pattern "FAILED|error|ok"
```

Erwartet: `FAILED` (Tabellen existieren noch nicht)

- [ ] **Schritt 3: CURRENT_VERSION bumpen und v14 in `apply()` hinzufügen**

In `src-tauri/src/db/migrations.rs`:

Ändere Zeile 4:
```rust
const CURRENT_VERSION: u32 = 14;
```

Füge vor `_ => Ok(()),` den v14-Case ein:

```rust
14 => {
    conn.execute_batch(r#"
        CREATE TABLE IF NOT EXISTS workspace_folders (
            id           TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            name         TEXT NOT NULL,
            parent_id    TEXT REFERENCES workspace_folders(id) ON DELETE CASCADE,
            created_at   TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_ws_folders_workspace
            ON workspace_folders(workspace_id, name);

        CREATE TABLE IF NOT EXISTS workspace_files (
            id           TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            folder_id    TEXT REFERENCES workspace_folders(id) ON DELETE SET NULL,
            name         TEXT NOT NULL,
            path         TEXT NOT NULL,
            size         INTEGER,
            mime_type    TEXT,
            source_type  TEXT NOT NULL DEFAULT 'manual',
            source_id    TEXT,
            created_at   TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_ws_files_workspace
            ON workspace_files(workspace_id, folder_id);
        CREATE INDEX IF NOT EXISTS idx_ws_files_source
            ON workspace_files(source_type, source_id);
    "#)?;
    Ok(())
}
```

- [ ] **Schritt 4: Tabellen auch in `schema.rs` ergänzen** (für Frisch-Installs und Tests)

In `src-tauri/src/db/schema.rs`, füge am Ende des großen `execute_batch`-Strings (vor dem schließenden `"#)?;`) ein:

```sql
        CREATE TABLE IF NOT EXISTS workspace_folders (
            id           TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            name         TEXT NOT NULL,
            parent_id    TEXT REFERENCES workspace_folders(id) ON DELETE CASCADE,
            created_at   TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_ws_folders_workspace
            ON workspace_folders(workspace_id, name);

        CREATE TABLE IF NOT EXISTS workspace_files (
            id           TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            folder_id    TEXT REFERENCES workspace_folders(id) ON DELETE SET NULL,
            name         TEXT NOT NULL,
            path         TEXT NOT NULL,
            size         INTEGER,
            mime_type    TEXT,
            source_type  TEXT NOT NULL DEFAULT 'manual',
            source_id    TEXT,
            created_at   TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_ws_files_workspace
            ON workspace_files(workspace_id, folder_id);
        CREATE INDEX IF NOT EXISTS idx_ws_files_source
            ON workspace_files(source_type, source_id);
```

- [ ] **Schritt 5: Test erneut laufen — erwartet PASS**

```powershell
cargo test migration_v14_creates_workspace_ablage_tables 2>&1 | Select-String -Pattern "FAILED|error|test.*ok"
```

Erwartet: `test migration_v14_creates_workspace_ablage_tables ... ok`

- [ ] **Schritt 6: Alle bestehenden Migrations-Tests prüfen**

```powershell
cargo test db::migrations 2>&1 | tail -20
```

Erwartet: alle grün, kein FAILED.

- [ ] **Schritt 7: Commit**

```powershell
cd ..
git add src-tauri/src/db/migrations.rs src-tauri/src/db/schema.rs
git commit -m "feat(db): migration v14 — workspace_folders + workspace_files tables"
```

---

## Task 2: DB-Modul `workspace_ablage.rs`

**Files:**
- Create: `src-tauri/src/db/workspace_ablage.rs`
- Modify: `src-tauri/src/db/mod.rs`

- [ ] **Schritt 1: `mod.rs` ergänzen**

Füge am Ende von `src-tauri/src/db/mod.rs` hinzu:
```rust
pub mod workspace_ablage;
```

- [ ] **Schritt 2: Modul anlegen mit Failing-Tests**

Erstelle `src-tauri/src/db/workspace_ablage.rs`:

```rust
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::AppError;

// ── Structs ───────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFolder {
    pub id: String,
    pub workspace_id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFile {
    pub id: String,
    pub workspace_id: String,
    pub folder_id: Option<String>,
    pub name: String,
    pub path: String,
    pub size: Option<i64>,
    pub mime_type: Option<String>,
    pub source_type: String,
    pub source_id: Option<String>,
    pub created_at: String,
}

// ── Folder helpers ────────────────────────────────────────────────────────────

fn row_to_folder(row: &rusqlite::Row<'_>) -> rusqlite::Result<WorkspaceFolder> {
    Ok(WorkspaceFolder {
        id: row.get(0)?, workspace_id: row.get(1)?,
        name: row.get(2)?, parent_id: row.get(3)?, created_at: row.get(4)?,
    })
}

fn row_to_file(row: &rusqlite::Row<'_>) -> rusqlite::Result<WorkspaceFile> {
    Ok(WorkspaceFile {
        id: row.get(0)?, workspace_id: row.get(1)?, folder_id: row.get(2)?,
        name: row.get(3)?, path: row.get(4)?, size: row.get(5)?,
        mime_type: row.get(6)?, source_type: row.get(7)?,
        source_id: row.get(8)?, created_at: row.get(9)?,
    })
}

// ── Folder CRUD ───────────────────────────────────────────────────────────────

pub fn get_ws_folders(conn: &Connection, workspace_id: &str) -> Result<Vec<WorkspaceFolder>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, name, parent_id, created_at
         FROM workspace_folders WHERE workspace_id = ?1 ORDER BY name ASC",
    )?;
    let folders = stmt
        .query_map([workspace_id], row_to_folder)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(folders)
}

pub fn create_ws_folder(
    conn: &Connection,
    workspace_id: &str,
    name: &str,
    parent_id: Option<&str>,
) -> Result<WorkspaceFolder, AppError> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO workspace_folders (id, workspace_id, name, parent_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![id, workspace_id, name, parent_id, now],
    )?;
    Ok(WorkspaceFolder {
        id,
        workspace_id: workspace_id.to_string(),
        name: name.to_string(),
        parent_id: parent_id.map(|s| s.to_string()),
        created_at: now,
    })
}

pub fn find_folder_by_name(
    conn: &Connection,
    workspace_id: &str,
    name: &str,
    parent_id: Option<&str>,
) -> Result<Option<WorkspaceFolder>, AppError> {
    let result = if let Some(pid) = parent_id {
        let mut stmt = conn.prepare(
            "SELECT id, workspace_id, name, parent_id, created_at
             FROM workspace_folders
             WHERE workspace_id = ?1 AND name = ?2 AND parent_id = ?3 LIMIT 1",
        )?;
        stmt.query_map(rusqlite::params![workspace_id, name, pid], row_to_folder)?
            .next().transpose()?
    } else {
        let mut stmt = conn.prepare(
            "SELECT id, workspace_id, name, parent_id, created_at
             FROM workspace_folders
             WHERE workspace_id = ?1 AND name = ?2 AND parent_id IS NULL LIMIT 1",
        )?;
        stmt.query_map(rusqlite::params![workspace_id, name], row_to_folder)?
            .next().transpose()?
    };
    Ok(result)
}

pub fn delete_ws_folder(conn: &Connection, id: &str) -> Result<(), AppError> {
    let affected = conn.execute("DELETE FROM workspace_folders WHERE id = ?1", [id])?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("Workspace folder {id} not found")));
    }
    Ok(())
}

// ── File CRUD ─────────────────────────────────────────────────────────────────

pub fn get_ws_files(
    conn: &Connection,
    workspace_id: &str,
    folder_id: Option<&str>,
) -> Result<Vec<WorkspaceFile>, AppError> {
    let files = if let Some(fid) = folder_id {
        let mut stmt = conn.prepare(
            "SELECT id, workspace_id, folder_id, name, path, size, mime_type,
                    source_type, source_id, created_at
             FROM workspace_files
             WHERE workspace_id = ?1 AND folder_id = ?2 ORDER BY created_at DESC",
        )?;
        stmt.query_map(rusqlite::params![workspace_id, fid], row_to_file)?
            .collect::<Result<Vec<_>, _>>()?
    } else {
        let mut stmt = conn.prepare(
            "SELECT id, workspace_id, folder_id, name, path, size, mime_type,
                    source_type, source_id, created_at
             FROM workspace_files
             WHERE workspace_id = ?1 ORDER BY created_at DESC",
        )?;
        stmt.query_map([workspace_id], row_to_file)?
            .collect::<Result<Vec<_>, _>>()?
    };
    Ok(files)
}

pub fn add_ws_file(
    conn: &Connection,
    workspace_id: &str,
    folder_id: Option<&str>,
    name: &str,
    path: &str,
    size: Option<i64>,
    mime_type: Option<&str>,
    source_type: &str,
    source_id: Option<&str>,
) -> Result<WorkspaceFile, AppError> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO workspace_files
         (id, workspace_id, folder_id, name, path, size, mime_type, source_type, source_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        rusqlite::params![id, workspace_id, folder_id, name, path, size, mime_type, source_type, source_id, now],
    )?;
    Ok(WorkspaceFile {
        id,
        workspace_id: workspace_id.to_string(),
        folder_id: folder_id.map(|s| s.to_string()),
        name: name.to_string(),
        path: path.to_string(),
        size,
        mime_type: mime_type.map(|s| s.to_string()),
        source_type: source_type.to_string(),
        source_id: source_id.map(|s| s.to_string()),
        created_at: now,
    })
}

pub fn get_ws_file(conn: &Connection, id: &str) -> Result<WorkspaceFile, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, folder_id, name, path, size, mime_type,
                source_type, source_id, created_at
         FROM workspace_files WHERE id = ?1",
    )?;
    stmt.query_map([id], row_to_file)?
        .next()
        .ok_or_else(|| AppError::NotFound(format!("Workspace file {id} not found")))?
        .map_err(AppError::from)
}

/// Löscht den DB-Eintrag und gibt den Disk-Pfad zurück, damit der Aufrufer
/// die Datei vom Dateisystem entfernen kann.
pub fn delete_ws_file(conn: &Connection, id: &str) -> Result<String, AppError> {
    let path: String = conn.query_row(
        "SELECT path FROM workspace_files WHERE id = ?1",
        [id],
        |row| row.get(0),
    ).map_err(|_| AppError::NotFound(format!("Workspace file {id} not found")))?;
    conn.execute("DELETE FROM workspace_files WHERE id = ?1", [id])?;
    Ok(path)
}

// ── Invoice-Folder-Path ───────────────────────────────────────────────────────

/// Stellt sicher, dass `Rechnungen/{year}/{month_name}` existiert.
/// Legt fehlende Ordner an. Gibt die `folder_id` des Monats-Ordners zurück.
pub fn ensure_invoice_folder_path(
    conn: &Connection,
    workspace_id: &str,
    year: i32,
    month_name: &str,
) -> Result<String, AppError> {
    let root = match find_folder_by_name(conn, workspace_id, "Rechnungen", None)? {
        Some(f) => f,
        None => create_ws_folder(conn, workspace_id, "Rechnungen", None)?,
    };
    let year_str = year.to_string();
    let year_folder = match find_folder_by_name(conn, workspace_id, &year_str, Some(&root.id))? {
        Some(f) => f,
        None => create_ws_folder(conn, workspace_id, &year_str, Some(&root.id))?,
    };
    let month_folder = match find_folder_by_name(conn, workspace_id, month_name, Some(&year_folder.id))? {
        Some(f) => f,
        None => create_ws_folder(conn, workspace_id, month_name, Some(&year_folder.id))?,
    };
    Ok(month_folder.id)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

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

    const WS: &str = "ws-test";

    #[test]
    fn create_and_list_folder() {
        let conn = setup();
        create_ws_folder(&conn, WS, "Rechnungen", None).unwrap();
        let folders = get_ws_folders(&conn, WS).unwrap();
        assert_eq!(folders.len(), 1);
        assert_eq!(folders[0].name, "Rechnungen");
        assert_eq!(folders[0].parent_id, None);
    }

    #[test]
    fn create_nested_folder() {
        let conn = setup();
        let root = create_ws_folder(&conn, WS, "Rechnungen", None).unwrap();
        let child = create_ws_folder(&conn, WS, "2026", Some(&root.id)).unwrap();
        assert_eq!(child.parent_id, Some(root.id.clone()));
        let all = get_ws_folders(&conn, WS).unwrap();
        assert_eq!(all.len(), 2);
    }

    #[test]
    fn delete_folder_cascades_children() {
        let conn = setup();
        let root = create_ws_folder(&conn, WS, "Rechnungen", None).unwrap();
        create_ws_folder(&conn, WS, "2026", Some(&root.id)).unwrap();
        delete_ws_folder(&conn, &root.id).unwrap();
        assert_eq!(get_ws_folders(&conn, WS).unwrap().len(), 0);
    }

    #[test]
    fn add_and_get_file() {
        let conn = setup();
        let folder = create_ws_folder(&conn, WS, "Docs", None).unwrap();
        let file = add_ws_file(
            &conn, WS, Some(&folder.id),
            "rechnung.pdf", "/tmp/rechnung.pdf",
            Some(1024), Some("application/pdf"),
            "invoice", Some("inv-1"),
        ).unwrap();
        let files = get_ws_files(&conn, WS, Some(&folder.id)).unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].name, "rechnung.pdf");
        assert_eq!(files[0].source_type, "invoice");

        let fetched = get_ws_file(&conn, &file.id).unwrap();
        assert_eq!(fetched.id, file.id);
    }

    #[test]
    fn delete_file_returns_path() {
        let conn = setup();
        let file = add_ws_file(
            &conn, WS, None, "test.pdf", "/tmp/test.pdf",
            None, None, "manual", None,
        ).unwrap();
        let path = delete_ws_file(&conn, &file.id).unwrap();
        assert_eq!(path, "/tmp/test.pdf");
        assert!(get_ws_file(&conn, &file.id).is_err());
    }

    #[test]
    fn ensure_invoice_folder_path_creates_hierarchy() {
        let conn = setup();
        let folder_id = ensure_invoice_folder_path(&conn, WS, 2026, "Mai").unwrap();
        let folders = get_ws_folders(&conn, WS).unwrap();
        // Should have: Rechnungen, 2026, Mai
        assert_eq!(folders.len(), 3);
        let names: Vec<&str> = folders.iter().map(|f| f.name.as_str()).collect();
        assert!(names.contains(&"Rechnungen"));
        assert!(names.contains(&"2026"));
        assert!(names.contains(&"Mai"));

        // Calling again is idempotent
        let folder_id2 = ensure_invoice_folder_path(&conn, WS, 2026, "Mai").unwrap();
        assert_eq!(folder_id, folder_id2);
        assert_eq!(get_ws_folders(&conn, WS).unwrap().len(), 3);
    }

    #[test]
    fn find_folder_by_name_returns_none_for_missing() {
        let conn = setup();
        let result = find_folder_by_name(&conn, WS, "Nichtvorhanden", None).unwrap();
        assert!(result.is_none());
    }
}
```

- [ ] **Schritt 3: Tests laufen lassen — erwartet PASS**

```powershell
cd src-tauri
cargo test db::workspace_ablage 2>&1 | tail -20
```

Erwartet: alle 7 Tests grün.

- [ ] **Schritt 4: Commit**

```powershell
cd ..
git add src-tauri/src/db/workspace_ablage.rs src-tauri/src/db/mod.rs
git commit -m "feat(db): workspace_ablage module — folders, files, ensure_invoice_folder_path"
```

---

## Task 3: Rust Commands `workspace_ablage.rs`

**Files:**
- Create: `src-tauri/src/commands/workspace_ablage.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Schritt 1: `commands/mod.rs` ergänzen**

Füge am Ende von `src-tauri/src/commands/mod.rs` hinzu:
```rust
pub mod workspace_ablage;
```

- [ ] **Schritt 2: Commands-Modul anlegen**

Erstelle `src-tauri/src/commands/workspace_ablage.rs`:

```rust
use tauri::{Manager, State};
use crate::{AppError, db::{pool::DbPool, workspace_ablage::{self, WorkspaceFolder, WorkspaceFile}}};

#[tauri::command]
pub async fn cmd_get_ws_folders(
    db: State<'_, DbPool>,
    workspace_id: String,
) -> Result<Vec<WorkspaceFolder>, AppError> {
    workspace_ablage::get_ws_folders(&db.conn(), &workspace_id)
}

#[tauri::command]
pub async fn cmd_create_ws_folder(
    db: State<'_, DbPool>,
    workspace_id: String,
    name: String,
    parent_id: Option<String>,
) -> Result<WorkspaceFolder, AppError> {
    workspace_ablage::create_ws_folder(&db.conn(), &workspace_id, &name, parent_id.as_deref())
}

#[tauri::command]
pub async fn cmd_delete_ws_folder(
    db: State<'_, DbPool>,
    id: String,
) -> Result<(), AppError> {
    workspace_ablage::delete_ws_folder(&db.conn(), &id)
}

#[tauri::command]
pub async fn cmd_get_ws_files(
    db: State<'_, DbPool>,
    workspace_id: String,
    folder_id: Option<String>,
) -> Result<Vec<WorkspaceFile>, AppError> {
    workspace_ablage::get_ws_files(&db.conn(), &workspace_id, folder_id.as_deref())
}

#[tauri::command]
pub async fn cmd_import_ws_file(
    app: tauri::AppHandle,
    db: State<'_, DbPool>,
    workspace_id: String,
    folder_id: Option<String>,
    name: String,
    data: Vec<u8>,
    mime_type: Option<String>,
) -> Result<WorkspaceFile, AppError> {
    let data_dir = app.path().app_data_dir()
        .map_err(|e| AppError::Io(e.to_string()))?;
    let file_id = uuid::Uuid::new_v4().to_string();
    let dest_dir = data_dir.join("cynera").join("ws_files").join(&workspace_id).join(&file_id);
    std::fs::create_dir_all(&dest_dir)?;
    let dest = dest_dir.join(&name);
    std::fs::write(&dest, &data)?;
    workspace_ablage::add_ws_file(
        &db.conn(), &workspace_id, folder_id.as_deref(), &name,
        &dest.to_string_lossy(), Some(data.len() as i64),
        mime_type.as_deref(), "manual", None,
    )
}

#[tauri::command]
pub async fn cmd_delete_ws_file(
    db: State<'_, DbPool>,
    id: String,
) -> Result<(), AppError> {
    let path = workspace_ablage::delete_ws_file(&db.conn(), &id)?;
    let _ = std::fs::remove_file(&path); // best-effort
    Ok(())
}

#[tauri::command]
pub async fn cmd_read_ws_file(
    db: State<'_, DbPool>,
    id: String,
) -> Result<Vec<u8>, AppError> {
    let file = workspace_ablage::get_ws_file(&db.conn(), &id)?;
    let bytes = std::fs::read(&file.path)?;
    Ok(bytes)
}

#[tauri::command]
pub async fn cmd_save_invoice_to_ablage(
    app: tauri::AppHandle,
    db: State<'_, DbPool>,
    workspace_id: String,
    invoice_id: String,
    invoice_number: String,
    account_name: String,
    invoice_date: String,   // ISO "2026-05-27"
    pdf_data: Vec<u8>,
) -> Result<WorkspaceFile, AppError> {
    // Parse year + month
    let parts: Vec<&str> = invoice_date.splitn(3, '-').collect();
    let year: i32 = parts.first().and_then(|s| s.parse().ok()).unwrap_or(2026);
    let month: usize = parts.get(1).and_then(|s| s.parse::<usize>().ok()).unwrap_or(1);
    let month_names = ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];
    let month_name = month_names.get(month.saturating_sub(1)).copied().unwrap_or("Jan");

    let folder_id = workspace_ablage::ensure_invoice_folder_path(
        &db.conn(), &workspace_id, year, month_name,
    )?;

    // Safe filename
    let safe_chars = |s: &str| -> String {
        s.chars()
            .map(|c| if matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') { '_' } else { c })
            .collect()
    };
    let safe_num  = safe_chars(&invoice_number);
    let safe_name = safe_chars(&account_name);
    let safe_name = if safe_name.chars().count() > 40 {
        safe_name.chars().take(40).collect::<String>()
    } else { safe_name };
    let filename = format!("{}_{}.pdf", safe_num, safe_name);

    // Write to disk
    let data_dir = app.path().app_data_dir()
        .map_err(|e| AppError::Io(e.to_string()))?;
    let file_id = uuid::Uuid::new_v4().to_string();
    let dest_dir = data_dir.join("cynera").join("ws_files").join(&workspace_id).join(&file_id);
    std::fs::create_dir_all(&dest_dir)?;
    let dest = dest_dir.join(&filename);
    std::fs::write(&dest, &pdf_data)?;

    workspace_ablage::add_ws_file(
        &db.conn(), &workspace_id, Some(&folder_id), &filename,
        &dest.to_string_lossy(), Some(pdf_data.len() as i64),
        Some("application/pdf"), "invoice", Some(&invoice_id),
    )
}
```

- [ ] **Schritt 3: Commands in `main.rs` registrieren**

In `src-tauri/src/main.rs`, füge am Ende der `invoke_handler!`-Liste (vor `commands::export::save_pdf`) hinzu:

```rust
            commands::workspace_ablage::cmd_get_ws_folders,
            commands::workspace_ablage::cmd_create_ws_folder,
            commands::workspace_ablage::cmd_delete_ws_folder,
            commands::workspace_ablage::cmd_get_ws_files,
            commands::workspace_ablage::cmd_import_ws_file,
            commands::workspace_ablage::cmd_delete_ws_file,
            commands::workspace_ablage::cmd_read_ws_file,
            commands::workspace_ablage::cmd_save_invoice_to_ablage,
```

- [ ] **Schritt 4: Compile-Check**

```powershell
cd src-tauri
cargo build 2>&1 | Select-String -Pattern "error\[" | head -20
```

Erwartet: keine Fehler.

- [ ] **Schritt 5: Commit**

```powershell
cd ..
git add src-tauri/src/commands/workspace_ablage.rs src-tauri/src/commands/mod.rs src-tauri/src/main.rs
git commit -m "feat(commands): workspace_ablage commands — CRUD + save_invoice_to_ablage"
```

---

## Task 4: Frontend-Typen + Service

**Files:**
- Create: `src/types/workspace-ablage.types.ts`
- Create: `src/services/workspace-ablage.service.ts`

- [ ] **Schritt 1: Typen anlegen**

Erstelle `src/types/workspace-ablage.types.ts`:

```typescript
export interface WorkspaceFolder {
  id: string
  workspaceId: string
  name: string
  parentId: string | null
  createdAt: string
}

export interface WorkspaceFile {
  id: string
  workspaceId: string
  folderId: string | null
  name: string
  path: string
  size: number | null
  mimeType: string | null
  sourceType: 'manual' | 'invoice' | 'offer'
  sourceId: string | null
  createdAt: string
}

export interface SaveInvoiceToAblageParams {
  workspaceId: string
  invoiceId: string
  invoiceNumber: string
  accountName: string
  invoiceDate: string  // ISO "2026-05-27"
  pdfData: number[]   // Array.from(Uint8Array)
}
```

- [ ] **Schritt 2: Service anlegen**

Erstelle `src/services/workspace-ablage.service.ts`:

```typescript
import { invoke } from '@tauri-apps/api/core'
import type {
  WorkspaceFolder, WorkspaceFile, SaveInvoiceToAblageParams,
} from '@/types/workspace-ablage.types'

export const WorkspaceAblageService = {
  getFolders(workspaceId: string): Promise<WorkspaceFolder[]> {
    return invoke<WorkspaceFolder[]>('cmd_get_ws_folders', { workspaceId })
  },
  createFolder(workspaceId: string, name: string, parentId?: string | null): Promise<WorkspaceFolder> {
    return invoke<WorkspaceFolder>('cmd_create_ws_folder', { workspaceId, name, parentId: parentId ?? null })
  },
  deleteFolder(id: string): Promise<void> {
    return invoke<void>('cmd_delete_ws_folder', { id })
  },
  getFiles(workspaceId: string, folderId?: string | null): Promise<WorkspaceFile[]> {
    return invoke<WorkspaceFile[]>('cmd_get_ws_files', { workspaceId, folderId: folderId ?? null })
  },
  importFile(params: {
    workspaceId: string
    folderId?: string | null
    name: string
    data: number[]
    mimeType?: string | null
  }): Promise<WorkspaceFile> {
    return invoke<WorkspaceFile>('cmd_import_ws_file', {
      workspaceId: params.workspaceId,
      folderId: params.folderId ?? null,
      name: params.name,
      data: params.data,
      mimeType: params.mimeType ?? null,
    })
  },
  deleteFile(id: string): Promise<void> {
    return invoke<void>('cmd_delete_ws_file', { id })
  },
  readFile(id: string): Promise<number[]> {
    return invoke<number[]>('cmd_read_ws_file', { id })
  },
  saveInvoiceToAblage(params: SaveInvoiceToAblageParams): Promise<WorkspaceFile> {
    return invoke<WorkspaceFile>('cmd_save_invoice_to_ablage', {
      workspaceId: params.workspaceId,
      invoiceId: params.invoiceId,
      invoiceNumber: params.invoiceNumber,
      accountName: params.accountName,
      invoiceDate: params.invoiceDate,
      pdfData: params.pdfData,
    })
  },
}
```

- [ ] **Schritt 3: TypeScript-Check**

```powershell
npx tsc --noEmit 2>&1 | Select-String -Pattern "workspace-ablage" | head -10
```

Erwartet: keine Fehler in den neuen Dateien.

- [ ] **Schritt 4: Commit**

```powershell
git add src/types/workspace-ablage.types.ts src/services/workspace-ablage.service.ts
git commit -m "feat(frontend): workspace-ablage types + service"
```

---

## Task 5: Zustand-Store

**Files:**
- Create: `src/store/workspace-ablage.store.ts`

- [ ] **Schritt 1: Store anlegen**

Erstelle `src/store/workspace-ablage.store.ts`:

```typescript
import { create } from 'zustand'
import { WorkspaceAblageService } from '@/services/workspace-ablage.service'
import { log } from '@/lib/logger'
import type { WorkspaceFolder, WorkspaceFile } from '@/types/workspace-ablage.types'
import type { AppError } from '@/types/error.types'
import { isAppError, formatError } from '@/types/error.types'

interface WorkspaceAblageState {
  folders: WorkspaceFolder[]
  files: WorkspaceFile[]
  activeFolderId: string | null
  isLoading: boolean
  error: AppError | null

  load: (workspaceId: string) => Promise<void>
  selectFolder: (workspaceId: string, folderId: string | null) => Promise<void>
  createFolder: (workspaceId: string, name: string, parentId?: string | null) => Promise<void>
  removeFolder: (id: string) => Promise<void>
  importFile: (params: {
    workspaceId: string
    folderId?: string | null
    name: string
    data: number[]
    mimeType?: string | null
  }) => Promise<void>
  removeFile: (id: string) => Promise<void>
  readFile: (id: string) => Promise<Uint8Array>
}

export const useWorkspaceAblageStore = create<WorkspaceAblageState>()((set, get) => ({
  folders: [],
  files: [],
  activeFolderId: null,
  isLoading: false,
  error: null,

  load: async (workspaceId) => {
    set({ isLoading: true, error: null })
    try {
      const [folders, files] = await Promise.all([
        WorkspaceAblageService.getFolders(workspaceId),
        WorkspaceAblageService.getFiles(workspaceId, null),
      ])
      set({ folders, files, activeFolderId: null, isLoading: false })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
      log.error('Failed to load workspace ablage', { error })
    }
  },

  selectFolder: async (workspaceId, folderId) => {
    set({ activeFolderId: folderId, isLoading: true, error: null })
    try {
      const files = await WorkspaceAblageService.getFiles(workspaceId, folderId)
      set({ files, isLoading: false })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
    }
  },

  createFolder: async (workspaceId, name, parentId) => {
    try {
      const folder = await WorkspaceAblageService.createFolder(workspaceId, name, parentId)
      set(s => ({ folders: [...s.folders, folder] }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  removeFolder: async (id) => {
    try {
      await WorkspaceAblageService.deleteFolder(id)
      set(s => ({
        folders: s.folders.filter(f => f.id !== id && f.parentId !== id),
        files: s.files.filter(f => f.folderId !== id),
        activeFolderId: s.activeFolderId === id ? null : s.activeFolderId,
      }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  importFile: async (params) => {
    try {
      const file = await WorkspaceAblageService.importFile(params)
      if (file.folderId === get().activeFolderId || get().activeFolderId === null) {
        set(s => ({ files: [file, ...s.files] }))
      }
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  removeFile: async (id) => {
    try {
      await WorkspaceAblageService.deleteFile(id)
      set(s => ({ files: s.files.filter(f => f.id !== id) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  readFile: async (id) => {
    const arr = await WorkspaceAblageService.readFile(id)
    return new Uint8Array(arr)
  },
}))
```

- [ ] **Schritt 2: TypeScript-Check**

```powershell
npx tsc --noEmit 2>&1 | Select-String -Pattern "workspace-ablage.store" | head -10
```

Erwartet: keine Fehler.

- [ ] **Schritt 3: Commit**

```powershell
git add src/store/workspace-ablage.store.ts
git commit -m "feat(store): useWorkspaceAblageStore — folders, files, CRUD actions"
```

---

## Task 6: Navigation — AppView + Sidebar + App Router

**Files:**
- Modify: `src/store/ui.store.ts`
- Modify: `src/components/layout/NavSidebar.tsx`
- Modify: `src/App.tsx`

- [ ] **Schritt 1: `AppView` in `ui.store.ts` ergänzen**

In `src/store/ui.store.ts`, ändere Zeile 7 (AppView-Typ):

```typescript
export type AppView =
  | 'dashboard' | 'profile'   | 'workstation'
  | 'clients'   | 'pipeline'  | 'invoices'  | 'tasks'    | 'kpis' | 'insights'
  | 'calendar'  | 'mail'      | 'crm'       | 'settings' | 'followups'
  | 'smartlists'| 'chat'      | 'leads'     | 'ablage'
```

- [ ] **Schritt 2: Sidebar-Eintrag ergänzen**

In `src/components/layout/NavSidebar.tsx`:

Import-Zeile ergänzen — `FolderOpen` zu den Lucide-Imports hinzufügen:
```typescript
import {
  Monitor, Home, CheckSquare, Users, CreditCard,
  TrendingUp, ListFilter, Bell, Target,
  Calendar, Mail, MessageCircle, Settings,
  ChevronRight, FolderOpen,
} from 'lucide-react'
```

Im JSX, direkt nach dem `{isAdmin && <SidebarNavItem icon={CreditCard} ...` Eintrag einfügen:
```tsx
<SidebarNavItem icon={FolderOpen} label="Ablage"  active={appView === 'ablage'}  onClick={() => setAppView('ablage')}  kbd="B" />
```

- [ ] **Schritt 3: Route in `App.tsx` ergänzen**

In `src/App.tsx`:

Import am Ende der Route-Imports hinzufügen:
```typescript
import { AblageRoute }          from '@/routes/AblageRoute'
```

Im `renderMain`-Switch (nach `case 'leads':`) hinzufügen:
```typescript
      case 'ablage':     return <AblageRoute />
```

- [ ] **Schritt 4: TypeScript-Check**

```powershell
npx tsc --noEmit 2>&1 | Select-String "error TS" | head -10
```

Erwartet: keine Fehler (außer ggf. "Cannot find module AblageRoute" — das wird in Task 7 behoben).

- [ ] **Schritt 5: Commit**

```powershell
git add src/store/ui.store.ts src/components/layout/NavSidebar.tsx src/App.tsx
git commit -m "feat(nav): 'ablage' AppView + Sidebar-Eintrag (FolderOpen)"
```

---

## Task 7: AblageRoute

**Files:**
- Create: `src/routes/AblageRoute.tsx`

- [ ] **Schritt 1: Route anlegen**

Erstelle `src/routes/AblageRoute.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { FolderOpen, FolderPlus, Upload, Trash2 } from 'lucide-react'
import { useWorkspaceAblageStore } from '@/store/workspace-ablage.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { FilePreviewModal } from '@/components/ablage/FilePreviewModal'
import type { WorkspaceFile, WorkspaceFolder } from '@/types/workspace-ablage.types'

const MAX_BYTES = 50 * 1024 * 1024

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

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

// ── Folder Tree ───────────────────────────────────────────────────────────────

function FolderNode({
  folder,
  folders,
  activeFolderId,
  depth,
  onSelect,
  onDelete,
}: {
  folder: WorkspaceFolder
  folders: WorkspaceFolder[]
  activeFolderId: string | null
  depth: number
  onSelect: (id: string | null) => void
  onDelete: (id: string) => void
}) {
  const children = folders.filter(f => f.parentId === folder.id)
  const isActive = activeFolderId === folder.id

  return (
    <div>
      <div
        className="flex items-center gap-1 group"
        style={{ paddingLeft: depth * 12 }}
      >
        <button
          onClick={() => onSelect(folder.id)}
          className="flex-1 flex items-center gap-1.5 text-left text-sm px-2 py-1.5 rounded-lg transition-colors truncate"
          style={{
            background: isActive ? 'var(--accent)' : 'none',
            color: isActive ? 'var(--accent-ink)' : 'var(--fg-muted)',
          }}
        >
          <FolderOpen size={13} style={{ flexShrink: 0 }} />
          <span className="truncate">{folder.name}</span>
        </button>
        <button
          onClick={() => onDelete(folder.id)}
          className="opacity-0 group-hover:opacity-100 p-1 rounded text-[var(--fg-muted)] hover:text-red-400 transition-opacity"
          title="Ordner löschen"
        >
          <Trash2 size={11} />
        </button>
      </div>
      {children.map(child => (
        <FolderNode
          key={child.id}
          folder={child}
          folders={folders}
          activeFolderId={activeFolderId}
          depth={depth + 1}
          onSelect={onSelect}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}

// ── Main Route ────────────────────────────────────────────────────────────────

export function AblageRoute() {
  const workspaceId  = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const folders      = useWorkspaceAblageStore(s => s.folders)
  const files        = useWorkspaceAblageStore(s => s.files)
  const activeFolderId = useWorkspaceAblageStore(s => s.activeFolderId)
  const isLoading    = useWorkspaceAblageStore(s => s.isLoading)
  const error        = useWorkspaceAblageStore(s => s.error)
  const load         = useWorkspaceAblageStore(s => s.load)
  const selectFolder = useWorkspaceAblageStore(s => s.selectFolder)
  const createFolder = useWorkspaceAblageStore(s => s.createFolder)
  const removeFolder = useWorkspaceAblageStore(s => s.removeFolder)
  const importFile   = useWorkspaceAblageStore(s => s.importFile)
  const removeFile   = useWorkspaceAblageStore(s => s.removeFile)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const [previewFile, setPreviewFile]     = useState<WorkspaceFile | null>(null)
  const [deletingId, setDeletingId]       = useState<string | null>(null)

  useEffect(() => {
    if (workspaceId) load(workspaceId)
  }, [workspaceId, load])

  const activeFolder = folders.find(f => f.id === activeFolderId) ?? null
  const rootFolders  = folders.filter(f => f.parentId === null)

  const handleSelectFolder = (id: string | null) => {
    selectFolder(workspaceId, id)
  }

  const handleCreateFolder = async () => {
    const name = newFolderName.trim()
    if (!name || !workspaceId) return
    await createFolder(workspaceId, name, activeFolderId)
    setNewFolderName('')
  }

  const handleDeleteFolder = async (id: string) => {
    const folder = folders.find(f => f.id === id)
    if (!folder) return
    if (!confirm(`Ordner "${folder.name}" wirklich löschen? Alle Unterordner werden ebenfalls entfernt.`)) return
    await removeFolder(id)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !workspaceId) return
    if (file.size > MAX_BYTES) {
      alert('Datei zu groß (max. 50 MB)')
      return
    }
    const buffer = await file.arrayBuffer()
    const data   = Array.from(new Uint8Array(buffer))
    await importFile({ workspaceId, folderId: activeFolderId, name: file.name, data, mimeType: file.type || null })
    e.target.value = ''
  }

  const handleDeleteFile = async (id: string) => {
    setDeletingId(id)
    try { await removeFile(id) } finally { setDeletingId(null) }
  }

  const breadcrumb = (() => {
    if (!activeFolderId) return 'Alle Dateien'
    const parts: string[] = []
    let current: WorkspaceFolder | undefined = folders.find(f => f.id === activeFolderId)
    while (current) {
      parts.unshift(current.name)
      current = current.parentId ? folders.find(f => f.id === current!.parentId) : undefined
    }
    return parts.join(' › ')
  })()

  return (
    <div className="main-inner" style={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 className="greeting-title">Ablage<em>.</em></h1>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-muted)', marginTop: 8 }}>
            {folders.length} Ordner · {files.length} Dateien
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
          <button className="btn-ghost" onClick={() => fileInputRef.current?.click()}>
            <Upload size={13} /> Datei hochladen
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="card" style={{ display: 'flex', flex: 1, minHeight: 0, padding: 0, overflow: 'hidden' }}>
        {/* Sidebar — Ordner */}
        <div style={{
          width: 200, flexShrink: 0, borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', padding: '12px 8px', gap: 2, overflowY: 'auto',
        }}>
          <p style={{ fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-dim)', padding: '4px 8px 8px' }}>
            Ordner
          </p>

          {/* "Alle Dateien" */}
          <button
            onClick={() => handleSelectFolder(null)}
            className="flex items-center gap-1.5 text-left text-sm px-2 py-1.5 rounded-lg transition-colors w-full"
            style={{
              background: activeFolderId === null ? 'var(--accent)' : 'none',
              color: activeFolderId === null ? 'var(--accent-ink)' : 'var(--fg-muted)',
            }}
          >
            <FolderOpen size={13} />
            <span>Alle Dateien</span>
          </button>

          {/* Ordner-Baum */}
          {rootFolders.map(folder => (
            <FolderNode
              key={folder.id}
              folder={folder}
              folders={folders}
              activeFolderId={activeFolderId}
              depth={0}
              onSelect={handleSelectFolder}
              onDelete={handleDeleteFolder}
            />
          ))}

          {/* Neuer Ordner */}
          <div style={{ marginTop: 12, display: 'flex', gap: 4 }}>
            <input
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
              placeholder="Neuer Ordner…"
              style={{
                flex: 1, fontSize: 12, padding: '5px 8px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--surface-2)',
                color: 'var(--fg)', outline: 'none',
              }}
            />
            <button
              onClick={handleCreateFolder}
              title="Ordner anlegen"
              style={{
                padding: '5px 8px', borderRadius: 8,
                background: 'var(--accent)', color: 'var(--accent-ink)',
                border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
              }}
            >
              <FolderPlus size={13} />
            </button>
          </div>
        </div>

        {/* Datei-Grid */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Breadcrumb */}
          <div style={{
            padding: '10px 20px', borderBottom: '1px solid var(--border)',
            fontSize: 12, color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)',
          }}>
            {breadcrumb}
          </div>

          <div style={{ flex: 1, padding: 20, overflowY: 'auto' }}>
            {error && (
              <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error.message}</p>
            )}
            {isLoading && (
              <p style={{ color: 'var(--fg-dim)', fontSize: 13 }}>Lädt…</p>
            )}
            {!isLoading && files.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--fg-dim)', fontSize: 13 }}>
                <FolderOpen size={32} style={{ opacity: 0.3, margin: '0 auto 12px' }} />
                <p>Keine Dateien{activeFolderId ? ' in diesem Ordner' : ''}</p>
                <p style={{ fontSize: 11, marginTop: 4 }}>Dateien hochladen oder Rechnungen freigeben</p>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
              {files.map(file => (
                <div
                  key={file.id}
                  onClick={() => setPreviewFile(file)}
                  style={{
                    padding: 14, borderRadius: 12, border: '1px solid var(--border)',
                    background: 'var(--surface-2)', cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', gap: 8, position: 'relative',
                    transition: 'border-color 150ms',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                >
                  <span style={{ fontSize: 28 }}>{fileIcon(file.mimeType)}</span>
                  <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg)', lineHeight: 1.3, wordBreak: 'break-word' }}>
                    {file.name}
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {file.size !== null && (
                      <p style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{formatSize(file.size)}</p>
                    )}
                    <p style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{fmtDate(file.createdAt)}</p>
                  </div>

                  {/* Quelle-Badge für automatisch abgelegte Rechnungen */}
                  {file.sourceType === 'invoice' && (
                    <span style={{
                      position: 'absolute', top: 8, right: 8,
                      fontSize: 9, padding: '2px 6px', borderRadius: 99,
                      background: 'oklch(92% 0.2 125 / 0.15)',
                      color: 'var(--accent)', fontFamily: 'var(--font-mono)',
                      letterSpacing: '0.05em', textTransform: 'uppercase',
                    }}>
                      Rechnung
                    </span>
                  )}

                  {/* Löschen-Button */}
                  <button
                    onClick={e => { e.stopPropagation(); handleDeleteFile(file.id) }}
                    disabled={deletingId === file.id}
                    style={{
                      position: 'absolute', bottom: 8, right: 8,
                      opacity: 0, background: 'none', border: 'none',
                      cursor: 'pointer', padding: 4, borderRadius: 6,
                      color: 'var(--fg-muted)', transition: 'opacity 150ms, color 150ms',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--fg-muted)')}
                    className="file-delete-btn"
                    title="Datei löschen"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </div>
  )
}
```

Füge am Ende der `globals.css` (oder in einem passenden Stylesheet) hinzu, damit der Löschen-Button beim Card-Hover sichtbar wird:

```css
/* AblageRoute — Datei-Karte Hover-States */
div:hover > .file-delete-btn {
  opacity: 1 !important;
}
```

Die `globals.css` liegt unter `src/styles/globals.css`.

- [ ] **Schritt 2: TypeScript-Check**

```powershell
npx tsc --noEmit 2>&1 | Select-String "AblageRoute" | head -5
```

Erwartet: keine Fehler.

- [ ] **Schritt 3: Commit**

```powershell
git add src/routes/AblageRoute.tsx src/styles/globals.css
git commit -m "feat(route): AblageRoute — Ordnerbaum + Datei-Grid + Upload"
```

---

## Task 8: FilePreviewModal

**Files:**
- Create: `src/components/ablage/FilePreviewModal.tsx`

- [ ] **Schritt 1: Komponente anlegen**

Erstelle `src/components/ablage/FilePreviewModal.tsx`:

```tsx
import { useEffect, useState, useRef } from 'react'
import { X, Download, FileText } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { useWorkspaceAblageStore } from '@/store/workspace-ablage.store'
import type { WorkspaceFile } from '@/types/workspace-ablage.types'

interface Props {
  file: WorkspaceFile
  onClose: () => void
}

function formatSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function FilePreviewModal({ file, onClose }: Props) {
  const readFile = useWorkspaceAblageStore(s => s.readFile)

  const [blobUrl,  setBlobUrl]  = useState<string | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const blobUrlRef = useRef<string | null>(null)

  const canPreview = file.mimeType === 'application/pdf'
    || (file.mimeType?.startsWith('image/') ?? false)

  useEffect(() => {
    if (!canPreview) { setLoading(false); return }
    let cancelled = false
    ;(async () => {
      try {
        const bytes = await readFile(file.id)
        if (cancelled) return
        const blob = new Blob([bytes], { type: file.mimeType ?? 'application/octet-stream' })
        const url  = URL.createObjectURL(blob)
        blobUrlRef.current = url
        setBlobUrl(url)
      } catch (err) {
        if (!cancelled) setError(String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
    }
  }, [file.id])

  const handleDownload = async () => {
    try {
      const bytes = await readFile(file.id)
      await invoke('save_pdf', { bytes: Array.from(bytes), suggestedName: file.name })
    } catch (err) {
      alert(`Download fehlgeschlagen: ${String(err)}`)
    }
  }

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 700,
        background: 'oklch(0% 0 0 / 0.75)',
        backdropFilter: 'blur(16px)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: 32,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        width: '100%', maxWidth: 860, height: '85vh',
        background: 'var(--surface)', borderRadius: 16,
        border: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 32px 80px oklch(0% 0 0 / 0.5)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 20px', borderBottom: '1px solid var(--border)',
        }}>
          <FileText size={16} style={{ color: 'var(--fg-muted)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', truncate: true, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {file.name}
            </p>
            <p style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 2 }}>
              {file.mimeType ?? 'Unbekannter Typ'}{file.size ? ` · ${formatSize(file.size)}` : ''}
            </p>
          </div>
          <button
            onClick={handleDownload}
            className="btn-ghost"
            style={{ flexShrink: 0 }}
          >
            <Download size={13} /> Herunterladen
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--fg-muted)', padding: 6, borderRadius: 8,
              display: 'flex', alignItems: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {loading && (
            <p style={{ color: 'var(--fg-dim)', fontSize: 13 }}>Lädt Vorschau…</p>
          )}
          {error && (
            <div style={{ textAlign: 'center', color: 'var(--danger)', fontSize: 13 }}>
              <p>Vorschau nicht möglich</p>
              <p style={{ fontSize: 11, marginTop: 4, color: 'var(--fg-dim)' }}>{error}</p>
            </div>
          )}
          {!loading && !error && blobUrl && file.mimeType === 'application/pdf' && (
            <iframe
              src={blobUrl}
              style={{ width: '100%', height: '100%', border: 'none' }}
              title={file.name}
            />
          )}
          {!loading && !error && blobUrl && file.mimeType?.startsWith('image/') && (
            <img
              src={blobUrl}
              alt={file.name}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8 }}
            />
          )}
          {!loading && !error && !canPreview && (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <span style={{ fontSize: 48 }}>📎</span>
              <p style={{ color: 'var(--fg)', fontWeight: 600, marginTop: 12 }}>{file.name}</p>
              <p style={{ color: 'var(--fg-dim)', fontSize: 12, marginTop: 4 }}>
                Keine Vorschau verfügbar für diesen Dateityp
              </p>
              <button onClick={handleDownload} className="btn-primary" style={{ marginTop: 20 }}>
                <Download size={13} /> Herunterladen
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Schritt 2: TypeScript-Check**

```powershell
npx tsc --noEmit 2>&1 | Select-String "FilePreviewModal" | head -5
```

Erwartet: keine Fehler.

- [ ] **Schritt 3: Commit**

```powershell
git add src/components/ablage/FilePreviewModal.tsx
git commit -m "feat(component): FilePreviewModal — In-App PDF/Bild-Viewer mit Download"
```

---

## Task 9: Auto-Ablage bei Rechnungs-Freigabe

**Files:**
- Modify: `src/components/finance/InvoicePDF.tsx`
- Modify: `src/routes/FinanceRoute.tsx`

- [ ] **Schritt 1: `getInvoicePdfBytes` aus `InvoicePDF.tsx` exportieren**

In `src/components/finance/InvoicePDF.tsx`, ändere die Funktion `pdfToBytes` (Zeile 264):

```typescript
export async function getInvoicePdfBytes(
  data: InvoiceWithItems,
  profile: CompanyProfile,
  account: Account,
): Promise<Uint8Array> {
  const blob = await pdf(<InvoicePDFDoc data={data} profile={profile} account={account} />).toBlob()
  const buf = await blob.arrayBuffer()
  return new Uint8Array(buf)
}
```

Aktualisiere `downloadInvoicePDF` (Zeile 270) so, dass sie `getInvoicePdfBytes` intern aufruft:

```typescript
export async function downloadInvoicePDF(
  data: InvoiceWithItems,
  profile: CompanyProfile,
  account: Account,
) {
  const toast = useDownloadToastStore.getState()
  const fmtAmt = (n: number) =>
    new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' EUR'
  const safeClient = account.name.replace(/[/\\:*?"<>|]/g, '_').slice(0, 40)
  const filename = `RECHNUNG ${data.invoice.number ?? 'Entwurf'} - ${safeClient} - ${fmtAmt(data.invoice.total)}.pdf`
  try {
    toast.start(filename, false)
    const bytes = await getInvoicePdfBytes(data, profile, account)
    toast.setSaving()
    const savedTo = await invoke<string>('save_pdf', { bytes: Array.from(bytes), suggestedName: filename })
    toast.setDone(savedTo)
  } catch {
    toast.setError('Fehler beim Speichern')
  }
}
```

- [ ] **Schritt 2: Auto-Ablage in `FinanceRoute.tsx` einbauen**

In `src/routes/FinanceRoute.tsx`:

Imports oben ergänzen:
```typescript
import { getInvoicePdfBytes } from '@/components/finance/InvoicePDF'
import { WorkspaceAblageService } from '@/services/workspace-ablage.service'
```

Direkt nach den bestehenden `useState`-Deklarationen (ca. Zeile 356) eine neue Handler-Funktion hinzufügen:

```typescript
  const handleReleaseInvoice = async (inv: Invoice) => {
    await updateInvoiceStatus(inv.id, 'open')
    await loadAll(workspaceId)
    // Auto-Ablage: PDF generieren und in Workspace-Ablage speichern
    try {
      const full = await FinanceService.getInvoice(inv.id)
      const acc  = accounts.find(a => a.id === inv.accountId)
      if (acc && full.invoice.number && profile) {
        const bytes = await getInvoicePdfBytes(full, profile, acc)
        await WorkspaceAblageService.saveInvoiceToAblage({
          workspaceId,
          invoiceId:     inv.id,
          invoiceNumber: full.invoice.number,
          accountName:   acc.name,
          invoiceDate:   full.invoice.date,
          pdfData:       Array.from(bytes),
        })
      }
    } catch {
      // Silent fallback — Rechnung ist bereits freigegeben, Ablage-Fehler blockiert nicht
    }
  }
```

In der Draft-Invoices-Tabelle (ca. Zeile 624), ersetze den "Freigeben"-Button-onClick:

**Vorher:**
```typescript
onClick={() => updateInvoiceStatus(inv.id, 'open').then(() => loadAll(workspaceId))}
```

**Nachher:**
```typescript
onClick={() => handleReleaseInvoice(inv)}
```

- [ ] **Schritt 3: TypeScript-Check**

```powershell
npx tsc --noEmit 2>&1 | Select-String "error TS" | head -10
```

Erwartet: keine Fehler.

- [ ] **Schritt 4: Commit**

```powershell
git add src/components/finance/InvoicePDF.tsx src/routes/FinanceRoute.tsx
git commit -m "feat(finance): auto-save invoice PDF to workspace Ablage on Freigabe"
```

---

## Task 10: End-to-End-Smoke-Test

- [ ] **Schritt 1: App starten**

```powershell
npm run tauri dev
```

- [ ] **Schritt 2: Ablage-Route testen**
  - In der Sidebar auf "Ablage" klicken (Shortcut `B`)
  - Prüfen: Leerer Zustand mit "Keine Dateien"-Meldung erscheint

- [ ] **Schritt 3: Ordner anlegen**
  - Im Sidebar-Input "Test-Ordner" eingeben + Enter
  - Prüfen: Ordner erscheint im Baum, ist sofort ausgewählt

- [ ] **Schritt 4: Datei hochladen**
  - "+ Datei hochladen" klicken, eine kleine PDF wählen
  - Prüfen: Datei erscheint in der Grid

- [ ] **Schritt 5: PDF-Vorschau testen**
  - Auf die Datei-Karte klicken
  - Prüfen: Modal öffnet, PDF wird im iframe angezeigt
  - "Herunterladen" klicken → Datei landet im Downloads-Ordner

- [ ] **Schritt 6: Auto-Ablage testen**
  - Zu "Finanzen" navigieren
  - Eine Rechnung im Status "Entwurf" auf "Offen" setzen (Freigeben-Button)
  - Zurück zur Ablage navigieren
  - Prüfen: Ordner `Rechnungen / {Jahr} / {Monat}` ist automatisch entstanden
  - Prüfen: PDF der Rechnung liegt darin

- [ ] **Schritt 7: Ordner löschen**
  - Einen Ordner per Hover-Button löschen
  - Prüfen: Ordner + Inhalte verschwinden aus der Anzeige

- [ ] **Schritt 8: Final-Commit**

```powershell
git add -A
git commit -m "chore: workspace ablage implementation complete"
```

---

## Self-Review gegen Spec

| Spec-Anforderung | Task |
|-----------------|------|
| Neue Tabellen workspace_folders + workspace_files (Migration v14) | Task 1 |
| workspace_id Scoping | Task 1–3 |
| ensure_invoice_folder_path (Rechnungen/Jahr/Monat) | Task 2, Schritt 2 |
| Rust Commands CRUD + save_invoice_to_ablage + read_ws_file | Task 3 |
| TS-Typen + Service | Task 4 |
| Zustand-Store | Task 5 |
| AppView 'ablage' + Sidebar-Eintrag | Task 6 |
| AblageRoute mit Ordnerbaum + Datei-Grid | Task 7 |
| FilePreviewModal (PDF/Bild in-app, Download) | Task 8 |
| Auto-Ablage bei Freigabe (Freigeben-Button → handleReleaseInvoice) | Task 9 |
| Silent fallback bei Ablage-Fehler | Task 9 |
| Escape-Taste schließt Modal | Task 8 |
| Blob-URL-Cleanup (revokeObjectURL) | Task 8 |
| Quelle-Badge für automatisch abgelegte Rechnungen | Task 7 |
