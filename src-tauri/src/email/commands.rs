use tauri::{Emitter, WebviewWindow as Window};
use uuid::Uuid;
use chrono::Utc;

use crate::email::{auto_detect, db, imap, keychain, smtp};
use crate::email::db::EmailDb;
use crate::db::pool::DbPool;
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
    folder: Option<String>,       // NEU — None = INBOX + Sent; Some(path) = nur dieser Ordner
    customers_json: String,
    window: Window,
    db: tauri::State<'_, EmailDb>,
    pool: tauri::State<'_, DbPool>,   // für Reply-Detection
) -> Result<SyncResult, String> {
    let customers: Vec<CustomerRef> = serde_json::from_str(&customers_json)
        .map_err(|e| format!("Ungültiges customers_json: {}", e))?;

    // Account-Daten holen — Lock vor dem await freigeben
    let (email, imap_host, imap_port, account_last_uid) = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        db::get_account_sync_info(&conn, &account_id).map_err(|e| e.to_string())?
    };

    // last_uid: für On-Demand-Sync eines einzelnen Ordners aus emails-Tabelle ableiten
    let last_uid = if let Some(ref f) = folder {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        db::get_folder_last_uid(&conn, &account_id, f).map_err(|e| e.to_string())?
    } else {
        account_last_uid
    };

    let password = keychain::get(&email)?;

    let w = window.clone();
    let specific_folder_ref = folder.as_deref();
    let output = imap::sync_account(
        &email, &password, &imap_host, imap_port,
        &account_id, last_uid, &customers,
        specific_folder_ref,
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
                // Ignorierliste anwenden: neue Mails ignorierter Absender
                // bleiben dauerhaft aus der Newcomer-Ansicht draußen.
                db::apply_ignored_senders(&conn).map_err(|e| e.to_string())?;
                n
            };
            // Reply-Detection: newly synced incoming emails may be campaign replies
            if inserted > 0 {
                for row in &out.rows {
                    // Only process inbound emails (skip own-account sent messages)
                    if !row.from_addr.is_empty() && row.from_addr != email {
                        let _ = crate::db::campaign::mark_replied(&pool.conn(), &row.from_addr);
                    }
                }
            }
            {
                let conn = db.0.lock().map_err(|e| e.to_string())?;
                // last_synced_uid nur bei Voll-Sync aktualisieren, nicht bei On-Demand-Sync
                if folder.is_none() {
                    db::update_last_synced(&conn, &account_id, out.max_uid, &Utc::now().to_rfc3339())
                        .map_err(|e| e.to_string())?;
                }
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

// ── Folder listing ─────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn email_list_folders(
    account_id: String,
    db: tauri::State<'_, EmailDb>,
) -> Result<Vec<crate::email::types::Folder>, String> {
    // 1. Account-Daten holen
    let (email, imap_host, imap_port) = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let account = db::get_account(&conn, &account_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Konto nicht gefunden".to_string())?;
        (account.email, account.imap_host, account.imap_port)
    };

    // 2. Passwort aus Keychain
    let password = keychain::get(&email)?;

    // 3. Ordner via IMAP holen — bei Fehler: gecachte Daten zurückgeben
    match crate::email::folders::fetch_folders(&email, &password, &imap_host, imap_port).await {
        Ok(raw_folders) => {
            // 4. In DB speichern (vollständige Aktualisierung)
            let conn = db.0.lock().map_err(|e| e.to_string())?;
            db::upsert_folders(&conn, &account_id, &raw_folders)
                .map_err(|e| e.to_string())?;
        }
        Err(e) => {
            // IMAP nicht erreichbar — stale Cache ist okay, kein Fehler propagieren
            eprintln!("email_list_folders: IMAP nicht erreichbar, verwende Cache. Fehler: {}", e);
        }
    }

    // 5. Aus DB zurückgeben (frisch oder gecacht)
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::get_folders(&conn, &account_id).map_err(|e| e.to_string())
}

// ── Folder management ─────────────────────────────────────────────────────────

const SYSTEM_PATH_SEGMENTS: &[&str] = &[
    "inbox", "sent", "sent messages", "drafts", "draft",
    "trash", "deleted messages", "deleted", "spam", "junk",
    "junk e-mail", "archive", "archiv",
];

const SYSTEM_FLAGS: &[&str] = &[
    "\\Sent", "\\Drafts", "\\Trash", "\\Junk", "\\All", "\\Archive",
];

#[tauri::command]
pub async fn email_create_folder(
    account_id: String,
    folder_path: String,
    db: tauri::State<'_, EmailDb>,
) -> Result<(), String> {
    // Systemordner-Namen verbieten
    let path_lc = folder_path.to_lowercase();
    let last_seg = path_lc.split(['.', '/']).last().unwrap_or(&path_lc);
    if path_lc == "inbox" || SYSTEM_PATH_SEGMENTS.contains(&last_seg) {
        return Err("Systemordner-Namen sind nicht erlaubt.".to_string());
    }

    let (email, imap_host, imap_port) = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let account = db::get_account(&conn, &account_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Konto nicht gefunden".to_string())?;
        (account.email, account.imap_host, account.imap_port)
    };
    let password = keychain::get(&email)?;
    crate::email::folders::create_imap_folder(&email, &password, &imap_host, imap_port, &folder_path).await
}

#[tauri::command]
pub async fn email_delete_folder(
    account_id: String,
    folder_path: String,
    db: tauri::State<'_, EmailDb>,
) -> Result<(), String> {
    // Systemordner schützen
    let path_lc = folder_path.to_lowercase();
    let last_seg = path_lc.split(['.', '/']).last().unwrap_or(&path_lc);
    // path_lc == "inbox" guards the root case explicitly (last_seg also catches it)
    if path_lc == "inbox" || SYSTEM_PATH_SEGMENTS.contains(&last_seg) {
        return Err("Systemordner können nicht gelöscht werden.".to_string());
    }

    let (email, imap_host, imap_port) = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        // Flags aus DB-Cache prüfen
        let flags = db::get_folder_flags(&conn, &account_id, &folder_path)
            .map_err(|e| e.to_string())?;
        let flags_lc: Vec<String> = flags.iter().map(|f| f.to_lowercase()).collect();
        if SYSTEM_FLAGS.iter().any(|sf| flags_lc.iter().any(|f| f == &sf.to_lowercase())) {
            return Err("Systemordner können nicht gelöscht werden.".to_string());
        }
        let account = db::get_account(&conn, &account_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Konto nicht gefunden".to_string())?;
        (account.email, account.imap_host, account.imap_port)
    };
    let password = keychain::get(&email)?;
    crate::email::folders::delete_imap_folder(&email, &password, &imap_host, imap_port, &folder_path).await?;
    // Cache bereinigen
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::delete_folder(&conn, &account_id, &folder_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn email_move_to_folder(
    account_id: String,
    email_id: String,
    target_folder: String,
    db: tauri::State<'_, EmailDb>,
) -> Result<(), String> {
    let (uid, source_folder, email_addr, imap_host, imap_port) = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let (uid, folder, acc_id) = db::get_email_uid_and_folder(&conn, &email_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "E-Mail nicht gefunden".to_string())?;
        if acc_id != account_id {
            return Err("E-Mail gehört nicht zu diesem Konto.".to_string());
        }
        let account = db::get_account(&conn, &account_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Konto nicht gefunden".to_string())?;
        (uid, folder, account.email, account.imap_host, account.imap_port)
    };
    let password = keychain::get(&email_addr)?;
    crate::email::imap::move_email(
        &email_addr, &password, &imap_host, imap_port,
        uid, &source_folder, &target_folder,
    ).await?;
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::update_email_folder(&conn, &email_id, &target_folder).map_err(|e| e.to_string())
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
pub async fn email_fetch_body_imap(
    email_id: String,
    db: tauri::State<'_, EmailDb>,
) -> Result<EmailBody, String> {
    // 1. Look up uid, folder, account_id
    let (uid, folder, account_id) = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        db::get_email_uid_and_folder(&conn, &email_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "E-Mail nicht gefunden".to_string())?
    };

    // 2. Load account credentials
    let (imap_email, password, imap_host, imap_port) = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let acc = db::get_account(&conn, &account_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Konto nicht gefunden".to_string())?;
        let pw = crate::email::keychain::get(&acc.email).map_err(|e| e)?;
        (acc.email, pw, acc.imap_host, acc.imap_port)
    };

    // 3. Fetch from IMAP
    let (body_text, body_html) = crate::email::imap::fetch_single_body(
        &imap_email, &password, &imap_host, imap_port, &folder, uid,
    ).await?;

    // 4. Update DB
    {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        db::update_email_body(&conn, &email_id, &body_text, &body_html)
            .map_err(|e| e.to_string())?;
    }

    Ok(EmailBody { id: email_id, body_text, body_html })
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

/// Ordnet bislang nicht zugeordnete Mails rückwirkend passenden Kunden zu —
/// Auslöser: ein neuer/aktualisierter Kunde. Gibt die Anzahl Treffer zurück.
#[tauri::command]
pub fn email_rematch_customers(
    customers_json: String,
    db: tauri::State<'_, EmailDb>,
) -> Result<usize, String> {
    let customers: Vec<CustomerRef> = serde_json::from_str(&customers_json)
        .map_err(|e| format!("Ungültiges customers_json: {}", e))?;
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::rematch_auto(&conn, &customers).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn email_delete(
    email_id: String,
    db: tauri::State<'_, EmailDb>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::delete_email(&conn, &email_id).map_err(|e| e.to_string())
}

/// Markiert eine Mail als „kein Lead" (oder hebt es auf) — blendet sie dauerhaft
/// aus der Newcomer-Liste der unbekannten Absender aus.
#[tauri::command]
pub fn email_set_not_a_lead(
    email_id: String,
    value: bool,
    db: tauri::State<'_, EmailDb>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::set_not_a_lead(&conn, &email_id, value).map_err(|e| e.to_string())
}

// ── Ignorierte Absender ───────────────────────────────────────────────────────

#[tauri::command]
pub fn email_list_ignored_senders(
    db: tauri::State<'_, EmailDb>,
) -> Result<Vec<crate::email::types::IgnoredSender>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::list_ignored_senders(&conn).map_err(|e| e.to_string())
}

/// Setzt einen Absender (scope „address") oder eine Domain (scope „domain")
/// dauerhaft auf die Ignorierliste und blendet vorhandene Mails aus.
/// Gibt die aktualisierte Liste zurück.
#[tauri::command]
pub fn email_ignore_sender(
    pattern: String,
    scope: String,
    db: tauri::State<'_, EmailDb>,
) -> Result<Vec<crate::email::types::IgnoredSender>, String> {
    if scope != "address" && scope != "domain" {
        return Err("Ungültiger Scope — erlaubt sind 'address' und 'domain'.".to_string());
    }
    if pattern.trim().is_empty() {
        return Err("Leeres Muster kann nicht ignoriert werden.".to_string());
    }
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::add_ignored_sender(&conn, &pattern, &scope).map_err(|e| e.to_string())?;
    db::list_ignored_senders(&conn).map_err(|e| e.to_string())
}

/// Entfernt einen Ignorier-Eintrag und blendet dessen Mails wieder ein.
/// Gibt die aktualisierte Liste zurück.
#[tauri::command]
pub fn email_unignore_sender(
    id: String,
    db: tauri::State<'_, EmailDb>,
) -> Result<Vec<crate::email::types::IgnoredSender>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::remove_ignored_sender(&conn, &id).map_err(|e| e.to_string())?;
    db::list_ignored_senders(&conn).map_err(|e| e.to_string())
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
