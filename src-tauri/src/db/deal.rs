use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::AppError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Deal {
    pub id: String,
    pub workspace_id: String,
    pub created_by: String,
    pub account_id: String,
    pub contact_id: Option<String>,
    pub title: String,
    pub stage: String,
    pub value: Option<f64>,
    pub currency: String,
    pub probability: Option<i64>,
    pub expected_close: Option<String>,
    pub owner: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertDealPayload {
    pub id: Option<String>,
    pub workspace_id: String,
    pub created_by: String,
    pub account_id: String,
    pub contact_id: Option<String>,
    pub title: String,
    pub stage: Option<String>,
    pub value: Option<f64>,
    pub currency: Option<String>,
    pub probability: Option<i64>,
    pub expected_close: Option<String>,
    pub owner: Option<String>,
}

pub fn get_by_account(conn: &Connection, account_id: &str) -> Result<Vec<Deal>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, created_by, account_id, contact_id, title, stage,
                value, currency, probability, expected_close, owner, created_at, updated_at
         FROM deals WHERE account_id = ?1 ORDER BY created_at DESC"
    )?;
    let rows = stmt.query_map([account_id], |r| Ok(Deal {
        id: r.get(0)?, workspace_id: r.get(1)?, created_by: r.get(2)?,
        account_id: r.get(3)?, contact_id: r.get(4)?, title: r.get(5)?,
        stage: r.get(6)?, value: r.get(7)?,
        currency: r.get::<_, Option<String>>(8)?.unwrap_or_else(|| "EUR".into()),
        probability: r.get(9)?, expected_close: r.get(10)?,
        owner: r.get(11)?, created_at: r.get(12)?, updated_at: r.get(13)?,
    }))?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn upsert(conn: &Connection, payload: UpsertDealPayload) -> Result<Deal, AppError> {
    let id = payload.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let now = chrono::Utc::now().to_rfc3339();
    let account_id = payload.account_id.clone();
    conn.execute(
        "INSERT INTO deals (id, workspace_id, created_by, account_id, contact_id, title,
                            stage, value, currency, probability, expected_close, owner,
                            pending_sync, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,1,?13,?13)
         ON CONFLICT(id) DO UPDATE SET
           title=excluded.title, stage=excluded.stage, value=excluded.value,
           currency=excluded.currency, probability=excluded.probability,
           expected_close=excluded.expected_close, owner=excluded.owner,
           contact_id=excluded.contact_id, pending_sync=1, updated_at=excluded.updated_at",
        rusqlite::params![
            id, payload.workspace_id, payload.created_by, payload.account_id, payload.contact_id,
            payload.title, payload.stage.unwrap_or_else(|| "prospect".into()),
            payload.value, payload.currency.unwrap_or_else(|| "EUR".into()),
            payload.probability, payload.expected_close, payload.owner, now,
        ],
    )?;
    crate::core::sync::enqueue(conn, "deals", &id, "INSERT",
        serde_json::json!({"id": id, "account_id": account_id}))?;
    conn.query_row(
        "SELECT id, workspace_id, created_by, account_id, contact_id, title, stage,
                value, currency, probability, expected_close, owner, created_at, updated_at
         FROM deals WHERE id = ?1", [&id], |r| Ok(Deal {
            id: r.get(0)?, workspace_id: r.get(1)?, created_by: r.get(2)?,
            account_id: r.get(3)?, contact_id: r.get(4)?, title: r.get(5)?,
            stage: r.get(6)?, value: r.get(7)?,
            currency: r.get::<_, Option<String>>(8)?.unwrap_or_else(|| "EUR".into()),
            probability: r.get(9)?, expected_close: r.get(10)?,
            owner: r.get(11)?, created_at: r.get(12)?, updated_at: r.get(13)?,
        }),
    ).map_err(AppError::from)
}

pub fn delete(conn: &Connection, id: &str) -> Result<(), AppError> {
    let n = conn.execute("DELETE FROM deals WHERE id = ?1", [id])?;
    if n == 0 { return Err(AppError::NotFound(format!("Deal {id} not found"))); }
    Ok(())
}

pub fn update_stage(conn: &Connection, id: &str, stage: &str) -> Result<Deal, AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    let n = conn.execute(
        "UPDATE deals SET stage = ?1, updated_at = ?2, pending_sync = 1 WHERE id = ?3",
        rusqlite::params![stage, now, id],
    )?;
    if n == 0 { return Err(AppError::NotFound(format!("Deal {id} not found"))); }
    conn.query_row(
        "SELECT id, workspace_id, created_by, account_id, contact_id, title, stage,
                value, currency, probability, expected_close, owner, created_at, updated_at
         FROM deals WHERE id = ?1", [id], |r| Ok(Deal {
            id: r.get(0)?, workspace_id: r.get(1)?, created_by: r.get(2)?,
            account_id: r.get(3)?, contact_id: r.get(4)?, title: r.get(5)?,
            stage: r.get(6)?, value: r.get(7)?,
            currency: r.get::<_, Option<String>>(8)?.unwrap_or_else(|| "EUR".into()),
            probability: r.get(9)?, expected_close: r.get(10)?,
            owner: r.get(11)?, created_at: r.get(12)?, updated_at: r.get(13)?,
        }),
    ).map_err(AppError::from)
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
        let id = "acc-1".to_string();
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, created_at, updated_at)
             VALUES (?1, 'ws-1', 'u-1', 'Test AG', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [&id],
        ).unwrap();
        id
    }

    #[test]
    fn upsert_creates_deal() {
        let conn = setup();
        let acc_id = seed_account(&conn);
        let d = upsert(&conn, UpsertDealPayload {
            id: None, workspace_id: "ws-1".into(), created_by: "u-1".into(),
            account_id: acc_id.clone(), contact_id: None,
            title: "Website Relaunch".into(), stage: Some("proposal".into()),
            value: Some(5000.0), currency: None, probability: Some(60),
            expected_close: Some("2026-06-30".into()), owner: None,
        }).unwrap();
        assert_eq!(d.title, "Website Relaunch");
        assert_eq!(d.stage, "proposal");
        assert_eq!(d.value, Some(5000.0));
    }

    #[test]
    fn update_stage_changes_stage() {
        let conn = setup();
        let acc_id = seed_account(&conn);
        let d = upsert(&conn, UpsertDealPayload {
            id: None, workspace_id: "ws-1".into(), created_by: "u-1".into(),
            account_id: acc_id, contact_id: None, title: "Deal".into(),
            stage: None, value: None, currency: None, probability: None,
            expected_close: None, owner: None,
        }).unwrap();
        let updated = update_stage(&conn, &d.id, "won").unwrap();
        assert_eq!(updated.stage, "won");
    }

    #[test]
    fn get_by_account_returns_deals() {
        let conn = setup();
        let acc_id = seed_account(&conn);
        upsert(&conn, UpsertDealPayload {
            id: None, workspace_id: "ws-1".into(), created_by: "u-1".into(),
            account_id: acc_id.clone(), contact_id: None, title: "D1".into(),
            stage: None, value: None, currency: None, probability: None,
            expected_close: None, owner: None,
        }).unwrap();
        assert_eq!(get_by_account(&conn, &acc_id).unwrap().len(), 1);
    }
}
