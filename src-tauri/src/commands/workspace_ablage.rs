use tauri::{Manager, State};
use crate::{AppError, db::{pool::DbPool, workspace_ablage::{self, WorkspaceFolder, WorkspaceFile}}};

#[tauri::command]
pub async fn cmd_get_ws_folders(
    db: State<'_, DbPool>,
    workspace_id: String,
) -> Result<Vec<WorkspaceFolder>, AppError> {
    workspace_ablage::get_ws_folders(&db.conn(), &workspace_id)
}

#[tauri::command]
pub async fn cmd_create_ws_folder(
    db: State<'_, DbPool>,
    workspace_id: String,
    name: String,
    parent_id: Option<String>,
) -> Result<WorkspaceFolder, AppError> {
    workspace_ablage::create_ws_folder(&db.conn(), &workspace_id, &name, parent_id.as_deref())
}

#[tauri::command]
pub async fn cmd_delete_ws_folder(
    db: State<'_, DbPool>,
    id: String,
) -> Result<(), AppError> {
    workspace_ablage::delete_ws_folder(&db.conn(), &id)
}

#[tauri::command]
pub async fn cmd_get_ws_files(
    db: State<'_, DbPool>,
    workspace_id: String,
    folder_id: Option<String>,
) -> Result<Vec<WorkspaceFile>, AppError> {
    workspace_ablage::get_ws_files(&db.conn(), &workspace_id, folder_id.as_deref())
}

#[tauri::command]
pub async fn cmd_import_ws_file(
    app: tauri::AppHandle,
    db: State<'_, DbPool>,
    workspace_id: String,
    folder_id: Option<String>,
    name: String,
    data: Vec<u8>,
    mime_type: Option<String>,
) -> Result<WorkspaceFile, AppError> {
    let data_dir = app.path().app_data_dir()
        .map_err(|e| AppError::Io(e.to_string()))?;
    let file_id = uuid::Uuid::new_v4().to_string();
    let dest_dir = data_dir.join("cynera").join("ws_files").join(&workspace_id).join(&file_id);
    std::fs::create_dir_all(&dest_dir)?;
    let dest = dest_dir.join(&name);
    std::fs::write(&dest, &data)?;
    workspace_ablage::add_ws_file(
        &db.conn(), &workspace_id, folder_id.as_deref(), &name,
        &dest.to_string_lossy(), Some(data.len() as i64),
        mime_type.as_deref(), "manual", None,
    )
}

#[tauri::command]
pub async fn cmd_delete_ws_file(
    db: State<'_, DbPool>,
    id: String,
) -> Result<(), AppError> {
    let path = workspace_ablage::delete_ws_file(&db.conn(), &id)?;
    let _ = std::fs::remove_file(&path); // best-effort
    Ok(())
}

#[tauri::command]
pub async fn cmd_read_ws_file(
    db: State<'_, DbPool>,
    id: String,
) -> Result<Vec<u8>, AppError> {
    let file = workspace_ablage::get_ws_file(&db.conn(), &id)?;
    let bytes = std::fs::read(&file.path)?;
    Ok(bytes)
}

#[tauri::command]
pub async fn cmd_save_invoice_to_ablage(
    app: tauri::AppHandle,
    db: State<'_, DbPool>,
    workspace_id: String,
    invoice_id: String,
    invoice_number: String,
    account_name: String,
    invoice_date: String,   // ISO "2026-05-27"
    pdf_data: Vec<u8>,
) -> Result<WorkspaceFile, AppError> {
    // Parse year + month
    let parts: Vec<&str> = invoice_date.splitn(3, '-').collect();
    let year: i32 = parts.first().and_then(|s| s.parse().ok()).unwrap_or(2026);
    let month: usize = parts.get(1).and_then(|s| s.parse::<usize>().ok()).unwrap_or(1);
    let month_names = ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];
    let month_name = month_names.get(month.saturating_sub(1)).copied().unwrap_or("Jan");

    let folder_id = workspace_ablage::ensure_invoice_folder_path(
        &db.conn(), &workspace_id, year, month_name,
    )?;

    // Safe filename
    let safe_chars = |s: &str| -> String {
        s.chars()
            .map(|c| if matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') { '_' } else { c })
            .collect()
    };
    let safe_num  = safe_chars(&invoice_number);
    let safe_name = safe_chars(&account_name);
    let safe_name = if safe_name.chars().count() > 40 {
        safe_name.chars().take(40).collect::<String>()
    } else { safe_name };
    let filename = format!("{}_{}.pdf", safe_num, safe_name);

    // Write to disk
    let data_dir = app.path().app_data_dir()
        .map_err(|e| AppError::Io(e.to_string()))?;
    let file_id = uuid::Uuid::new_v4().to_string();
    let dest_dir = data_dir.join("cynera").join("ws_files").join(&workspace_id).join(&file_id);
    std::fs::create_dir_all(&dest_dir)?;
    let dest = dest_dir.join(&filename);
    std::fs::write(&dest, &pdf_data)?;

    workspace_ablage::add_ws_file(
        &db.conn(), &workspace_id, Some(&folder_id), &filename,
        &dest.to_string_lossy(), Some(pdf_data.len() as i64),
        Some("application/pdf"), "invoice", Some(&invoice_id),
    )
}
