use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::AppError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Lead {
    pub id: String,
    pub workspace_id: String,
    pub name: String,
    pub email: Option<String>,
    pub account_type: String,
    pub lead_status: String,
    pub lead_source: String,
    pub lead_source_detail: Option<String>,
    pub engagement_score: i64,
    pub re_engage_date: Option<String>,
    pub converted_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertLeadPayload {
    pub id: Option<String>,
    pub workspace_id: String,
    pub name: String,
    pub email: Option<String>,
    pub lead_status: Option<String>,
    pub lead_source: String,
    pub lead_source_detail: Option<String>,
    pub re_engage_date: Option<String>,
}

fn map_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<Lead> {
    Ok(Lead {
        id: r.get(0)?,
        workspace_id: r.get(1)?,
        name: r.get(2)?,
        email: r.get(3)?,
        account_type: r.get(4)?,
        lead_status: r.get::<_, Option<String>>(5)?.unwrap_or_default(),
        lead_source: r.get::<_, Option<String>>(6)?.unwrap_or_default(),
        lead_source_detail: r.get(7)?,
        engagement_score: r.get::<_, Option<i64>>(8)?.unwrap_or(0),
        re_engage_date: r.get(9)?,
        converted_at: r.get(10)?,
        created_at: r.get(11)?,
        updated_at: r.get(12)?,
    })
}

const SELECT: &str =
    "SELECT id, workspace_id, name, email, account_type, lead_status, lead_source,
            lead_source_detail, engagement_score, re_engage_date, converted_at,
            created_at, updated_at
     FROM accounts";

pub fn get_leads(conn: &Connection, workspace_id: &str) -> Result<Vec<Lead>, AppError> {
    let mut stmt = conn.prepare(&format!(
        "{SELECT} WHERE workspace_id=?1 AND account_type='lead' ORDER BY created_at DESC"
    ))?;
    let rows = stmt.query_map([workspace_id], map_row)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn upsert_lead(conn: &Connection, payload: UpsertLeadPayload) -> Result<Lead, AppError> {
    let id = payload.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let now = chrono::Utc::now().to_rfc3339();
    let status = payload.lead_status.unwrap_or_else(|| "new".into());
    conn.execute(
        "INSERT INTO accounts
           (id, workspace_id, created_by, name, email, account_type, lead_status, lead_source,
            lead_source_detail, engagement_score, re_engage_date, created_at, updated_at)
         VALUES (?1,?2,'',?3,?4,'lead',?5,?6,?7,0,?8,?9,?9)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name, email=excluded.email,
           lead_status=excluded.lead_status, lead_source=excluded.lead_source,
           lead_source_detail=excluded.lead_source_detail,
           re_engage_date=excluded.re_engage_date, updated_at=excluded.updated_at",
        rusqlite::params![
            id, payload.workspace_id, payload.name, payload.email,
            status, payload.lead_source, payload.lead_source_detail,
            payload.re_engage_date, now,
        ],
    )?;
    conn.query_row(&format!("{SELECT} WHERE id=?1"), [&id], map_row)
        .map_err(AppError::from)
}

pub fn bulk_update_lead_status(
    conn: &Connection,
    ids: &[String],
    status: &str,
    re_engage_date: Option<&str>,
) -> Result<(), AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    for id in ids {
        conn.execute(
            "UPDATE accounts SET lead_status=?1, re_engage_date=COALESCE(?2, re_engage_date),
             updated_at=?3 WHERE id=?4 AND account_type='lead'",
            rusqlite::params![status, re_engage_date, now, id],
        )?;
    }
    Ok(())
}

pub fn convert_lead_to_client(conn: &Connection, id: &str) -> Result<Lead, AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    let n = conn.execute(
        "UPDATE accounts SET account_type='client', lead_status=NULL, converted_at=?1,
         updated_at=?1 WHERE id=?2 AND account_type='lead'",
        rusqlite::params![now, id],
    )?;
    if n == 0 {
        return Err(AppError::NotFound(format!("Lead {id} not found")));
    }
    conn.query_row(&format!("{SELECT} WHERE id=?1"), [id], map_row)
        .map_err(AppError::from)
}

pub fn insert_synced_leads(conn: &Connection, leads: Vec<UpsertLeadPayload>) -> Result<usize, AppError> {
    let mut count = 0usize;
    for lead in leads {
        upsert_lead(conn, lead)?;
        count += 1;
    }
    Ok(count)
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

    fn lead_payload(ws: &str) -> UpsertLeadPayload {
        UpsertLeadPayload {
            id: None,
            workspace_id: ws.into(),
            name: "Max Mustermann".into(),
            email: Some("max@example.com".into()),
            lead_status: None,
            lead_source: "zoom".into(),
            lead_source_detail: Some("Marketing Webinar".into()),
            re_engage_date: None,
        }
    }

    #[test]
    fn upsert_creates_lead_with_new_status() {
        let conn = setup();
        let lead = upsert_lead(&conn, lead_payload("ws-1")).unwrap();
        assert_eq!(lead.lead_status, "new");
        assert_eq!(lead.account_type, "lead");
        assert_eq!(lead.lead_source, "zoom");
    }

    #[test]
    fn get_leads_returns_only_leads() {
        let conn = setup();
        upsert_lead(&conn, lead_payload("ws-1")).unwrap();
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, account_type, created_at, updated_at)
             VALUES ('client-1','ws-1','','Client AG','client',?1,?1)",
            [&now],
        ).unwrap();
        let leads = get_leads(&conn, "ws-1").unwrap();
        assert_eq!(leads.len(), 1);
        assert_eq!(leads[0].account_type, "lead");
    }

    #[test]
    fn bulk_update_changes_status_for_all_ids() {
        let conn = setup();
        let l1 = upsert_lead(&conn, lead_payload("ws-1")).unwrap();
        let l2 = upsert_lead(&conn, UpsertLeadPayload {
            name: "Anna".into(), email: None, ..lead_payload("ws-1")
        }).unwrap();
        bulk_update_lead_status(&conn, &[l1.id.clone(), l2.id.clone()], "attempted", None).unwrap();
        let leads = get_leads(&conn, "ws-1").unwrap();
        assert!(leads.iter().all(|l| l.lead_status == "attempted"));
    }

    #[test]
    fn convert_lead_to_client_changes_account_type() {
        let conn = setup();
        let lead = upsert_lead(&conn, lead_payload("ws-1")).unwrap();
        let converted = convert_lead_to_client(&conn, &lead.id).unwrap();
        assert_eq!(converted.account_type, "client");
        assert!(converted.converted_at.is_some());
        assert!(get_leads(&conn, "ws-1").unwrap().is_empty());
    }

    #[test]
    fn convert_nonexistent_lead_returns_not_found() {
        let conn = setup();
        let result = convert_lead_to_client(&conn, "nonexistent");
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }

    #[test]
    fn insert_synced_leads_returns_correct_count() {
        let conn = setup();
        let count = insert_synced_leads(&conn, vec![
            lead_payload("ws-1"),
            UpsertLeadPayload { name: "Anna".into(), email: None, ..lead_payload("ws-1") },
        ]).unwrap();
        assert_eq!(count, 2);
        assert_eq!(get_leads(&conn, "ws-1").unwrap().len(), 2);
    }
}
