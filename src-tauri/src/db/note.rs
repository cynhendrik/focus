use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::AppError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub customer_id: String,
    pub title: String,
    pub content: String,
    pub pinned: bool,
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
}

pub fn get_by_customer(conn: &Connection, customer_id: &str) -> Result<Vec<Note>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, customer_id, title, content, pinned, created_at, updated_at
         FROM notes WHERE customer_id = ?1 ORDER BY pinned DESC, created_at DESC",
    )?;
    let notes = stmt
        .query_map([customer_id], |row| {
            Ok(Note {
                id: row.get(0)?,
                customer_id: row.get(1)?,
                title: row.get(2)?,
                content: row.get(3)?,
                pinned: row.get::<_, i32>(4)? != 0,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(notes)
}

pub fn upsert(conn: &Connection, payload: UpsertNotePayload) -> Result<Note, AppError> {
    let id = payload.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO notes (id, customer_id, title, content, pinned, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title, content = excluded.content,
           pinned = excluded.pinned, updated_at = excluded.updated_at",
        rusqlite::params![
            id, payload.customer_id, payload.title,
            payload.content.unwrap_or_default(),
            payload.pinned.unwrap_or(false) as i32,
            now,
        ],
    )?;
    let note = conn.query_row(
        "SELECT id, customer_id, title, content, pinned, created_at, updated_at
         FROM notes WHERE id = ?1",
        [&id],
        |row| Ok(Note {
            id: row.get(0)?, customer_id: row.get(1)?, title: row.get(2)?,
            content: row.get(3)?, pinned: row.get::<_, i32>(4)? != 0,
            created_at: row.get(5)?, updated_at: row.get(6)?,
        }),
    )?;
    Ok(note)
}

pub fn delete(conn: &Connection, id: &str) -> Result<(), AppError> {
    let affected = conn.execute("DELETE FROM notes WHERE id = ?1", [id])?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("Note {id} not found")));
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
    fn upsert_creates_note() {
        let conn = setup();
        let note = upsert(&conn, UpsertNotePayload {
            id: None, customer_id: "__cynera_privat__".to_string(),
            title: "Meine Notiz".to_string(), content: Some("Inhalt".to_string()), pinned: None,
        }).unwrap();
        assert_eq!(note.title, "Meine Notiz");
        assert!(!note.pinned);
    }

    #[test]
    fn pinned_notes_come_first() {
        let conn = setup();
        upsert(&conn, UpsertNotePayload {
            id: None, customer_id: "__cynera_privat__".to_string(),
            title: "Normal".to_string(), content: None, pinned: Some(false),
        }).unwrap();
        upsert(&conn, UpsertNotePayload {
            id: None, customer_id: "__cynera_privat__".to_string(),
            title: "Pinned".to_string(), content: None, pinned: Some(true),
        }).unwrap();
        let notes = get_by_customer(&conn, "__cynera_privat__").unwrap();
        assert_eq!(notes[0].title, "Pinned");
    }

    #[test]
    fn delete_removes_note() {
        let conn = setup();
        let note = upsert(&conn, UpsertNotePayload {
            id: None, customer_id: "__cynera_privat__".to_string(),
            title: "Weg".to_string(), content: None, pinned: None,
        }).unwrap();
        delete(&conn, &note.id).unwrap();
        assert_eq!(get_by_customer(&conn, "__cynera_privat__").unwrap().len(), 0);
    }
}
