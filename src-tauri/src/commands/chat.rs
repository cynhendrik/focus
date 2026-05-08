use tauri::State;
use crate::{AppError, db::{pool::DbPool, chat_message::{self, ChatMessage, AddChatMessagePayload}}};

#[tauri::command]
pub async fn get_chat_messages(db: State<'_, DbPool>, customer_id: String) -> Result<Vec<ChatMessage>, AppError> {
    chat_message::get_by_customer(&db.conn(), &customer_id)
}

#[tauri::command]
pub async fn add_chat_message(db: State<'_, DbPool>, payload: AddChatMessagePayload) -> Result<ChatMessage, AppError> {
    chat_message::add(&db.conn(), payload)
}

#[tauri::command]
pub async fn mark_chat_read(db: State<'_, DbPool>, id: String) -> Result<(), AppError> {
    chat_message::mark_read(&db.conn(), &id)
}

#[tauri::command]
pub async fn delete_chat_message(db: State<'_, DbPool>, id: String) -> Result<(), AppError> {
    chat_message::delete(&db.conn(), &id)
}
