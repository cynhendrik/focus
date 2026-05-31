use tauri::{AppHandle, State};
use crate::{AppError, db::{self, deal::{Deal, UpsertDealPayload}}, db::pool::DbPool, engine};

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
        account_id: Some(updated.account_id.clone()),
        contact_id: updated.contact_id.clone(),
        deal_id: Some(id.clone()),
        customer_id: None,
        activity_type: "stage_change".into(),
        title: Some(format!("Stage → {stage}")),
        body: None,
        payload: Some(serde_json::json!({"to_stage": stage}).to_string()),
        status: Some("done".into()),
        due_at: None,
        assignee: None,
        outcome: None,
        direction: None,
        email_id: None,
    });
    engine::evaluate(&*conn, engine::CrmEvent::DealStageChanged {
        account_id:   updated.account_id.clone(),
        workspace_id: updated.workspace_id.clone(),
        deal_id:      id,
        to_stage:     stage.clone(),
    })?;
    if stage == "won" {
        if let Err(e) = db::invoice::create_suggestion_from_deal(&*conn, &updated) {
            eprintln!("[invoice] create_suggestion_from_deal failed for deal {}: {e}", updated.id);
        }
    }
    Ok(updated)
}

#[tauri::command]
pub fn get_deals_by_workspace(
    db: State<'_, DbPool>,
    workspace_id: String,
) -> Result<Vec<Deal>, AppError> {
    db::deal::get_by_workspace(&db.conn(), &workspace_id)
}

#[tauri::command]
pub fn get_deals_by_customer(
    db: State<'_, DbPool>,
    customer_id: String,
) -> Result<Vec<Deal>, AppError> {
    db::deal::get_by_customer(&db.conn(), &customer_id)
}
