use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::AppError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PreparedItem {
    pub id: String,
    pub workspace_id: String,
    #[serde(rename = "type")]
    pub item_type: String,
    pub source_kind: String,
    pub source_id: String,
    pub assignee: Option<String>,
    pub payload: String,
    pub score: f64,
    pub status: String,
    pub snooze_until: Option<String>,
    pub rule_id: String,
    pub created_at: String,
    pub updated_at: String,
    pub approved_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePreparedItemPayload {
    pub workspace_id: String,
    #[serde(rename = "type")]
    pub item_type: String,
    pub source_kind: String,
    pub source_id: String,
    pub assignee: Option<String>,
    pub payload: String,
    pub score: f64,
    pub rule_id: String,
}

const SELECT_COLS: &str = "id, workspace_id, type, source_kind, source_id, assignee, payload, score, status, snooze_until, rule_id, created_at, updated_at, approved_at";

fn map_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<PreparedItem> {
    Ok(PreparedItem {
        id: r.get(0)?, workspace_id: r.get(1)?, item_type: r.get(2)?,
        source_kind: r.get(3)?, source_id: r.get(4)?, assignee: r.get(5)?,
        payload: r.get(6)?, score: r.get(7)?, status: r.get(8)?,
        snooze_until: r.get(9)?, rule_id: r.get(10)?, created_at: r.get(11)?,
        updated_at: r.get(12)?, approved_at: r.get(13)?,
    })
}

fn get_by_id(conn: &Connection, id: &str) -> Result<PreparedItem, AppError> {
    conn.query_row(&format!("SELECT {SELECT_COLS} FROM prepared_items WHERE id=?1"), [id], map_row)
        .map_err(AppError::from)
}

/// Idempotenter Insert — genau eine Karte pro Quelle. true = neu eingefügt.
/// Verworfene/erledigte Karten werden NIE wiederbelebt (INSERT OR IGNORE).
pub fn insert_ignore(conn: &Connection, p: CreatePreparedItemPayload) -> Result<bool, AppError> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let n = conn.execute(
        "INSERT OR IGNORE INTO prepared_items
         (id, workspace_id, type, source_kind, source_id, assignee, payload, score, rule_id, status, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'pending',?10,?10)",
        rusqlite::params![id, p.workspace_id, p.item_type, p.source_kind, p.source_id, p.assignee, p.payload, p.score, p.rule_id, now],
    )?;
    Ok(n > 0)
}

pub fn get_active(conn: &Connection, workspace_id: &str) -> Result<Vec<PreparedItem>, AppError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {SELECT_COLS} FROM prepared_items
         WHERE workspace_id=?1 AND status IN ('pending','snoozed')
         ORDER BY score DESC, created_at ASC"
    ))?;
    let rows = stmt.query_map([workspace_id], map_row)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn update_status(
    conn: &Connection, id: &str, status: &str,
    snooze_until: Option<String>, approved_at: Option<String>,
) -> Result<PreparedItem, AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    let n = conn.execute(
        "UPDATE prepared_items SET status=?2, snooze_until=?3, approved_at=?4, updated_at=?5 WHERE id=?1",
        rusqlite::params![id, status, snooze_until, approved_at, now],
    )?;
    if n == 0 { return Err(AppError::NotFound(format!("PreparedItem {id} not found"))); }
    get_by_id(conn, id)
}

pub fn update_payload(conn: &Connection, id: &str, payload: &str) -> Result<PreparedItem, AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    let n = conn.execute(
        "UPDATE prepared_items SET payload=?2, updated_at=?3 WHERE id=?1",
        rusqlite::params![id, payload, now],
    )?;
    if n == 0 { return Err(AppError::NotFound(format!("PreparedItem {id} not found"))); }
    get_by_id(conn, id)
}

pub fn set_assignee(conn: &Connection, id: &str, assignee: Option<String>) -> Result<PreparedItem, AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    let n = conn.execute(
        "UPDATE prepared_items SET assignee=?2, updated_at=?3 WHERE id=?1",
        rusqlite::params![id, assignee, now],
    )?;
    if n == 0 { return Err(AppError::NotFound(format!("PreparedItem {id} not found"))); }
    get_by_id(conn, id)
}

pub fn get_approved_since(conn: &Connection, workspace_id: &str, since: &str) -> Result<Vec<PreparedItem>, AppError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {SELECT_COLS} FROM prepared_items
         WHERE workspace_id=?1 AND status='approved' AND approved_at >= ?2
         ORDER BY approved_at DESC"
    ))?;
    let rows = stmt.query_map([workspace_id, since], map_row)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{schema, migrations};

    fn setup() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        schema::create_tables(&conn).unwrap();
        migrations::run(&conn).unwrap();
        conn
    }

    fn payload(source_id: &str) -> CreatePreparedItemPayload {
        CreatePreparedItemPayload {
            workspace_id: "ws1".into(),
            item_type: "mahnung".into(),
            source_kind: "invoice_reminder".into(),
            source_id: source_id.into(),
            assignee: None,
            payload: r#"{"title":"Test"}"#.into(),
            score: 1000.0,
            rule_id: "mahnung-l0".into(),
        }
    }

    #[test]
    fn insert_ignore_dedupes_on_source() {
        let conn = setup();
        assert!(insert_ignore(&conn, payload("inv1:0")).unwrap());
        assert!(!insert_ignore(&conn, payload("inv1:0")).unwrap()); // Duplikat → false
        assert_eq!(get_active(&conn, "ws1").unwrap().len(), 1);
    }

    #[test]
    fn dismissed_items_are_not_active_and_not_resurrected() {
        let conn = setup();
        insert_ignore(&conn, payload("inv1:0")).unwrap();
        let id: String = conn.query_row("SELECT id FROM prepared_items LIMIT 1", [], |r| r.get(0)).unwrap();
        update_status(&conn, &id, "dismissed", None, None).unwrap();
        assert_eq!(get_active(&conn, "ws1").unwrap().len(), 0);
        // Erneuter Insert derselben Quelle: ignoriert, Karte bleibt dismissed.
        assert!(!insert_ignore(&conn, payload("inv1:0")).unwrap());
        let status: String = conn.query_row("SELECT status FROM prepared_items WHERE id=?1", [&id], |r| r.get(0)).unwrap();
        assert_eq!(status, "dismissed");
    }

    #[test]
    fn approved_since_returns_only_approved_in_window() {
        let conn = setup();
        insert_ignore(&conn, payload("inv1:0")).unwrap();
        insert_ignore(&conn, payload("inv2:0")).unwrap();
        let id: String = conn.query_row("SELECT id FROM prepared_items WHERE source_id='inv1:0'", [], |r| r.get(0)).unwrap();
        update_status(&conn, &id, "approved", None, Some("2026-07-01T08:00:00Z".into())).unwrap();
        let hits = get_approved_since(&conn, "ws1", "2026-06-29T00:00:00Z").unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].source_id, "inv1:0");
        assert!(get_approved_since(&conn, "ws1", "2026-07-02T00:00:00Z").unwrap().is_empty());
    }
}
