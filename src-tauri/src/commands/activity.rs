use tauri::{AppHandle, State};
use crate::{
    AppError, engine, activity_engine,
    db::{self, activity::{Activity, CreateActivityPayload, UpdateActivityPayload}},
    db::pool::DbPool,
};

#[tauri::command]
pub fn create_activity(
    db: State<'_, DbPool>,
    app: AppHandle,
    payload: CreateActivityPayload,
) -> Result<Activity, AppError> {
    let conn = db.conn();
    let activity = activity_engine::create(&*conn, &app, payload)?;
    if let Some(outcome) = &activity.outcome {
        engine::evaluate(&*conn, engine::CrmEvent::ActivityOutcome {
            account_id:   activity.account_id.clone(),
            workspace_id: activity.workspace_id.clone(),
            outcome:      outcome.clone(),
        })?;
    }
    Ok(activity)
}

#[tauri::command]
pub fn update_activity(
    db: State<'_, DbPool>,
    app: AppHandle,
    id: String,
    payload: UpdateActivityPayload,
) -> Result<Activity, AppError> {
    let conn = db.conn();
    let activity = activity_engine::update(&*conn, &app, &id, payload)?;
    if let Some(outcome) = &activity.outcome {
        engine::evaluate(&*conn, engine::CrmEvent::ActivityOutcome {
            account_id:   activity.account_id.clone(),
            workspace_id: activity.workspace_id.clone(),
            outcome:      outcome.clone(),
        })?;
    }
    Ok(activity)
}

#[tauri::command]
pub fn delete_activity(
    db: State<'_, DbPool>,
    app: AppHandle,
    id: String,
) -> Result<(), AppError> {
    activity_engine::delete(&db.conn(), &app, &id)
}

#[tauri::command]
pub fn get_activities_by_account(
    db: State<'_, DbPool>,
    account_id: String,
) -> Result<Vec<Activity>, AppError> {
    db::activity::get_by_account(&db.conn(), &account_id)
}

#[tauri::command]
pub fn get_activities_by_deal(
    db: State<'_, DbPool>,
    deal_id: String,
) -> Result<Vec<Activity>, AppError> {
    db::activity::get_by_deal(&db.conn(), &deal_id)
}

#[tauri::command]
pub fn get_open_tasks(
    db: State<'_, DbPool>,
    workspace_id: String,
) -> Result<Vec<Activity>, AppError> {
    db::activity::get_open_tasks(&db.conn(), &workspace_id)
}
