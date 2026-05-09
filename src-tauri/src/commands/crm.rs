use tauri::State;
use crate::{AppError, db::{pool::DbPool, crm::{self, FollowUp, UpsertFollowUpPayload}}};

#[tauri::command]
pub async fn get_follow_ups(db: State<'_, DbPool>, customer_id: String) -> Result<Vec<FollowUp>, AppError> {
    crm::get_by_customer(&db.conn(), &customer_id)
}

#[tauri::command]
pub async fn upsert_follow_up(db: State<'_, DbPool>, payload: UpsertFollowUpPayload) -> Result<FollowUp, AppError> {
    crm::upsert(&db.conn(), payload)
}

#[tauri::command]
pub async fn delete_follow_up(db: State<'_, DbPool>, id: String) -> Result<(), AppError> {
    crm::delete(&db.conn(), &id)
}
