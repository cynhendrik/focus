use tauri::State;
use crate::{AppError, db::{pool::DbPool, kpi::{self, Kpi, UpsertKpiPayload}}};

#[tauri::command]
pub async fn get_kpis(db: State<'_, DbPool>, customer_id: String) -> Result<Vec<Kpi>, AppError> {
    kpi::get_by_customer(&db.conn(), &customer_id)
}

#[tauri::command]
pub async fn upsert_kpi(db: State<'_, DbPool>, payload: UpsertKpiPayload) -> Result<Kpi, AppError> {
    kpi::upsert(&db.conn(), payload)
}

#[tauri::command]
pub async fn delete_kpi(db: State<'_, DbPool>, id: String) -> Result<(), AppError> {
    kpi::delete(&db.conn(), &id)
}
