use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::AppError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LeadStage {
    pub id: String,
    pub workspace_id: String,
    pub name: String,
    pub label: String,
    pub order_index: i32,
    pub color: String,
    pub is_qualified: bool,
    pub is_disqualified: bool,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertLeadStagePayload {
    pub id: Option<String>,
    pub workspace_id: String,
    pub name: String,
    pub label: String,
    pub order_index: Option<i32>,
    pub color: Option<String>,
    pub is_qualified: Option<bool>,
    pub is_disqualified: Option<bool>,
}

fn map_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<LeadStage> {
    Ok(LeadStage {
        id:               r.get(0)?,
        workspace_id:     r.get(1)?,
        name:             r.get(2)?,
        label:            r.get(3)?,
        order_index:      r.get(4)?,
        color:            r.get(5)?,
        is_qualified:     r.get::<_, i32>(6)? != 0,
        is_disqualified:  r.get::<_, i32>(7)? != 0,
        created_at:       r.get(8)?,
    })
}

pub fn get_all(conn: &Connection, workspace_id: &str) -> Result<Vec<LeadStage>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, name, label, order_index, color, is_qualified, is_disqualified, created_at
         FROM lead_stages WHERE workspace_id = ?1 ORDER BY order_index ASC"
    )?;
    let rows = stmt.query_map([workspace_id], map_row)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn upsert(conn: &Connection, payload: UpsertLeadStagePayload) -> Result<LeadStage, AppError> {
    if let Some(ref existing_id) = payload.id {
        let result = conn.query_row(
            "SELECT workspace_id FROM lead_stages WHERE id = ?1",
            [existing_id],
            |r| r.get::<_, String>(0),
        );
        match result {
            Ok(ws_id) if ws_id != payload.workspace_id =>
                return Err(AppError::Validation("stage does not belong to workspace".into())),
            Ok(_) => {}
            Err(rusqlite::Error::QueryReturnedNoRows) => {}
            Err(e) => return Err(AppError::Db(e.to_string())),
        }
    }
    let id = payload.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO lead_stages
         (id, workspace_id, name, label, order_index, color, is_qualified, is_disqualified, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name, label=excluded.label,
           order_index=excluded.order_index, color=excluded.color",
        rusqlite::params![
            id, payload.workspace_id, payload.name, payload.label,
            payload.order_index.unwrap_or(0),
            payload.color.unwrap_or_else(|| "#6B7280".to_string()),
            payload.is_qualified.unwrap_or(false) as i32,
            payload.is_disqualified.unwrap_or(false) as i32,
            now,
        ],
    )?;
    conn.query_row(
        "SELECT id, workspace_id, name, label, order_index, color, is_qualified, is_disqualified, created_at
         FROM lead_stages WHERE id = ?1",
        [&id], map_row,
    ).map_err(AppError::from)
}

pub fn delete(conn: &Connection, id: &str, workspace_id: &str) -> Result<(), AppError> {
    let row = conn.query_row(
        "SELECT is_qualified, is_disqualified FROM lead_stages WHERE id = ?1 AND workspace_id = ?2",
        rusqlite::params![id, workspace_id],
        |r| Ok((r.get::<_, i32>(0)?, r.get::<_, i32>(1)?)),
    ).map_err(|_| AppError::NotFound(format!("Stage {id} not found")))?;
    if row.0 != 0 || row.1 != 0 {
        return Err(AppError::Validation("Terminal-Stages können nicht gelöscht werden".into()));
    }
    conn.execute(
        "DELETE FROM lead_stages WHERE id = ?1 AND workspace_id = ?2",
        rusqlite::params![id, workspace_id],
    )?;
    Ok(())
}

pub fn reorder(conn: &Connection, workspace_id: &str, ordered_ids: &[String]) -> Result<(), AppError> {
    let tx = conn.unchecked_transaction().map_err(|e| AppError::Db(e.to_string()))?;
    for (index, id) in ordered_ids.iter().enumerate() {
        tx.execute(
            "UPDATE lead_stages SET order_index = ?1 WHERE id = ?2 AND workspace_id = ?3",
            rusqlite::params![index as i32, id, workspace_id],
        ).map_err(|e| AppError::Db(e.to_string()))?;
    }
    tx.commit().map_err(|e| AppError::Db(e.to_string()))?;
    Ok(())
}

pub fn seed_defaults(conn: &Connection, workspace_id: &str) -> Result<(), AppError> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM lead_stages WHERE workspace_id = ?1",
        [workspace_id], |r| r.get(0),
    ).map_err(|e| AppError::Db(e.to_string()))?;
    if count > 0 { return Ok(()); }

    let tx = conn.unchecked_transaction().map_err(|e| AppError::Db(e.to_string()))?;
    let now = chrono::Utc::now().to_rfc3339();
    let defaults: &[(&str, &str, &str, bool, bool)] = &[
        ("neu",             "Neu",             "#60a5fa", false, false),
        ("kontaktiert",     "Kontaktiert",     "#fbbf24", false, false),
        ("warm",            "Warm",            "#4ade80", false, false),
        ("qualifiziert",    "Qualifiziert",    "#D0FC69", true,  false),
        ("disqualifiziert", "Disqualifiziert", "#6B7280", false, true),
    ];
    for (idx, (name, label, color, is_qual, is_disqual)) in defaults.iter().enumerate() {
        tx.execute(
            "INSERT INTO lead_stages
             (id, workspace_id, name, label, order_index, color, is_qualified, is_disqualified, created_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
            rusqlite::params![
                uuid::Uuid::new_v4().to_string(),
                workspace_id, name, label, idx as i32,
                color, *is_qual as i32, *is_disqual as i32, now,
            ],
        ).map_err(|e| AppError::Db(e.to_string()))?;
    }
    tx.commit().map_err(|e| AppError::Db(e.to_string()))?;
    Ok(())
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

    #[test]
    fn seed_creates_5_default_stages() {
        let conn = setup();
        seed_defaults(&conn, "ws-1").unwrap();
        let stages = get_all(&conn, "ws-1").unwrap();
        assert_eq!(stages.len(), 5);
        assert!(stages.iter().any(|s| s.name == "qualifiziert" && s.is_qualified));
        assert!(stages.iter().any(|s| s.name == "disqualifiziert" && s.is_disqualified));
    }

    #[test]
    fn seed_is_idempotent() {
        let conn = setup();
        seed_defaults(&conn, "ws-1").unwrap();
        seed_defaults(&conn, "ws-1").unwrap();
        let stages = get_all(&conn, "ws-1").unwrap();
        assert_eq!(stages.len(), 5);
    }

    #[test]
    fn delete_blocks_terminal_stages() {
        let conn = setup();
        seed_defaults(&conn, "ws-1").unwrap();
        let stages = get_all(&conn, "ws-1").unwrap();
        let qual = stages.iter().find(|s| s.is_qualified).unwrap();
        let result = delete(&conn, &qual.id, "ws-1");
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn delete_removes_custom_stage() {
        let conn = setup();
        let stage = upsert(&conn, UpsertLeadStagePayload {
            id: None, workspace_id: "ws-1".into(),
            name: "temp".into(), label: "Temp".into(),
            order_index: Some(99), color: Some("#FF0000".into()),
            is_qualified: None, is_disqualified: None,
        }).unwrap();
        delete(&conn, &stage.id, "ws-1").unwrap();
        let stages = get_all(&conn, "ws-1").unwrap();
        assert!(stages.iter().all(|s| s.id != stage.id));
    }

    #[test]
    fn upsert_creates_and_updates() {
        let conn = setup();
        let created = upsert(&conn, UpsertLeadStagePayload {
            id: None, workspace_id: "ws-1".into(),
            name: "custom".into(), label: "Old".into(),
            order_index: Some(10), color: None,
            is_qualified: None, is_disqualified: None,
        }).unwrap();
        assert_eq!(created.label, "Old");
        let updated = upsert(&conn, UpsertLeadStagePayload {
            id: Some(created.id.clone()), workspace_id: "ws-1".into(),
            name: "custom".into(), label: "New".into(),
            order_index: Some(10), color: None,
            is_qualified: None, is_disqualified: None,
        }).unwrap();
        assert_eq!(updated.id, created.id);
        assert_eq!(updated.label, "New");
    }

    #[test]
    fn reorder_updates_order_index() {
        let conn = setup();
        seed_defaults(&conn, "ws-1").unwrap();
        let stages = get_all(&conn, "ws-1").unwrap();
        let reversed: Vec<String> = stages.iter().rev().map(|s| s.id.clone()).collect();
        reorder(&conn, "ws-1", &reversed).unwrap();
        let reordered = get_all(&conn, "ws-1").unwrap();
        assert_eq!(reordered[0].id, stages.last().unwrap().id);
    }
}
