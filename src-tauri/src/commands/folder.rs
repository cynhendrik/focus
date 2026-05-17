use tauri::{Manager, State};
use crate::{AppError, db::{pool::DbPool, folder::{self, Folder, FileEntry, CreateFolderPayload, AddFilePayload}}};

#[tauri::command]
pub async fn cmd_get_folders(db: State<'_, DbPool>, account_id: String) -> Result<Vec<Folder>, AppError> {
    folder::get_folders(&db.conn(), &account_id)
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
pub async fn cmd_get_files(db: State<'_, DbPool>, account_id: String, folder_id: Option<String>) -> Result<Vec<FileEntry>, AppError> {
    folder::get_files(&db.conn(), &account_id, folder_id.as_deref())
}

#[tauri::command]
pub async fn cmd_add_file(db: State<'_, DbPool>, payload: AddFilePayload) -> Result<FileEntry, AppError> {
    folder::add_file(&db.conn(), payload)
}

#[tauri::command]
pub async fn cmd_delete_file(db: State<'_, DbPool>, id: String) -> Result<(), AppError> {
    folder::delete_file(&db.conn(), &id)
}

#[tauri::command]
pub async fn cmd_import_file(
    app: tauri::AppHandle,
    db: State<'_, DbPool>,
    account_id: String,
    folder_id: Option<String>,
    name: String,
    data: Vec<u8>,
    mime_type: Option<String>,
) -> Result<FileEntry, AppError> {
    let data_dir = app.path().app_data_dir()
        .map_err(|e| AppError::Io(e.to_string()))?;

    let file_id = uuid::Uuid::new_v4().to_string();
    let dest_dir = data_dir
        .join("cynera")
        .join("files")
        .join(&account_id)
        .join(&file_id);
    std::fs::create_dir_all(&dest_dir)?;
    let dest = dest_dir.join(&name);
    std::fs::write(&dest, &data)?;

    let payload = AddFilePayload {
        account_id,
        folder_id,
        name,
        path: dest.to_string_lossy().to_string(),
        size: Some(data.len() as i64),
        mime_type,
    };
    folder::add_file(&db.conn(), payload)
}
