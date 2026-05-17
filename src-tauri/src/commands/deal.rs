use tauri::{AppHandle, State};
use crate::{AppError, db::{self, deal::{Deal, UpsertDealPayload}}, db::pool::DbPool};

#[tauri::command]
pub fn get_deals(db: State<'_, DbPool>, account_id: String) -> Result<Vec<Deal>, AppError> {
    db::deal::get_by_account(&db.conn(), &account_id)
}

#[tauri::command]
pub fn upsert_deal(db: State<'_, DbPool>, payload: UpsertDealPayload) -> Result<Deal, AppError> {
    db::deal::upsert(&db.conn(), payload)
}

#[tauri::command]
pub fn delete_deal(db: State<'_, DbPool>, id: String) -> Result<(), AppError> {
    db::deal::delete(&db.conn(), &id)
}

#[tauri::command]
pub fn update_deal_stage(
    db: State<'_, DbPool>,
    app: AppHandle,
    id: String,
    stage: String,
) -> Result<Deal, AppError> {
    let conn = db.conn();
    let updated = db::deal::update_stage(&*conn, &id, &stage)?;
    let _ = crate::activity_engine::create(&*conn, &app, crate::db::activity::CreateActivityPayload {
        workspace_id: updated.workspace_id.clone(),
        created_by: updated.created_by.clone(),
        account_id: updated.account_id.clone(),
        contact_id: updated.contact_id.clone(),
        deal_id: Some(id),
        activity_type: "stage_change".into(),
        title: Some(format!("Stage → {stage}")),
        body: None,
        payload: Some(serde_json::json!({"to_stage": stage}).to_string()),
        status: Some("done".into()),
        due_at: None,
        assignee: None,
    });
    Ok(updated)
}
