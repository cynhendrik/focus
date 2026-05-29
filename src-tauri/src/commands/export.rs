use std::io::Write;

#[derive(serde::Deserialize)]
pub struct ExportFile {
    pub name: String,
    pub bytes: Vec<u8>,
}

fn downloads_dir() -> std::path::PathBuf {
    dirs::download_dir()
        .unwrap_or_else(|| dirs::home_dir().unwrap_or_else(std::env::temp_dir))
}

fn unique_path(dir: &std::path::Path, name: &str) -> std::path::PathBuf {
    let path = dir.join(name);
    if !path.exists() { return path; }
    let stem = std::path::Path::new(name).file_stem().and_then(|s| s.to_str()).unwrap_or("file");
    let ext  = std::path::Path::new(name).extension().and_then(|s| s.to_str()).unwrap_or("");
    for i in 1..=999 {
        let candidate = if ext.is_empty() {
            dir.join(format!("{stem} ({i})"))
        } else {
            dir.join(format!("{stem} ({i}).{ext}"))
        };
        if !candidate.exists() { return candidate; }
    }
    path
}

#[tauri::command]
pub async fn save_pdf(bytes: Vec<u8>, suggested_name: String) -> Result<String, String> {
    let dir  = downloads_dir();
    let path = unique_path(&dir, &suggested_name);
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn save_zip(files: Vec<ExportFile>, suggested_name: String) -> Result<String, String> {
    if files.is_empty() {
        return Err("Keine Dateien zum Exportieren".into());
    }

    let buf    = Vec::new();
    let cursor = std::io::Cursor::new(buf);
    let mut zip = zip::ZipWriter::new(cursor);
    let options = zip::write::FileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    for file in &files {
        zip.start_file(file.name.as_str(), options).map_err(|e| e.to_string())?;
        zip.write_all(&file.bytes).map_err(|e| e.to_string())?;
    }

    let cursor   = zip.finish().map_err(|e| e.to_string())?;
    let zip_bytes = cursor.into_inner();

    let dir  = downloads_dir();
    let path = unique_path(&dir, &suggested_name);
    std::fs::write(&path, &zip_bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}
