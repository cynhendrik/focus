use std::io::Write;
use tauri::State;
use crate::db::pool::DbPool;

#[derive(serde::Deserialize)]
pub struct ExportFile {
    pub name: String,
    pub bytes: Vec<u8>,
}

pub(crate) fn downloads_dir() -> std::path::PathBuf {
    dirs::download_dir()
        .unwrap_or_else(|| dirs::home_dir().unwrap_or_else(std::env::temp_dir))
}

pub(crate) fn unique_path(dir: &std::path::Path, name: &str) -> std::path::PathBuf {
    let path = dir.join(name);
    if !path.exists() { return path; }
    let stem = std::path::Path::new(name).file_stem().and_then(|s| s.to_str()).unwrap_or("file");
    let ext  = std::path::Path::new(name).extension().and_then(|s| s.to_str()).unwrap_or("");
    for i in 1..=999 {
        let candidate = if ext.is_empty() {
            dir.join(format!("{stem} ({i})"))
        } else {
            dir.join(format!("{stem} ({i}).{ext}"))
        };
        if !candidate.exists() { return candidate; }
    }
    path
}

#[tauri::command]
pub async fn save_pdf(bytes: Vec<u8>, suggested_name: String) -> Result<String, String> {
    let dir  = downloads_dir();
    let path = unique_path(&dir, &suggested_name);
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn save_zip(files: Vec<ExportFile>, suggested_name: String) -> Result<String, String> {
    if files.is_empty() {
        return Err("Keine Dateien zum Exportieren".into());
    }

    let buf    = Vec::new();
    let cursor = std::io::Cursor::new(buf);
    let mut zip = zip::ZipWriter::new(cursor);
    let options = zip::write::FileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    for file in &files {
        zip.start_file(file.name.as_str(), options).map_err(|e| e.to_string())?;
        zip.write_all(&file.bytes).map_err(|e| e.to_string())?;
    }

    let cursor   = zip.finish().map_err(|e| e.to_string())?;
    let zip_bytes = cursor.into_inner();

    let dir  = downloads_dir();
    let path = unique_path(&dir, &suggested_name);
    std::fs::write(&path, &zip_bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

// ─────────────────────────────────────────────────────────────────────────────
// Full data backup — versioned, schema-introspecting export/import.
//
// The export walks `sqlite_master` and dumps EVERY user table to JSON, so it
// stays complete even as the schema grows (no hardcoded table list). This file
// is the portable format that serves two purposes:
//   1. Restore into the local DB today (cmd_import_backup).
//   2. The input the future cloud/SaaS importer maps into Postgres (assigning
//      workspace_id / user_id per account). Keep the `format`/`version` fields
//      stable so that importer can rely on them.
// ─────────────────────────────────────────────────────────────────────────────

const BACKUP_FORMAT: &str = "cultera-backup";
/// Backup marker used before the Cynera→Cultera rebrand. Still accepted on
/// import so existing backups keep working.
const LEGACY_BACKUP_FORMAT: &str = "cynera-backup";
const BACKUP_VERSION: u32 = 1;

fn dump_table(conn: &rusqlite::Connection, table: &str) -> Result<Vec<serde_json::Value>, String> {
    let mut stmt = conn
        .prepare(&format!("SELECT * FROM \"{table}\""))
        .map_err(|e| e.to_string())?;
    let cols: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let mut obj = serde_json::Map::new();
        for (i, name) in cols.iter().enumerate() {
            let v = match row.get_ref(i).map_err(|e| e.to_string())? {
                rusqlite::types::ValueRef::Null      => serde_json::Value::Null,
                rusqlite::types::ValueRef::Integer(n) => serde_json::Value::from(n),
                rusqlite::types::ValueRef::Real(f)    => serde_json::Value::from(f),
                rusqlite::types::ValueRef::Text(t)    => serde_json::Value::from(String::from_utf8_lossy(t).into_owned()),
                rusqlite::types::ValueRef::Blob(b)    => serde_json::Value::from(b.to_vec()),
            };
            obj.insert(name.clone(), v);
        }
        out.push(serde_json::Value::Object(obj));
    }
    Ok(out)
}

/// Builds the versioned backup JSON for every user table. Shared by the manual
/// export command and the automatic on-close backup.
pub fn build_backup_json(conn: &rusqlite::Connection) -> Result<Vec<u8>, String> {
    // All user tables (skip SQLite internals + the device-local sync queue).
    let tables: Vec<String> = {
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' \
                      AND name NOT LIKE 'sqlite_%' AND name != 'sync_queue' ORDER BY name")
            .map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?;
        rows.filter_map(Result::ok).collect()
    };

    let mut tables_obj = serde_json::Map::new();
    let mut total: u64 = 0;
    for t in &tables {
        let rows = dump_table(conn, t)?;
        total += rows.len() as u64;
        tables_obj.insert(t.clone(), serde_json::Value::Array(rows));
    }

    let manifest = serde_json::json!({
        "format":      BACKUP_FORMAT,
        "version":     BACKUP_VERSION,
        "app_version": env!("CARGO_PKG_VERSION"),
        "exported_at": chrono::Utc::now().to_rfc3339(),
        "row_count":   total,
        "tables":      tables_obj,
    });
    serde_json::to_vec_pretty(&manifest).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cmd_export_backup(db: State<'_, DbPool>, suggested_name: Option<String>) -> Result<String, String> {
    let bytes = build_backup_json(&db.conn())?;
    let name = suggested_name.unwrap_or_else(||
        format!("cultera-backup-{}.json", chrono::Local::now().format("%Y-%m-%d")));
    let dir  = downloads_dir();
    let path = unique_path(&dir, &name);
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

/// Best-effort silent backup into `app_data_dir/backups/`, keeping the last few.
/// Called on app close so a fresh local backup always exists without the user
/// having to remember to export. Never panics — failures are ignored.
pub fn auto_export(app: &tauri::AppHandle) {
    use tauri::Manager;
    let pool = app.state::<DbPool>();
    let bytes = match build_backup_json(&pool.conn()) { Ok(b) => b, Err(_) => return };
    let dir = match app.path().app_data_dir() { Ok(d) => d.join("backups"), Err(_) => return };
    if std::fs::create_dir_all(&dir).is_err() { return; }
    let name = format!("autobackup-{}.json", chrono::Local::now().format("%Y%m%d-%H%M%S"));
    let _ = std::fs::write(dir.join(&name), &bytes);
    rotate_backups(&dir, 5);
}

/// Keep only the newest `keep` autobackup files.
fn rotate_backups(dir: &std::path::Path, keep: usize) {
    let mut files: Vec<std::path::PathBuf> = match std::fs::read_dir(dir) {
        Ok(rd) => rd.flatten().map(|e| e.path()).filter(|p| {
            p.file_name().and_then(|n| n.to_str())
                .map(|n| n.starts_with("autobackup-")).unwrap_or(false)
        }).collect(),
        Err(_) => return,
    };
    files.sort(); // timestamped names sort chronologically
    if files.len() > keep {
        for old in &files[..files.len() - keep] {
            let _ = std::fs::remove_file(old);
        }
    }
}

#[derive(serde::Serialize, Debug)]
pub struct ImportSummary {
    pub tables: usize,
    pub rows: u64,
    pub skipped_unknown_columns: u64,
}

fn json_to_sql(v: &serde_json::Value) -> rusqlite::types::Value {
    use rusqlite::types::Value;
    match v {
        serde_json::Value::Null      => Value::Null,
        serde_json::Value::Bool(b)   => Value::Integer(*b as i64),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() { Value::Integer(i) }
            else { Value::Real(n.as_f64().unwrap_or(0.0)) }
        }
        serde_json::Value::String(s) => Value::Text(s.clone()),
        // arrays/objects are stored as JSON text in this schema (tags, payload, …)
        other => Value::Text(other.to_string()),
    }
}

/// Core import logic — testable without Tauri state.
pub fn import_into(conn: &mut rusqlite::Connection, json: &str, active_ws: Option<&str>, user_id: Option<&str>) -> Result<ImportSummary, String> {
    let manifest: serde_json::Value = serde_json::from_str(json)
        .map_err(|e| format!("Ungültige Backup-Datei: {e}"))?;
    let fmt = manifest.get("format").and_then(|v| v.as_str());
    if fmt != Some(BACKUP_FORMAT) && fmt != Some(LEGACY_BACKUP_FORMAT) {
        return Err("Das ist keine Cultera-Backup-Datei.".into());
    }
    let tables = manifest.get("tables").and_then(|v| v.as_object())
        .ok_or("Backup enthält keine Tabellen.")?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    // Tables are restored in alphabetical order, so a child can be inserted before
    // its parent (e.g. invoice_items before invoices). With foreign_keys=ON (the
    // production pool, pool.rs), that aborts the whole import. Defer FK enforcement
    // to commit time — the final state is consistent. Same pattern as reset_workspace_local.
    tx.execute_batch("PRAGMA defer_foreign_keys=ON;").map_err(|e| e.to_string())?;
    let mut summary = ImportSummary { tables: 0, rows: 0, skipped_unknown_columns: 0 };

    for (table, rows_val) in tables {
        let rows = match rows_val.as_array() { Some(r) => r, None => continue };

        // Current columns of this table; skip tables/columns that no longer exist
        // so an old backup imports cleanly into a newer schema.
        let existing: std::collections::HashSet<String> = {
            let mut stmt = match tx.prepare(&format!("PRAGMA table_info(\"{table}\")")) {
                Ok(s) => s,
                Err(_) => continue, // table gone → skip
            };
            let cols = stmt.query_map([], |r| r.get::<_, String>(1)).map_err(|e| e.to_string())?;
            cols.filter_map(Result::ok).collect()
        };
        if existing.is_empty() { continue; }
        summary.tables += 1;

        for row in rows {
            let obj = match row.as_object() { Some(o) => o, None => continue };
            let mut cols: Vec<String> = Vec::new();
            let mut vals: Vec<rusqlite::types::Value> = Vec::new();
            for (k, v) in obj {
                if !existing.contains(k) { summary.skipped_unknown_columns += 1; continue; }
                cols.push(format!("\"{k}\""));
                if k == "workspace_id" { if let Some(ws) = active_ws { vals.push(rusqlite::types::Value::Text(ws.to_string())); continue; } }
                if k == "created_by"   { if let Some(u)  = user_id   { vals.push(rusqlite::types::Value::Text(u.to_string()));  continue; } }
                vals.push(json_to_sql(v));
            }
            if cols.is_empty() { continue; }
            let placeholders = vec!["?"; cols.len()].join(", ");
            let sql = format!(
                "INSERT OR REPLACE INTO \"{table}\" ({}) VALUES ({})",
                cols.join(", "), placeholders,
            );
            tx.execute(&sql, rusqlite::params_from_iter(vals.iter()))
                .map_err(|e| format!("{table}: {e}"))?;
            summary.rows += 1;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(summary)
}

#[tauri::command]
pub fn cmd_import_backup(db: State<'_, DbPool>, json: String, active_workspace_id: Option<String>, user_id: Option<String>) -> Result<ImportSummary, String> {
    let mut conn = db.conn();
    import_into(&mut conn, &json, active_workspace_id.as_deref(), user_id.as_deref())
}

/// Leert alle User-Inhalts-Tabellen in einer Transaktion, behält aber das Setup
/// (Firmenprofil + Rechnungs-Nummernkreis). Schema-introspektiv wie der Backup-Export,
/// damit neue Tabellen automatisch mit-geleert werden.
pub fn reset_workspace_local(conn: &mut rusqlite::Connection) -> Result<(), String> {
    // Setup/Konfiguration + Workspace-Identität, die NICHT geleert wird. (workspaces/
    // workspace_members existieren lokal aktuell nicht — defensiv für Konsistenz mit
    // dem Cloud-Reset, falls sie lokal je dazukommen.)
    const KEEP: &[&str] = &[
        "company_settings", "invoice_sequences", "offer_sequences",
        "time_planning", "app_state", "workspaces", "workspace_members",
    ];

    let tables: Vec<String> = {
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' \
                      AND name NOT LIKE 'sqlite_%' AND name != 'sync_queue' ORDER BY name")
            .map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?;
        rows.filter_map(Result::ok).collect()
    };

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute_batch("PRAGMA defer_foreign_keys=ON;").map_err(|e| e.to_string())?;
    for t in &tables {
        if KEEP.contains(&t.as_str()) { continue; }
        tx.execute(&format!("DELETE FROM \"{t}\""), [])
            .map_err(|e| format!("{t}: {e}"))?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

/// True, wenn irgendeine workspace-scoped Tabelle Zeilen mit dieser workspace_id hat.
pub fn has_workspace_data(conn: &rusqlite::Connection, ws_id: &str) -> Result<bool, String> {
    let tables: Vec<String> = {
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' \
                      AND name NOT LIKE 'sqlite_%' AND name != 'sync_queue' ORDER BY name")
            .map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?;
        rows.filter_map(Result::ok).collect()
    };
    for t in &tables {
        let has_ws = {
            let mut stmt = match conn.prepare(&format!("PRAGMA table_info(\"{t}\")")) {
                Ok(s) => s, Err(_) => continue,
            };
            let c = stmt.query_map([], |r| r.get::<_, String>(1)).map_err(|e| e.to_string())?;
            let found = c.filter_map(Result::ok).any(|name| name == "workspace_id");
            found
        };
        if !has_ws { continue; }
        let n: i64 = conn
            .query_row(&format!("SELECT count(*) FROM \"{t}\" WHERE workspace_id=?1"), [ws_id], |r| r.get(0))
            .map_err(|e| format!("{t}: {e}"))?;
        if n > 0 { return Ok(true); }
    }
    Ok(false)
}

#[tauri::command]
pub fn cmd_has_local_orphan_data(db: State<'_, DbPool>) -> Result<bool, String> {
    let conn = db.conn();
    has_workspace_data(&conn, "dev")
}

#[tauri::command]
pub fn cmd_reset_workspace(db: State<'_, DbPool>) -> Result<(), String> {
    let mut conn = db.conn();
    reset_workspace_local(&mut conn)
}

/// Schreibt workspace_id (und created_by, falls Spalte existiert) aller
/// workspace-scoped Tabellen von `from` auf `to`/`user_id` um. Schema-introspektiv,
/// FK-deferred. Gibt die Zahl der geänderten Zeilen zurück.
pub fn rescope_workspace(conn: &mut rusqlite::Connection, from: &str, to: &str, user_id: &str) -> Result<u64, String> {
    let tables: Vec<String> = {
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' \
                      AND name NOT LIKE 'sqlite_%' AND name != 'sync_queue' ORDER BY name")
            .map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?;
        rows.filter_map(Result::ok).collect()
    };
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute_batch("PRAGMA defer_foreign_keys=ON;").map_err(|e| e.to_string())?;
    let mut total: u64 = 0;
    for t in &tables {
        let cols: std::collections::HashSet<String> = {
            let mut stmt = match tx.prepare(&format!("PRAGMA table_info(\"{t}\")")) {
                Ok(s) => s, Err(_) => continue,
            };
            let c = stmt.query_map([], |r| r.get::<_, String>(1)).map_err(|e| e.to_string())?;
            c.filter_map(Result::ok).collect()
        };
        if !cols.contains("workspace_id") { continue; }
        let has_created_by = cols.contains("created_by");
        let sql = if has_created_by {
            format!("UPDATE \"{t}\" SET workspace_id=?1, created_by=?2 WHERE workspace_id=?3")
        } else {
            format!("UPDATE \"{t}\" SET workspace_id=?1 WHERE workspace_id=?2")
        };
        let changed = if has_created_by {
            tx.execute(&sql, rusqlite::params![to, user_id, from]).map_err(|e| format!("{t}: {e}"))?
        } else {
            tx.execute(&sql, rusqlite::params![to, from]).map_err(|e| format!("{t}: {e}"))?
        };
        total += changed as u64;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(total)
}

#[tauri::command]
pub fn cmd_rescope_workspace(db: State<'_, DbPool>, from: String, to: String, user_id: String) -> Result<u64, String> {
    let mut conn = db.conn();
    rescope_workspace(&mut conn, &from, &to, &user_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_conn() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        crate::db::schema::create_tables(&conn).unwrap();
        conn
    }

    #[test]
    fn export_import_roundtrip_restores_all_rows() {
        // 1. DB mit Beispieldaten in mehreren Tabellen (workspace- und customer-scoped).
        let conn = sample_conn();
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, created_at, updated_at) \
             VALUES ('a1','ws1','u1','Muster GmbH','2026-01-01','2026-01-01')", []).unwrap();
        conn.execute(
            "INSERT INTO customers (id, name, tags, created_at, updated_at) \
             VALUES ('c1','Kunde Eins','[\"vip\"]','2026-01-01','2026-01-01')", []).unwrap();
        conn.execute(
            "INSERT INTO invoices (id, workspace_id, created_by, account_id, date, due_date, total, created_at, updated_at) \
             VALUES ('i1','ws1','u1','a1','2026-01-01','2026-01-15', 119.0,'2026-01-01','2026-01-01')", []).unwrap();

        // 2. Export → JSON
        let json = build_backup_json(&conn).unwrap();
        let json_str = String::from_utf8(json).unwrap();
        assert!(json_str.contains("cultera-backup"));
        assert!(json_str.contains("Muster GmbH"));

        // 3. Daten löschen (simuliert Datenverlust / neue DB)
        let mut conn2 = sample_conn();
        let before: i64 = conn2.query_row("SELECT count(*) FROM accounts", [], |r| r.get(0)).unwrap();
        assert_eq!(before, 0);

        // 4. Import in die leere DB
        let summary = import_into(&mut conn2, &json_str, None, None).unwrap();
        assert!(summary.rows >= 3, "mindestens die 3 eingefügten Zeilen");

        // 5. Alles wieder da?
        let acc: String = conn2.query_row("SELECT name FROM accounts WHERE id='a1'", [], |r| r.get(0)).unwrap();
        assert_eq!(acc, "Muster GmbH");
        let cust: String = conn2.query_row("SELECT name FROM customers WHERE id='c1'", [], |r| r.get(0)).unwrap();
        assert_eq!(cust, "Kunde Eins");
        let total: f64 = conn2.query_row("SELECT total FROM invoices WHERE id='i1'", [], |r| r.get(0)).unwrap();
        assert_eq!(total, 119.0);
    }

    #[test]
    fn import_restores_child_rows_with_foreign_keys_enforced() {
        // Regression: a backup containing a child table (invoice_items → invoices)
        // must import even though "invoice_items" sorts BEFORE "invoices"
        // alphabetically. Production runs with foreign_keys=ON (pool.rs), so
        // inserting the child before the parent fails unless FK checks are deferred
        // to commit. Virtually every real backup has invoice line items.
        let conn = sample_conn();
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, created_at, updated_at) \
             VALUES ('a1','ws1','u1','Muster GmbH','2026-01-01','2026-01-01')", []).unwrap();
        conn.execute(
            "INSERT INTO invoices (id, workspace_id, created_by, account_id, date, due_date, total, created_at, updated_at) \
             VALUES ('i1','ws1','u1','a1','2026-01-01','2026-01-15',119.0,'2026-01-01','2026-01-01')", []).unwrap();
        conn.execute(
            "INSERT INTO invoice_items (id, invoice_id, title, quantity, unit_price, tax_rate, total, sort_order) \
             VALUES ('it1','i1','Leistung',1,100.0,19,119.0,0)", []).unwrap();

        let json = String::from_utf8(build_backup_json(&conn).unwrap()).unwrap();

        // Fresh DB with FK enforcement ON (matches the production pool).
        let mut conn2 = sample_conn();
        let summary = import_into(&mut conn2, &json, None, None)
            .expect("import must succeed with child tables and foreign_keys=ON");
        assert!(summary.rows >= 3, "accounts + invoices + invoice_items");

        let item_invoice: String = conn2
            .query_row("SELECT invoice_id FROM invoice_items WHERE id='it1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(item_invoice, "i1");
    }

    #[test]
    fn import_rejects_foreign_file() {
        let mut conn = sample_conn();
        let err = import_into(&mut conn, "{\"format\":\"something-else\",\"tables\":{}}", None, None).unwrap_err();
        assert!(err.contains("keine Cultera-Backup-Datei"));
    }

    #[test]
    fn import_is_idempotent_on_replace() {
        let conn = sample_conn();
        conn.execute(
            "INSERT INTO customers (id, name, tags, created_at, updated_at) \
             VALUES ('c1','V1','[]','2026-01-01','2026-01-01')", []).unwrap();
        let json = String::from_utf8(build_backup_json(&conn).unwrap()).unwrap();

        // Zielzeile existiert bereits mit anderem Wert → INSERT OR REPLACE überschreibt.
        let mut conn2 = sample_conn();
        conn2.execute(
            "INSERT INTO customers (id, name, tags, created_at, updated_at) \
             VALUES ('c1','ALT','[]','2025-01-01','2025-01-01')", []).unwrap();
        import_into(&mut conn2, &json, None, None).unwrap();
        import_into(&mut conn2, &json, None, None).unwrap(); // zweimal = kein Duplikat

        let count: i64 = conn2.query_row("SELECT count(*) FROM customers WHERE id='c1'", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 1);
        let name: String = conn2.query_row("SELECT name FROM customers WHERE id='c1'", [], |r| r.get(0)).unwrap();
        assert_eq!(name, "V1");
    }

    #[test]
    fn rescope_rewrites_workspace_id_and_created_by() {
        let mut conn = sample_conn();
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, created_at, updated_at) \
             VALUES ('a1','dev','old','Muster GmbH','2026-01-01','2026-01-01')", []).unwrap();
        conn.execute(
            "INSERT INTO invoices (id, workspace_id, created_by, account_id, date, due_date, total, created_at, updated_at) \
             VALUES ('i1','dev','old','a1','2026-01-01','2026-01-15',119.0,'2026-01-01','2026-01-01')", []).unwrap();
        conn.execute(
            "INSERT INTO invoice_items (id, invoice_id, title, quantity, unit_price, tax_rate, total, sort_order) \
             VALUES ('it1','i1','Pos',1,100.0,19,119.0,0)", []).unwrap();

        let n = rescope_workspace(&mut conn, "dev", "ws-new", "me").unwrap();
        assert!(n >= 2, "accounts + invoices umgeschrieben");

        let (ws, by): (String, String) = conn
            .query_row("SELECT workspace_id, created_by FROM accounts WHERE id='a1'", [], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
        assert_eq!(ws, "ws-new");
        assert_eq!(by, "me");
        // Tabelle ohne workspace_id-Spalte bleibt unangetastet, kein Fehler:
        let inv_items: i64 = conn.query_row("SELECT count(*) FROM invoice_items WHERE id='it1'", [], |r| r.get(0)).unwrap();
        assert_eq!(inv_items, 1);
    }

    #[test]
    fn has_workspace_data_detects_rows() {
        let conn = sample_conn();
        assert_eq!(has_workspace_data(&conn, "dev").unwrap(), false);
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, created_at, updated_at) \
             VALUES ('a1','dev','u','X','2026-01-01','2026-01-01')", []).unwrap();
        assert_eq!(has_workspace_data(&conn, "dev").unwrap(), true);
        assert_eq!(has_workspace_data(&conn, "other").unwrap(), false);
    }

    #[test]
    fn import_rescopes_workspace_id_to_active() {
        let conn = sample_conn();
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, created_at, updated_at) \
             VALUES ('a1','OLD-WS','old-user','Muster GmbH','2026-01-01','2026-01-01')", []).unwrap();
        let json = String::from_utf8(build_backup_json(&conn).unwrap()).unwrap();

        let mut conn2 = sample_conn();
        import_into(&mut conn2, &json, Some("ACTIVE-WS"), Some("me")).unwrap();

        let (ws, by): (String, String) = conn2
            .query_row("SELECT workspace_id, created_by FROM accounts WHERE id='a1'", [], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
        assert_eq!(ws, "ACTIVE-WS");
        assert_eq!(by, "me");
    }

    #[test]
    fn reset_clears_data_but_keeps_setup() {
        let mut conn = sample_conn();
        conn.execute(
            "INSERT INTO company_settings (id, profile, modules, crm_config, updated_at) \
             VALUES ('ws1','{}','{}','{}','2026-01-01')", []).unwrap();
        conn.execute(
            "INSERT INTO invoice_sequences (workspace_id, next_number, start_number) \
             VALUES ('ws1', 5, 1)", []).unwrap();
        conn.execute(
            "INSERT INTO offer_sequences (workspace_id, next_number, start_number) \
             VALUES ('ws1', 3, 1)", []).unwrap();
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, created_at, updated_at) \
             VALUES ('a1','ws1','u1','Muster GmbH','2026-01-01','2026-01-01')", []).unwrap();
        conn.execute(
            "INSERT INTO invoices (id, workspace_id, created_by, account_id, date, due_date, total, created_at, updated_at) \
             VALUES ('i1','ws1','u1','a1','2026-01-01','2026-01-15',119.0,'2026-01-01','2026-01-01')", []).unwrap();

        reset_workspace_local(&mut conn).unwrap();

        let accounts: i64 = conn.query_row("SELECT count(*) FROM accounts", [], |r| r.get(0)).unwrap();
        let invoices: i64 = conn.query_row("SELECT count(*) FROM invoices", [], |r| r.get(0)).unwrap();
        assert_eq!(accounts, 0);
        assert_eq!(invoices, 0);
        let settings: i64 = conn.query_row("SELECT count(*) FROM company_settings", [], |r| r.get(0)).unwrap();
        let seq: i64 = conn.query_row("SELECT next_number FROM invoice_sequences WHERE workspace_id='ws1'", [], |r| r.get(0)).unwrap();
        let oseq: i64 = conn.query_row("SELECT next_number FROM offer_sequences WHERE workspace_id='ws1'", [], |r| r.get(0)).unwrap();
        assert_eq!(settings, 1);
        assert_eq!(seq, 5);
        assert_eq!(oseq, 3);
    }
}
