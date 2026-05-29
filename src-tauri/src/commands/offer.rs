use tauri::State;
use crate::{AppError, db::{self, offer::*, invoice::InvoiceWithItems, pool::DbPool}};

#[tauri::command]
pub fn get_offers(
    db: State<'_, DbPool>,
    workspace_id: String,
) -> Result<Vec<Offer>, AppError> {
    db::offer::get_by_workspace(&db.conn(), &workspace_id)
}

#[tauri::command]
pub fn get_offer(db: State<'_, DbPool>, id: String) -> Result<OfferWithItems, AppError> {
    db::offer::get_by_id(&db.conn(), &id)
}

#[tauri::command]
pub fn create_offer(
    db: State<'_, DbPool>,
    payload: UpsertOfferPayload,
) -> Result<OfferWithItems, AppError> {
    db::offer::create(&db.conn(), payload)
}

#[tauri::command]
pub fn update_offer(
    db: State<'_, DbPool>,
    id: String,
    payload: UpsertOfferPayload,
) -> Result<OfferWithItems, AppError> {
    db::offer::update(&db.conn(), &id, payload)
}

#[tauri::command]
pub fn delete_offer(db: State<'_, DbPool>, id: String) -> Result<(), AppError> {
    db::offer::delete(&db.conn(), &id)
}

#[tauri::command]
pub fn update_offer_status(
    db: State<'_, DbPool>,
    id: String,
    status: String,
) -> Result<Offer, AppError> {
    db::offer::update_status(&db.conn(), &id, &status)
}

#[tauri::command]
pub fn convert_offer_to_invoice(
    db: State<'_, DbPool>,
    offer_id: String,
    workspace_id: String,
    created_by: String,
) -> Result<InvoiceWithItems, AppError> {
    db::offer::convert_to_invoice(&db.conn(), &offer_id, &workspace_id, &created_by)
}

#[tauri::command]
pub fn get_offers_by_account(
    db: State<'_, DbPool>,
    account_id: String,
) -> Result<Vec<Offer>, AppError> {
    db::offer::get_by_account(&db.conn(), &account_id)
}
