use tauri::State;
use crate::{AppError, db::{self, contact::{Contact, UpsertContactPayload}}, db::pool::DbPool};

#[tauri::command]
pub fn get_contacts(db: State<'_, DbPool>, account_id: String) -> Result<Vec<Contact>, AppError> {
    db::contact::get_by_account(&db.conn(), &account_id)
}

#[tauri::command]
pub fn upsert_contact(db: State<'_, DbPool>, payload: UpsertContactPayload) -> Result<Contact, AppError> {
    db::contact::upsert(&db.conn(), payload)
}

#[tauri::command]
pub fn delete_contact(db: State<'_, DbPool>, id: String) -> Result<(), AppError> {
    db::contact::delete(&db.conn(), &id)
}
