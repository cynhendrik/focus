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
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertProjectPayload {
    pub id: Option<String>,
    pub workspace_id: String,
    pub account_id: String,
    pub title: String,
    pub description: Option<String>,
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
    })
}

const SELECT_COLUMNS: &str =
    "id, workspace_id, account_id, title, description, status, current_phase_id, created_at, updated_at, completed_at";

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
        "INSERT INTO projects (id, workspace_id, account_id, title, description, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'active', ?6, ?6)
         ON CONFLICT(id) DO UPDATE SET
           title=excluded.title, description=excluded.description, updated_at=excluded.updated_at",
        rusqlite::params![id, payload.workspace_id, payload.account_id, payload.title, payload.description, now],
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

    #[test]
    fn upsert_creates_new_project_with_active_status() {
        let conn = setup();
        let p = upsert(&conn, UpsertProjectPayload {
            id: None, workspace_id: "ws-1".into(), account_id: "a1".into(),
            title: "Website-Relaunch".into(), description: None,
        }).unwrap();
        assert_eq!(p.title, "Website-Relaunch");
        assert_eq!(p.status, "active");
        assert_eq!(p.current_phase_id, None);
    }

    #[test]
    fn upsert_updates_existing_project_title() {
        let conn = setup();
        let created = upsert(&conn, UpsertProjectPayload {
            id: None, workspace_id: "ws-1".into(), account_id: "a1".into(),
            title: "Alt".into(), description: None,
        }).unwrap();
        let updated = upsert(&conn, UpsertProjectPayload {
            id: Some(created.id.clone()), workspace_id: "ws-1".into(), account_id: "a1".into(),
            title: "Neu".into(), description: Some("Beschreibung".into()),
        }).unwrap();
        assert_eq!(updated.id, created.id);
        assert_eq!(updated.title, "Neu");
        assert_eq!(updated.description, Some("Beschreibung".to_string()));
    }

    #[test]
    fn advance_phase_moves_to_next_phase() {
        let conn = setup();
        let p = upsert(&conn, UpsertProjectPayload {
            id: None, workspace_id: "ws-1".into(), account_id: "a1".into(),
            title: "Test".into(), description: None,
        }).unwrap();
        let phase1 = project_phase::create(&conn, project_phase::CreateProjectPhasePayload {
            project_id: p.id.clone(), name: "Konzept".into(),
        }).unwrap();
        let phase2 = project_phase::create(&conn, project_phase::CreateProjectPhasePayload {
            project_id: p.id.clone(), name: "Umsetzung".into(),
        }).unwrap();
        let advanced = advance_phase(&conn, &p.id).unwrap();
        assert_eq!(advanced.current_phase_id, Some(phase2.id));
        assert_eq!(advanced.status, "active");
        let _ = phase1; // erste Phase wird nicht mehr referenziert, aber existiert weiterhin
    }

    #[test]
    fn advance_phase_completes_project_after_last_phase() {
        let conn = setup();
        let p = upsert(&conn, UpsertProjectPayload {
            id: None, workspace_id: "ws-1".into(), account_id: "a1".into(),
            title: "Test".into(), description: None,
        }).unwrap();
        project_phase::create(&conn, project_phase::CreateProjectPhasePayload {
            project_id: p.id.clone(), name: "Nur Phase".into(),
        }).unwrap();
        let completed = advance_phase(&conn, &p.id).unwrap();
        assert_eq!(completed.status, "completed");
        assert!(completed.completed_at.is_some());
    }

    #[test]
    fn advance_phase_rejects_already_completed_project() {
        let conn = setup();
        let p = upsert(&conn, UpsertProjectPayload {
            id: None, workspace_id: "ws-1".into(), account_id: "a1".into(),
            title: "Test".into(), description: None,
        }).unwrap();
        project_phase::create(&conn, project_phase::CreateProjectPhasePayload {
            project_id: p.id.clone(), name: "Nur Phase".into(),
        }).unwrap();
        advance_phase(&conn, &p.id).unwrap(); // -> completed
        let result = advance_phase(&conn, &p.id);
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn set_status_toggles_active_and_paused() {
        let conn = setup();
        let p = upsert(&conn, UpsertProjectPayload {
            id: None, workspace_id: "ws-1".into(), account_id: "a1".into(),
            title: "Test".into(), description: None,
        }).unwrap();
        let paused = set_status(&conn, &p.id, "paused").unwrap();
        assert_eq!(paused.status, "paused");
        let reactivated = set_status(&conn, &p.id, "active").unwrap();
        assert_eq!(reactivated.status, "active");
    }

    #[test]
    fn set_status_rejects_completed_project() {
        let conn = setup();
        let p = upsert(&conn, UpsertProjectPayload {
            id: None, workspace_id: "ws-1".into(), account_id: "a1".into(),
            title: "Test".into(), description: None,
        }).unwrap();
        project_phase::create(&conn, project_phase::CreateProjectPhasePayload {
            project_id: p.id.clone(), name: "Nur Phase".into(),
        }).unwrap();
        advance_phase(&conn, &p.id).unwrap(); // -> completed
        let result = set_status(&conn, &p.id, "paused");
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn delete_removes_project() {
        let conn = setup();
        let p = upsert(&conn, UpsertProjectPayload {
            id: None, workspace_id: "ws-1".into(), account_id: "a1".into(),
            title: "Test".into(), description: None,
        }).unwrap();
        delete(&conn, &p.id, "ws-1").unwrap();
        let all = get_all_for_workspace(&conn, "ws-1").unwrap();
        assert!(all.is_empty());
    }
}
