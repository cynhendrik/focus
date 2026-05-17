use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::AppError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    pub workspace_id: String,
    pub created_by: String,
    pub name: String,
    pub kind: String,
    pub industry: Option<String>,
    pub website: Option<String>,
    pub status: String,
    pub priority: String,
    pub tags: Vec<String>,
    pub goals: Vec<String>,
    pub health_score: Option<f64>,
    pub internal_notes: Option<String>,
    pub is_private: bool,
    pub social_links: String,
    pub primary_deal_id: Option<String>,
    pub lead_score: f64,
    // Computed via JOIN, never stored on Account
    pub pipeline_phase: Option<String>,
    pub pipeline_phase_label: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertAccountPayload {
    pub id: Option<String>,
    pub workspace_id: String,
    pub created_by: String,
    pub name: String,
    pub kind: Option<String>,
    pub industry: Option<String>,
    pub website: Option<String>,
    pub status: Option<String>,
    pub priority: Option<String>,
    pub tags: Option<Vec<String>>,
    pub goals: Option<Vec<String>>,
    pub internal_notes: Option<String>,
    pub social_links: Option<String>,
    pub primary_deal_id: Option<String>,
}

fn map_account_row(row: &rusqlite::Row) -> rusqlite::Result<Account> {
    let tags_json: String = row.get(9)?;
    let goals_json: String = row.get(10)?;
    Ok(Account {
        id:                   row.get(0)?,
        workspace_id:         row.get(1)?,
        created_by:           row.get(2)?,
        name:                 row.get(3)?,
        kind:                 row.get(4)?,
        industry:             row.get(5)?,
        website:              row.get(6)?,
        status:               row.get(7)?,
        priority:             row.get(8)?,
        tags:                 serde_json::from_str(&tags_json).unwrap_or_default(),
        goals:                serde_json::from_str(&goals_json).unwrap_or_default(),
        health_score:         row.get(11)?,
        internal_notes:       row.get(12)?,
        is_private:           row.get::<_, i32>(13)? != 0,
        social_links:         row.get::<_, Option<String>>(14)?.unwrap_or_else(|| "{}".to_string()),
        primary_deal_id:      row.get(15)?,
        lead_score:           row.get::<_, Option<f64>>(16)?.unwrap_or(0.0),
        created_at:           row.get(17)?,
        updated_at:           row.get(18)?,
        pipeline_phase:       row.get(19)?,
        pipeline_phase_label: row.get(20)?,
    })
}

const JOIN_QUERY_ALL: &str = "
SELECT
    a.id, a.workspace_id, a.created_by, a.name, a.kind, a.industry, a.website,
    a.status, a.priority, a.tags, a.goals, a.health_score, a.internal_notes,
    a.is_private, a.social_links, a.primary_deal_id, a.lead_score,
    a.created_at, a.updated_at,
    ps.name   AS pipeline_phase,
    ps.label  AS pipeline_phase_label
FROM accounts a
LEFT JOIN deals d ON d.id = COALESCE(
    a.primary_deal_id,
    (SELECT d2.id FROM deals d2
     WHERE d2.account_id = a.id
       AND d2.stage NOT IN (
           SELECT name FROM pipeline_stages
           WHERE (is_won = 1 OR is_lost = 1) AND workspace_id = a.workspace_id
       )
     ORDER BY d2.updated_at DESC LIMIT 1)
)
LEFT JOIN pipeline_stages ps ON ps.name = d.stage AND ps.workspace_id = a.workspace_id
WHERE a.is_private = 0 AND a.workspace_id = ?1
ORDER BY a.name ASC";

const JOIN_QUERY_BY_ID: &str = "
SELECT
    a.id, a.workspace_id, a.created_by, a.name, a.kind, a.industry, a.website,
    a.status, a.priority, a.tags, a.goals, a.health_score, a.internal_notes,
    a.is_private, a.social_links, a.primary_deal_id, a.lead_score,
    a.created_at, a.updated_at,
    ps.name   AS pipeline_phase,
    ps.label  AS pipeline_phase_label
FROM accounts a
LEFT JOIN deals d ON d.id = COALESCE(
    a.primary_deal_id,
    (SELECT d2.id FROM deals d2
     WHERE d2.account_id = a.id
       AND d2.stage NOT IN (
           SELECT name FROM pipeline_stages
           WHERE (is_won = 1 OR is_lost = 1) AND workspace_id = a.workspace_id
       )
     ORDER BY d2.updated_at DESC LIMIT 1)
)
LEFT JOIN pipeline_stages ps ON ps.name = d.stage AND ps.workspace_id = a.workspace_id
WHERE a.id = ?1";

pub fn get_all(conn: &Connection, workspace_id: &str) -> Result<Vec<Account>, AppError> {
    let mut stmt = conn.prepare(JOIN_QUERY_ALL)?;
    let accounts = stmt
        .query_map([workspace_id], map_account_row)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(accounts)
}

pub fn get_by_id(conn: &Connection, id: &str) -> Result<Account, AppError> {
    conn.query_row(JOIN_QUERY_BY_ID, [id], map_account_row)
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                AppError::NotFound(format!("Account {id} not found"))
            }
            other => AppError::Db(other.to_string()),
        })
}

pub fn upsert(conn: &Connection, payload: UpsertAccountPayload) -> Result<Account, AppError> {
    let id = payload.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let now = chrono::Utc::now().to_rfc3339();
    let tags_json = serde_json::to_string(&payload.tags.unwrap_or_default())
        .map_err(|e| AppError::Validation(e.to_string()))?;
    let goals_json = serde_json::to_string(&payload.goals.unwrap_or_default())
        .map_err(|e| AppError::Validation(e.to_string()))?;

    conn.execute(
        "INSERT INTO accounts (id, workspace_id, created_by, name, kind, industry, website,
                               status, priority, tags, goals, internal_notes,
                               pending_sync, social_links, primary_deal_id, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,1,?13,?14,?15,?15)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name, kind=excluded.kind, industry=excluded.industry,
           website=excluded.website, status=excluded.status, priority=excluded.priority,
           tags=excluded.tags, goals=excluded.goals, internal_notes=excluded.internal_notes,
           social_links=excluded.social_links, primary_deal_id=excluded.primary_deal_id,
           pending_sync=1, updated_at=excluded.updated_at",
        rusqlite::params![
            id, payload.workspace_id, payload.created_by, payload.name,
            payload.kind.unwrap_or_else(|| "company".to_string()),
            payload.industry, payload.website,
            payload.status.unwrap_or_else(|| "aktiv".to_string()),
            payload.priority.unwrap_or_else(|| "normal".to_string()),
            tags_json, goals_json, payload.internal_notes,
            payload.social_links.unwrap_or_else(|| "{}".to_string()),
            payload.primary_deal_id, now,
        ],
    )?;

    let account_json = serde_json::json!({
        "id": id,
        "name": payload.name,
        "workspace_id": payload.workspace_id,
        "updated_at": now,
    });
    crate::core::sync::enqueue(conn, "accounts", &id, "INSERT", account_json)?;

    get_by_id(conn, &id)
}

pub fn set_primary_deal(
    conn: &Connection,
    account_id: &str,
    deal_id: Option<&str>,
) -> Result<Account, AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    let affected = conn.execute(
        "UPDATE accounts SET primary_deal_id = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![deal_id, now, account_id],
    )?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("Account {account_id} not found")));
    }
    get_by_id(conn, account_id)
}

pub fn delete(conn: &Connection, id: &str, workspace_id: &str) -> Result<(), AppError> {
    crate::core::sync::enqueue(
        conn, "accounts", id, "DELETE",
        serde_json::json!({"id": id, "workspace_id": workspace_id}),
    )?;
    let affected = conn.execute(
        "DELETE FROM accounts WHERE id = ?1 AND is_private = 0 AND workspace_id = ?2",
        rusqlite::params![id, workspace_id],
    )?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("Account {id} not found")));
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

    fn make_payload(id: &str, workspace_id: &str, name: &str) -> UpsertAccountPayload {
        UpsertAccountPayload {
            id: Some(id.to_string()),
            workspace_id: workspace_id.to_string(),
            created_by: "test".to_string(),
            name: name.to_string(),
            kind: None,
            industry: None,
            website: None,
            status: None,
            priority: None,
            tags: None,
            goals: None,
            internal_notes: None,
            social_links: None,
            primary_deal_id: None,
        }
    }

    #[test]
    fn upsert_creates_account() {
        let conn = setup();
        let acc = upsert(&conn, make_payload("acc-u1", "ws-1", "Muster GmbH")).unwrap();
        assert_eq!(acc.name, "Muster GmbH");
        assert_eq!(acc.kind, "company");
        assert_eq!(acc.workspace_id, "ws-1");
        assert!(!acc.is_private);
    }

    #[test]
    fn get_all_filters_private_and_workspace() {
        let conn = setup();
        upsert(&conn, make_payload("acc-v1", "ws-1", "Visible")).unwrap();
        upsert(&conn, make_payload("acc-v2", "ws-2", "Other WS")).unwrap();
        let result = get_all(&conn, "ws-1").unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].name, "Visible");
    }

    #[test]
    fn delete_removes_account() {
        let conn = setup();
        let acc = upsert(&conn, make_payload("del-1", "ws-1", "To Delete")).unwrap();
        delete(&conn, &acc.id, "ws-1").unwrap();
        assert!(get_all(&conn, "ws-1").unwrap().is_empty());
    }

    #[test]
    fn get_by_id_returns_account() {
        let conn = setup();
        let acc = upsert(&conn, make_payload("acc-1", "ws-1", "TestCo")).unwrap();
        let found = get_by_id(&conn, "acc-1").unwrap();
        assert_eq!(found.id, acc.id);
        assert_eq!(found.name, "TestCo");
    }

    #[test]
    fn get_by_id_returns_not_found() {
        let conn = setup();
        let result = get_by_id(&conn, "nonexistent");
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }

    #[test]
    fn get_all_returns_pipeline_phase_from_primary_deal() {
        let conn = setup();
        let now = "2026-01-01T00:00:00Z";
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, kind, is_private, created_at, updated_at)
             VALUES ('acc-1', 'ws-1', '', 'Test', 'company', 0, ?1, ?2)",
            rusqlite::params![now, now],
        ).unwrap();
        conn.execute(
            "INSERT INTO pipeline_stages (id, workspace_id, name, label, order_index, color, is_won, is_lost, created_at, updated_at)
             VALUES ('ps-1', 'ws-1', 'qualified', 'Qualifiziert', 1, '#3B82F6', 0, 0, ?1, ?2)",
            rusqlite::params![now, now],
        ).unwrap();
        conn.execute(
            "INSERT INTO deals (id, workspace_id, account_id, title, stage, created_at, updated_at)
             VALUES ('deal-1', 'ws-1', 'acc-1', 'Deal', 'qualified', ?1, ?2)",
            rusqlite::params![now, now],
        ).unwrap();
        set_primary_deal(&conn, "acc-1", Some("deal-1")).unwrap();
        let accounts = get_all(&conn, "ws-1").unwrap();
        let acc = accounts.iter().find(|a| a.id == "acc-1").unwrap();
        assert_eq!(acc.pipeline_phase.as_deref(), Some("qualified"));
        assert_eq!(acc.pipeline_phase_label.as_deref(), Some("Qualifiziert"));
    }

    #[test]
    fn get_all_returns_null_pipeline_phase_when_no_deals() {
        let conn = setup();
        let acc = upsert(&conn, make_payload("acc-1", "ws-1", "NoDealCo")).unwrap();
        let accounts = get_all(&conn, "ws-1").unwrap();
        let found = accounts.iter().find(|a| a.id == acc.id).unwrap();
        assert!(found.pipeline_phase.is_none());
    }

    #[test]
    fn get_all_falls_back_to_newest_active_deal() {
        let conn = setup();
        let now = "2026-01-01T00:00:00Z";
        // Insert account with no primary_deal_id
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, kind, is_private, created_at, updated_at)
             VALUES ('acc-fb', 'ws-1', '', 'FallbackCo', 'company', 0, ?1, ?2)",
            rusqlite::params![now, now],
        ).unwrap();
        // Insert pipeline stages: 'lead' (active), 'qualified' (active), 'won' (terminal)
        for (id, name, label, order, color, is_won, is_lost) in [
            ("ps-lead", "lead",      "Lead",        0i32, "#6B7280", 0i32, 0i32),
            ("ps-qual", "qualified", "Qualifiziert", 1,    "#3B82F6", 0,    0),
            ("ps-won",  "won",       "Won",          8,    "#22C55E", 1,    0),
        ] {
            conn.execute(
                "INSERT INTO pipeline_stages (id, workspace_id, name, label, order_index, color, is_won, is_lost, created_at, updated_at)
                 VALUES (?1, 'ws-1', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                rusqlite::params![id, name, label, order, color, is_won, is_lost, now, now],
            ).unwrap();
        }
        // Insert two active deals: older 'lead' and newer 'qualified'
        conn.execute(
            "INSERT INTO deals (id, workspace_id, account_id, title, stage, created_at, updated_at)
             VALUES ('deal-old', 'ws-1', 'acc-fb', 'Old', 'lead', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO deals (id, workspace_id, account_id, title, stage, created_at, updated_at)
             VALUES ('deal-new', 'ws-1', 'acc-fb', 'New', 'qualified', '2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z')",
            [],
        ).unwrap();
        // Insert a won deal that should NOT be picked up by the fallback
        conn.execute(
            "INSERT INTO deals (id, workspace_id, account_id, title, stage, created_at, updated_at)
             VALUES ('deal-won', 'ws-1', 'acc-fb', 'Won', 'won', '2026-01-01T00:00:00Z', '2026-03-01T00:00:00Z')",
            [],
        ).unwrap();
        // Fallback should return the newest active (non-won/non-lost) deal = deal-new (stage: qualified)
        let accounts = get_all(&conn, "ws-1").unwrap();
        let acc = accounts.iter().find(|a| a.id == "acc-fb").unwrap();
        assert_eq!(acc.pipeline_phase.as_deref(), Some("qualified"));
        assert_eq!(acc.pipeline_phase_label.as_deref(), Some("Qualifiziert"));
        assert!(acc.primary_deal_id.is_none());
    }

    #[test]
    fn set_primary_deal_updates_and_returns_account() {
        let conn = setup();
        let now = "2026-01-01T00:00:00Z";
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, kind, is_private, created_at, updated_at)
             VALUES ('acc-2', 'ws-1', '', 'Deal Co', 'company', 0, ?1, ?2)",
            rusqlite::params![now, now],
        ).unwrap();
        conn.execute(
            "INSERT INTO pipeline_stages (id, workspace_id, name, label, order_index, color, is_won, is_lost, created_at, updated_at)
             VALUES ('ps-2', 'ws-1', 'lead', 'Lead', 0, '#6B7280', 0, 0, ?1, ?2)",
            rusqlite::params![now, now],
        ).unwrap();
        conn.execute(
            "INSERT INTO deals (id, workspace_id, account_id, title, stage, created_at, updated_at)
             VALUES ('deal-2', 'ws-1', 'acc-2', 'Deal', 'lead', ?1, ?2)",
            rusqlite::params![now, now],
        ).unwrap();
        let acc = set_primary_deal(&conn, "acc-2", Some("deal-2")).unwrap();
        assert_eq!(acc.primary_deal_id.as_deref(), Some("deal-2"));
        assert_eq!(acc.pipeline_phase.as_deref(), Some("lead"));
    }
}
