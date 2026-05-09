use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::AppError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FollowUp {
    pub id: String,
    pub customer_id: String,
    pub title: String,
    pub due_date: String,
    pub status: String,
    pub priority: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertFollowUpPayload {
    pub id: Option<String>,
    pub customer_id: String,
    pub title: String,
    pub due_date: String,
    pub status: Option<String>,
    pub priority: Option<String>,
}

pub fn get_by_customer(conn: &Connection, customer_id: &str) -> Result<Vec<FollowUp>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, customer_id, title, due_date, status, priority, created_at
         FROM crm_follow_ups WHERE customer_id = ?1 ORDER BY due_date ASC",
    )?;
    let items = stmt
        .query_map([customer_id], |row| Ok(FollowUp {
            id: row.get(0)?, customer_id: row.get(1)?, title: row.get(2)?,
            due_date: row.get(3)?, status: row.get(4)?, priority: row.get(5)?,
            created_at: row.get(6)?,
        }))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(items)
}

pub fn upsert(conn: &Connection, payload: UpsertFollowUpPayload) -> Result<FollowUp, AppError> {
    let id = payload.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let now = chrono::Utc::now().to_rfc3339();
    let status = payload.status.unwrap_or_else(|| "offen".to_string());
    let priority = payload.priority.unwrap_or_else(|| "normal".to_string());
    conn.execute(
        "INSERT INTO crm_follow_ups (id, customer_id, title, due_date, status, priority, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(id) DO UPDATE SET title=excluded.title, due_date=excluded.due_date,
         status=excluded.status, priority=excluded.priority",
        rusqlite::params![id, payload.customer_id, payload.title, payload.due_date, status, priority, now],
    )?;
    Ok(FollowUp { id, customer_id: payload.customer_id, title: payload.title, due_date: payload.due_date, status, priority, created_at: now })
}

pub fn delete(conn: &Connection, id: &str) -> Result<(), AppError> {
    let affected = conn.execute("DELETE FROM crm_follow_ups WHERE id = ?1", [id])?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("FollowUp {id} not found")));
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
    fn upsert_creates_follow_up() {
        let conn = setup();
        let fu = upsert(&conn, UpsertFollowUpPayload {
            id: None, customer_id: "__cynera_privat__".to_string(),
            title: "Angebot nachfassen".to_string(), due_date: "2026-05-15".to_string(),
            status: None, priority: None,
        }).unwrap();
        assert_eq!(fu.status, "offen");
        assert_eq!(fu.priority, "normal");
    }

    #[test]
    fn upsert_updates_status() {
        let conn = setup();
        let fu = upsert(&conn, UpsertFollowUpPayload {
            id: None, customer_id: "__cynera_privat__".to_string(),
            title: "Call".to_string(), due_date: "2026-05-10".to_string(),
            status: None, priority: None,
        }).unwrap();
        upsert(&conn, UpsertFollowUpPayload {
            id: Some(fu.id.clone()), customer_id: "__cynera_privat__".to_string(),
            title: "Call".to_string(), due_date: "2026-05-10".to_string(),
            status: Some("erledigt".to_string()), priority: None,
        }).unwrap();
        let items = get_by_customer(&conn, "__cynera_privat__").unwrap();
        assert_eq!(items[0].status, "erledigt");
    }

    #[test]
    fn delete_removes_follow_up() {
        let conn = setup();
        let fu = upsert(&conn, UpsertFollowUpPayload {
            id: None, customer_id: "__cynera_privat__".to_string(),
            title: "Test".to_string(), due_date: "2026-05-20".to_string(),
            status: None, priority: None,
        }).unwrap();
        delete(&conn, &fu.id).unwrap();
        assert_eq!(get_by_customer(&conn, "__cynera_privat__").unwrap().len(), 0);
    }
}
