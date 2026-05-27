use tauri::State;
use crate::{AppError, db, db::pool::DbPool};
use crate::db::follow_up_queue::FollowUpQueueItem;

#[tauri::command]
pub fn cmd_get_due_follow_ups(
    db: State<'_, DbPool>,
    workspace_id: String,
) -> Result<Vec<FollowUpQueueItem>, AppError> {
    db::follow_up_queue::get_due(&db.conn(), &workspace_id)
}

#[tauri::command]
pub fn cmd_get_follow_ups_for_lead(
    db: State<'_, DbPool>,
    lead_id: String,
) -> Result<Vec<FollowUpQueueItem>, AppError> {
    db::follow_up_queue::get_for_lead(&db.conn(), &lead_id)
}

#[tauri::command]
pub fn cmd_create_follow_up_sequence(
    db: State<'_, DbPool>,
    workspace_id: String,
    lead_id: String,
    trigger_activity_id: String,
    lead_name: String,
    company_name: Option<String>,
) -> Result<Vec<FollowUpQueueItem>, AppError> {
    db::follow_up_queue::create_sequence(
        &db.conn(),
        &workspace_id,
        &lead_id,
        &trigger_activity_id,
        &lead_name,
        company_name.as_deref(),
    )
}

#[tauri::command]
pub fn cmd_cancel_follow_ups_for_lead(
    db: State<'_, DbPool>,
    lead_id: String,
) -> Result<usize, AppError> {
    db::follow_up_queue::cancel_for_lead(&db.conn(), &lead_id)
}

#[tauri::command]
pub fn cmd_mark_follow_up_sent(
    db: State<'_, DbPool>,
    id: String,
    sent_activity_id: String,
) -> Result<FollowUpQueueItem, AppError> {
    db::follow_up_queue::mark_sent(&db.conn(), &id, &sent_activity_id)
}

#[tauri::command]
pub fn cmd_mark_follow_up_skipped(
    db: State<'_, DbPool>,
    id: String,
) -> Result<FollowUpQueueItem, AppError> {
    db::follow_up_queue::mark_skipped(&db.conn(), &id)
}

#[tauri::command]
pub fn cmd_update_follow_up_draft(
    db: State<'_, DbPool>,
    id: String,
    subject: Option<String>,
    body: Option<String>,
) -> Result<FollowUpQueueItem, AppError> {
    db::follow_up_queue::update_draft(&db.conn(), &id, subject.as_deref(), body.as_deref())
}
