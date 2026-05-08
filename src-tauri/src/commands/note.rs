use tauri::State;
use crate::{AppError, db::{pool::DbPool, note::{self, Note, UpsertNotePayload}}};

#[tauri::command]
pub async fn get_notes(db: State<'_, DbPool>, customer_id: String) -> Result<Vec<Note>, AppError> {
    note::get_by_customer(&db.conn(), &customer_id)
}

#[tauri::command]
pub async fn upsert_note(db: State<'_, DbPool>, payload: UpsertNotePayload) -> Result<Note, AppError> {
    note::upsert(&db.conn(), payload)
}

#[tauri::command]
pub async fn delete_note(db: State<'_, DbPool>, id: String) -> Result<(), AppError> {
    note::delete(&db.conn(), &id)
}
