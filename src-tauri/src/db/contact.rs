use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::AppError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Contact {
    pub id: String,
    pub workspace_id: String,
    pub created_by: String,
    pub account_id: Option<String>,
    pub first_name: String,
    pub last_name: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub role: Option<String>,
    pub is_primary: bool,
    pub avatar_url: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertContactPayload {
    pub id: Option<String>,
    pub workspace_id: String,
    pub created_by: String,
    pub account_id: Option<String>,
    pub first_name: String,
    pub last_name: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub role: Option<String>,
    pub is_primary: Option<bool>,
    pub avatar_url: Option<String>,
}

pub fn get_by_account(conn: &Connection, account_id: &str) -> Result<Vec<Contact>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, created_by, account_id, first_name, last_name, email,
                phone, role, is_primary, avatar_url, created_at, updated_at
         FROM contacts WHERE account_id = ?1 ORDER BY is_primary DESC, first_name ASC"
    )?;
    let rows = stmt.query_map([account_id], |r| Ok(Contact {
        id: r.get(0)?, workspace_id: r.get(1)?, created_by: r.get(2)?,
        account_id: r.get(3)?, first_name: r.get(4)?, last_name: r.get(5)?,
        email: r.get(6)?, phone: r.get(7)?, role: r.get(8)?,
        is_primary: r.get::<_, i32>(9)? != 0, avatar_url: r.get(10)?,
        created_at: r.get(11)?, updated_at: r.get(12)?,
    }))?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn upsert(conn: &Connection, payload: UpsertContactPayload) -> Result<Contact, AppError> {
    let id = payload.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let now = chrono::Utc::now().to_rfc3339();
    let is_primary = payload.is_primary.unwrap_or(false) as i32;
    conn.execute(
        "INSERT INTO contacts (id, workspace_id, created_by, account_id, first_name, last_name,
                               email, phone, role, is_primary, avatar_url, pending_sync, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,1,?12,?12)
         ON CONFLICT(id) DO UPDATE SET
           account_id=excluded.account_id, first_name=excluded.first_name,
           last_name=excluded.last_name, email=excluded.email, phone=excluded.phone,
           role=excluded.role, is_primary=excluded.is_primary, avatar_url=excluded.avatar_url,
           pending_sync=1, updated_at=excluded.updated_at",
        rusqlite::params![id, payload.workspace_id, payload.created_by, payload.account_id,
            payload.first_name, payload.last_name, payload.email, payload.phone,
            payload.role, is_primary, payload.avatar_url, now],
    )?;
    conn.query_row(
        "SELECT id, workspace_id, created_by, account_id, first_name, last_name, email,
                phone, role, is_primary, avatar_url, created_at, updated_at
         FROM contacts WHERE id = ?1", [&id], |r| Ok(Contact {
            id: r.get(0)?, workspace_id: r.get(1)?, created_by: r.get(2)?,
            account_id: r.get(3)?, first_name: r.get(4)?, last_name: r.get(5)?,
            email: r.get(6)?, phone: r.get(7)?, role: r.get(8)?,
            is_primary: r.get::<_, i32>(9)? != 0, avatar_url: r.get(10)?,
            created_at: r.get(11)?, updated_at: r.get(12)?,
        }),
    ).map_err(AppError::from)
}

pub fn delete(conn: &Connection, id: &str) -> Result<(), AppError> {
    let n = conn.execute("DELETE FROM contacts WHERE id = ?1", [id])?;
    if n == 0 { return Err(AppError::NotFound(format!("Contact {id} not found"))); }
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

    fn seed_account(conn: &Connection) -> String {
        let id = "acc-test".to_string();
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, created_at, updated_at)
             VALUES (?1, 'ws-1', 'u-1', 'Test AG', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [&id],
        ).unwrap();
        id
    }

    #[test]
    fn upsert_creates_contact() {
        let conn = setup();
        let acc_id = seed_account(&conn);
        let c = upsert(&conn, UpsertContactPayload {
            id: None, workspace_id: "ws-1".into(), created_by: "u-1".into(),
            account_id: Some(acc_id.clone()), first_name: "Anna".into(),
            last_name: Some("Müller".into()), email: Some("anna@test.de".into()),
            phone: None, role: Some("CEO".into()), is_primary: Some(true), avatar_url: None,
        }).unwrap();
        assert_eq!(c.first_name, "Anna");
        assert_eq!(c.account_id, Some(acc_id));
        assert!(c.is_primary);
    }

    #[test]
    fn get_by_account_returns_contacts() {
        let conn = setup();
        let acc_id = seed_account(&conn);
        upsert(&conn, UpsertContactPayload {
            id: None, workspace_id: "ws-1".into(), created_by: "u-1".into(),
            account_id: Some(acc_id.clone()), first_name: "Bob".into(),
            last_name: None, email: None, phone: None, role: None, is_primary: None, avatar_url: None,
        }).unwrap();
        let contacts = get_by_account(&conn, &acc_id).unwrap();
        assert_eq!(contacts.len(), 1);
        assert_eq!(contacts[0].first_name, "Bob");
    }

    #[test]
    fn delete_removes_contact() {
        let conn = setup();
        let acc_id = seed_account(&conn);
        let c = upsert(&conn, UpsertContactPayload {
            id: None, workspace_id: "ws-1".into(), created_by: "u-1".into(),
            account_id: Some(acc_id.clone()), first_name: "To Delete".into(),
            last_name: None, email: None, phone: None, role: None, is_primary: None, avatar_url: None,
        }).unwrap();
        delete(&conn, &c.id).unwrap();
        assert!(get_by_account(&conn, &acc_id).unwrap().is_empty());
    }
}
