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

use std::sync::atomic::{AtomicBool, Ordering};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};
use email::db::EmailDb;
use db::pool::DbPool;
use core::auth::SyncState;
use tauri_plugin_autostart::MacosLauncher;

fn groq_key() -> &'static str {
    option_env!("GROQ_API_KEY").unwrap_or("")
}

#[derive(Debug, Deserialize, Serialize, Clone)]
struct Message {
    role: String,
    content: String,
}

/// Verhalten beim Fenster-Schließen: true = in den Tray minimieren (Default),
/// false = App wirklich beenden. Wird von den Einstellungen per Command gesetzt.
pub struct CloseToTray(pub AtomicBool);

#[tauri::command]
fn cmd_set_close_to_tray(state: tauri::State<'_, CloseToTray>, enabled: bool) {
    state.0.store(enabled, Ordering::Relaxed);
}

#[tauri::command]
fn cmd_update_tray_status(app: tauri::AppHandle, open_count: u32) {
    if let Some(tray) = app.tray_by_id("main-tray") {
        let tip = if open_count > 0 {
            format!("Cultera OS — {open_count} offene Punkte")
        } else {
            "Cultera OS — alles erledigt".to_string()
        };
        let _ = tray.set_tooltip(Some(tip));
    }
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

/// Kopiert ein Verzeichnis rekursiv (überschreibt vorhandene Dateien NICHT).
/// Best effort — einzelne Kopierfehler werden ignoriert, damit ein gesperrtes
/// Cache-File die Migration nicht abbricht.
fn copy_dir_all(src: &std::path::Path, dst: &std::path::Path) {
    if std::fs::create_dir_all(dst).is_err() { return; }
    let Ok(entries) = std::fs::read_dir(src) else { return };
    for entry in entries.flatten() {
        let from = entry.path();
        let to = dst.join(entry.file_name());
        match entry.file_type() {
            Ok(ty) if ty.is_dir() => copy_dir_all(&from, &to),
            Ok(_) => { if !to.exists() { let _ = std::fs::copy(&from, &to); } }
            Err(_) => {}
        }
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Zweitstart: vorhandenes Fenster zeigen statt zweiten Prozess auf derselben DB.
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--hidden"])))
        .setup(|app| {
            // Init SQLite email database
            let data_dir = app.path()
                .app_data_dir()
                .expect("App-Data-Verzeichnis nicht gefunden");
            std::fs::create_dir_all(&data_dir)
                .expect("App-Data-Verzeichnis konnte nicht erstellt werden");

            // ── Rebrand-Migration (com.cynera.focus → de.cultera.focus) ──────────
            // Der Bundle-Identifier-Wechsel ändert die App-Verzeichnisse. Beim ersten
            // Start mit neuem Identifier übernehmen wir die alten Daten verlustfrei:
            //  • app_data_dir (Roaming): focus.db, emails.db, backups/
            //  • app_local_data_dir (Local): WebView2-Profil = localStorage
            // Kopie statt Verschieben — der alte Ordner bleibt als Sicherheitsnetz.
            if !data_dir.join("focus.db").exists() {
                const OLD_ID: &str = "com.cynera.focus";
                if let Some(parent) = data_dir.parent() {
                    let old = parent.join(OLD_ID);
                    if old.join("focus.db").exists() {
                        copy_dir_all(&old, &data_dir);
                        eprintln!("[migration] Daten von {OLD_ID} übernommen → {}", data_dir.display());
                    }
                }
                if let Ok(local) = app.path().app_local_data_dir() {
                    if let Some(lparent) = local.parent() {
                        let old_local = lparent.join(OLD_ID);
                        if old_local.exists() {
                            copy_dir_all(&old_local, &local);
                        }
                    }
                }
            }

            // Main app DB (SQLite — all domains)
            let db_path = data_dir.join("focus.db");
            let db_pool = DbPool::new(&db_path)
                .expect("focus.db konnte nicht geöffnet werden");
            let sync_state = SyncState::new();
            app.manage(sync_state.clone());
            app.manage(db_pool.clone());
            app.manage(CloseToTray(AtomicBool::new(true)));

            // Legacy email DB — kept until Phase 4 email migration
            let email_db_path = data_dir.join("emails.db");
            let conn = rusqlite::Connection::open(&email_db_path)
                .expect("emails.db konnte nicht geöffnet werden");
            email::db::init_schema(&conn)
                .expect("Datenbankschema konnte nicht initialisiert werden");
            app.manage(EmailDb(std::sync::Mutex::new(conn)));

            let window = app.get_webview_window("main").unwrap();
            window.set_title("Cultera OS").unwrap();
            // Autostart übergibt --hidden: dann im Tray bleiben statt Fenster zeigen.
            let start_hidden = std::env::args().any(|a| a == "--hidden");
            if !start_hidden {
                window.maximize().unwrap();
                window.show().unwrap();
            }

            // ── Tray: Cultera OS lebt im Hintergrund weiter ─────────────────────
            {
                use tauri::menu::{Menu, MenuItem};
                use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

                fn show_main(app: &tauri::AppHandle) {
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.show();
                        let _ = w.unminimize();
                        let _ = w.set_focus();
                    }
                }

                let open_item = MenuItem::with_id(app, "open", "Cultera OS öffnen", true, None::<&str>)?;
                let quit_item = MenuItem::with_id(app, "quit", "Beenden", true, None::<&str>)?;
                let tray_menu = Menu::with_items(app, &[&open_item, &quit_item])?;

                if let Some(icon) = app.default_window_icon().cloned() {
                    TrayIconBuilder::with_id("main-tray")
                        .icon(icon)
                        .tooltip("Cultera OS")
                        .menu(&tray_menu)
                        .show_menu_on_left_click(false)
                        .on_menu_event(|app, event| match event.id.as_ref() {
                            "open" => show_main(app),
                            "quit" => {
                                commands::export::auto_export(app);
                                app.exit(0);
                            }
                            _ => {}
                        })
                        .on_tray_icon_event(|tray, event| {
                            if let TrayIconEvent::Click {
                                button: MouseButton::Left,
                                button_state: MouseButtonState::Up, ..
                            } = event {
                                show_main(tray.app_handle());
                            }
                        })
                        .build(app)?;
                } else {
                    eprintln!("[tray] Kein Fenster-Icon — Tray deaktiviert");
                }
            }

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
            cmd_set_close_to_tray,
            cmd_update_tray_status,
            commands::account::get_accounts,
            commands::account::upsert_account,
            commands::account::delete_account,
            commands::account::cmd_set_primary_deal,
            commands::account::cmd_set_account_archived,
            commands::pipeline_stage::cmd_get_pipeline_stages,
            commands::pipeline_stage::cmd_upsert_pipeline_stage,
            commands::pipeline_stage::cmd_delete_pipeline_stage,
            commands::pipeline_stage::cmd_reorder_pipeline_stages,
            commands::project::cmd_get_projects,
            commands::project::cmd_get_project,
            commands::project::cmd_upsert_project,
            commands::project::cmd_delete_project,
            commands::project::cmd_advance_project_phase,
            commands::project::cmd_set_project_status,
            commands::project_phase::cmd_get_project_phases,
            commands::project_phase::cmd_create_project_phase,
            commands::project_phase::cmd_delete_project_phase,
            commands::project_phase::cmd_reorder_project_phases,
            commands::lead_stage::cmd_get_lead_stages,
            commands::lead_stage::cmd_upsert_lead_stage,
            commands::lead_stage::cmd_delete_lead_stage,
            commands::lead_stage::cmd_reorder_lead_stages,
            commands::lead_stage::cmd_seed_lead_stages,
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
            commands::activity::get_activities_by_project,
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
            commands::folder::cmd_import_file_from_path,
            commands::folder::cmd_read_file,
            commands::folder::cmd_open_file,
            commands::folder::cmd_download_file,
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
            email::commands::email_fetch_body_imap,
            email::commands::email_mark_read,
            email::commands::email_assign_customer,
            email::commands::email_rematch_customers,
            email::commands::email_delete,
            email::commands::email_set_not_a_lead,
            email::commands::email_list_ignored_senders,
            email::commands::email_ignore_sender,
            email::commands::email_unignore_sender,
            email::commands::email_test_smtp,
            email::commands::email_send,
            email::commands::email_get_attachments,
            email::commands::email_download_attachment,
            email::commands::email_list_folders,
            email::commands::email_create_folder,
            email::commands::email_delete_folder,
            email::commands::email_move_to_folder,
            core::auth::set_auth_token,
            core::sync::get_sync_status,
            core::sync::sync_now,
            core::sync::get_failed_sync_entries,
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
            commands::follow_up::cmd_mark_follow_up_done,
            commands::follow_up::cmd_delete_follow_up,
            commands::follow_up::cmd_update_follow_up_draft,
            commands::contract::cmd_get_contracts,
            commands::contract::cmd_upsert_contract,
            commands::contract::cmd_delete_contract,
            commands::payment::cmd_add_payment,
            commands::payment::cmd_get_payments,
            commands::payment::cmd_get_payments_by_workspace,
            commands::payment::cmd_delete_payment,
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
            commands::invoice::get_invoice_sequence,
            commands::invoice::set_invoice_start_number,
            commands::invoice::peek_invoice_number,
            commands::invoice::set_invoice_format,
            commands::invoice::invoice_number_exists,
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
            commands::export::cmd_export_backup,
            commands::export::cmd_import_backup,
            commands::export::cmd_reset_workspace,
            commands::export::cmd_delete_workspace,
            commands::export::cmd_rescope_workspace,
            commands::export::cmd_has_local_orphan_data,
            commands::export::cmd_list_local_workspace_ids,
            commands::export::cmd_dump_table,
            commands::calendar::get_calendar_events,
            commands::calendar::upsert_calendar_event,
            commands::calendar::delete_calendar_event,
            commands::campaign::cmd_list_campaigns,
            commands::campaign::cmd_get_campaign,
            commands::campaign::cmd_get_campaign_recipients,
            commands::campaign::cmd_create_campaign,
            commands::campaign::cmd_send_campaign,
            commands::campaign::cmd_store_campaign_attachment,
            commands::ai::cmd_anthropic_messages,
            commands::notes::get_note_entries,
            commands::notes::create_note_entry,
            commands::notes::update_note_entry,
            commands::notes::delete_note_entry,
            commands::notes::get_note_folders,
            commands::notes::create_note_folder,
            commands::notes::update_note_folder,
            commands::notes::delete_note_folder,
            commands::prepared_item::cmd_get_active_prepared_items,
            commands::prepared_item::cmd_insert_prepared_item_ignore,
            commands::prepared_item::cmd_update_prepared_item_status,
            commands::prepared_item::cmd_update_prepared_item_payload,
            commands::prepared_item::cmd_set_prepared_item_assignee,
            commands::prepared_item::cmd_get_approved_prepared_items_since,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Sicherheitsnetz-Backup wie bisher — best effort.
                commands::export::auto_export(window.app_handle());
                // Default: in den Tray statt beenden — die Präsenz-Schicht
                // (Briefing, Geld-Events) lebt nur, solange der Prozess lebt.
                let to_tray = window.app_handle().state::<CloseToTray>().0.load(Ordering::Relaxed);
                if to_tray && window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("Fehler beim Starten der Anwendung");
}
