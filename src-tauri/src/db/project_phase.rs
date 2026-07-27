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
    pub start_date: String,
    pub end_date: String,
    pub gate_name: String,
    pub gate_state: String,
    pub gate_date: Option<String>,
    pub gate_approved_by: Option<String>,
    pub progress_percent: i32,
    pub deliverables: String,
    pub assignee_ids: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectPhasePayload {
    pub project_id: String,
    pub name: String,
    pub start_date: String,
    pub end_date: String,
    pub gate_name: String,
}

const SELECT_COLUMNS: &str =
    "id, project_id, name, order_index, created_at, start_date, end_date, gate_name, gate_state, gate_date, gate_approved_by, progress_percent, deliverables, assignee_ids";

fn map_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<ProjectPhase> {
    Ok(ProjectPhase {
        id: r.get(0)?,
        project_id: r.get(1)?,
        name: r.get(2)?,
        order_index: r.get(3)?,
        created_at: r.get(4)?,
        start_date: r.get(5)?,
        end_date: r.get(6)?,
        gate_name: r.get(7)?,
        gate_state: r.get(8)?,
        gate_date: r.get(9)?,
        gate_approved_by: r.get(10)?,
        progress_percent: r.get(11)?,
        deliverables: r.get(12)?,
        assignee_ids: r.get(13)?,
    })
}

pub fn get_all_for_project(conn: &Connection, project_id: &str) -> Result<Vec<ProjectPhase>, AppError> {
    let sql = format!("SELECT {SELECT_COLUMNS} FROM project_phases WHERE project_id = ?1 ORDER BY order_index ASC");
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([project_id], map_row)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// Einzelne Phase per id+project_id, mit korrekter NotFound-Konvertierung.
/// Von request_gate/approve_gate/update_deliverables genutzt, um Existenz-Check
/// und aktuellen Zustand in einer Abfrage zu bekommen (statt separatem COUNT(*)).
fn get_by_id(conn: &Connection, id: &str, project_id: &str) -> Result<ProjectPhase, AppError> {
    let sql = format!("SELECT {SELECT_COLUMNS} FROM project_phases WHERE id = ?1 AND project_id = ?2");
    conn.query_row(&sql, rusqlite::params![id, project_id], map_row)
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(format!("Phase {id} not found")),
            other => AppError::from(other),
        })
}

/// Haengt eine neue Phase ans Ende an (order_index = aktuelles Maximum + 1).
/// gate_state startet immer 'open', progress_percent immer 0 -- der volle
/// Freigabe-Workflow (Gate manuell auf 'pending'/'approved' setzen) kommt erst
/// mit dem Phasen-Tab (Etappe 3). Ist es die erste Phase des Projekts, wird sie
/// automatisch zur aktuellen Phase des Projekts (projects.current_phase_id).
pub fn create(conn: &Connection, payload: CreateProjectPhasePayload) -> Result<ProjectPhase, AppError> {
    let existing = get_all_for_project(conn, &payload.project_id)?;
    let order_index = existing.iter().map(|p| p.order_index).max().map(|m| m + 1).unwrap_or(0);
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO project_phases
           (id, project_id, name, order_index, created_at, start_date, end_date, gate_name, gate_state, progress_percent)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'open', 0)",
        rusqlite::params![
            id, payload.project_id, payload.name, order_index, now,
            payload.start_date, payload.end_date, payload.gate_name,
        ],
    )?;
    if existing.is_empty() {
        conn.execute(
            "UPDATE projects SET current_phase_id = ?1 WHERE id = ?2 AND current_phase_id IS NULL",
            rusqlite::params![id, payload.project_id],
        )?;
    }
    let sql = format!("SELECT {SELECT_COLUMNS} FROM project_phases WHERE id = ?1");
    conn.query_row(&sql, [&id], map_row).map_err(AppError::from)
}

/// Manuelles Fortschritts-Prozent fuer die Timeline-Uebersicht (Etappe 1).
/// Kein Deliverables-basiertes Auto-Tracking -- das kommt mit Etappe 3.
pub fn update_progress(conn: &Connection, id: &str, project_id: &str, progress_percent: i32) -> Result<ProjectPhase, AppError> {
    if !(0..=100).contains(&progress_percent) {
        return Err(AppError::Validation("progress_percent muss zwischen 0 und 100 liegen".to_string()));
    }
    let exists: i64 = conn.query_row(
        "SELECT COUNT(*) FROM project_phases WHERE id = ?1 AND project_id = ?2",
        rusqlite::params![id, project_id],
        |r| r.get(0),
    )?;
    if exists == 0 {
        return Err(AppError::NotFound(format!("Phase {id} not found")));
    }
    conn.execute(
        "UPDATE project_phases SET progress_percent = ?1 WHERE id = ?2 AND project_id = ?3",
        rusqlite::params![progress_percent, id, project_id],
    )?;
    let sql = format!("SELECT {SELECT_COLUMNS} FROM project_phases WHERE id = ?1");
    conn.query_row(&sql, [id], map_row).map_err(AppError::from)
}

/// Fragt die Freigabe fuer ein Gate an (open -> pending). gate_date ist
/// optional und wird 1:1 uebernommen -- NIE automatisch "heute", das eine
/// Dringlichkeit vortaeuschen wuerde, die so nicht gemeint ist.
pub fn request_gate(conn: &Connection, id: &str, project_id: &str, gate_date: Option<String>) -> Result<ProjectPhase, AppError> {
    let phase = get_by_id(conn, id, project_id)?;
    if phase.gate_state != "open" {
        return Err(AppError::Validation("Freigabe kann nur aus dem Zustand 'open' angefragt werden".to_string()));
    }
    conn.execute(
        "UPDATE project_phases SET gate_state = 'pending', gate_date = ?1 WHERE id = ?2 AND project_id = ?3",
        rusqlite::params![gate_date, id, project_id],
    )?;
    get_by_id(conn, id, project_id)
}

/// Traegt die Freigabe ein (pending -> approved). approved_by ist Pflicht
/// (Freitext, meist der Name der Person beim Kunden, die freigegeben hat --
/// nicht automatisch der eigene Name, da die Freigabe meist vom Kunden kommt).
pub fn approve_gate(conn: &Connection, id: &str, project_id: &str, approved_by: String) -> Result<ProjectPhase, AppError> {
    let trimmed = approved_by.trim();
    if trimmed.is_empty() {
        return Err(AppError::Validation("approved_by darf nicht leer sein".to_string()));
    }
    let phase = get_by_id(conn, id, project_id)?;
    if phase.gate_state != "pending" {
        return Err(AppError::Validation("Freigabe kann nur aus dem Zustand 'pending' eingetragen werden".to_string()));
    }
    let today = chrono::Utc::now().date_naive().to_string();
    conn.execute(
        "UPDATE project_phases SET gate_state = 'approved', gate_date = ?1, gate_approved_by = ?2 WHERE id = ?3 AND project_id = ?4",
        rusqlite::params![today, trimmed, id, project_id],
    )?;
    get_by_id(conn, id, project_id)
}

/// Ersetzt die Deliverables-Liste. Rust prueft nur, dass es sich um gueltiges
/// JSON handelt (Boundary-Validierung) -- die Struktur (Feldnamen etc.) wird
/// nur auf TypeScript-Seite verstanden, analog zum todos.checklist-Muster.
pub fn update_deliverables(conn: &Connection, id: &str, project_id: &str, deliverables_json: String) -> Result<ProjectPhase, AppError> {
    if serde_json::from_str::<serde_json::Value>(&deliverables_json).is_err() {
        return Err(AppError::Validation("deliverables muss gueltiges JSON sein".to_string()));
    }
    get_by_id(conn, id, project_id)?;
    conn.execute(
        "UPDATE project_phases SET deliverables = ?1 WHERE id = ?2 AND project_id = ?3",
        rusqlite::params![deliverables_json, id, project_id],
    )?;
    get_by_id(conn, id, project_id)
}

/// Ersetzt die Liste zugewiesener Mitglieder (user_ids). Rust prueft nur, dass
/// es sich um gueltiges JSON handelt (Boundary-Validierung) -- analog zu
/// update_deliverables. Rein informativ: keine Kapazitaets-/Rollen-Logik.
pub fn update_assignees(conn: &Connection, id: &str, project_id: &str, assignee_ids_json: String) -> Result<ProjectPhase, AppError> {
    if serde_json::from_str::<serde_json::Value>(&assignee_ids_json).is_err() {
        return Err(AppError::Validation("assignee_ids muss gueltiges JSON sein".to_string()));
    }
    get_by_id(conn, id, project_id)?;
    conn.execute(
        "UPDATE project_phases SET assignee_ids = ?1 WHERE id = ?2 AND project_id = ?3",
        rusqlite::params![assignee_ids_json, id, project_id],
    )?;
    get_by_id(conn, id, project_id)
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

    fn phase_payload(project_id: &str, name: &str) -> CreateProjectPhasePayload {
        CreateProjectPhasePayload {
            project_id: project_id.into(), name: name.into(),
            start_date: "2026-04-27".into(), end_date: "2026-05-11".into(), gate_name: "Freigabe".into(),
        }
    }

    #[test]
    fn create_first_phase_becomes_current_phase_of_project() {
        let conn = setup();
        let phase = create(&conn, phase_payload("p1", "Konzept")).unwrap();
        assert_eq!(phase.order_index, 0);
        assert_eq!(phase.gate_state, "open");
        assert_eq!(phase.progress_percent, 0);
        assert_eq!(phase.start_date, "2026-04-27");
        assert_eq!(phase.deliverables, "[]");
        assert_eq!(phase.assignee_ids, "[]");
        let current: Option<String> = conn.query_row(
            "SELECT current_phase_id FROM projects WHERE id = 'p1'", [], |r| r.get(0),
        ).unwrap();
        assert_eq!(current, Some(phase.id));
    }

    #[test]
    fn create_second_phase_does_not_change_current_phase() {
        let conn = setup();
        let first = create(&conn, phase_payload("p1", "Konzept")).unwrap();
        let _second = create(&conn, phase_payload("p1", "Umsetzung")).unwrap();
        let current: Option<String> = conn.query_row(
            "SELECT current_phase_id FROM projects WHERE id = 'p1'", [], |r| r.get(0),
        ).unwrap();
        assert_eq!(current, Some(first.id));
    }

    #[test]
    fn get_all_for_project_orders_by_order_index() {
        let conn = setup();
        create(&conn, phase_payload("p1", "Konzept")).unwrap();
        create(&conn, phase_payload("p1", "Umsetzung")).unwrap();
        let phases = get_all_for_project(&conn, "p1").unwrap();
        assert_eq!(phases.len(), 2);
        assert_eq!(phases[0].name, "Konzept");
        assert_eq!(phases[1].name, "Umsetzung");
    }

    #[test]
    fn delete_blocks_current_phase() {
        let conn = setup();
        let phase = create(&conn, phase_payload("p1", "Konzept")).unwrap();
        let result = delete(&conn, &phase.id, "p1");
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn delete_removes_non_current_phase() {
        let conn = setup();
        create(&conn, phase_payload("p1", "Konzept")).unwrap();
        let second = create(&conn, phase_payload("p1", "Umsetzung")).unwrap();
        delete(&conn, &second.id, "p1").unwrap();
        let phases = get_all_for_project(&conn, "p1").unwrap();
        assert_eq!(phases.len(), 1);
    }

    #[test]
    fn reorder_updates_order_index() {
        let conn = setup();
        let a = create(&conn, phase_payload("p1", "A")).unwrap();
        let b = create(&conn, phase_payload("p1", "B")).unwrap();
        reorder(&conn, "p1", &[b.id.clone(), a.id.clone()]).unwrap();
        let phases = get_all_for_project(&conn, "p1").unwrap();
        assert_eq!(phases[0].id, b.id);
        assert_eq!(phases[1].id, a.id);
    }

    #[test]
    fn update_progress_sets_value_within_range() {
        let conn = setup();
        let phase = create(&conn, phase_payload("p1", "Konzept")).unwrap();
        let updated = update_progress(&conn, &phase.id, "p1", 78).unwrap();
        assert_eq!(updated.progress_percent, 78);
    }

    #[test]
    fn update_progress_rejects_out_of_range_value() {
        let conn = setup();
        let phase = create(&conn, phase_payload("p1", "Konzept")).unwrap();
        let result = update_progress(&conn, &phase.id, "p1", 101);
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn update_progress_rejects_unknown_phase() {
        let conn = setup();
        let result = update_progress(&conn, "missing", "p1", 50);
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }

    #[test]
    fn request_gate_moves_open_to_pending_with_given_date() {
        let conn = setup();
        let phase = create(&conn, phase_payload("p1", "Konzept")).unwrap();
        let updated = request_gate(&conn, &phase.id, "p1", Some("2026-06-01".to_string())).unwrap();
        assert_eq!(updated.gate_state, "pending");
        assert_eq!(updated.gate_date, Some("2026-06-01".to_string()));
    }

    #[test]
    fn request_gate_allows_no_date() {
        let conn = setup();
        let phase = create(&conn, phase_payload("p1", "Konzept")).unwrap();
        let updated = request_gate(&conn, &phase.id, "p1", None).unwrap();
        assert_eq!(updated.gate_state, "pending");
        assert_eq!(updated.gate_date, None);
    }

    #[test]
    fn request_gate_rejects_non_open_phase() {
        let conn = setup();
        let phase = create(&conn, phase_payload("p1", "Konzept")).unwrap();
        request_gate(&conn, &phase.id, "p1", None).unwrap();
        let result = request_gate(&conn, &phase.id, "p1", None);
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn approve_gate_moves_pending_to_approved_with_approver_and_todays_date() {
        let conn = setup();
        let phase = create(&conn, phase_payload("p1", "Konzept")).unwrap();
        request_gate(&conn, &phase.id, "p1", None).unwrap();
        let updated = approve_gate(&conn, &phase.id, "p1", "M. Weber, TechCorp".to_string()).unwrap();
        assert_eq!(updated.gate_state, "approved");
        assert_eq!(updated.gate_approved_by, Some("M. Weber, TechCorp".to_string()));
        assert!(updated.gate_date.is_some());
    }

    #[test]
    fn approve_gate_rejects_empty_approved_by() {
        let conn = setup();
        let phase = create(&conn, phase_payload("p1", "Konzept")).unwrap();
        request_gate(&conn, &phase.id, "p1", None).unwrap();
        let result = approve_gate(&conn, &phase.id, "p1", "   ".to_string());
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn approve_gate_rejects_non_pending_phase() {
        let conn = setup();
        let phase = create(&conn, phase_payload("p1", "Konzept")).unwrap();
        let result = approve_gate(&conn, &phase.id, "p1", "M. Weber".to_string());
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn update_deliverables_stores_valid_json() {
        let conn = setup();
        let phase = create(&conn, phase_payload("p1", "Konzept")).unwrap();
        let json = r#"[{"id":"d1","name":"Moodboard","status":"open"}]"#.to_string();
        let updated = update_deliverables(&conn, &phase.id, "p1", json.clone()).unwrap();
        assert_eq!(updated.deliverables, json);
    }

    #[test]
    fn update_deliverables_rejects_invalid_json() {
        let conn = setup();
        let phase = create(&conn, phase_payload("p1", "Konzept")).unwrap();
        let result = update_deliverables(&conn, &phase.id, "p1", "not json".to_string());
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn update_deliverables_rejects_unknown_phase() {
        let conn = setup();
        let result = update_deliverables(&conn, "missing", "p1", "[]".to_string());
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }

    #[test]
    fn update_assignees_stores_valid_json() {
        let conn = setup();
        let phase = create(&conn, phase_payload("p1", "Konzept")).unwrap();
        let json = r#"["u-1","u-2"]"#.to_string();
        let updated = update_assignees(&conn, &phase.id, "p1", json.clone()).unwrap();
        assert_eq!(updated.assignee_ids, json);
    }

    #[test]
    fn update_assignees_rejects_invalid_json() {
        let conn = setup();
        let phase = create(&conn, phase_payload("p1", "Konzept")).unwrap();
        let result = update_assignees(&conn, &phase.id, "p1", "not json".to_string());
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn update_assignees_rejects_unknown_phase() {
        let conn = setup();
        let result = update_assignees(&conn, "missing", "p1", "[]".to_string());
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }
}
