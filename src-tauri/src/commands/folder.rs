use tauri::State;
use crate::{AppError, db::{pool::DbPool, folder::{self, Folder, FileEntry, CreateFolderPayload, AddFilePayload}}};

#[tauri::command]
pub async fn cmd_get_folders(db: State<'_, DbPool>, customer_id: String) -> Result<Vec<Folder>, AppError> {
    folder::get_folders(&db.conn(), &customer_id)
}

#[tauri::command]
pub async fn cmd_create_folder(db: State<'_, DbPool>, payload: CreateFolderPayload) -> Result<Folder, AppError> {
    folder::create_folder(&db.conn(), payload)
}

#[tauri::command]
pub async fn cmd_delete_folder(db: State<'_, DbPool>, id: String) -> Result<(), AppError> {
    folder::delete_folder(&db.conn(), &id)
}

#[tauri::command]
pub async fn cmd_get_files(db: State<'_, DbPool>, customer_id: String, folder_id: Option<String>) -> Result<Vec<FileEntry>, AppError> {
    folder::get_files(&db.conn(), &customer_id, folder_id.as_deref())
}

#[tauri::command]
pub async fn cmd_add_file(db: State<'_, DbPool>, payload: AddFilePayload) -> Result<FileEntry, AppError> {
    folder::add_file(&db.conn(), payload)
}

#[tauri::command]
pub async fn cmd_delete_file(db: State<'_, DbPool>, id: String) -> Result<(), AppError> {
    folder::delete_file(&db.conn(), &id)
}
