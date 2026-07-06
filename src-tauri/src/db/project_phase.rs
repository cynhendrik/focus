use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::AppError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPhase {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub order_index: i32,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectPhasePayload {
    pub project_id: String,
    pub name: String,
}

fn map_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<ProjectPhase> {
    Ok(ProjectPhase {
        id: r.get(0)?,
        project_id: r.get(1)?,
        name: r.get(2)?,
        order_index: r.get(3)?,
        created_at: r.get(4)?,
    })
}

pub fn get_all_for_project(conn: &Connection, project_id: &str) -> Result<Vec<ProjectPhase>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, name, order_index, created_at
         FROM project_phases WHERE project_id = ?1 ORDER BY order_index ASC"
    )?;
    let rows = stmt.query_map([project_id], map_row)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// Haengt eine neue Phase ans Ende an (order_index = aktuelles Maximum + 1).
/// Ist es die erste Phase des Projekts, wird sie automatisch zur aktuellen
/// Phase des Projekts (projects.current_phase_id), da ein frisch angelegtes
/// Projekt sonst keine "wo stehen wir"-Antwort haette.
pub fn create(conn: &Connection, payload: CreateProjectPhasePayload) -> Result<ProjectPhase, AppError> {
    let existing = get_all_for_project(conn, &payload.project_id)?;
    let order_index = existing.iter().map(|p| p.order_index).max().map(|m| m + 1).unwrap_or(0);
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO project_phases (id, project_id, name, order_index, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![id, payload.project_id, payload.name, order_index, now],
    )?;
    if existing.is_empty() {
        conn.execute(
            "UPDATE projects SET current_phase_id = ?1 WHERE id = ?2 AND current_phase_id IS NULL",
            rusqlite::params![id, payload.project_id],
        )?;
    }
    conn.query_row(
        "SELECT id, project_id, name, order_index, created_at FROM project_phases WHERE id = ?1",
        [&id], map_row,
    ).map_err(AppError::from)
}

/// Blockiert das Loeschen der aktuellen Phase eines Projekts (sonst verliert
/// das Projekt seinen current_phase_id-Zeiger). Aufgaben, die per payload-JSON
/// auf diese Phase zeigen, werden NICHT geprueft (siehe Plan-Notiz: project_phase_id
/// lebt im JSON-payload der activities, nicht in einer abfragbaren Spalte --
/// aus SQL heraus nicht ohne JSON-Extraktion pruefbar; bewusst out of scope fuer v1).
pub fn delete(conn: &Connection, id: &str, project_id: &str) -> Result<(), AppError> {
    let exists: i64 = conn.query_row(
        "SELECT COUNT(*) FROM project_phases WHERE id = ?1 AND project_id = ?2",
        rusqlite::params![id, project_id],
        |r| r.get(0),
    )?;
    if exists == 0 {
        return Err(AppError::NotFound(format!("Phase {id} not found")));
    }
    let is_current: i64 = conn.query_row(
        "SELECT COUNT(*) FROM projects WHERE id = ?1 AND current_phase_id = ?2",
        rusqlite::params![project_id, id],
        |r| r.get(0),
    )?;
    if is_current > 0 {
        return Err(AppError::Validation(
            "Aktuelle Phase kann nicht geloescht werden -- zuerst eine andere Phase aktivieren".to_string(),
        ));
    }
    conn.execute(
        "DELETE FROM project_phases WHERE id = ?1 AND project_id = ?2",
        rusqlite::params![id, project_id],
    )?;
    Ok(())
}

pub fn reorder(conn: &Connection, project_id: &str, ordered_ids: &[String]) -> Result<(), AppError> {
    let tx = conn.unchecked_transaction().map_err(|e| AppError::Db(e.to_string()))?;
    for (index, id) in ordered_ids.iter().enumerate() {
        tx.execute(
            "UPDATE project_phases SET order_index = ?1 WHERE id = ?2 AND project_id = ?3",
            rusqlite::params![index as i32, id, project_id],
        ).map_err(|e| AppError::Db(e.to_string()))?;
    }
    tx.commit().map_err(|e| AppError::Db(e.to_string()))?;
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
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, created_at, updated_at)
             VALUES ('a1','ws-1','u-1','Test','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO projects (id, workspace_id, account_id, title, status, created_at, updated_at)
             VALUES ('p1','ws-1','a1','Test-Projekt','active','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')",
            [],
        ).unwrap();
        conn
    }

    #[test]
    fn create_first_phase_becomes_current_phase_of_project() {
        let conn = setup();
        let phase = create(&conn, CreateProjectPhasePayload { project_id: "p1".into(), name: "Konzept".into() }).unwrap();
        assert_eq!(phase.order_index, 0);
        let current: Option<String> = conn.query_row(
            "SELECT current_phase_id FROM projects WHERE id = 'p1'", [], |r| r.get(0),
        ).unwrap();
        assert_eq!(current, Some(phase.id));
    }

    #[test]
    fn create_second_phase_does_not_change_current_phase() {
        let conn = setup();
        let first = create(&conn, CreateProjectPhasePayload { project_id: "p1".into(), name: "Konzept".into() }).unwrap();
        let _second = create(&conn, CreateProjectPhasePayload { project_id: "p1".into(), name: "Umsetzung".into() }).unwrap();
        let current: Option<String> = conn.query_row(
            "SELECT current_phase_id FROM projects WHERE id = 'p1'", [], |r| r.get(0),
        ).unwrap();
        assert_eq!(current, Some(first.id));
    }

    #[test]
    fn get_all_for_project_orders_by_order_index() {
        let conn = setup();
        create(&conn, CreateProjectPhasePayload { project_id: "p1".into(), name: "Konzept".into() }).unwrap();
        create(&conn, CreateProjectPhasePayload { project_id: "p1".into(), name: "Umsetzung".into() }).unwrap();
        let phases = get_all_for_project(&conn, "p1").unwrap();
        assert_eq!(phases.len(), 2);
        assert_eq!(phases[0].name, "Konzept");
        assert_eq!(phases[1].name, "Umsetzung");
    }

    #[test]
    fn delete_blocks_current_phase() {
        let conn = setup();
        let phase = create(&conn, CreateProjectPhasePayload { project_id: "p1".into(), name: "Konzept".into() }).unwrap();
        let result = delete(&conn, &phase.id, "p1");
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn delete_removes_non_current_phase() {
        let conn = setup();
        create(&conn, CreateProjectPhasePayload { project_id: "p1".into(), name: "Konzept".into() }).unwrap();
        let second = create(&conn, CreateProjectPhasePayload { project_id: "p1".into(), name: "Umsetzung".into() }).unwrap();
        delete(&conn, &second.id, "p1").unwrap();
        let phases = get_all_for_project(&conn, "p1").unwrap();
        assert_eq!(phases.len(), 1);
    }

    #[test]
    fn reorder_updates_order_index() {
        let conn = setup();
        let a = create(&conn, CreateProjectPhasePayload { project_id: "p1".into(), name: "A".into() }).unwrap();
        let b = create(&conn, CreateProjectPhasePayload { project_id: "p1".into(), name: "B".into() }).unwrap();
        reorder(&conn, "p1", &[b.id.clone(), a.id.clone()]).unwrap();
        let phases = get_all_for_project(&conn, "p1").unwrap();
        assert_eq!(phases[0].id, b.id);
        assert_eq!(phases[1].id, a.id);
    }
}
