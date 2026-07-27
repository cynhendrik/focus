use tauri::State;
use crate::{AppError, db::{self, invoice::*, pool::DbPool}};

#[tauri::command]
pub fn get_invoices(
    db: State<'_, DbPool>,
    workspace_id: String,
    status_filter: Option<String>,
) -> Result<Vec<Invoice>, AppError> {
    db::invoice::get_by_workspace(&db.conn(), &workspace_id, status_filter.as_deref())
}

#[tauri::command]
pub fn get_invoice(db: State<'_, DbPool>, id: String) -> Result<InvoiceWithItems, AppError> {
    db::invoice::get_by_id(&db.conn(), &id)
}

#[tauri::command]
pub fn create_invoice(
    db: State<'_, DbPool>,
    payload: UpsertInvoicePayload,
) -> Result<InvoiceWithItems, AppError> {
    db::invoice::create(&db.conn(), payload)
}

#[tauri::command]
pub fn update_invoice(
    db: State<'_, DbPool>,
    id: String,
    payload: UpsertInvoicePayload,
) -> Result<InvoiceWithItems, AppError> {
    db::invoice::update(&db.conn(), &id, payload)
}

#[tauri::command]
pub fn delete_invoice(db: State<'_, DbPool>, id: String) -> Result<(), AppError> {
    db::invoice::delete(&db.conn(), &id)
}

#[tauri::command]
pub fn approve_invoice_suggestion(
    db: State<'_, DbPool>,
    id: String,
    approved_by: String,
    workspace_id: String,
) -> Result<Invoice, AppError> {
    db::invoice::approve_suggestion(&db.conn(), &id, &approved_by, &workspace_id)
}

#[tauri::command]
pub fn update_invoice_status(
    db: State<'_, DbPool>,
    id: String,
    status: String,
) -> Result<Invoice, AppError> {
    db::invoice::update_status(&db.conn(), &id, &status)
}

#[tauri::command]
pub fn get_invoice_suggestions(
    db: State<'_, DbPool>,
    workspace_id: String,
) -> Result<Vec<Invoice>, AppError> {
    db::invoice::get_by_workspace(&db.conn(), &workspace_id, Some("suggestions"))
}

#[tauri::command]
pub fn get_invoices_by_account(
    db: State<'_, DbPool>,
    account_id: String,
) -> Result<Vec<Invoice>, AppError> {
    db::invoice::get_by_account(&db.conn(), &account_id)
}

#[tauri::command]
pub fn get_invoices_by_project(
    db: State<'_, DbPool>,
    project_id: String,
) -> Result<Vec<Invoice>, AppError> {
    db::invoice::get_by_project(&db.conn(), &project_id)
}

#[tauri::command]
pub fn set_invoice_project(
    db: State<'_, DbPool>,
    id: String,
    project_id: Option<String>,
) -> Result<Invoice, AppError> {
    db::invoice::set_project(&db.conn(), &id, project_id)
}

#[tauri::command]
pub fn get_finance_kpis(
    db: State<'_, DbPool>,
    workspace_id: String,
) -> Result<FinanceKpis, AppError> {
    db::invoice::get_finance_kpis(&db.conn(), &workspace_id)
}

#[tauri::command]
pub fn get_invoice_sequence(
    db: State<'_, DbPool>,
    workspace_id: String,
) -> Result<(i64, i64, String), AppError> {
    db::invoice::get_invoice_sequence(&db.conn(), &workspace_id)
        .map_err(|e| AppError::Db(e.to_string()))
}

#[tauri::command]
pub fn peek_invoice_number(
    db: State<'_, DbPool>,
    workspace_id: String,
) -> Result<String, AppError> {
    Ok(db::invoice::peek_invoice_number(&db.conn(), &workspace_id))
}

#[tauri::command]
pub fn set_invoice_format(
    db: State<'_, DbPool>,
    workspace_id: String,
    format: String,
) -> Result<(), AppError> {
    db::invoice::set_invoice_format(&db.conn(), &workspace_id, &format)
        .map_err(|e| AppError::Db(e.to_string()))
}

#[tauri::command]
pub fn invoice_number_exists(
    db: State<'_, DbPool>,
    workspace_id: String,
    number: String,
    exclude_id: Option<String>,
) -> Result<bool, AppError> {
    db::invoice::invoice_number_exists(&db.conn(), &workspace_id, &number, exclude_id.as_deref())
        .map_err(|e| AppError::Db(e.to_string()))
}

#[tauri::command]
pub fn set_invoice_start_number(
    db: State<'_, DbPool>,
    workspace_id: String,
    start_number: i64,
) -> Result<(), AppError> {
    db::invoice::set_invoice_start_number(&db.conn(), &workspace_id, start_number)
        .map_err(|e| AppError::Db(e.to_string()))
}
