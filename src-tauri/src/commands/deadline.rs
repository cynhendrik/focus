use tauri::State;
use crate::{AppError, db::{pool::DbPool, deadline::{self, Deadline, UpsertDeadlinePayload}}};

#[tauri::command]
pub async fn get_deadlines(db: State<'_, DbPool>, customer_id: String) -> Result<Vec<Deadline>, AppError> {
    deadline::get_by_customer(&db.conn(), &customer_id)
}

#[tauri::command]
pub async fn upsert_deadline(db: State<'_, DbPool>, payload: UpsertDeadlinePayload) -> Result<Deadline, AppError> {
    deadline::upsert(&db.conn(), payload)
}

#[tauri::command]
pub async fn delete_deadline(db: State<'_, DbPool>, id: String) -> Result<(), AppError> {
    deadline::delete(&db.conn(), &id)
}
