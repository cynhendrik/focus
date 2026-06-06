use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::AppError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NoteFolder {
    pub id:           String,
    pub workspace_id: String,
    pub account_id:   String,
    pub name:         String,
    pub created_by:   String,
    pub created_at:   String,
    pub updated_at:   String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateNoteFolderPayload {
    pub workspace_id: String,
    pub account_id:   String,
    pub name:         String,
    pub created_by:   String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateNoteFolderPayload {
    pub name: String,
}

const SELECT_COLS: &str =
    "id, workspace_id, account_id, name, created_by, created_at, updated_at";

fn map_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<NoteFolder> {
    Ok(NoteFolder {
        id:           r.get(0)?,
        workspace_id: r.get(1)?,
        account_id:   r.get(2)?,
        name:         r.get(3)?,
        created_by:   r.get(4)?,
        created_at:   r.get(5)?,
        updated_at:   r.get(6)?,
    })
}

pub fn insert(conn: &Connection, payload: CreateNoteFolderPayload) -> Result<NoteFolder, AppError> {
    let id  = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO note_folders (id, workspace_id, account_id, name, created_by, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
        rusqlite::params![id, payload.workspace_id, payload.account_id, payload.name, payload.created_by, now],
    )?;
    conn.query_row(
        &format!("SELECT {SELECT_COLS} FROM note_folders WHERE id=?1"),
        [&id], map_row,
    ).map_err(AppError::from)
}

pub fn update(conn: &Connection, id: &str, payload: UpdateNoteFolderPayload) -> Result<NoteFolder, AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    let n = conn.execute(
        "UPDATE note_folders SET name=?1, updated_at=?2 WHERE id=?3",
        rusqlite::params![payload.name, now, id],
    )?;
    if n == 0 { return Err(AppError::NotFound(format!("NoteFolder {id} not found"))); }
    conn.query_row(
        &format!("SELECT {SELECT_COLS} FROM note_folders WHERE id=?1"),
        [id], map_row,
    ).map_err(AppError::from)
}

pub fn delete(conn: &Connection, id: &str) -> Result<(), AppError> {
    let n = conn.execute("DELETE FROM note_folders WHERE id=?1", [id])?;
    if n == 0 { return Err(AppError::NotFound(format!("NoteFolder {id} not found"))); }
    Ok(())
}

pub fn get_by_account(conn: &Connection, account_id: &str) -> Result<Vec<NoteFolder>, AppError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {SELECT_COLS} FROM note_folders WHERE account_id=?1 ORDER BY name ASC"
    ))?;
    let rows = stmt.query_map([account_id], map_row)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}
