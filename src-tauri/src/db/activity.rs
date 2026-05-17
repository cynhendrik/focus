use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::AppError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Activity {
    pub id: String,
    pub workspace_id: String,
    pub created_by: String,
    pub account_id: String,
    pub contact_id: Option<String>,
    pub deal_id: Option<String>,
    #[serde(rename = "type")]
    pub activity_type: String,
    pub title: Option<String>,
    pub body: Option<String>,
    pub payload: String,
    pub status: String,
    pub due_at: Option<String>,
    pub assignee: Option<String>,
    pub outcome: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateActivityPayload {
    pub workspace_id: String,
    pub created_by: String,
    pub account_id: String,
    pub contact_id: Option<String>,
    pub deal_id: Option<String>,
    #[serde(rename = "type")]
    pub activity_type: String,
    pub title: Option<String>,
    pub body: Option<String>,
    pub payload: Option<String>,
    pub status: Option<String>,
    pub due_at: Option<String>,
    pub assignee: Option<String>,
    pub outcome: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateActivityPayload {
    pub title: Option<String>,
    pub body: Option<String>,
    pub payload: Option<String>,
    pub status: Option<String>,
    pub due_at: Option<String>,
    pub assignee: Option<String>,
    pub outcome: Option<String>,
}

pub fn insert(conn: &Connection, payload: CreateActivityPayload) -> Result<Activity, AppError> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO activities
         (id, workspace_id, created_by, account_id, contact_id, deal_id, type,
          title, body, payload, status, due_at, assignee, outcome, pending_sync, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,1,?15,?15)",
        rusqlite::params![
            id, payload.workspace_id, payload.created_by, payload.account_id,
            payload.contact_id, payload.deal_id, payload.activity_type,
            payload.title, payload.body,
            payload.payload.unwrap_or_else(|| "{}".into()),
            payload.status.unwrap_or_else(|| "open".into()),
            payload.due_at, payload.assignee, payload.outcome, now,
        ],
    )?;
    conn.query_row(
        "SELECT id, workspace_id, created_by, account_id, contact_id, deal_id, type,
                title, body, payload, status, due_at, assignee, outcome, created_at, updated_at
         FROM activities WHERE id = ?1", [&id], map_row,
    ).map_err(AppError::from)
}

pub fn update(conn: &Connection, id: &str, payload: UpdateActivityPayload) -> Result<Activity, AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE activities SET
           title = COALESCE(?1, title),
           body = COALESCE(?2, body),
           payload = COALESCE(?3, payload),
           status = COALESCE(?4, status),
           due_at = COALESCE(?5, due_at),
           assignee = COALESCE(?6, assignee),
           outcome = COALESCE(?7, outcome),
           pending_sync = 1, updated_at = ?8
         WHERE id = ?9",
        rusqlite::params![
            payload.title, payload.body, payload.payload,
            payload.status, payload.due_at, payload.assignee, payload.outcome, now, id,
        ],
    )?;
    conn.query_row(
        "SELECT id, workspace_id, created_by, account_id, contact_id, deal_id, type,
                title, body, payload, status, due_at, assignee, outcome, created_at, updated_at
         FROM activities WHERE id = ?1", [id], map_row,
    ).map_err(AppError::from)
}

pub fn delete(conn: &Connection, id: &str) -> Result<(), AppError> {
    let n = conn.execute("DELETE FROM activities WHERE id = ?1", [id])?;
    if n == 0 { return Err(AppError::NotFound(format!("Activity {id} not found"))); }
    Ok(())
}

pub fn get_by_account(conn: &Connection, account_id: &str) -> Result<Vec<Activity>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, created_by, account_id, contact_id, deal_id, type,
                title, body, payload, status, due_at, assignee, outcome, created_at, updated_at
         FROM activities WHERE account_id = ?1 ORDER BY created_at DESC"
    )?;
    let rows = stmt.query_map([account_id], map_row)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn get_by_deal(conn: &Connection, deal_id: &str) -> Result<Vec<Activity>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, created_by, account_id, contact_id, deal_id, type,
                title, body, payload, status, due_at, assignee, outcome, created_at, updated_at
         FROM activities WHERE deal_id = ?1 ORDER BY created_at DESC"
    )?;
    let rows = stmt.query_map([deal_id], map_row)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn get_open_tasks(conn: &Connection, workspace_id: &str) -> Result<Vec<Activity>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, created_by, account_id, contact_id, deal_id, type,
                title, body, payload, status, due_at, assignee, outcome, created_at, updated_at
         FROM activities
         WHERE workspace_id = ?1 AND type = 'task' AND status = 'open'
         ORDER BY due_at ASC NULLS LAST"
    )?;
    let rows = stmt.query_map([workspace_id], map_row)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

fn map_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<Activity> {
    Ok(Activity {
        id: r.get(0)?, workspace_id: r.get(1)?, created_by: r.get(2)?,
        account_id: r.get(3)?, contact_id: r.get(4)?, deal_id: r.get(5)?,
        activity_type: r.get(6)?, title: r.get(7)?, body: r.get(8)?,
        payload: r.get::<_, Option<String>>(9)?.unwrap_or_else(|| "{}".into()),
        status: r.get(10)?, due_at: r.get(11)?, assignee: r.get(12)?,
        outcome: r.get(13)?,
        created_at: r.get(14)?, updated_at: r.get(15)?,
    })
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
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, created_at, updated_at)
             VALUES (?1,'ws-1','u-1','Test AG','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')",
            [id],
        ).unwrap();
    }

    fn make_payload(account_id: &str, activity_type: &str) -> CreateActivityPayload {
        CreateActivityPayload {
            workspace_id: "ws-1".into(), created_by: "u-1".into(),
            account_id: account_id.into(), contact_id: None, deal_id: None,
            activity_type: activity_type.into(), title: Some("Test".into()),
            body: None, payload: None, status: None, due_at: None, assignee: None,
            outcome: None,
        }
    }

    #[test]
    fn insert_creates_note() {
        let conn = setup();
        seed_account(&conn, "a1");
        let a = insert(&conn, make_payload("a1", "note")).unwrap();
        assert_eq!(a.activity_type, "note");
        assert_eq!(a.status, "open");
    }

    #[test]
    fn get_by_account_returns_activities() {
        let conn = setup();
        seed_account(&conn, "a1");
        insert(&conn, make_payload("a1", "note")).unwrap();
        insert(&conn, make_payload("a1", "task")).unwrap();
        let activities = get_by_account(&conn, "a1").unwrap();
        assert_eq!(activities.len(), 2);
    }

    #[test]
    fn get_open_tasks_filters_correctly() {
        let conn = setup();
        seed_account(&conn, "a1");
        // open task
        insert(&conn, CreateActivityPayload {
            workspace_id: "ws-1".into(), created_by: "u-1".into(),
            account_id: "a1".into(), contact_id: None, deal_id: None,
            activity_type: "task".into(), title: Some("Open Task".into()),
            body: None, payload: None, status: Some("open".into()),
            due_at: Some("2026-06-01".into()), assignee: None, outcome: None,
        }).unwrap();
        // note (should not appear)
        insert(&conn, make_payload("a1", "note")).unwrap();
        let tasks = get_open_tasks(&conn, "ws-1").unwrap();
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].activity_type, "task");
    }

    #[test]
    fn update_changes_status() {
        let conn = setup();
        seed_account(&conn, "a1");
        let a = insert(&conn, make_payload("a1", "task")).unwrap();
        let updated = update(&conn, &a.id, UpdateActivityPayload {
            title: None, body: None, payload: None,
            status: Some("done".into()), due_at: None, assignee: None,
            outcome: None,
        }).unwrap();
        assert_eq!(updated.status, "done");
    }

    #[test]
    fn delete_removes_activity() {
        let conn = setup();
        seed_account(&conn, "a1");
        let a = insert(&conn, make_payload("a1", "note")).unwrap();
        delete(&conn, &a.id).unwrap();
        assert!(get_by_account(&conn, "a1").unwrap().is_empty());
    }

    #[test]
    fn insert_with_outcome() {
        let conn = setup();
        seed_account(&conn, "a1");
        let a = insert(&conn, CreateActivityPayload {
            workspace_id: "ws-1".into(), created_by: "u-1".into(),
            account_id: "a1".into(), contact_id: None, deal_id: None,
            activity_type: "call".into(), title: Some("Call".into()),
            body: None, payload: None, status: None, due_at: None, assignee: None,
            outcome: Some("strong_interest".into()),
        }).unwrap();
        assert_eq!(a.outcome.as_deref(), Some("strong_interest"));

        // update outcome
        let updated = update(&conn, &a.id, UpdateActivityPayload {
            title: None, body: None, payload: None,
            status: None, due_at: None, assignee: None,
            outcome: Some("deal_won".into()),
        }).unwrap();
        assert_eq!(updated.outcome.as_deref(), Some("deal_won"));
    }
}
