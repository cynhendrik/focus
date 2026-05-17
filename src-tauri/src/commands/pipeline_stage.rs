use tauri::State;
use crate::{AppError, db::{self, pipeline_stage::{PipelineStage, UpsertPipelineStagePayload}}, db::pool::DbPool};

#[tauri::command]
pub fn cmd_get_pipeline_stages(db: State<'_, DbPool>, workspace_id: String) -> Result<Vec<PipelineStage>, AppError> {
    db::pipeline_stage::get_all(&db.conn(), &workspace_id)
}

#[tauri::command]
pub fn cmd_upsert_pipeline_stage(db: State<'_, DbPool>, payload: UpsertPipelineStagePayload) -> Result<PipelineStage, AppError> {
    db::pipeline_stage::upsert(&db.conn(), payload)
}

#[tauri::command]
pub fn cmd_delete_pipeline_stage(db: State<'_, DbPool>, id: String, workspace_id: String) -> Result<(), AppError> {
    db::pipeline_stage::delete(&db.conn(), &id, &workspace_id)
}

#[tauri::command]
pub fn cmd_reorder_pipeline_stages(db: State<'_, DbPool>, workspace_id: String, ordered_ids: Vec<String>) -> Result<(), AppError> {
    db::pipeline_stage::reorder(&db.conn(), &workspace_id, &ordered_ids)
}
