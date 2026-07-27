use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::AppError;
use super::project_phase;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub workspace_id: String,
    pub account_id: String,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub current_phase_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
    pub retainer_monthly: f64,
    pub retainer_hours: i32,
    pub retainer_months: Option<i32>,
    pub moodboard_items: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertProjectPayload {
    pub id: Option<String>,
    pub workspace_id: String,
    pub account_id: String,
    pub title: String,
    pub description: Option<String>,
    pub retainer_monthly: f64,
    pub retainer_hours: i32,
    pub retainer_months: Option<i32>,
}

fn map_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<Project> {
    Ok(Project {
        id: r.get(0)?,
        workspace_id: r.get(1)?,
        account_id: r.get(2)?,
        title: r.get(3)?,
        description: r.get(4)?,
        status: r.get(5)?,
        current_phase_id: r.get(6)?,
        created_at: r.get(7)?,
        updated_at: r.get(8)?,
        completed_at: r.get(9)?,
        retainer_monthly: r.get(10)?,
        retainer_hours: r.get(11)?,
        retainer_months: r.get(12)?,
        moodboard_items: r.get(13)?,
    })
}

const SELECT_COLUMNS: &str =
    "id, workspace_id, account_id, title, description, status, current_phase_id, created_at, updated_at, completed_at, retainer_monthly, retainer_hours, retainer_months, moodboard_items";

pub fn get_all_for_workspace(conn: &Connection, workspace_id: &str) -> Result<Vec<Project>, AppError> {
    let sql = format!("SELECT {SELECT_COLUMNS} FROM projects WHERE workspace_id = ?1 ORDER BY created_at DESC");
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([workspace_id], map_row)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn get_by_id(conn: &Connection, id: &str) -> Result<Project, AppError> {
    let sql = format!("SELECT {SELECT_COLUMNS} FROM projects WHERE id = ?1");
    conn.query_row(&sql, [id], map_row).map_err(AppError::from)
}

pub fn upsert(conn: &Connection, payload: UpsertProjectPayload) -> Result<Project, AppError> {
    let id = payload.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO projects
           (id, workspace_id, account_id, title, description, status, created_at, updated_at,
            retainer_monthly, retainer_hours, retainer_months)
         VALUES (?1, ?2, ?3, ?4, ?5, 'active', ?6, ?6, ?7, ?8, ?9)
         ON CONFLICT(id) DO UPDATE SET
           title=excluded.title, description=excluded.description, updated_at=excluded.updated_at,
           retainer_monthly=excluded.retainer_monthly, retainer_hours=excluded.retainer_hours,
           retainer_months=excluded.retainer_months",
        rusqlite::params![
            id, payload.workspace_id, payload.account_id, payload.title, payload.description, now,
            payload.retainer_monthly, payload.retainer_hours, payload.retainer_months,
        ],
    )?;
    get_by_id(conn, &id)
}

pub fn delete(conn: &Connection, id: &str, workspace_id: &str) -> Result<(), AppError> {
    let exists: i64 = conn.query_row(
        "SELECT COUNT(*) FROM projects WHERE id = ?1 AND workspace_id = ?2",
        rusqlite::params![id, workspace_id],
        |r| r.get(0),
    )?;
    if exists == 0 {
        return Err(AppError::NotFound(format!("Project {id} not found")));
    }
    conn.execute("DELETE FROM projects WHERE id = ?1 AND workspace_id = ?2", rusqlite::params![id, workspace_id])?;
    Ok(())
}

/// Rueckt zur naechsten Phase vor (naechsthoeherer order_index). Gibt es keine
/// weitere Phase, schliesst das Projekt ab (status='completed' + completed_at).
pub fn advance_phase(conn: &Connection, project_id: &str) -> Result<Project, AppError> {
    let project = get_by_id(conn, project_id)?;
    if project.status == "completed" {
        return Err(AppError::Validation("Projekt ist bereits abgeschlossen".to_string()));
    }
    let phases = project_phase::get_all_for_project(conn, project_id)?;
    let current_index = project.current_phase_id.as_ref()
        .and_then(|cpid| phases.iter().position(|p| &p.id == cpid));
    let next_phase = match current_index {
        Some(idx) => phases.get(idx + 1),
        None => phases.first(),
    };
    let now = chrono::Utc::now().to_rfc3339();
    match next_phase {
        Some(next) => {
            conn.execute(
                "UPDATE projects SET current_phase_id = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![next.id, now, project_id],
            )?;
        }
        None => {
            conn.execute(
                "UPDATE projects SET status = 'completed', completed_at = ?1, updated_at = ?1 WHERE id = ?2",
                rusqlite::params![now, project_id],
            )?;
        }
    }
    get_by_id(conn, project_id)
}

/// Manueller Umschalter, unabhaengig vom Phasen-Fortschritt. Nur active<->paused;
/// ein abgeschlossenes Projekt kann nicht pausiert werden.
pub fn set_status(conn: &Connection, project_id: &str, status: &str) -> Result<Project, AppError> {
    if status != "active" && status != "paused" {
        return Err(AppError::Validation(format!("Ungueltiger Status: {status}")));
    }
    let project = get_by_id(conn, project_id)?;
    if project.status == "completed" {
        return Err(AppError::Validation("Abgeschlossenes Projekt kann nicht pausiert werden".to_string()));
    }
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE projects SET status = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![status, now, project_id],
    )?;
    get_by_id(conn, project_id)
}

/// Ersetzt die Moodboard-Kacheln-Liste. Rust prueft nur, dass es sich um
/// gueltiges JSON handelt (Boundary-Validierung) -- analog zu
/// update_deliverables/update_assignees auf project_phases. Bild-Kacheln
/// enthalten nur einen storageKey-Verweis, keine Bytes -- die liegen ausserhalb
/// dieser Spalte (lokal via workspace_ablage, cloud via Supabase Storage).
pub fn update_moodboard_items(conn: &Connection, id: &str, moodboard_items_json: String) -> Result<Project, AppError> {
    if serde_json::from_str::<serde_json::Value>(&moodboard_items_json).is_err() {
        return Err(AppError::Validation("moodboard_items muss gueltiges JSON sein".to_string()));
    }
    get_by_id(conn, id)?;
    conn.execute(
        "UPDATE projects SET moodboard_items = ?1 WHERE id = ?2",
        rusqlite::params![moodboard_items_json, id],
    )?;
    get_by_id(conn, id)
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
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, created_at, updated_at)
             VALUES ('a1','ws-1','u-1','Test','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')",
            [],
        ).unwrap();
        conn
    }

    fn payload(title: &str) -> UpsertProjectPayload {
        UpsertProjectPayload {
            id: None, workspace_id: "ws-1".into(), account_id: "a1".into(),
            title: title.into(), description: None,
            retainer_monthly: 0.0, retainer_hours: 0, retainer_months: None,
        }
    }

    #[test]
    fn upsert_creates_new_project_with_active_status() {
        let conn = setup();
        let p = upsert(&conn, payload("Website-Relaunch")).unwrap();
        assert_eq!(p.title, "Website-Relaunch");
        assert_eq!(p.status, "active");
        assert_eq!(p.current_phase_id, None);
        assert_eq!(p.moodboard_items, "[]");
    }

    #[test]
    fn upsert_stores_retainer_fields() {
        let conn = setup();
        let p = upsert(&conn, UpsertProjectPayload {
            retainer_monthly: 8500.0, retainer_hours: 60, retainer_months: Some(12),
            ..payload("Brand Refresh")
        }).unwrap();
        assert_eq!(p.retainer_monthly, 8500.0);
        assert_eq!(p.retainer_hours, 60);
        assert_eq!(p.retainer_months, Some(12));
    }

    #[test]
    fn upsert_updates_existing_project_title_and_retainer() {
        let conn = setup();
        let created = upsert(&conn, payload("Alt")).unwrap();
        let updated = upsert(&conn, UpsertProjectPayload {
            id: Some(created.id.clone()), description: Some("Beschreibung".into()),
            retainer_monthly: 4000.0, retainer_hours: 20, retainer_months: None,
            ..payload("Neu")
        }).unwrap();
        assert_eq!(updated.id, created.id);
        assert_eq!(updated.title, "Neu");
        assert_eq!(updated.description, Some("Beschreibung".to_string()));
        assert_eq!(updated.retainer_monthly, 4000.0);
    }

    #[test]
    fn advance_phase_moves_to_next_phase() {
        let conn = setup();
        let p = upsert(&conn, payload("Test")).unwrap();
        let phase1 = project_phase::create(&conn, project_phase::CreateProjectPhasePayload {
            project_id: p.id.clone(), name: "Konzept".into(),
            start_date: "2026-04-27".into(), end_date: "2026-05-11".into(), gate_name: "Freigabe".into(),
        }).unwrap();
        let phase2 = project_phase::create(&conn, project_phase::CreateProjectPhasePayload {
            project_id: p.id.clone(), name: "Umsetzung".into(),
            start_date: "2026-05-11".into(), end_date: "2026-06-01".into(), gate_name: "Freigabe".into(),
        }).unwrap();
        let advanced = advance_phase(&conn, &p.id).unwrap();
        assert_eq!(advanced.current_phase_id, Some(phase2.id));
        assert_eq!(advanced.status, "active");
        let _ = phase1;
    }

    #[test]
    fn advance_phase_completes_project_after_last_phase() {
        let conn = setup();
        let p = upsert(&conn, payload("Test")).unwrap();
        project_phase::create(&conn, project_phase::CreateProjectPhasePayload {
            project_id: p.id.clone(), name: "Nur Phase".into(),
            start_date: "2026-04-27".into(), end_date: "2026-05-11".into(), gate_name: "Freigabe".into(),
        }).unwrap();
        let completed = advance_phase(&conn, &p.id).unwrap();
        assert_eq!(completed.status, "completed");
        assert!(completed.completed_at.is_some());
    }

    #[test]
    fn advance_phase_rejects_already_completed_project() {
        let conn = setup();
        let p = upsert(&conn, payload("Test")).unwrap();
        project_phase::create(&conn, project_phase::CreateProjectPhasePayload {
            project_id: p.id.clone(), name: "Nur Phase".into(),
            start_date: "2026-04-27".into(), end_date: "2026-05-11".into(), gate_name: "Freigabe".into(),
        }).unwrap();
        advance_phase(&conn, &p.id).unwrap();
        let result = advance_phase(&conn, &p.id);
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn set_status_toggles_active_and_paused() {
        let conn = setup();
        let p = upsert(&conn, payload("Test")).unwrap();
        let paused = set_status(&conn, &p.id, "paused").unwrap();
        assert_eq!(paused.status, "paused");
        let reactivated = set_status(&conn, &p.id, "active").unwrap();
        assert_eq!(reactivated.status, "active");
    }

    #[test]
    fn set_status_rejects_completed_project() {
        let conn = setup();
        let p = upsert(&conn, payload("Test")).unwrap();
        project_phase::create(&conn, project_phase::CreateProjectPhasePayload {
            project_id: p.id.clone(), name: "Nur Phase".into(),
            start_date: "2026-04-27".into(), end_date: "2026-05-11".into(), gate_name: "Freigabe".into(),
        }).unwrap();
        advance_phase(&conn, &p.id).unwrap();
        let result = set_status(&conn, &p.id, "paused");
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn delete_removes_project() {
        let conn = setup();
        let p = upsert(&conn, payload("Test")).unwrap();
        delete(&conn, &p.id, "ws-1").unwrap();
        let all = get_all_for_workspace(&conn, "ws-1").unwrap();
        assert!(all.is_empty());
    }

    #[test]
    fn update_moodboard_items_stores_valid_json() {
        let conn = setup();
        let p = upsert(&conn, payload("Test")).unwrap();
        let json = r#"[{"id":"m1","kind":"note","x":10,"y":10,"w":20,"h":15,"cap":"Notiz","text":"Hallo"}]"#.to_string();
        let updated = update_moodboard_items(&conn, &p.id, json.clone()).unwrap();
        assert_eq!(updated.moodboard_items, json);
    }

    #[test]
    fn update_moodboard_items_rejects_invalid_json() {
        let conn = setup();
        let p = upsert(&conn, payload("Test")).unwrap();
        let result = update_moodboard_items(&conn, &p.id, "not json".to_string());
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn update_moodboard_items_rejects_unknown_project() {
        let conn = setup();
        let result = update_moodboard_items(&conn, "missing", "[]".to_string());
        assert!(result.is_err());
    }
}
