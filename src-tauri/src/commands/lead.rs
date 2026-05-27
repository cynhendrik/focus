use tauri::State;
use crate::{AppError, db, db::pool::DbPool};
use crate::db::lead::{Lead, UpsertLeadPayload};

#[tauri::command]
pub fn get_leads(db: State<'_, DbPool>, workspace_id: String) -> Result<Vec<Lead>, AppError> {
    db::lead::get_leads(&db.conn(), &workspace_id)
}

#[tauri::command]
pub fn upsert_lead(db: State<'_, DbPool>, payload: UpsertLeadPayload) -> Result<Lead, AppError> {
    db::lead::upsert_lead(&db.conn(), payload)
}

#[tauri::command]
pub fn bulk_update_leads(
    db: State<'_, DbPool>,
    ids: Vec<String>,
    status: String,
    re_engage_date: Option<String>,
) -> Result<(), AppError> {
    db::lead::bulk_update_lead_status(&db.conn(), &ids, &status, re_engage_date.as_deref())
}

#[tauri::command]
pub fn convert_lead_to_client(db: State<'_, DbPool>, id: String) -> Result<Lead, AppError> {
    db::lead::convert_lead_to_client(&db.conn(), &id)
}

#[tauri::command]
pub fn insert_synced_leads(
    db: State<'_, DbPool>,
    leads: Vec<UpsertLeadPayload>,
) -> Result<usize, AppError> {
    db::lead::insert_synced_leads(&db.conn(), leads)
}

#[tauri::command]
pub fn update_lead_stage(
    db: State<'_, DbPool>,
    id: String,
    stage: String,
) -> Result<Lead, AppError> {
    db::lead::update_pipeline_stage(&db.conn(), &id, &stage)
}
