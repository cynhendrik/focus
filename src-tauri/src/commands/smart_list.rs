use tauri::State;
use crate::db::pool::DbPool;
use crate::db::smart_list::{SmartList, UpsertSmartListPayload};
use crate::AppError;

#[tauri::command]
pub fn get_smart_lists(
    db: State<'_, DbPool>,
    workspace_id: String,
) -> Result<Vec<SmartList>, AppError> {
    crate::db::smart_list::get_smart_lists(&db.conn(), &workspace_id)
}

#[tauri::command]
pub fn upsert_smart_list(
    db: State<'_, DbPool>,
    payload: UpsertSmartListPayload,
) -> Result<SmartList, AppError> {
    crate::db::smart_list::upsert_smart_list(&db.conn(), &payload)
}

#[tauri::command]
pub fn delete_smart_list(
    db: State<'_, DbPool>,
    id: String,
) -> Result<(), AppError> {
    crate::db::smart_list::delete_smart_list(&db.conn(), &id)
}

#[tauri::command]
pub fn seed_system_smart_lists(
    db: State<'_, DbPool>,
    workspace_id: String,
) -> Result<(), AppError> {
    crate::db::smart_list::seed_system_lists(&db.conn(), &workspace_id)
}
