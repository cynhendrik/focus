use tauri::State;
use crate::{AppError, db::{pool::DbPool, customer::{self, UpsertCustomerPayload}}};

#[tauri::command]
pub async fn get_customers(
    db: State<'_, DbPool>,
    workspace_id: String,
) -> Result<Vec<customer::Customer>, AppError> {
    let conn = db.conn();
    customer::get_all(&conn, &workspace_id)
}

#[tauri::command]
pub async fn upsert_customer(
    db: State<'_, DbPool>,
    payload: UpsertCustomerPayload,
) -> Result<customer::Customer, AppError> {
    let conn = db.conn();
    customer::upsert(&conn, payload)
}

#[tauri::command]
pub async fn delete_customer(
    db: State<'_, DbPool>,
    id: String,
    workspace_id: String,
) -> Result<(), AppError> {
    let conn = db.conn();
    customer::delete(&conn, &id, &workspace_id)
}
