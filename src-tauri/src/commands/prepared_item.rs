use tauri::State;
use crate::{AppError, db::{pool::DbPool, prepared_item::{PreparedItem, CreatePreparedItemPayload}}};

#[tauri::command]
pub fn cmd_get_active_prepared_items(db: State<'_, DbPool>, workspace_id: String) -> Result<Vec<PreparedItem>, AppError> {
    let conn = db.conn();
    crate::db::prepared_item::get_active(&conn, &workspace_id)
}

#[tauri::command]
pub fn cmd_insert_prepared_item_ignore(db: State<'_, DbPool>, payload: CreatePreparedItemPayload) -> Result<bool, AppError> {
    let conn = db.conn();
    crate::db::prepared_item::insert_ignore(&conn, payload)
}

#[tauri::command]
pub fn cmd_update_prepared_item_status(
    db: State<'_, DbPool>, id: String, status: String,
    snooze_until: Option<String>, approved_at: Option<String>,
) -> Result<PreparedItem, AppError> {
    let conn = db.conn();
    crate::db::prepared_item::update_status(&conn, &id, &status, snooze_until, approved_at)
}

#[tauri::command]
pub fn cmd_update_prepared_item_payload(db: State<'_, DbPool>, id: String, payload: String) -> Result<PreparedItem, AppError> {
    let conn = db.conn();
    crate::db::prepared_item::update_payload(&conn, &id, &payload)
}

#[tauri::command]
pub fn cmd_set_prepared_item_assignee(db: State<'_, DbPool>, id: String, assignee: Option<String>) -> Result<PreparedItem, AppError> {
    let conn = db.conn();
    crate::db::prepared_item::set_assignee(&conn, &id, assignee)
}

#[tauri::command]
pub fn cmd_get_approved_prepared_items_since(db: State<'_, DbPool>, workspace_id: String, since: String) -> Result<Vec<PreparedItem>, AppError> {
    let conn = db.conn();
    crate::db::prepared_item::get_approved_since(&conn, &workspace_id, &since)
}
