use tauri::State;
use crate::{AppError, db::{self, lead_stage::{LeadStage, UpsertLeadStagePayload}}, db::pool::DbPool};

#[tauri::command]
pub fn cmd_get_lead_stages(db: State<'_, DbPool>, workspace_id: String) -> Result<Vec<LeadStage>, AppError> {
    db::lead_stage::get_all(&db.conn(), &workspace_id)
}

#[tauri::command]
pub fn cmd_upsert_lead_stage(db: State<'_, DbPool>, payload: UpsertLeadStagePayload) -> Result<LeadStage, AppError> {
    db::lead_stage::upsert(&db.conn(), payload)
}

#[tauri::command]
pub fn cmd_delete_lead_stage(db: State<'_, DbPool>, id: String, workspace_id: String) -> Result<(), AppError> {
    db::lead_stage::delete(&db.conn(), &id, &workspace_id)
}

#[tauri::command]
pub fn cmd_reorder_lead_stages(db: State<'_, DbPool>, workspace_id: String, ordered_ids: Vec<String>) -> Result<(), AppError> {
    db::lead_stage::reorder(&db.conn(), &workspace_id, &ordered_ids)
}

#[tauri::command]
pub fn cmd_seed_lead_stages(db: State<'_, DbPool>, workspace_id: String) -> Result<(), AppError> {
    db::lead_stage::seed_defaults(&db.conn(), &workspace_id)
}
