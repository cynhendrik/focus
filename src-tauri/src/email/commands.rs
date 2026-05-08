use tauri::{Emitter, WebviewWindow as Window};
use uuid::Uuid;
use chrono::Utc;

use crate::email::{auto_detect, db, imap, keychain};
use crate::email::db::EmailDb;
use crate::email::types::{Account, CustomerRef, EmailBody, EmailHeader, SyncProgress, SyncResult};

// ── Account management ────────────────────────────────────────────────────────

#[tauri::command]
pub fn email_get_accounts(db: tauri::State<'_, EmailDb>) -> Result<Vec<Account>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::get_accounts(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn email_test_connection(
    email: String,
    password: String,
    imap_host: String,
    imap_port: u16,
) -> Result<(), String> {
    imap::test_connection(&email, &password, &imap_host, imap_port).await
}

#[tauri::command]
pub fn email_add_account(
    email: String,
    password: String,
    imap_host: String,
    imap_port: u16,
    display_name: String,
    db: tauri::State<'_, EmailDb>,
) -> Result<Account, String> {
    keychain::set(&email, &password)?;
    let account = Account {
        id:             Uuid::new_v4().to_string(),
        email:          email.clone(),
        display_name,
        imap_host,
        imap_port,
        last_synced_at: None,
        status:         "active".to_string(),
    };
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::insert_account(&conn, &account).map_err(|e| e.to_string())?;
    Ok(account)
}

#[tauri::command]
pub fn email_remove_account(
    account_id: String,
    db: tauri::State<'_, EmailDb>,
) -> Result<(), String> {
    let email = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        db::get_account(&conn, &account_id)
            .map_err(|e| e.to_string())?
            .map(|a| a.email)
    };
    if let Some(email) = email {
        keychain::delete(&email)?;
    }
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::delete_account(&conn, &account_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn email_detect_provider(email: String) -> Option<(String, u16)> {
    auto_detect::detect(&email).map(|(h, p)| (h.to_string(), p))
}

// ── Sync ──────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn email_sync(
    account_id: String,
    customers_json: String,
    window: Window,
    db: tauri::State<'_, EmailDb>,
) -> Result<SyncResult, String> {
    let customers: Vec<CustomerRef> = serde_json::from_str(&customers_json)
        .map_err(|e| format!("Ungültiges customers_json: {}", e))?;

    // Get account info — release lock before any await
    let (email, imap_host, imap_port, last_uid) = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        db::get_account_sync_info(&conn, &account_id).map_err(|e| e.to_string())?
    };

    let password = keychain::get(&email)?;

    let w = window.clone();
    let output = imap::sync_account(
        &email, &password, &imap_host, imap_port,
        &account_id, last_uid, &customers,
        move |progress: SyncProgress| {
            let _ = w.emit("email-sync-progress", &progress);
        },
    ).await;

    match output {
        Ok(out) => {
            let inserted = {
                let conn = db.0.lock().map_err(|e| e.to_string())?;
                db::insert_emails(&conn, &out.rows).map_err(|e| e.to_string())?
            };
            {
                let conn = db.0.lock().map_err(|e| e.to_string())?;
                db::update_last_synced(&conn, &account_id, out.max_uid, &Utc::now().to_rfc3339())
                    .map_err(|e| e.to_string())?;
                db::update_account_status(&conn, &account_id, "active")
                    .map_err(|e| e.to_string())?;
            }
            let _ = window.emit("email-sync-progress", &SyncProgress {
                folder: "done".into(), done: inserted, total: inserted, phase: "done".into(),
            });
            let skipped = out.inserted_count.saturating_sub(inserted);
            Ok(SyncResult { inserted, skipped })
        }
        Err(e) => {
            let status = if e.contains("Authentifizierung") { "auth_error" } else { "error" };
            if let Ok(conn) = db.0.lock() {
                let _ = db::update_account_status(&conn, &account_id, status);
            }
            Err(e)
        }
    }
}

// ── Email CRUD ────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn email_list(
    account_id: String,
    folder: String,
    limit: i64,
    offset: i64,
    search: String,
    db: tauri::State<'_, EmailDb>,
) -> Result<Vec<EmailHeader>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::list_emails(&conn, &account_id, &folder, limit, offset, &search)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn email_get_body(
    email_id: String,
    db: tauri::State<'_, EmailDb>,
) -> Result<Option<EmailBody>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::get_email_body(&conn, &email_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn email_mark_read(
    email_id: String,
    is_read: bool,
    db: tauri::State<'_, EmailDb>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::set_read(&conn, &email_id, is_read).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn email_assign_customer(
    email_id: String,
    customer_id: Option<String>,
    db: tauri::State<'_, EmailDb>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::assign_customer(&conn, &email_id, customer_id.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn email_delete(
    email_id: String,
    db: tauri::State<'_, EmailDb>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::delete_email(&conn, &email_id).map_err(|e| e.to_string())
}
