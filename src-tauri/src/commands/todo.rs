use tauri::State;
use crate::{AppError, db::{pool::DbPool, todo::{self, Todo, UpsertTodoPayload}}};

#[tauri::command]
pub async fn get_todos(db: State<'_, DbPool>, customer_id: String) -> Result<Vec<Todo>, AppError> {
    todo::get_by_customer(&db.conn(), &customer_id)
}

#[tauri::command]
pub async fn upsert_todo(db: State<'_, DbPool>, payload: UpsertTodoPayload) -> Result<Todo, AppError> {
    todo::upsert(&db.conn(), payload)
}

#[tauri::command]
pub async fn delete_todo(db: State<'_, DbPool>, id: String) -> Result<(), AppError> {
    todo::delete(&db.conn(), &id)
}
