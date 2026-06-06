use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::AppError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NoteEntry {
    pub id:           String,
    pub workspace_id: String,
    pub account_id:   String,
    pub folder_id:    Option<String>,
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
    pub folder_id:    Option<String>,
    pub title:        Option<String>,
    pub content:      Option<String>,
    pub tags:         Option<String>,
    pub created_by:   String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateNoteEntryPayload {
    pub folder_id:  Option<Option<String>>,
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
        folder_id:    r.get(3)?,
        title:        r.get(4)?,
        content:      r.get::<_, Option<String>>(5)?.unwrap_or_default(),
        tags:         r.get::<_, Option<String>>(6)?.unwrap_or_else(|| "[]".into()),
        created_by:   r.get(7)?,
        updated_by:   r.get(8)?,
        created_at:   r.get(9)?,
        updated_at:   r.get(10)?,
    })
}

const SELECT_COLS: &str =
    "id, workspace_id, account_id, folder_id, title, content, tags,
     created_by, updated_by, created_at, updated_at";

pub fn insert(conn: &Connection, payload: CreateNoteEntryPayload) -> Result<NoteEntry, AppError> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO note_entries
         (id, workspace_id, account_id, folder_id, title, content, tags, created_by, pending_sync, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,1,?9,?9)",
        rusqlite::params![
            id,
            payload.workspace_id,
            payload.account_id,
            payload.folder_id,
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
           folder_id  = CASE WHEN ?1 IS NOT NULL THEN ?2 ELSE folder_id END,
           title      = COALESCE(?3, title),
           content    = COALESCE(?4, content),
           tags       = COALESCE(?5, tags),
           updated_by = ?6,
           pending_sync = 1,
           updated_at = ?7
         WHERE id = ?8",
        rusqlite::params![
            payload.folder_id.is_some(),
            payload.folder_id.unwrap_or(None),
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
