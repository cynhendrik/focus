use tauri::{AppHandle, Emitter};
use rusqlite::Connection;
use crate::{AppError, db::activity::{self, Activity, CreateActivityPayload, UpdateActivityPayload}, core::sync};

pub fn create(
    conn: &Connection,
    handle: &AppHandle,
    payload: CreateActivityPayload,
) -> Result<Activity, AppError> {
    let activity = activity::insert(conn, payload)?;
    sync::enqueue(conn, "activities", &activity.id, "INSERT",
        serde_json::json!({"id": activity.id, "workspace_id": activity.workspace_id}))?;
    handle.emit("activity:created", &activity).ok();
    Ok(activity)
}

pub fn update(
    conn: &Connection,
    handle: &AppHandle,
    id: &str,
    payload: UpdateActivityPayload,
) -> Result<Activity, AppError> {
    let activity = activity::update(conn, id, payload)?;
    sync::enqueue(conn, "activities", &activity.id, "UPDATE",
        serde_json::json!({"id": activity.id}))?;
    handle.emit("activity:updated", &activity).ok();
    Ok(activity)
}

pub fn delete(
    conn: &Connection,
    handle: &AppHandle,
    id: &str,
) -> Result<(), AppError> {
    activity::delete(conn, id)?;
    sync::enqueue(conn, "activities", id, "DELETE",
        serde_json::json!({"id": id}))?;
    handle.emit("activity:deleted", serde_json::json!({"id": id})).ok();
    Ok(())
}
