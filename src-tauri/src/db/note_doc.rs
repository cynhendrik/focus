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
