use tauri::State;
use crate::{AppError, db::{pool::DbPool, customer::{self, Customer, UpsertCustomerPayload}}};

#[tauri::command]
pub async fn get_customers(db: State<'_, DbPool>) -> Result<Vec<Customer>, AppError> {
    let conn = db.conn();
    customer::get_all(&conn)
}

#[tauri::command]
pub async fn upsert_customer(
    db: State<'_, DbPool>,
    payload: UpsertCustomerPayload,
) -> Result<Customer, AppError> {
    let conn = db.conn();
    customer::upsert(&conn, payload)
}

#[tauri::command]
pub async fn delete_customer(
    db: State<'_, DbPool>,
    id: String,
) -> Result<(), AppError> {
    let conn = db.conn();
    customer::delete(&conn, &id)
}
