#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod email;
mod error;
mod db;
mod commands;
mod core;
mod services;
mod activity_engine;
mod engine;

pub use error::AppError;

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};
use email::db::EmailDb;
use db::pool::DbPool;
use core::auth::SyncState;

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
            let sync_state = SyncState::new();
            app.manage(sync_state.clone());
            app.manage(db_pool.clone());

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

            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                core::sync::connectivity::run_loop(app_handle, sync_state, db_pool).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            focus_ai_chat,
            commands::account::get_accounts,
            commands::account::upsert_account,
            commands::account::delete_account,
            commands::account::cmd_set_primary_deal,
            commands::pipeline_stage::cmd_get_pipeline_stages,
            commands::pipeline_stage::cmd_upsert_pipeline_stage,
            commands::pipeline_stage::cmd_delete_pipeline_stage,
            commands::pipeline_stage::cmd_reorder_pipeline_stages,
            commands::automation_rule::cmd_get_automation_rules,
            commands::automation_rule::cmd_set_rule_active,
            commands::contact::get_contacts,
            commands::contact::upsert_contact,
            commands::contact::delete_contact,
            commands::deal::get_deals,
            commands::deal::upsert_deal,
            commands::deal::delete_deal,
            commands::deal::update_deal_stage,
            commands::deal::get_deals_by_workspace,
            commands::deal::get_deals_by_customer,
            commands::activity::create_activity,
            commands::activity::update_activity,
            commands::activity::delete_activity,
            commands::activity::get_activities_by_account,
            commands::activity::get_activities_by_deal,
            commands::activity::get_open_tasks,
            commands::activity::get_last_activity_dates,
            commands::activity::get_activities_by_customer,
            commands::activity::get_open_followups,
            commands::pipeline_stage::cmd_seed_pipeline_stages,
            commands::kpi::get_kpis,
            commands::kpi::upsert_kpi,
            commands::kpi::delete_kpi,
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
            commands::folder::cmd_import_file,
            commands::company::get_company_settings,
            commands::company::update_company_settings,
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
            email::commands::email_test_smtp,
            email::commands::email_send,
            email::commands::email_get_attachments,
            email::commands::email_download_attachment,
            email::commands::email_list_folders,
            core::auth::set_auth_token,
            core::sync::get_sync_status,
            core::sync::sync_now,
            commands::lead::get_leads,
            commands::lead::upsert_lead,
            commands::lead::bulk_update_leads,
            commands::lead::convert_lead_to_client,
            commands::lead::insert_synced_leads,
            commands::lead::update_lead_stage,
            commands::follow_up::cmd_get_due_follow_ups,
            commands::follow_up::cmd_get_follow_ups_for_lead,
            commands::follow_up::cmd_create_follow_up_sequence,
            commands::follow_up::cmd_cancel_follow_ups_for_lead,
            commands::follow_up::cmd_mark_follow_up_sent,
            commands::follow_up::cmd_mark_follow_up_skipped,
            commands::follow_up::cmd_update_follow_up_draft,
            commands::invoice::get_invoices,
            commands::invoice::get_invoice,
            commands::invoice::create_invoice,
            commands::invoice::update_invoice,
            commands::invoice::delete_invoice,
            commands::invoice::approve_invoice_suggestion,
            commands::invoice::update_invoice_status,
            commands::invoice::get_invoice_suggestions,
            commands::invoice::get_invoices_by_account,
            commands::invoice::get_finance_kpis,
            commands::offer::get_offers,
            commands::offer::get_offer,
            commands::offer::create_offer,
            commands::offer::update_offer,
            commands::offer::delete_offer,
            commands::offer::update_offer_status,
            commands::offer::convert_offer_to_invoice,
            commands::offer::get_offers_by_account,
            commands::workspace_ablage::cmd_get_ws_folders,
            commands::workspace_ablage::cmd_create_ws_folder,
            commands::workspace_ablage::cmd_delete_ws_folder,
            commands::workspace_ablage::cmd_get_ws_files,
            commands::workspace_ablage::cmd_import_ws_file,
            commands::workspace_ablage::cmd_delete_ws_file,
            commands::workspace_ablage::cmd_read_ws_file,
            commands::workspace_ablage::cmd_save_invoice_to_ablage,
            commands::export::save_pdf,
            commands::export::save_zip,
            commands::calendar::get_calendar_events,
            commands::calendar::upsert_calendar_event,
            commands::calendar::delete_calendar_event,
            commands::campaign::cmd_list_campaigns,
            commands::campaign::cmd_get_campaign,
            commands::campaign::cmd_get_campaign_recipients,
            commands::campaign::cmd_create_campaign,
            commands::campaign::cmd_send_campaign,
            commands::ai::cmd_anthropic_messages,
        ])
        .run(tauri::generate_context!())
        .expect("Fehler beim Starten der Anwendung");
}
