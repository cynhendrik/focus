use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::AppError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TimeEntry {
    pub id: String,
    pub customer_id: String,
    pub description: String,
    pub minutes: i64,
    pub date: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddTimeEntryPayload {
    pub customer_id: String,
    pub description: String,
    pub minutes: i64,
    pub date: String,
}

pub fn get_by_customer(conn: &Connection, customer_id: &str) -> Result<Vec<TimeEntry>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, customer_id, description, minutes, date, created_at
         FROM time_entries WHERE customer_id = ?1 ORDER BY date DESC, created_at DESC",
    )?;
    let entries = stmt
        .query_map([customer_id], |row| {
            Ok(TimeEntry {
                id: row.get(0)?,
                customer_id: row.get(1)?,
                description: row.get(2)?,
                minutes: row.get(3)?,
                date: row.get(4)?,
                created_at: row.get(5)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(entries)
}

pub fn add(conn: &Connection, payload: AddTimeEntryPayload) -> Result<TimeEntry, AppError> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO time_entries (id, customer_id, description, minutes, date, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![id, payload.customer_id, payload.description, payload.minutes, payload.date, now],
    )?;
    Ok(TimeEntry {
        id,
        customer_id: payload.customer_id,
        description: payload.description,
        minutes: payload.minutes,
        date: payload.date,
        created_at: now,
    })
}

pub fn delete(conn: &Connection, id: &str) -> Result<(), AppError> {
    let affected = conn.execute("DELETE FROM time_entries WHERE id = ?1", [id])?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("TimeEntry {id} not found")));
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
    fn add_creates_entry() {
        let conn = setup();
        let entry = add(&conn, AddTimeEntryPayload {
            customer_id: "__cynera_privat__".to_string(),
            description: "Meeting".to_string(),
            minutes: 60,
            date: "2026-05-08".to_string(),
        }).unwrap();
        assert_eq!(entry.minutes, 60);
        assert_eq!(entry.description, "Meeting");
    }

    #[test]
    fn get_by_customer_isolates() {
        let conn = setup();
        add(&conn, AddTimeEntryPayload {
            customer_id: "__cynera_privat__".to_string(),
            description: "Work".to_string(), minutes: 30, date: "2026-05-08".to_string(),
        }).unwrap();
        assert_eq!(get_by_customer(&conn, "__cynera_privat__").unwrap().len(), 1);
        assert_eq!(get_by_customer(&conn, "other").unwrap().len(), 0);
    }

    #[test]
    fn delete_removes_entry() {
        let conn = setup();
        let entry = add(&conn, AddTimeEntryPayload {
            customer_id: "__cynera_privat__".to_string(),
            description: "X".to_string(), minutes: 15, date: "2026-05-08".to_string(),
        }).unwrap();
        delete(&conn, &entry.id).unwrap();
        assert_eq!(get_by_customer(&conn, "__cynera_privat__").unwrap().len(), 0);
    }
}
