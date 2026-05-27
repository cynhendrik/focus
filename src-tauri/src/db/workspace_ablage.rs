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
        let x = stmt.query_map(rusqlite::params![workspace_id, name, pid], row_to_folder)?
            .next().transpose()?; x
    } else {
        let mut stmt = conn.prepare(
            "SELECT id, workspace_id, name, parent_id, created_at
             FROM workspace_folders
             WHERE workspace_id = ?1 AND name = ?2 AND parent_id IS NULL LIMIT 1",
        )?;
        let x = stmt.query_map(rusqlite::params![workspace_id, name], row_to_folder)?
            .next().transpose()?; x
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
        let x = stmt.query_map(rusqlite::params![workspace_id, fid], row_to_file)?
            .collect::<Result<Vec<_>, _>>()?; x
    } else {
        let mut stmt = conn.prepare(
            "SELECT id, workspace_id, folder_id, name, path, size, mime_type,
                    source_type, source_id, created_at
             FROM workspace_files
             WHERE workspace_id = ?1 ORDER BY created_at DESC",
        )?;
        let x = stmt.query_map([workspace_id], row_to_file)?
            .collect::<Result<Vec<_>, _>>()?; x
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
    let x = stmt.query_map([id], row_to_file)?
        .next()
        .ok_or_else(|| AppError::NotFound(format!("Workspace file {id} not found")))?
        .map_err(AppError::from); x
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
