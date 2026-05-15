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
    Ok(Deadline {
        id,
        customer_id: payload.customer_id,
        title: payload.title,
        due_date: payload.due_date,
        done,
        created_at: now,
    })
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

    #[test]
    fn get_by_customer_orders_by_due_date() {
        let conn = setup();
        upsert(&conn, UpsertDeadlinePayload {
            id: None, customer_id: "__cynera_privat__".to_string(),
            title: "Später".to_string(), due_date: "2026-07-01".to_string(), done: None,
        }).unwrap();
        upsert(&conn, UpsertDeadlinePayload {
            id: None, customer_id: "__cynera_privat__".to_string(),
            title: "Früher".to_string(), due_date: "2026-06-01".to_string(), done: None,
        }).unwrap();
        let items = get_by_customer(&conn, "__cynera_privat__").unwrap();
        assert_eq!(items[0].title, "Früher");
    }
}
