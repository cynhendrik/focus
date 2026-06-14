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

// ── Datei lesen / öffnen / herunterladen ────────────────────────────────────
// Alle drei Commands prüfen, dass der Pfad innerhalb des App-Dateiordners liegt
// (kein Zugriff auf beliebige Systemdateien via Frontend).

fn guard_path(app: &tauri::AppHandle, path: &str) -> Result<std::path::PathBuf, AppError> {
    let base = app.path().app_data_dir()
        .map_err(|e| AppError::Io(e.to_string()))?
        .join("cynera").join("files");
    let canon = std::fs::canonicalize(path).map_err(|e| AppError::Io(e.to_string()))?;
    let base_canon = std::fs::canonicalize(&base).map_err(|e| AppError::Io(e.to_string()))?;
    if !canon.starts_with(&base_canon) {
        return Err(AppError::Io("Zugriff außerhalb des Dateiordners verweigert".into()));
    }
    Ok(canon)
}

#[tauri::command]
pub fn cmd_read_file(app: tauri::AppHandle, path: String) -> Result<Vec<u8>, AppError> {
    let p = guard_path(&app, &path)?;
    std::fs::read(&p).map_err(|e| AppError::Io(e.to_string()))
}

#[tauri::command]
pub fn cmd_open_file(app: tauri::AppHandle, path: String) -> Result<(), AppError> {
    let p = guard_path(&app, &path)?;
    open::that(&p).map_err(|e| AppError::Io(e.to_string()))
}

#[tauri::command]
pub fn cmd_download_file(app: tauri::AppHandle, path: String, suggested_name: String) -> Result<String, AppError> {
    let p = guard_path(&app, &path)?;
    let dir = crate::commands::export::downloads_dir();
    let dest = crate::commands::export::unique_path(&dir, &suggested_name);
    std::fs::copy(&p, &dest).map_err(|e| AppError::Io(e.to_string()))?;
    Ok(dest.to_string_lossy().to_string())
}

/// Copies bytes into the app's per-account file store and records the entry.
/// Shared by upload (bytes from the browser) and drag-&-drop (read from a path).
fn store_file(
    app: &tauri::AppHandle,
    db: &DbPool,
    account_id: String,
    folder_id: Option<String>,
    name: String,
    data: Vec<u8>,
    mime_type: Option<String>,
) -> Result<FileEntry, AppError> {
    let data_dir = app.path().app_data_dir()
        .map_err(|e| AppError::Io(e.to_string()))?;

    let file_id = uuid::Uuid::new_v4().to_string();
    let dest_dir = data_dir.join("cynera").join("files").join(&account_id).join(&file_id);
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

/// Best-effort MIME from the file extension (drag-&-drop gives no browser type),
/// so the in-app preview (Bilder/PDF) funktioniert auch bei gezogenen Dateien.
fn mime_from_name(name: &str) -> Option<String> {
    let ext = std::path::Path::new(name).extension().and_then(|e| e.to_str())?.to_lowercase();
    let m = match ext.as_str() {
        "pdf" => "application/pdf",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "txt" => "text/plain",
        "csv" => "text/csv",
        "doc" => "application/msword",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xls" => "application/vnd.ms-excel",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "zip" => "application/zip",
        _ => return None,
    };
    Some(m.to_string())
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
    store_file(&app, &db, account_id, folder_id, name, data, mime_type)
}

/// Import a file the user dragged in from the OS (Tauri delivers a path, not bytes).
#[tauri::command]
pub async fn cmd_import_file_from_path(
    app: tauri::AppHandle,
    db: State<'_, DbPool>,
    account_id: String,
    folder_id: Option<String>,
    src_path: String,
) -> Result<FileEntry, AppError> {
    let src = std::path::Path::new(&src_path);
    let name = src.file_name().and_then(|n| n.to_str())
        .ok_or_else(|| AppError::Io("Ungültiger Dateiname".into()))?
        .to_string();
    let data = std::fs::read(src).map_err(|e| AppError::Io(e.to_string()))?;
    let mime = mime_from_name(&name);
    store_file(&app, &db, account_id, folder_id, name, data, mime)
}
