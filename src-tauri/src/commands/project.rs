use tauri::State;
use crate::{AppError, db::{self, project::{Project, UpsertProjectPayload}}, db::pool::DbPool};

#[tauri::command]
pub fn cmd_get_projects(db: State<'_, DbPool>, workspace_id: String) -> Result<Vec<Project>, AppError> {
    db::project::get_all_for_workspace(&db.conn(), &workspace_id)
}

#[tauri::command]
pub fn cmd_get_project(db: State<'_, DbPool>, id: String) -> Result<Project, AppError> {
    db::project::get_by_id(&db.conn(), &id)
}

#[tauri::command]
pub fn cmd_upsert_project(db: State<'_, DbPool>, payload: UpsertProjectPayload) -> Result<Project, AppError> {
    db::project::upsert(&db.conn(), payload)
}

#[tauri::command]
pub fn cmd_delete_project(db: State<'_, DbPool>, id: String, workspace_id: String) -> Result<(), AppError> {
    db::project::delete(&db.conn(), &id, &workspace_id)
}

#[tauri::command]
pub fn cmd_advance_project_phase(db: State<'_, DbPool>, project_id: String) -> Result<Project, AppError> {
    db::project::advance_phase(&db.conn(), &project_id)
}

#[tauri::command]
pub fn cmd_set_project_status(db: State<'_, DbPool>, project_id: String, status: String) -> Result<Project, AppError> {
    db::project::set_status(&db.conn(), &project_id, &status)
}

#[tauri::command]
pub fn cmd_update_project_moodboard_items(
    db: State<'_, DbPool>, id: String, moodboard_items_json: String,
) -> Result<Project, AppError> {
    db::project::update_moodboard_items(&db.conn(), &id, moodboard_items_json)
}
