use tauri::State;
use crate::{AppError, db, db::pool::DbPool};
use crate::db::contract::{Contract, UpsertContractPayload};

#[tauri::command]
pub fn cmd_get_contracts(
    db: State<'_, DbPool>,
    workspace_id: String,
) -> Result<Vec<Contract>, AppError> {
    db::contract::get_by_workspace(&db.conn(), &workspace_id)
}

#[tauri::command]
pub fn cmd_upsert_contract(
    db: State<'_, DbPool>,
    payload: UpsertContractPayload,
) -> Result<Contract, AppError> {
    db::contract::upsert(&db.conn(), payload)
}

#[tauri::command]
pub fn cmd_delete_contract(
    db: State<'_, DbPool>,
    id: String,
) -> Result<(), AppError> {
    db::contract::delete(&db.conn(), &id)
}
