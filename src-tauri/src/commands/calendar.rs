use tauri::State;
use crate::{AppError, db::{self, calendar::*, pool::DbPool}};

#[tauri::command]
pub fn get_calendar_events(
    db: State<'_, DbPool>,
    workspace_id: String,
    from: String,
    to: String,
) -> Result<Vec<CalendarEvent>, AppError> {
    db::calendar::get_events(&db.conn(), &workspace_id, &from, &to)
}

#[tauri::command]
pub fn upsert_calendar_event(
    db: State<'_, DbPool>,
    payload: UpsertCalendarEventPayload,
) -> Result<CalendarEvent, AppError> {
    db::calendar::upsert_event(&db.conn(), payload)
}

#[tauri::command]
pub fn delete_calendar_event(
    db: State<'_, DbPool>,
    id: String,
    workspace_id: String,
) -> Result<(), AppError> {
    db::calendar::delete_event(&db.conn(), &id, &workspace_id)
}
