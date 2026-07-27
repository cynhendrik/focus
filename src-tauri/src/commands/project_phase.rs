use tauri::State;
use crate::{AppError, db::{self, project_phase::{ProjectPhase, CreateProjectPhasePayload}}, db::pool::DbPool};

#[tauri::command]
pub fn cmd_get_project_phases(db: State<'_, DbPool>, project_id: String) -> Result<Vec<ProjectPhase>, AppError> {
    db::project_phase::get_all_for_project(&db.conn(), &project_id)
}

#[tauri::command]
pub fn cmd_create_project_phase(db: State<'_, DbPool>, payload: CreateProjectPhasePayload) -> Result<ProjectPhase, AppError> {
    db::project_phase::create(&db.conn(), payload)
}

#[tauri::command]
pub fn cmd_delete_project_phase(db: State<'_, DbPool>, id: String, project_id: String) -> Result<(), AppError> {
    db::project_phase::delete(&db.conn(), &id, &project_id)
}

#[tauri::command]
pub fn cmd_reorder_project_phases(db: State<'_, DbPool>, project_id: String, ordered_ids: Vec<String>) -> Result<(), AppError> {
    db::project_phase::reorder(&db.conn(), &project_id, &ordered_ids)
}

#[tauri::command]
pub fn cmd_update_project_phase_progress(
    db: State<'_, DbPool>, id: String, project_id: String, progress_percent: i32,
) -> Result<ProjectPhase, AppError> {
    db::project_phase::update_progress(&db.conn(), &id, &project_id, progress_percent)
}

#[tauri::command]
pub fn cmd_request_gate(
    db: State<'_, DbPool>, id: String, project_id: String, gate_date: Option<String>,
) -> Result<ProjectPhase, AppError> {
    db::project_phase::request_gate(&db.conn(), &id, &project_id, gate_date)
}

#[tauri::command]
pub fn cmd_approve_gate(
    db: State<'_, DbPool>, id: String, project_id: String, approved_by: String,
) -> Result<ProjectPhase, AppError> {
    db::project_phase::approve_gate(&db.conn(), &id, &project_id, approved_by)
}

#[tauri::command]
pub fn cmd_update_project_phase_deliverables(
    db: State<'_, DbPool>, id: String, project_id: String, deliverables_json: String,
) -> Result<ProjectPhase, AppError> {
    db::project_phase::update_deliverables(&db.conn(), &id, &project_id, deliverables_json)
}

#[tauri::command]
pub fn cmd_update_project_phase_assignees(
    db: State<'_, DbPool>, id: String, project_id: String, assignee_ids_json: String,
) -> Result<ProjectPhase, AppError> {
    db::project_phase::update_assignees(&db.conn(), &id, &project_id, assignee_ids_json)
}
