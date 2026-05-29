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
    pub linkedin_url: Option<String>,
    pub decision_power: Option<String>,
    pub preferred_channel: Option<String>,
    pub notes: Option<String>,
    pub birthday: Option<String>,
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
    pub linkedin_url: Option<String>,
    pub decision_power: Option<String>,
    pub preferred_channel: Option<String>,
    pub notes: Option<String>,
    pub birthday: Option<String>,
}

const SELECT_COLS: &str = "id, workspace_id, created_by, account_id, first_name, last_name, email, \
                            phone, role, is_primary, avatar_url, linkedin_url, decision_power, \
                            preferred_channel, notes, birthday, created_at, updated_at";

fn row_to_contact(r: &rusqlite::Row) -> rusqlite::Result<Contact> {
    Ok(Contact {
        id:                r.get(0)?,
        workspace_id:      r.get(1)?,
        created_by:        r.get(2)?,
        account_id:        r.get(3)?,
        first_name:        r.get(4)?,
        last_name:         r.get(5)?,
        email:             r.get(6)?,
        phone:             r.get(7)?,
        role:              r.get(8)?,
        is_primary:        r.get::<_, i32>(9)? != 0,
        avatar_url:        r.get(10)?,
        linkedin_url:      r.get(11)?,
        decision_power:    r.get(12)?,
        preferred_channel: r.get(13)?,
        notes:             r.get(14)?,
        birthday:          r.get(15)?,
        created_at:        r.get(16)?,
        updated_at:        r.get(17)?,
    })
}

pub fn get_by_account(conn: &Connection, account_id: &str) -> Result<Vec<Contact>, AppError> {
    let sql = format!(
        "SELECT {SELECT_COLS} FROM contacts WHERE account_id = ?1 ORDER BY is_primary DESC, first_name ASC"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([account_id], row_to_contact)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn upsert(conn: &Connection, payload: UpsertContactPayload) -> Result<Contact, AppError> {
    let id = payload.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let now = chrono::Utc::now().to_rfc3339();
    let is_primary = payload.is_primary.unwrap_or(false) as i32;
    conn.execute(
        "INSERT INTO contacts (id, workspace_id, created_by, account_id, first_name, last_name,
                               email, phone, role, is_primary, avatar_url, linkedin_url,
                               decision_power, preferred_channel, notes, birthday,
                               pending_sync, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,1,?17,?17)
         ON CONFLICT(id) DO UPDATE SET
           account_id=excluded.account_id, first_name=excluded.first_name,
           last_name=excluded.last_name, email=excluded.email, phone=excluded.phone,
           role=excluded.role, is_primary=excluded.is_primary, avatar_url=excluded.avatar_url,
           linkedin_url=excluded.linkedin_url, decision_power=excluded.decision_power,
           preferred_channel=excluded.preferred_channel, notes=excluded.notes,
           birthday=excluded.birthday,
           pending_sync=1, updated_at=excluded.updated_at",
        rusqlite::params![
            id, payload.workspace_id, payload.created_by, payload.account_id,
            payload.first_name, payload.last_name, payload.email, payload.phone,
            payload.role, is_primary, payload.avatar_url,
            payload.linkedin_url, payload.decision_power, payload.preferred_channel,
            payload.notes, payload.birthday,
            now
        ],
    )?;
    let sql = format!("SELECT {SELECT_COLS} FROM contacts WHERE id = ?1");
    conn.query_row(&sql, [&id], row_to_contact).map_err(AppError::from)
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
            linkedin_url: None, decision_power: None, preferred_channel: None,
            notes: None, birthday: None,
        }).unwrap();
        assert_eq!(c.first_name, "Anna");
        assert_eq!(c.account_id, Some(acc_id));
        assert!(c.is_primary);
    }

    #[test]
    fn upsert_persists_enriched_fields() {
        let conn = setup();
        let acc_id = seed_account(&conn);
        let c = upsert(&conn, UpsertContactPayload {
            id: None, workspace_id: "ws-1".into(), created_by: "u-1".into(),
            account_id: Some(acc_id), first_name: "Anna".into(),
            last_name: None, email: None, phone: None, role: None,
            is_primary: None, avatar_url: None,
            linkedin_url:      Some("https://linkedin.com/in/anna".into()),
            decision_power:    Some("high".into()),
            preferred_channel: Some("phone".into()),
            notes:             Some("Mag thailändisch · Tochter Lena (Mär)".into()),
            birthday:          Some("1985-03-12".into()),
        }).unwrap();
        assert_eq!(c.linkedin_url.as_deref(),      Some("https://linkedin.com/in/anna"));
        assert_eq!(c.decision_power.as_deref(),    Some("high"));
        assert_eq!(c.preferred_channel.as_deref(), Some("phone"));
        assert_eq!(c.notes.as_deref(),             Some("Mag thailändisch · Tochter Lena (Mär)"));
        assert_eq!(c.birthday.as_deref(),          Some("1985-03-12"));
    }

    #[test]
    fn get_by_account_returns_contacts() {
        let conn = setup();
        let acc_id = seed_account(&conn);
        upsert(&conn, UpsertContactPayload {
            id: None, workspace_id: "ws-1".into(), created_by: "u-1".into(),
            account_id: Some(acc_id.clone()), first_name: "Bob".into(),
            last_name: None, email: None, phone: None, role: None, is_primary: None, avatar_url: None,
            linkedin_url: None, decision_power: None, preferred_channel: None,
            notes: None, birthday: None,
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
            linkedin_url: None, decision_power: None, preferred_channel: None,
            notes: None, birthday: None,
        }).unwrap();
        delete(&conn, &c.id).unwrap();
        assert!(get_by_account(&conn, &acc_id).unwrap().is_empty());
    }
}
