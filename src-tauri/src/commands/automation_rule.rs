use tauri::State;
use crate::{AppError, db::{self, automation_rule::AutomationRule}, db::pool::DbPool};

#[tauri::command]
pub fn cmd_get_automation_rules(
    db: State<'_, DbPool>,
    workspace_id: String,
) -> Result<Vec<AutomationRule>, AppError> {
    db::automation_rule::get_all(&db.conn(), &workspace_id)
}

#[tauri::command]
pub fn cmd_set_rule_active(
    db: State<'_, DbPool>,
    id: String,
    workspace_id: String,
    is_active: bool,
) -> Result<(), AppError> {
    db::automation_rule::set_active(&db.conn(), &id, &workspace_id, is_active)
}
