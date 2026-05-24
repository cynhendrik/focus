use tauri::{Emitter, WebviewWindow as Window};
use uuid::Uuid;
use chrono::Utc;

use crate::email::{auto_detect, db, imap, keychain, smtp};
use crate::email::db::EmailDb;
use crate::email::types::{Account, CustomerRef, EmailAttachment, EmailBody, EmailHeader, SendEmailPayload, SyncProgress, SyncResult};

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
pub async fn email_add_account(
    email: String,
    password: String,
    imap_host: String,
    imap_port: u16,
    display_name: String,
    smtp_host: Option<String>,
    smtp_port: Option<u16>,
    smtp_starttls: Option<bool>,
    db: tauri::State<'_, EmailDb>,
) -> Result<Account, String> {
    // 1. Determine SMTP config — use provided values or auto-derive
    let derived_smtp_host = smtp_host
        .clone()
        .filter(|h| !h.is_empty())
        .unwrap_or_else(|| auto_detect::derive_smtp_host(&imap_host));

    let resolved_port = smtp_port.unwrap_or(auto_detect::DEFAULT_SMTP_PORT);
    let resolved_starttls = smtp_starttls.unwrap_or(true);

    // 2. Test SMTP connection
    let smtp_test_result = smtp::test_smtp_connection(
        &derived_smtp_host, resolved_port, resolved_starttls, &email, &password,
    ).await;

    let (final_smtp_host, final_smtp_port, final_starttls) =
        if smtp_test_result.is_ok() {
            (derived_smtp_host.clone(), resolved_port, resolved_starttls)
        } else if smtp_host.as_deref().map(|h| h.is_empty()).unwrap_or(true) {
            // Auto-detect failed on given port — try SSL on 465 as fallback
            let ssl_result = smtp::test_smtp_connection(
                &derived_smtp_host, 465, false, &email, &password,
            ).await;
            if ssl_result.is_ok() {
                (derived_smtp_host.clone(), 465, false)
            } else {
                // Both failed — signal frontend to show manual SMTP form
                return Err(format!(
                    "SMTP_AUTODETECT_FAILED:{{\"smtpHost\":\"{}\",\"smtpPort\":587}}",
                    derived_smtp_host
                ));
            }
        } else {
            // Explicit SMTP config was provided but test failed
            return Err(smtp_test_result.unwrap_err());
        };

    // 3. Save credentials + account
    keychain::set(&email, &password)?;
    let account = Account {
        id:             Uuid::new_v4().to_string(),
        email:          email.clone(),
        display_name,
        imap_host,
        imap_port,
        smtp_host:      final_smtp_host,
        smtp_port:      final_smtp_port,
        smtp_starttls:  final_starttls,
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
        None, // specific_folder — None = INBOX + Sent (default behavior)
        move |progress: SyncProgress| {
            let _ = w.emit("email-sync-progress", &progress);
        },
    ).await;

    match output {
        Ok(out) => {
            let inserted = {
                let conn = db.0.lock().map_err(|e| e.to_string())?;
                let n = db::insert_emails(&conn, &out.rows).map_err(|e| e.to_string())?;
                db::insert_attachments(&conn, &out.attachments).map_err(|e| e.to_string())?;
                n
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

// ── SMTP ──────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn email_test_smtp(
    email: String,
    password: String,
    smtp_host: String,
    smtp_port: u16,
    starttls: bool,
) -> Result<(), String> {
    smtp::test_smtp_connection(&smtp_host, smtp_port, starttls, &email, &password).await
}

#[tauri::command]
pub async fn email_send(
    payload: SendEmailPayload,
    db: tauri::State<'_, EmailDb>,
) -> Result<(), String> {
    let (from_email, smtp_host, smtp_port, smtp_starttls, display_name) = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let (e, h, p, s) = db::get_account_smtp(&conn, &payload.account_id)
            .map_err(|e| e.to_string())?;
        let account = db::get_account(&conn, &payload.account_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Konto nicht gefunden".to_string())?;
        (e, h, p, s, account.display_name)
    };
    let password = keychain::get(&from_email)?;

    smtp::send_email(
        &smtp_host, smtp_port, smtp_starttls,
        &from_email, &display_name,
        &password, &payload,
    ).await
}

// ── Attachments ───────────────────────────────────────────────────────────────

#[tauri::command]
pub fn email_get_attachments(
    email_id: String,
    db: tauri::State<'_, EmailDb>,
) -> Result<Vec<EmailAttachment>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::get_attachments(&conn, &email_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn email_download_attachment(
    attachment_id: String,
    db: tauri::State<'_, EmailDb>,
) -> Result<String, String> {
    let (filename, content) = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        db::get_attachment_content(&conn, &attachment_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Anhang nicht gefunden".to_string())?
    };

    let temp_dir = std::env::temp_dir().join(Uuid::new_v4().to_string());
    std::fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Konnte temporäres Verzeichnis nicht erstellen: {}", e))?;
    let temp_path = temp_dir.join(&filename);
    std::fs::write(&temp_path, &content)
        .map_err(|e| format!("Konnte Anhang nicht speichern: {}", e))?;

    open::that(&temp_path)
        .map_err(|e| format!("Konnte Datei nicht öffnen: {}", e))?;

    Ok(temp_path.to_string_lossy().to_string())
}
