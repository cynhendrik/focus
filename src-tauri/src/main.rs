#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod email;
mod error;
mod db;
mod commands;
mod services;

pub use error::AppError;

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};
use email::db::EmailDb;
use db::pool::DbPool;

fn groq_key() -> &'static str {
    option_env!("GROQ_API_KEY").unwrap_or("")
}

#[derive(Debug, Deserialize, Serialize, Clone)]
struct Message {
    role: String,
    content: String,
}

#[tauri::command]
async fn focus_ai_chat(window: tauri::WebviewWindow, messages: Vec<Message>) -> Result<(), String> {
    let key = groq_key();
    if key.is_empty() {
        return Err("GROQ_API_KEY nicht konfiguriert. Bitte in src-tauri/.cargo/config.toml setzen.".to_string());
    }

    let client = reqwest::Client::new();
    let payload = serde_json::json!({
        "model": "llama-3.1-8b-instant",
        "messages": messages,
        "stream": true,
        "max_tokens": 2048,
        "temperature": 0.7
    });

    let response = client
        .post("https://api.groq.com/openai/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", key))
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Netzwerkfehler: {}", e))?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let body = response.text().await.unwrap_or_default();
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&body) {
            if let Some(msg) = json["error"]["message"].as_str() {
                return Err(msg.to_string());
            }
        }
        return Err(format!("API Fehler HTTP {}", status));
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();

    while let Some(item) = stream.next().await {
        let chunk = item.map_err(|e| format!("Stream-Fehler: {}", e))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(pos) = buffer.find('\n') {
            let line = buffer[..pos].trim().to_string();
            buffer = buffer[pos + 1..].to_string();

            if let Some(data) = line.strip_prefix("data: ") {
                let data = data.trim();
                if data == "[DONE]" {
                    let _ = window.emit("ai-done", ());
                    return Ok(());
                }
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                    if let Some(content) = json["choices"][0]["delta"]["content"].as_str() {
                        if !content.is_empty() {
                            let _ = window.emit("ai-chunk", content.to_string());
                        }
                    }
                }
            }
        }
    }

    let _ = window.emit("ai-done", ());
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Init SQLite email database
            let data_dir = app.path()
                .app_data_dir()
                .expect("App-Data-Verzeichnis nicht gefunden");
            std::fs::create_dir_all(&data_dir)
                .expect("App-Data-Verzeichnis konnte nicht erstellt werden");

            // Main app DB (SQLite — all domains)
            let db_path = data_dir.join("focus.db");
            let db_pool = DbPool::new(&db_path)
                .expect("focus.db konnte nicht geöffnet werden");
            app.manage(db_pool);

            // Legacy email DB — kept until Phase 4 email migration
            let email_db_path = data_dir.join("emails.db");
            let conn = rusqlite::Connection::open(&email_db_path)
                .expect("emails.db konnte nicht geöffnet werden");
            email::db::init_schema(&conn)
                .expect("Datenbankschema konnte nicht initialisiert werden");
            app.manage(EmailDb(std::sync::Mutex::new(conn)));

            let window = app.get_webview_window("main").unwrap();
            window.set_title("Focus").unwrap();
            window.center().unwrap();

            #[cfg(target_os = "macos")]
            {
                use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
                apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, None)
                    .expect("Unsupported platform! 'apply_vibrancy' is only supported on macOS");
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            focus_ai_chat,
            commands::customer::get_customers,
            commands::customer::upsert_customer,
            commands::customer::delete_customer,
            commands::todo::get_todos,
            commands::todo::upsert_todo,
            commands::todo::delete_todo,
            commands::note::get_notes,
            commands::note::upsert_note,
            commands::note::delete_note,
            commands::kpi::get_kpis,
            commands::kpi::upsert_kpi,
            commands::kpi::delete_kpi,
            commands::time_entry::get_time_entries,
            commands::time_entry::add_time_entry,
            commands::time_entry::delete_time_entry,
            commands::chat::get_chat_messages,
            commands::chat::add_chat_message,
            commands::chat::mark_chat_read,
            commands::chat::delete_chat_message,
            commands::folder::cmd_get_folders,
            commands::folder::cmd_create_folder,
            commands::folder::cmd_delete_folder,
            commands::folder::cmd_get_files,
            commands::folder::cmd_add_file,
            commands::folder::cmd_delete_file,
            commands::crm::get_follow_ups,
            commands::crm::upsert_follow_up,
            commands::crm::delete_follow_up,
            email::commands::email_get_accounts,
            email::commands::email_test_connection,
            email::commands::email_add_account,
            email::commands::email_remove_account,
            email::commands::email_detect_provider,
            email::commands::email_sync,
            email::commands::email_list,
            email::commands::email_get_body,
            email::commands::email_mark_read,
            email::commands::email_assign_customer,
            email::commands::email_delete,
        ])
        .run(tauri::generate_context!())
        .expect("Fehler beim Starten der Anwendung");
}
