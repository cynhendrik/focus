use tauri::State;
use crate::{AppError, db, db::pool::DbPool};
use crate::db::payment::{Payment, CreatePaymentPayload};

#[tauri::command]
pub fn cmd_add_payment(db: State<'_, DbPool>, payload: CreatePaymentPayload) -> Result<Payment, AppError> {
    let conn = db.conn();
    let invoice_id = payload.invoice_id.clone();
    let p = db::payment::create(&conn, payload)?;
    // Rechnung automatisch auf 'paid' setzen, wenn vollständig beglichen
    // (kleine Toleranz gegen Float-Rundung).
    let paid = db::payment::total_paid(&conn, &invoice_id)?;
    let total: f64 = conn
        .query_row("SELECT total FROM invoices WHERE id=?1", [&invoice_id], |r| r.get(0))
        .unwrap_or(0.0);
    if total > 0.0 && paid + 0.005 >= total {
        let _ = db::invoice::update_status(&conn, &invoice_id, "paid");
    }
    Ok(p)
}

#[tauri::command]
pub fn cmd_get_payments(db: State<'_, DbPool>, invoice_id: String) -> Result<Vec<Payment>, AppError> {
    db::payment::get_by_invoice(&db.conn(), &invoice_id)
}

#[tauri::command]
pub fn cmd_get_payments_by_workspace(db: State<'_, DbPool>, workspace_id: String) -> Result<Vec<Payment>, AppError> {
    db::payment::get_by_workspace(&db.conn(), &workspace_id)
}

#[tauri::command]
pub fn cmd_delete_payment(db: State<'_, DbPool>, id: String) -> Result<(), AppError> {
    db::payment::delete(&db.conn(), &id)
}
