use tauri::State;
use crate::{AppError, db::{pool::DbPool, company::{self, CompanySettings, UpdateCompanyPayload}}};

#[tauri::command]
pub async fn get_company_settings(db: State<'_, DbPool>) -> Result<CompanySettings, AppError> {
    company::get(&db.conn())
}

#[tauri::command]
pub async fn update_company_settings(db: State<'_, DbPool>, payload: UpdateCompanyPayload) -> Result<CompanySettings, AppError> {
    company::update(&db.conn(), payload)
}
