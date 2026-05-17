use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::AppError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PipelineStage {
    pub id: String,
    pub workspace_id: String,
    pub name: String,
    pub label: String,
    pub order_index: i32,
    pub color: String,
    pub is_won: bool,
    pub is_lost: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertPipelineStagePayload {
    pub id: Option<String>,
    pub workspace_id: String,
    pub name: String,
    pub label: String,
    pub order_index: Option<i32>,
    pub color: Option<String>,
    pub is_won: Option<bool>,
    pub is_lost: Option<bool>,
}

fn map_stage_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<PipelineStage> {
    Ok(PipelineStage {
        id:           r.get(0)?,
        workspace_id: r.get(1)?,
        name:         r.get(2)?,
        label:        r.get(3)?,
        order_index:  r.get(4)?,
        color:        r.get(5)?,
        is_won:       r.get::<_, i32>(6)? != 0,
        is_lost:      r.get::<_, i32>(7)? != 0,
        created_at:   r.get(8)?,
        updated_at:   r.get(9)?,
    })
}

pub fn get_all(conn: &Connection, workspace_id: &str) -> Result<Vec<PipelineStage>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, name, label, order_index, color, is_won, is_lost, created_at, updated_at
         FROM pipeline_stages WHERE workspace_id = ?1 ORDER BY order_index ASC"
    )?;
    let rows = stmt.query_map([workspace_id], map_stage_row)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn upsert(conn: &Connection, payload: UpsertPipelineStagePayload) -> Result<PipelineStage, AppError> {
    if let Some(ref existing_id) = payload.id {
        let result = conn.query_row(
            "SELECT workspace_id FROM pipeline_stages WHERE id = ?1",
            [existing_id],
            |r| r.get::<_, String>(0),
        );
        match result {
            Ok(ws_id) if ws_id != payload.workspace_id => {
                return Err(AppError::Validation("stage does not belong to workspace".to_string()));
            }
            Ok(_) => {} // same workspace, proceed
            Err(rusqlite::Error::QueryReturnedNoRows) => {} // new insert, proceed
            Err(e) => return Err(AppError::Db(e.to_string())),
        }
    }
    let id = payload.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO pipeline_stages
         (id, workspace_id, name, label, order_index, color, is_won, is_lost, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?9)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name, label=excluded.label,
           order_index=excluded.order_index, color=excluded.color,
           is_won=excluded.is_won, is_lost=excluded.is_lost,
           updated_at=excluded.updated_at",
        rusqlite::params![
            id, payload.workspace_id, payload.name, payload.label,
            payload.order_index.unwrap_or(0),
            payload.color.unwrap_or_else(|| "#6B7280".to_string()),
            payload.is_won.unwrap_or(false) as i32,
            payload.is_lost.unwrap_or(false) as i32,
            now,
        ],
    )?;
    conn.query_row(
        "SELECT id, workspace_id, name, label, order_index, color, is_won, is_lost, created_at, updated_at
         FROM pipeline_stages WHERE id = ?1",
        [&id], map_stage_row,
    ).map_err(AppError::from)
}

pub fn delete(conn: &Connection, id: &str, workspace_id: &str) -> Result<(), AppError> {
    let exists: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pipeline_stages WHERE id = ?1 AND workspace_id = ?2",
        rusqlite::params![id, workspace_id],
        |r| r.get(0),
    )?;
    if exists == 0 {
        return Err(AppError::NotFound(format!("Stage {id} not found")));
    }
    let name: String = conn.query_row(
        "SELECT name FROM pipeline_stages WHERE id = ?1",
        [id], |r| r.get(0),
    )?;
    let in_use: i64 = conn.query_row(
        "SELECT COUNT(*) FROM deals WHERE stage = ?1",
        [&name], |r| r.get(0),
    )?;
    if in_use > 0 {
        return Err(AppError::Validation(format!(
            "Stage '{name}' is used by {in_use} deal(s) — reassign deals before deleting"
        )));
    }
    conn.execute(
        "DELETE FROM pipeline_stages WHERE id = ?1 AND workspace_id = ?2",
        rusqlite::params![id, workspace_id],
    )?;
    Ok(())
}

pub fn reorder(conn: &Connection, workspace_id: &str, ordered_ids: &[String]) -> Result<(), AppError> {
    let tx = conn.unchecked_transaction().map_err(|e| AppError::Db(e.to_string()))?;
    for (index, id) in ordered_ids.iter().enumerate() {
        tx.execute(
            "UPDATE pipeline_stages SET order_index = ?1, updated_at = ?2 WHERE id = ?3 AND workspace_id = ?4",
            rusqlite::params![index as i32, chrono::Utc::now().to_rfc3339(), id, workspace_id],
        ).map_err(|e| AppError::Db(e.to_string()))?;
    }
    tx.commit().map_err(|e| AppError::Db(e.to_string()))?;
    Ok(())
}

pub fn seed_defaults(conn: &Connection, workspace_id: &str) -> Result<(), AppError> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pipeline_stages WHERE workspace_id = ?1",
        [workspace_id], |r| r.get(0),
    )?;
    if count > 0 { return Ok(()); }
    let defaults: &[(&str, &str, &str, bool, bool)] = &[
        ("lead",           "Lead",                "#6B7280", false, false),
        ("qualified",      "Qualifiziert",        "#3B82F6", false, false),
        ("call_1_planned", "Call 1 geplant",      "#8B5CF6", false, false),
        ("call_1_done",    "Call 1 durchgeführt", "#F59E0B", false, false),
        ("follow_up",      "Follow-Up Phase",     "#F97316", false, false),
        ("call_2",         "Call 2 / Vertiefung", "#EF4444", false, false),
        ("proposal_sent",  "Angebot gesendet",    "#06B6D4", false, false),
        ("closing",        "Closing-Phase",       "#10B981", false, false),
        ("won",            "Won",                 "#22C55E", true,  false),
        ("lost",           "Lost",                "#6B7280", false, true),
    ];
    let now = chrono::Utc::now().to_rfc3339();
    for (idx, (name, label, color, is_won, is_lost)) in defaults.iter().enumerate() {
        let id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT OR IGNORE INTO pipeline_stages
             (id, workspace_id, name, label, order_index, color, is_won, is_lost, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?9)",
            rusqlite::params![
                id, workspace_id, name, label, idx as i32,
                color, *is_won as i32, *is_lost as i32, now,
            ],
        )?;
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
    fn seed_defaults_creates_10_stages() {
        let conn = setup();
        seed_defaults(&conn, "ws-1").unwrap();
        let stages = get_all(&conn, "ws-1").unwrap();
        assert_eq!(stages.len(), 10);
        assert!(stages.iter().any(|s| s.name == "lead"));
        assert!(stages.iter().any(|s| s.name == "won" && s.is_won));
        assert!(stages.iter().any(|s| s.name == "lost" && s.is_lost));
    }

    #[test]
    fn seed_defaults_is_idempotent() {
        let conn = setup();
        seed_defaults(&conn, "ws-1").unwrap();
        seed_defaults(&conn, "ws-1").unwrap();
        let stages = get_all(&conn, "ws-1").unwrap();
        assert_eq!(stages.len(), 10);
    }

    #[test]
    fn upsert_creates_new_stage() {
        let conn = setup();
        let stage = upsert(&conn, UpsertPipelineStagePayload {
            id: None,
            workspace_id: "ws-1".into(),
            name: "custom".into(),
            label: "Custom Phase".into(),
            order_index: Some(99),
            color: Some("#FF0000".into()),
            is_won: None,
            is_lost: None,
        }).unwrap();
        assert_eq!(stage.name, "custom");
        assert_eq!(stage.label, "Custom Phase");
        assert_eq!(stage.order_index, 99);
        assert!(!stage.is_won);
    }

    #[test]
    fn upsert_updates_existing_stage() {
        let conn = setup();
        let created = upsert(&conn, UpsertPipelineStagePayload {
            id: None, workspace_id: "ws-1".into(),
            name: "custom".into(), label: "Old".into(),
            order_index: None, color: None, is_won: None, is_lost: None,
        }).unwrap();
        let updated = upsert(&conn, UpsertPipelineStagePayload {
            id: Some(created.id.clone()), workspace_id: "ws-1".into(),
            name: "custom".into(), label: "New".into(),
            order_index: None, color: None, is_won: None, is_lost: None,
        }).unwrap();
        assert_eq!(updated.id, created.id);
        assert_eq!(updated.label, "New");
    }

    #[test]
    fn upsert_rejects_cross_workspace_update() {
        let conn = setup();
        // seed defaults for ws-1
        seed_defaults(&conn, "ws-1").unwrap();
        // get a stage id from ws-1
        let stages = get_all(&conn, "ws-1").unwrap();
        let stage_id = stages[0].id.clone();
        // attempt to upsert with ws-2 and the ws-1 id
        let payload = UpsertPipelineStagePayload {
            id: Some(stage_id),
            workspace_id: "ws-2".to_string(),
            name: "hack".to_string(),
            label: "Hack".to_string(),
            order_index: None,
            color: None,
            is_won: None,
            is_lost: None,
        };
        let result = upsert(&conn, payload);
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn delete_removes_stage_not_in_use() {
        let conn = setup();
        let stage = upsert(&conn, UpsertPipelineStagePayload {
            id: None, workspace_id: "ws-1".into(),
            name: "temp".into(), label: "Temp".into(),
            order_index: None, color: None, is_won: None, is_lost: None,
        }).unwrap();
        delete(&conn, &stage.id, "ws-1").unwrap();
        let stages = get_all(&conn, "ws-1").unwrap();
        assert!(stages.iter().all(|s| s.id != stage.id));
    }

    #[test]
    fn delete_blocks_stage_in_use() {
        let conn = setup();
        seed_defaults(&conn, "ws-1").unwrap();
        // Insert an account and a deal using 'lead' stage
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, created_at, updated_at)
             VALUES ('a1','ws-1','u-1','Test','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO deals (id, workspace_id, created_by, account_id, title, stage, created_at, updated_at)
             VALUES ('d1','ws-1','u-1','a1','Deal','lead','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')",
            [],
        ).unwrap();
        let lead_stage = get_all(&conn, "ws-1").unwrap()
            .into_iter().find(|s| s.name == "lead").unwrap();
        let result = delete(&conn, &lead_stage.id, "ws-1");
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), AppError::Validation(_)));
    }

    #[test]
    fn reorder_updates_order_index() {
        let conn = setup();
        seed_defaults(&conn, "ws-1").unwrap();
        let stages = get_all(&conn, "ws-1").unwrap();
        // Reverse order
        let reversed_ids: Vec<String> = stages.iter().rev().map(|s| s.id.clone()).collect();
        reorder(&conn, "ws-1", &reversed_ids).unwrap();
        let reordered = get_all(&conn, "ws-1").unwrap();
        // First stage after reorder should have been last before
        assert_eq!(reordered[0].id, stages.last().unwrap().id);
    }

    #[test]
    fn get_all_returns_stages_for_workspace_only() {
        let conn = setup();
        seed_defaults(&conn, "ws-1").unwrap();
        seed_defaults(&conn, "ws-2").unwrap();
        let ws1_stages = get_all(&conn, "ws-1").unwrap();
        let ws2_stages = get_all(&conn, "ws-2").unwrap();
        assert_eq!(ws1_stages.len(), 10);
        assert_eq!(ws2_stages.len(), 10);
        assert_ne!(ws1_stages[0].id, ws2_stages[0].id);
    }
}
