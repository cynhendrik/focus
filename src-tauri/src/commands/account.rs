use tauri::State;
use crate::{AppError, db::{self, account::{Account, UpsertAccountPayload}}, db::pool::DbPool};

#[tauri::command]
pub fn get_accounts(db: State<'_, DbPool>, workspace_id: String) -> Result<Vec<Account>, AppError> {
    db::account::get_all(&db.conn(), &workspace_id)
}

#[tauri::command]
pub fn upsert_account(db: State<'_, DbPool>, payload: UpsertAccountPayload) -> Result<Account, AppError> {
    db::account::upsert(&db.conn(), payload)
}

#[tauri::command]
pub fn delete_account(db: State<'_, DbPool>, id: String, workspace_id: String) -> Result<(), AppError> {
    db::account::delete(&db.conn(), &id, &workspace_id)
}
