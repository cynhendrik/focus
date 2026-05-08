use tauri::State;
use crate::{AppError, db::{pool::DbPool, time_entry::{self, TimeEntry, AddTimeEntryPayload}}};

#[tauri::command]
pub async fn get_time_entries(db: State<'_, DbPool>, customer_id: String) -> Result<Vec<TimeEntry>, AppError> {
    time_entry::get_by_customer(&db.conn(), &customer_id)
}

#[tauri::command]
pub async fn add_time_entry(db: State<'_, DbPool>, payload: AddTimeEntryPayload) -> Result<TimeEntry, AppError> {
    time_entry::add(&db.conn(), payload)
}

#[tauri::command]
pub async fn delete_time_entry(db: State<'_, DbPool>, id: String) -> Result<(), AppError> {
    time_entry::delete(&db.conn(), &id)
}
