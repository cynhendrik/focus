# IMAP Email Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verbindet beliebige IMAP-E-Mail-Konten (15 Provider auto-erkannt) mit Cynera Focus, synchronisiert den vollständigen Posteingang in SQLite und ordnet E-Mails automatisch Kunden zu.

**Architecture:** Rust-Backend übernimmt alle IMAP-Operationen via `async-imap`; Passwörter gehen direkt in den OS-Keychain (`keyring`); E-Mail-Inhalte leben in lokaler SQLite-DB (`rusqlite`); Frontend ruft Tauri-Commands auf, kein E-Mail-Inhalt im Zustand/localStorage.

**Tech Stack:** async-imap 0.9, rusqlite 0.31 (bundled), keyring 2, native-tls 0.2, tokio-native-tls 0.3, mailparse 0.14, uuid 1, chrono 0.4, React + Tauri invoke/listen

---

## File Map

```
src-tauri/
  Cargo.toml                          MODIFY — add 8 new dependencies
  src/
    main.rs                           MODIFY — add email module, init DB, register commands
    email/
      mod.rs                          CREATE — pub re-exports
      types.rs                        CREATE — Account, EmailHeader, EmailBody, SyncProgress
      db.rs                           CREATE — SQLite init + CRUD
      keychain.rs                     CREATE — OS keychain wrapper
      auto_detect.rs                  CREATE — domain → IMAP host/port table + unit tests
      imap.rs                         CREATE — test_connection + sync logic
      commands.rs                     CREATE — 9 Tauri commands

src/
  store/index.js                      MODIFY — emailAccounts[], emailSyncStatus{} state
  components/mail/
    GlobalMailClient.jsx              MODIFY — replace Zustand emails with Tauri invokes
    AccountSetupModal.jsx             CREATE — 3-step account setup flow
    SyncProgressBar.jsx               CREATE — Tauri event listener for sync progress
```

---

## Task 1: Cargo.toml — Add dependencies

**Files:**
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Add dependencies**

Replace the `[dependencies]` section in `src-tauri/Cargo.toml`:

```toml
[package]
name = "cynera-system-os"
version = "1.0.0"
description = "CYNERA SYSTEM OS — Notebook"
authors = ["Cynera"]
edition = "2021"

[build-dependencies]
tauri-build = { version = "1.5", features = [] }

[dependencies]
tauri = { version = "1.6", features = [
  "shell-open",
  "window-all",
  "fs-all",
  "path-all",
  "dialog-all",
  "notification-all"
] }
serde       = { version = "1",    features = ["derive"] }
serde_json  = "1"
reqwest     = { version = "0.11", features = ["json", "stream"] }
futures-util = "0.3"

# ── Email ────────────────────────────────────────────────────────────────────
async-imap       = { version = "0.9", default-features = false, features = ["runtime-tokio-native-tls"] }
tokio            = { version = "1",   features = ["full"] }
tokio-native-tls = "0.3"
native-tls       = "0.2"
rusqlite         = { version = "0.31", features = ["bundled"] }
keyring          = "2"
mailparse        = "0.14"
uuid             = { version = "1", features = ["v4"] }
chrono           = { version = "0.4", features = ["serde"] }

[features]
custom-protocol = ["tauri/custom-protocol"]
```

- [ ] **Step 2: Verify compilation**

```powershell
cd src-tauri
cargo check
```

Expected: no errors (will warn about unused imports — ignore for now).

---

## Task 2: email/types.rs — Shared data structures

**Files:**
- Create: `src-tauri/src/email/types.rs`

- [ ] **Step 1: Create the file**

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Account {
    pub id: String,
    pub email: String,
    pub display_name: String,
    pub imap_host: String,
    pub imap_port: u16,
    pub last_synced_at: Option<String>,
    pub status: String, // "active" | "auth_error" | "error"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailHeader {
    pub id: String,
    pub account_id: String,
    pub uid: u32,
    pub folder: String,
    pub subject: String,
    pub from_addr: String,
    pub from_name: String,
    pub to_addrs: Vec<String>,
    pub sent_at: String,
    pub is_read: bool,
    pub customer_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailBody {
    pub id: String,
    pub body_text: String,
    pub body_html: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncProgress {
    pub folder: String,   // "INBOX" | "Sent"
    pub done: usize,
    pub total: usize,
    pub phase: String,    // "connecting" | "scanning" | "fetching" | "done" | "error"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncResult {
    pub inserted: usize,
    pub skipped: usize,
}

/// Minimal customer ref passed from frontend for auto-matching
#[derive(Debug, Deserialize)]
pub struct CustomerRef {
    pub id: String,
    pub email: Option<String>,
}
```

- [ ] **Step 2: Verify**

```powershell
cargo check
```

Expected: no errors.

---

## Task 3: email/db.rs — SQLite schema and CRUD

**Files:**
- Create: `src-tauri/src/email/db.rs`

- [ ] **Step 1: Create the file**

```rust
use rusqlite::{Connection, params};
use crate::email::types::{Account, EmailHeader, EmailBody};

pub struct EmailDb(pub std::sync::Mutex<Connection>);

pub fn init_schema(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS accounts (
            id            TEXT PRIMARY KEY,
            email         TEXT NOT NULL UNIQUE,
            display_name  TEXT NOT NULL DEFAULT '',
            imap_host     TEXT NOT NULL,
            imap_port     INTEGER NOT NULL DEFAULT 993,
            last_synced_uid  INTEGER NOT NULL DEFAULT 0,
            last_synced_at   TEXT,
            status        TEXT NOT NULL DEFAULT 'active'
        );

        CREATE TABLE IF NOT EXISTS emails (
            id          TEXT PRIMARY KEY,
            account_id  TEXT NOT NULL,
            uid         INTEGER NOT NULL,
            folder      TEXT NOT NULL,
            message_id  TEXT,
            subject     TEXT NOT NULL DEFAULT '',
            from_addr   TEXT NOT NULL DEFAULT '',
            from_name   TEXT NOT NULL DEFAULT '',
            to_addrs    TEXT NOT NULL DEFAULT '[]',
            body_text   TEXT NOT NULL DEFAULT '',
            body_html   TEXT NOT NULL DEFAULT '',
            sent_at     TEXT NOT NULL DEFAULT '',
            is_read     INTEGER NOT NULL DEFAULT 0,
            customer_id TEXT,
            UNIQUE(account_id, folder, uid)
        );

        CREATE INDEX IF NOT EXISTS idx_emails_date     ON emails(sent_at DESC);
        CREATE INDEX IF NOT EXISTS idx_emails_folder   ON emails(account_id, folder);
        CREATE INDEX IF NOT EXISTS idx_emails_customer ON emails(customer_id);
        CREATE INDEX IF NOT EXISTS idx_emails_from     ON emails(from_addr);
    ")
}

pub fn get_accounts(conn: &Connection) -> rusqlite::Result<Vec<Account>> {
    let mut stmt = conn.prepare(
        "SELECT id, email, display_name, imap_host, imap_port, last_synced_at, status
         FROM accounts ORDER BY email"
    )?;
    let rows = stmt.query_map([], |row| Ok(Account {
        id:             row.get(0)?,
        email:          row.get(1)?,
        display_name:   row.get(2)?,
        imap_host:      row.get(3)?,
        imap_port:      row.get(4)?,
        last_synced_at: row.get(5)?,
        status:         row.get(6)?,
    }))?;
    rows.collect()
}

pub fn get_account(conn: &Connection, id: &str) -> rusqlite::Result<Option<Account>> {
    let mut stmt = conn.prepare(
        "SELECT id, email, display_name, imap_host, imap_port, last_synced_at, status
         FROM accounts WHERE id = ?1"
    )?;
    let mut rows = stmt.query_map(params![id], |row| Ok(Account {
        id:             row.get(0)?,
        email:          row.get(1)?,
        display_name:   row.get(2)?,
        imap_host:      row.get(3)?,
        imap_port:      row.get(4)?,
        last_synced_at: row.get(5)?,
        status:         row.get(6)?,
    }))?;
    Ok(rows.next().transpose()?)
}

/// Returns (email, imap_host, imap_port, last_synced_uid)
pub fn get_account_sync_info(
    conn: &Connection,
    id: &str,
) -> rusqlite::Result<(String, String, u16, u32)> {
    conn.query_row(
        "SELECT email, imap_host, imap_port, last_synced_uid FROM accounts WHERE id = ?1",
        params![id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get::<_, u16>(2)?, row.get::<_, u32>(3)?)),
    )
}

pub fn insert_account(conn: &Connection, account: &Account) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO accounts (id, email, display_name, imap_host, imap_port, status)
         VALUES (?1, ?2, ?3, ?4, ?5, 'active')",
        params![account.id, account.email, account.display_name, account.imap_host, account.imap_port],
    )?;
    Ok(())
}

pub fn delete_account(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM emails WHERE account_id = ?1", params![id])?;
    conn.execute("DELETE FROM accounts WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn update_account_status(conn: &Connection, id: &str, status: &str) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE accounts SET status = ?1 WHERE id = ?2",
        params![status, id],
    )?;
    Ok(())
}

pub fn update_last_synced(conn: &Connection, id: &str, uid: u32, at: &str) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE accounts SET last_synced_uid = ?1, last_synced_at = ?2 WHERE id = ?3",
        params![uid, at, id],
    )?;
    Ok(())
}

pub struct EmailRow {
    pub id: String,
    pub account_id: String,
    pub uid: u32,
    pub folder: String,
    pub message_id: String,
    pub subject: String,
    pub from_addr: String,
    pub from_name: String,
    pub to_addrs_json: String,
    pub body_text: String,
    pub body_html: String,
    pub sent_at: String,
    pub is_read: bool,
    pub customer_id: Option<String>,
}

pub fn insert_emails(conn: &Connection, rows: &[EmailRow]) -> rusqlite::Result<usize> {
    let mut inserted = 0;
    for row in rows {
        let result = conn.execute(
            "INSERT OR IGNORE INTO emails
             (id, account_id, uid, folder, message_id, subject, from_addr, from_name,
              to_addrs, body_text, body_html, sent_at, is_read, customer_id)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
            params![
                row.id, row.account_id, row.uid, row.folder, row.message_id,
                row.subject, row.from_addr, row.from_name, row.to_addrs_json,
                row.body_text, row.body_html, row.sent_at,
                row.is_read as i32, row.customer_id
            ],
        )?;
        inserted += result;
    }
    Ok(inserted)
}

pub fn list_emails(
    conn: &Connection,
    account_id: &str,
    folder: &str,
    limit: i64,
    offset: i64,
    search: &str,
) -> rusqlite::Result<Vec<EmailHeader>> {
    let pattern = format!("%{}%", search);
    let mut stmt = conn.prepare(
        "SELECT id, account_id, uid, folder, subject, from_addr, from_name,
                to_addrs, sent_at, is_read, customer_id
         FROM emails
         WHERE account_id = ?1 AND folder = ?2
           AND (subject LIKE ?3 OR from_addr LIKE ?3 OR from_name LIKE ?3)
         ORDER BY sent_at DESC
         LIMIT ?4 OFFSET ?5"
    )?;
    let rows = stmt.query_map(
        params![account_id, folder, pattern, limit, offset],
        |row| {
            let to_json: String = row.get(7)?;
            let to_addrs: Vec<String> = serde_json::from_str(&to_json).unwrap_or_default();
            Ok(EmailHeader {
                id:          row.get(0)?,
                account_id:  row.get(1)?,
                uid:         row.get(2)?,
                folder:      row.get(3)?,
                subject:     row.get(4)?,
                from_addr:   row.get(5)?,
                from_name:   row.get(6)?,
                to_addrs,
                sent_at:     row.get(8)?,
                is_read:     row.get::<_, i32>(9)? != 0,
                customer_id: row.get(10)?,
            })
        }
    )?;
    rows.collect()
}

pub fn get_email_body(conn: &Connection, id: &str) -> rusqlite::Result<Option<EmailBody>> {
    let mut stmt = conn.prepare(
        "SELECT id, body_text, body_html FROM emails WHERE id = ?1"
    )?;
    let mut rows = stmt.query_map(params![id], |row| Ok(EmailBody {
        id:        row.get(0)?,
        body_text: row.get(1)?,
        body_html: row.get(2)?,
    }))?;
    Ok(rows.next().transpose()?)
}

pub fn set_read(conn: &Connection, id: &str, is_read: bool) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE emails SET is_read = ?1 WHERE id = ?2",
        params![is_read as i32, id],
    )?;
    Ok(())
}

pub fn assign_customer(conn: &Connection, id: &str, customer_id: Option<&str>) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE emails SET customer_id = ?1 WHERE id = ?2",
        params![customer_id, id],
    )?;
    Ok(())
}

pub fn delete_email(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM emails WHERE id = ?1", params![id])?;
    Ok(())
}
```

- [ ] **Step 2: Verify**

```powershell
cargo check
```

Expected: no errors (may warn about dead code — ignore).

---

## Task 4: email/keychain.rs — OS Keychain wrapper

**Files:**
- Create: `src-tauri/src/email/keychain.rs`

- [ ] **Step 1: Create the file**

```rust
const SERVICE: &str = "cynera-email";

pub fn set(email: &str, password: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE, email)
        .map_err(|e| format!("Keychain-Fehler: {}", e))?;
    entry.set_password(password)
        .map_err(|e| format!("Passwort konnte nicht gespeichert werden: {}", e))
}

pub fn get(email: &str) -> Result<String, String> {
    let entry = keyring::Entry::new(SERVICE, email)
        .map_err(|e| format!("Keychain-Fehler: {}", e))?;
    entry.get_password()
        .map_err(|e| format!("Passwort nicht gefunden ({}): {}", email, e))
}

pub fn delete(email: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE, email)
        .map_err(|e| format!("Keychain-Fehler: {}", e))?;
    match entry.delete_password() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()), // already gone
        Err(e) => Err(format!("Passwort konnte nicht gelöscht werden: {}", e)),
    }
}
```

- [ ] **Step 2: Verify**

```powershell
cargo check
```

Expected: no errors.

---

## Task 5: email/auto_detect.rs — Provider auto-detection

**Files:**
- Create: `src-tauri/src/email/auto_detect.rs`

- [ ] **Step 1: Create the file**

```rust
/// Returns (imap_host, imap_port) for known providers, None for unknowns.
pub fn detect(email: &str) -> Option<(&'static str, u16)> {
    let domain = email.split('@').nth(1)?.to_lowercase();
    match domain.as_str() {
        "gmx.de" | "gmx.net" | "gmx.at" | "gmx.ch"
            => Some(("imap.gmx.net", 993)),
        "web.de"
            => Some(("imap.web.de", 993)),
        "freenet.de"
            => Some(("imap.freenet.de", 993)),
        "ionos.de" | "1und1.de" | "ionos.com"
            => Some(("imap.ionos.de", 993)),
        "strato.de" | "strato.com"
            => Some(("imap.strato.de", 993)),
        "hosteurope.de"
            => Some(("imap.hosteurope.de", 993)),
        "gmail.com" | "googlemail.com"
            => Some(("imap.gmail.com", 993)),
        "outlook.com" | "hotmail.com" | "hotmail.de"
        | "live.de" | "live.com" | "msn.com"
            => Some(("imap-mail.outlook.com", 993)),
        "t-online.de"
            => Some(("secureimap.t-online.de", 993)),
        "yahoo.de" | "yahoo.com" | "yahoo.co.uk"
            => Some(("imap.mail.yahoo.com", 993)),
        "posteo.de"
            => Some(("posteo.de", 993)),
        "protonmail.com" | "proton.me" | "pm.me"
            => Some(("127.0.0.1", 1143)), // ProtonMail Bridge
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_gmx() {
        assert_eq!(detect("user@gmx.de"), Some(("imap.gmx.net", 993)));
    }

    #[test]
    fn detects_web_de() {
        assert_eq!(detect("user@web.de"), Some(("imap.web.de", 993)));
    }

    #[test]
    fn detects_gmail() {
        assert_eq!(detect("user@gmail.com"), Some(("imap.gmail.com", 993)));
    }

    #[test]
    fn detects_outlook() {
        assert_eq!(detect("user@outlook.com"), Some(("imap-mail.outlook.com", 993)));
    }

    #[test]
    fn returns_none_for_unknown() {
        assert_eq!(detect("user@mycompany.de"), None);
    }

    #[test]
    fn returns_none_for_invalid_email() {
        assert_eq!(detect("notanemail"), None);
    }
}
```

- [ ] **Step 2: Run tests**

```powershell
cargo test email::auto_detect
```

Expected output:
```
running 6 tests
test email::auto_detect::tests::detects_gmx ... ok
test email::auto_detect::tests::detects_web_de ... ok
test email::auto_detect::tests::detects_gmail ... ok
test email::auto_detect::tests::detects_outlook ... ok
test email::auto_detect::tests::returns_none_for_unknown ... ok
test email::auto_detect::tests::returns_none_for_invalid_email ... ok
test result: ok. 6 passed
```

- [ ] **Step 3: Commit**

```powershell
git add src-tauri/Cargo.toml src-tauri/src/email/
git commit -m "feat(email): types, db schema, keychain, auto-detect"
```

---

## Task 6: email/imap.rs — Connection test and sync

**Files:**
- Create: `src-tauri/src/email/imap.rs`

- [ ] **Step 1: Create the file**

```rust
use async_imap::Client;
use native_tls::TlsConnector as NativeTlsConnector;
use tokio_native_tls::TlsConnector;
use crate::email::types::{CustomerRef, EmailHeader, SyncProgress};
use crate::email::db::EmailRow;
use mailparse::{parse_mail, MailHeaderMap};
use uuid::Uuid;
use chrono::Utc;

// ── TLS connect helpers ───────────────────────────────────────────────────────

async fn tls_connect(host: &str, port: u16) -> Result<impl tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin, String> {
    let tcp = tokio::net::TcpStream::connect((host, port))
        .await
        .map_err(|e| format!("TCP-Verbindung zu {}:{} fehlgeschlagen: {}", host, port, e))?;

    let connector = NativeTlsConnector::builder()
        .build()
        .map_err(|e| format!("TLS-Builder-Fehler: {}", e))?;
    let tls = TlsConnector::from(connector);
    tls.connect(host, tcp)
        .await
        .map_err(|e| format!("TLS-Handshake-Fehler mit {}: {}", host, e))
}

// ── Test connection ───────────────────────────────────────────────────────────

pub async fn test_connection(email: &str, password: &str, host: &str, port: u16) -> Result<(), String> {
    let tls_stream = tls_connect(host, port).await?;
    let client = Client::new(tls_stream);
    let mut session = client
        .login(email, password)
        .await
        .map_err(|(e, _)| format!("Authentifizierung fehlgeschlagen: {}", e))?;
    session
        .logout()
        .await
        .map_err(|e| format!("Logout-Fehler: {}", e))?;
    Ok(())
}

// ── MIME parsing ──────────────────────────────────────────────────────────────

fn extract_bodies(raw: &[u8]) -> (String, String) {
    let Ok(parsed) = parse_mail(raw) else { return (String::new(), String::new()) };
    extract_from_part(&parsed)
}

fn extract_from_part(part: &mailparse::ParsedMail) -> (String, String) {
    let ct = part.get_content_type().mimetype.to_lowercase();
    if part.subparts.is_empty() {
        let body = part.get_body().unwrap_or_default();
        return match ct.as_str() {
            "text/plain" => (body, String::new()),
            "text/html"  => (String::new(), body),
            _ => (String::new(), String::new()),
        };
    }
    let mut text = String::new();
    let mut html = String::new();
    for sub in &part.subparts {
        let (t, h) = extract_from_part(sub);
        if text.is_empty() { text = t; }
        if html.is_empty() { html = h; }
    }
    (text, html)
}

fn parse_addr(raw: &str) -> (String, String) {
    // "Name <addr@example.com>" or plain "addr@example.com"
    if let (Some(s), Some(e)) = (raw.find('<'), raw.find('>')) {
        let addr = raw[s + 1..e].trim().to_string();
        let name = raw[..s].trim().trim_matches('"').to_string();
        return (name, addr);
    }
    (String::new(), raw.trim().to_string())
}

fn parse_to_addrs(raw: &str) -> Vec<String> {
    raw.split(',')
        .map(|s| parse_addr(s.trim()).1)
        .filter(|s| !s.is_empty())
        .collect()
}

// ── Auto-customer matching ────────────────────────────────────────────────────

fn match_customer(from_addr: &str, customers: &[CustomerRef]) -> Option<String> {
    let from_lower = from_addr.to_lowercase();
    // Exact match
    if let Some(c) = customers.iter().find(|c| {
        c.email.as_deref().map(|e| e.to_lowercase()) == Some(from_lower.clone())
    }) {
        return Some(c.id.clone());
    }
    // Domain match
    let domain = from_addr.split('@').nth(1)?.to_lowercase();
    customers.iter().find(|c| {
        c.email.as_deref()
            .and_then(|e| e.split('@').nth(1))
            .map(|d| d.to_lowercase() == domain)
            .unwrap_or(false)
    }).map(|c| c.id.clone())
}

// ── Folder detection ──────────────────────────────────────────────────────────

const SENT_CANDIDATES: &[&str] = &[
    "Sent", "Sent Items", "Sent Messages", "Gesendet",
    "[Gmail]/Sent Mail", "INBOX.Sent", "Sent Mail",
];

async fn find_sent_folder(session: &mut async_imap::Session<impl tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin>) -> String {
    if let Ok(list) = session.list(Some(""), Some("*")).await {
        // Prefer \Sent special-use flag (RFC 6154)
        for mailbox in list.iter() {
            let attrs = mailbox.attributes();
            if attrs.iter().any(|a| format!("{:?}", a).contains("Sent")) {
                return mailbox.name().to_string();
            }
        }
        // Fallback: match by name
        let names: Vec<String> = list.iter().map(|m| m.name().to_string()).collect();
        for candidate in SENT_CANDIDATES {
            if names.iter().any(|n| n.eq_ignore_ascii_case(candidate)) {
                return candidate.to_string();
            }
        }
    }
    "Sent".to_string() // last resort default
}

// ── Sync ──────────────────────────────────────────────────────────────────────

pub struct SyncOutput {
    pub rows: Vec<EmailRow>,
    pub max_uid: u32,
    pub inserted: usize,
}

/// Connects to IMAP and fetches all emails newer than `last_uid` from INBOX + Sent.
/// Emits progress via the closure `on_progress`.
pub async fn sync_account<F>(
    email: &str,
    password: &str,
    host: &str,
    port: u16,
    account_id: &str,
    last_uid: u32,
    customers: &[CustomerRef],
    mut on_progress: F,
) -> Result<SyncOutput, String>
where
    F: FnMut(SyncProgress),
{
    on_progress(SyncProgress {
        folder: "INBOX".into(), done: 0, total: 0, phase: "connecting".into(),
    });

    let tls_stream = tls_connect(host, port).await?;
    let client = Client::new(tls_stream);
    let mut session = client
        .login(email, password)
        .await
        .map_err(|(e, _)| format!("Authentifizierung fehlgeschlagen: {}", e))?;

    // Find Sent folder name
    let sent_folder = find_sent_folder(&mut session).await;

    let folders = vec![
        ("INBOX".to_string(), "INBOX".to_string()),
        (sent_folder, "Sent".to_string()),
    ];

    let mut all_rows: Vec<EmailRow> = Vec::new();
    let mut max_uid: u32 = last_uid;

    for (server_folder, normalized_folder) in folders {
        // SELECT mailbox
        let mailbox = session
            .select(&server_folder)
            .await
            .map_err(|e| format!("SELECT {} fehlgeschlagen: {}", server_folder, e))?;

        let total_msgs = mailbox.exists as usize;

        on_progress(SyncProgress {
            folder: normalized_folder.clone(),
            done: 0,
            total: total_msgs,
            phase: "scanning".into(),
        });

        // Search for all UIDs (we filter by last_uid client-side)
        let uid_set = session
            .uid_search("ALL")
            .await
            .map_err(|e| format!("UID SEARCH fehlgeschlagen: {}", e))?;

        let mut uids: Vec<u32> = uid_set
            .into_iter()
            .filter(|&uid| uid > last_uid)
            .collect();
        uids.sort_unstable();

        let total = uids.len();
        let mut done = 0usize;

        for chunk in uids.chunks(50) {
            let uid_str: String = chunk.iter()
                .map(|u| u.to_string())
                .collect::<Vec<_>>()
                .join(",");

            on_progress(SyncProgress {
                folder: normalized_folder.clone(),
                done,
                total,
                phase: "fetching".into(),
            });

            let fetches = session
                .uid_fetch(&uid_str, "(RFC822 FLAGS UID)")
                .await
                .map_err(|e| format!("FETCH fehlgeschlagen: {}", e))?;

            for fetch in fetches.iter() {
                let uid = fetch.uid.unwrap_or(0);
                if uid == 0 { continue; }
                if uid > max_uid { max_uid = uid; }

                let body_bytes = match fetch.body() {
                    Some(b) => b,
                    None => continue,
                };

                let is_read = fetch.flags().iter().any(|f| {
                    format!("{:?}", f).contains("Seen")
                });

                // Parse headers
                let Ok(parsed) = parse_mail(body_bytes) else { continue };
                let subject   = parsed.headers.get_first_value("Subject").unwrap_or_default();
                let from_raw  = parsed.headers.get_first_value("From").unwrap_or_default();
                let to_raw    = parsed.headers.get_first_value("To").unwrap_or_default();
                let date_raw  = parsed.headers.get_first_value("Date").unwrap_or_default();
                let msg_id    = parsed.headers.get_first_value("Message-ID").unwrap_or_default();

                let (from_name, from_addr) = parse_addr(&from_raw);
                let to_addrs = parse_to_addrs(&to_raw);
                let to_addrs_json = serde_json::to_string(&to_addrs).unwrap_or_else(|_| "[]".into());

                // Parse date to ISO 8601 (best-effort)
                let sent_at = chrono::DateTime::parse_from_rfc2822(&date_raw)
                    .map(|d| d.to_rfc3339())
                    .unwrap_or_else(|_| Utc::now().to_rfc3339());

                let (body_text, body_html) = extract_bodies(body_bytes);

                // Auto-match customer
                let customer_id = match_customer(&from_addr, customers);

                all_rows.push(EmailRow {
                    id: Uuid::new_v4().to_string(),
                    account_id: account_id.to_string(),
                    uid,
                    folder: normalized_folder.clone(),
                    message_id: msg_id,
                    subject,
                    from_addr,
                    from_name,
                    to_addrs_json,
                    body_text,
                    body_html,
                    sent_at,
                    is_read,
                    customer_id,
                });

                done += 1;
            }

            on_progress(SyncProgress {
                folder: normalized_folder.clone(),
                done,
                total,
                phase: "fetching".into(),
            });
        }
    }

    let _ = session.logout().await;

    let inserted = all_rows.len();
    Ok(SyncOutput { rows: all_rows, max_uid, inserted })
}
```

- [ ] **Step 2: Verify**

```powershell
cargo check
```

Expected: no errors.

---

## Task 7: email/commands.rs — All Tauri commands

**Files:**
- Create: `src-tauri/src/email/commands.rs`

- [ ] **Step 1: Create the file**

```rust
use tauri::Window;
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
    // Store password in OS keychain — never in DB
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
    // Get email first for keychain deletion
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

    // Get account info from DB — release lock before any await
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
            // Write emails to SQLite — no await while holding lock
            let inserted = {
                let conn = db.0.lock().map_err(|e| e.to_string())?;
                db::insert_emails(&conn, &out.rows).map_err(|e| e.to_string())?
            };
            // Update last_synced_uid
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
            Ok(SyncResult { inserted, skipped: out.inserted - inserted })
        }
        Err(e) => {
            let conn = db.0.lock().map_err(|e| e.to_string())?;
            let status = if e.contains("Authentifizierung") { "auth_error" } else { "error" };
            let _ = db::update_account_status(&conn, &account_id, status);
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
```

- [ ] **Step 2: Verify**

```powershell
cargo check
```

Expected: no errors.

---

## Task 8: email/mod.rs + main.rs — Module wiring

**Files:**
- Create: `src-tauri/src/email/mod.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Create email/mod.rs**

```rust
pub mod auto_detect;
pub mod commands;
pub mod db;
pub mod imap;
pub mod keychain;
pub mod types;
```

- [ ] **Step 2: Replace main.rs**

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod email;

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use email::db::EmailDb;

fn groq_key() -> &'static str {
    option_env!("GROQ_API_KEY").unwrap_or("")
}

#[derive(Debug, Deserialize, Serialize, Clone)]
struct Message {
    role: String,
    content: String,
}

#[tauri::command]
async fn focus_ai_chat(window: tauri::Window, messages: Vec<Message>) -> Result<(), String> {
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
            // Init SQLite database
            let data_dir = app.path_resolver()
                .app_data_dir()
                .expect("App-Data-Verzeichnis nicht gefunden");
            std::fs::create_dir_all(&data_dir)
                .expect("App-Data-Verzeichnis konnte nicht erstellt werden");
            let db_path = data_dir.join("emails.db");
            let conn = rusqlite::Connection::open(&db_path)
                .expect("emails.db konnte nicht geöffnet werden");
            email::db::init_schema(&conn)
                .expect("Datenbankschema konnte nicht erstellt werden");
            app.manage(EmailDb(std::sync::Mutex::new(conn)));

            // Set window title
            let window = app.get_window("main").unwrap();
            window.set_title("CYNERA SYSTEM OS — Notebook").unwrap();
            window.center().unwrap();

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            focus_ai_chat,
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
```

- [ ] **Step 3: Build the Rust binary**

```powershell
cargo build
```

Expected: compiles without errors. Warnings about unused variables are fine.

- [ ] **Step 4: Commit**

```powershell
git add src-tauri/src/
git commit -m "feat(email): IMAP sync, SQLite storage, Tauri commands"
```

---

## Task 9: store/index.js — Frontend store additions

**Files:**
- Modify: `src/store/index.js`

- [ ] **Step 1: Add emailAccounts and emailSyncStatus state**

Find the state object in `src/store/index.js` and add these fields alongside existing state. Find the line where `emails: []` is defined and add after it:

```js
emailAccounts:   [],
emailSyncStatus: {},
```

- [ ] **Step 2: Add actions**

Find the actions section in the store and add after the existing email actions (`addEmail`, `deleteEmail`, etc.):

```js
addEmailAccount: (account) =>
  set(s => ({ emailAccounts: [...s.emailAccounts, account] })),

removeEmailAccount: (id) =>
  set(s => ({ emailAccounts: s.emailAccounts.filter(a => a.id !== id) })),

setEmailSyncStatus: (accountId, status) =>
  set(s => ({
    emailSyncStatus: { ...s.emailSyncStatus, [accountId]: status }
  })),
```

- [ ] **Step 3: Add to partialize**

In the `partialize` function (which controls what gets persisted to localStorage), add `emailAccounts` to the persisted fields alongside other existing fields. Do NOT persist `emailSyncStatus` (it resets on app start).

Find the partialize return object and add:
```js
emailAccounts:       s.emailAccounts,
```

- [ ] **Step 4: Verify dev server still starts**

```powershell
npm run dev
```

Expected: Vite starts on localhost:1420 with no console errors.

---

## Task 10: AccountSetupModal.jsx — 3-step account setup

**Files:**
- Create: `src/components/mail/AccountSetupModal.jsx`

- [ ] **Step 1: Create the component**

```jsx
import { useState } from 'react'
import { invoke } from '@tauri-apps/api/tauri'
import { useStore } from '../../store'

const STEPS = ['E-Mail', 'Passwort', 'Verbinden']

export function AccountSetupModal({ open, onClose }) {
  const addEmailAccount   = useStore(s => s.addEmailAccount)
  const setEmailSyncStatus = useStore(s => s.setEmailSyncStatus)

  const [step,        setStep]        = useState(0)
  const [email,       setEmail]       = useState('')
  const [password,    setPassword]    = useState('')
  const [imapHost,    setImapHost]    = useState('')
  const [imapPort,    setImapPort]    = useState(993)
  const [displayName, setDisplayName] = useState('')
  const [detected,    setDetected]    = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')

  if (!open) return null

  const reset = () => {
    setStep(0); setEmail(''); setPassword(''); setImapHost('')
    setImapPort(993); setDisplayName(''); setDetected(false)
    setError(''); setLoading(false)
  }

  const handleClose = () => { reset(); onClose() }

  const handleEmailNext = async () => {
    if (!email.includes('@')) { setError('Bitte gültige E-Mail-Adresse eingeben.'); return }
    setError('')
    setLoading(true)
    try {
      const result = await invoke('email_detect_provider', { email })
      if (result) {
        const [host, port] = result
        setImapHost(host)
        setImapPort(port)
        setDetected(true)
      } else {
        setDetected(false)
        if (!imapHost) setImapHost('')
      }
      setDisplayName(email.split('@')[0])
      setStep(1)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const handleTest = async () => {
    if (!password) { setError('Bitte Passwort eingeben.'); return }
    if (!imapHost) { setError('Bitte IMAP-Server eingeben.'); return }
    setError('')
    setLoading(true)
    try {
      await invoke('email_test_connection', { email, password, imapHost, imapPort })
      setStep(2)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setLoading(true)
    setError('')
    try {
      const account = await invoke('email_add_account', {
        email, password, imapHost, imapPort, displayName,
      })
      addEmailAccount(account)
      setEmailSyncStatus(account.id, { phase: 'idle', progress: 0, error: null })
      handleClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={e => e.target === e.currentTarget && handleClose()}>
      <div style={{
        width: 420, background: 'var(--bg1)', borderRadius: 16,
        border: '1px solid var(--border)', padding: 28,
        boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
      }}>
        {/* Step indicator */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
          {STEPS.map((label, i) => (
            <div key={label} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{
                height: 3, borderRadius: 2, marginBottom: 6,
                background: i <= step ? 'var(--p)' : 'var(--border2)',
              }} />
              <div style={{
                fontSize: 10, fontWeight: i === step ? 700 : 400,
                color: i === step ? 'var(--p)' : 'var(--text4)',
              }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Step 0: E-Mail */}
        {step === 0 && (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
              E-Mail-Konto verbinden
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 20 }}>
              Server-Einstellungen werden automatisch erkannt.
            </div>
            <Field label="E-Mail-Adresse" value={email} onChange={setEmail}
              placeholder="du@beispiel.de" type="email" autoFocus
              onKeyDown={e => e.key === 'Enter' && handleEmailNext()} />
            {!detected && imapHost === '' && email.includes('@') && (
              <>
                <Field label="IMAP-Server" value={imapHost} onChange={setImapHost}
                  placeholder="imap.beispiel.de" />
                <Field label="Port" value={String(imapPort)}
                  onChange={v => setImapPort(Number(v))} placeholder="993" />
              </>
            )}
            {error && <ErrorMsg msg={error} />}
            <BtnRow onCancel={handleClose} onNext={handleEmailNext} loading={loading} nextLabel="Weiter" />
          </>
        )}

        {/* Step 1: Password */}
        {step === 1 && (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
              Passwort eingeben
            </div>
            {detected ? (
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>
                Server erkannt: <strong style={{ color: 'var(--text)' }}>{imapHost}:{imapPort}</strong>
              </div>
            ) : (
              <>
                <Field label="IMAP-Server" value={imapHost} onChange={setImapHost} placeholder="imap.beispiel.de" />
                <Field label="Port" value={String(imapPort)} onChange={v => setImapPort(Number(v))} placeholder="993" />
              </>
            )}
            <Field label="Passwort" value={password} onChange={setPassword}
              type="password" autoFocus placeholder="••••••••"
              onKeyDown={e => e.key === 'Enter' && handleTest()} />
            <div style={{ fontSize: 11, color: 'var(--text4)', marginBottom: 16 }}>
              🔒 Wird sicher im Windows Credential Manager gespeichert — nicht in Dateien.
            </div>
            {error && <ErrorMsg msg={error} />}
            <BtnRow onCancel={() => setStep(0)} onNext={handleTest} loading={loading} nextLabel="Verbindung testen" />
          </>
        )}

        {/* Step 2: Confirm */}
        {step === 2 && (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
              Verbindung erfolgreich ✓
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 20 }}>
              Konto wird hinzugefügt und synchronisiert.
            </div>
            <Field label="Anzeigename" value={displayName} onChange={setDisplayName}
              placeholder="Mein GMX-Konto" autoFocus />
            {error && <ErrorMsg msg={error} />}
            <BtnRow onCancel={() => setStep(1)} onNext={handleSave} loading={loading} nextLabel="Konto hinzufügen" />
          </>
        )}
      </div>
    </div>
  )
}

function Field({ label, value, onChange, ...props }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 5 }}>{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', padding: '9px 12px', borderRadius: 8, boxSizing: 'border-box',
          background: 'var(--bg2)', border: '1px solid var(--border2)',
          color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', outline: 'none',
        }}
        onFocus={e => e.target.style.borderColor = 'rgba(124,58,237,0.5)'}
        onBlur={e => e.target.style.borderColor = 'var(--border2)'}
        {...props}
      />
    </div>
  )
}

function ErrorMsg({ msg }) {
  return (
    <div style={{ fontSize: 12, color: '#ef4444', background: 'rgba(239,68,68,0.08)',
      border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '8px 12px', marginBottom: 14 }}>
      {msg}
    </div>
  )
}

function BtnRow({ onCancel, onNext, loading, nextLabel }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
      <button onClick={onCancel} style={{
        padding: '10px 16px', borderRadius: 8, background: 'transparent',
        border: '1px solid var(--border2)', color: 'var(--text3)',
        fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
      }}>Zurück</button>
      <button onClick={onNext} disabled={loading} style={{
        flex: 1, padding: '10px 0', borderRadius: 8, background: 'var(--p)',
        border: 'none', color: '#fff', fontSize: 13, fontWeight: 600,
        cursor: loading ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: loading ? 0.7 : 1,
      }}>{loading ? 'Bitte warten…' : nextLabel}</button>
    </div>
  )
}
```

- [ ] **Step 2: Verify — open app and navigate to Mail**

Open `http://localhost:1420`, click "Mail" in the sidebar. Expected: Mail view opens (may be empty state since no accounts yet).

---

## Task 11: SyncProgressBar.jsx — Event-driven progress indicator

**Files:**
- Create: `src/components/mail/SyncProgressBar.jsx`

- [ ] **Step 1: Create the component**

```jsx
import { useState, useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'

export function SyncProgressBar({ accountId, onDone }) {
  const [progress, setProgress] = useState(null)

  useEffect(() => {
    let unlisten
    listen('email-sync-progress', (event) => {
      const p = event.payload
      setProgress(p)
      if (p.phase === 'done' || p.phase === 'error') {
        setTimeout(() => {
          setProgress(null)
          onDone?.()
        }, 1500)
      }
    }).then(fn => { unlisten = fn })
    return () => { unlisten?.() }
  }, [accountId])

  if (!progress) return null

  const pct = progress.total > 0
    ? Math.round((progress.done / progress.total) * 100)
    : 0

  const label = progress.phase === 'connecting' ? 'Verbinde…'
    : progress.phase === 'scanning'  ? `Scanne ${progress.folder}…`
    : progress.phase === 'fetching'  ? `${progress.folder}: ${progress.done}/${progress.total}`
    : progress.phase === 'done'      ? 'Sync abgeschlossen ✓'
    : progress.phase === 'error'     ? 'Sync fehlgeschlagen'
    : '…'

  const barColor = progress.phase === 'error' ? '#ef4444'
    : progress.phase === 'done' ? '#10b981'
    : 'var(--p)'

  return (
    <div style={{ padding: '8px 12px', background: 'var(--bg2)',
      borderTop: '1px solid var(--border)', flexShrink: 0 }}>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 5 }}>{label}</div>
      <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          height: '100%', background: barColor, borderRadius: 2,
          width: progress.phase === 'connecting' ? '10%' : `${pct}%`,
          transition: 'width 0.3s ease',
        }} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify**

No separate test needed — verified as part of GlobalMailClient in Task 12.

---

## Task 12: GlobalMailClient.jsx — Rewrite data layer

**Files:**
- Modify: `src/components/mail/GlobalMailClient.jsx`

- [ ] **Step 1: Read the current file**

Read `src/components/mail/GlobalMailClient.jsx` to understand the current structure before replacing.

- [ ] **Step 2: Replace the file with the new implementation**

```jsx
import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/tauri'
import { useStore } from '../../store'
import { AccountSetupModal } from './AccountSetupModal'
import { SyncProgressBar } from './SyncProgressBar'

const FOLDERS = [
  { id: 'INBOX',     label: 'Posteingang' },
  { id: 'Sent',      label: 'Gesendet'    },
  { id: 'UNASSIGNED', label: 'Unassigned' },
]

// ── Mail Row ──────────────────────────────────────────────────────────────────

function MailRow({ mail, active, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '10px 14px', borderBottom: '1px solid var(--border)',
        cursor: 'pointer', background: active ? 'var(--p5)' : 'transparent',
        borderLeft: `3px solid ${active ? 'var(--p)' : 'transparent'}`,
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg2)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <div style={{ fontSize: 12, fontWeight: mail.is_read ? 400 : 700, color: 'var(--text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}>
          {mail.from_name || mail.from_addr}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text4)', flexShrink: 0 }}>
          {mail.sent_at ? new Date(mail.sent_at).toLocaleDateString('de-DE', {
            day: '2-digit', month: '2-digit',
          }) : ''}
        </div>
      </div>
      <div style={{ fontSize: 12, fontWeight: mail.is_read ? 400 : 600, color: 'var(--text2)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {mail.subject || '(kein Betreff)'}
      </div>
      {!mail.customer_id && (
        <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 2 }}>● Unassigned</div>
      )}
    </div>
  )
}

// ── Detail Panel ──────────────────────────────────────────────────────────────

function MailDetail({ mail, customers, onAssign, onMarkRead, onDelete }) {
  const [body, setBody]         = useState(null)
  const [loadingBody, setLoadingBody] = useState(false)

  useEffect(() => {
    if (!mail) { setBody(null); return }
    setLoadingBody(true)
    invoke('email_get_body', { emailId: mail.id })
      .then(b => setBody(b))
      .catch(() => setBody(null))
      .finally(() => setLoadingBody(false))
    if (!mail.is_read) {
      invoke('email_mark_read', { emailId: mail.id, isRead: true }).catch(() => {})
    }
  }, [mail?.id])

  if (!mail) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--text4)', fontSize: 13 }}>
      E-Mail auswählen
    </div>
  )

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border)',
        flexShrink: 0, background: 'var(--bg1)' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
          {mail.subject || '(kein Betreff)'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>
          Von: <strong style={{ color: 'var(--text)' }}>{mail.from_name || mail.from_addr}</strong>
          {mail.from_name && <span style={{ color: 'var(--text4)' }}> &lt;{mail.from_addr}&gt;</span>}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text4)', marginBottom: 12 }}>
          {mail.sent_at ? new Date(mail.sent_at).toLocaleString('de-DE') : ''}
        </div>
        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* Assign to customer */}
          <select
            value={mail.customer_id || ''}
            onChange={e => onAssign(mail.id, e.target.value || null)}
            style={{ padding: '5px 10px', borderRadius: 7, fontSize: 12,
              background: 'var(--bg2)', border: '1px solid var(--border2)',
              color: 'var(--text)', fontFamily: 'inherit', cursor: 'pointer' }}
          >
            <option value="">— Kunden zuordnen —</option>
            {customers.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button onClick={() => onMarkRead(mail.id, !mail.is_read)} style={actionBtnStyle}>
            {mail.is_read ? 'Als ungelesen' : 'Als gelesen'}
          </button>
          <button onClick={() => onDelete(mail.id)} style={{ ...actionBtnStyle, color: '#ef4444',
            borderColor: 'rgba(239,68,68,0.3)' }}>
            Löschen
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
        {loadingBody && <div style={{ color: 'var(--text4)', fontSize: 13 }}>Lädt…</div>}
        {body?.body_html ? (
          <div
            style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}
            dangerouslySetInnerHTML={{ __html: body.body_html }}
          />
        ) : body?.body_text ? (
          <pre style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6,
            whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
            {body.body_text}
          </pre>
        ) : !loadingBody ? (
          <div style={{ color: 'var(--text4)', fontSize: 13 }}>Kein Inhalt</div>
        ) : null}
      </div>
    </div>
  )
}

const actionBtnStyle = {
  padding: '5px 12px', borderRadius: 7, fontSize: 12,
  background: 'transparent', border: '1px solid var(--border2)',
  color: 'var(--text3)', cursor: 'pointer', fontFamily: 'inherit',
}

// ── Main Component ────────────────────────────────────────────────────────────

export function GlobalMailClient() {
  const customers          = useStore(s => s.customers)
  const emails             = useStore(s => s.emails)           // local Zustand emails
  const emailAccounts      = useStore(s => s.emailAccounts)
  const addEmailAccount    = useStore(s => s.addEmailAccount)
  const removeEmailAccount = useStore(s => s.removeEmailAccount)
  const setEmailSyncStatus = useStore(s => s.setEmailSyncStatus)
  const emailSyncStatus    = useStore(s => s.emailSyncStatus)

  const [activeAccountId, setActiveAccountId] = useState('local')
  const [folder,          setFolder]          = useState('INBOX')
  const [search,          setSearch]          = useState('')
  const [mailList,        setMailList]        = useState([])
  const [selectedMail,    setSelectedMail]    = useState(null)
  const [offset,          setOffset]          = useState(0)
  const [hasMore,         setHasMore]         = useState(true)
  const [loadingList,     setLoadingList]     = useState(false)
  const [setupOpen,       setSetupOpen]       = useState(false)
  const [syncing,         setSyncing]         = useState(false)

  const LIMIT = 50
  const isLocal = activeAccountId === 'local'
  const syncStatus = emailSyncStatus[activeAccountId]

  // ── Fetch list ──────────────────────────────────────────────────────────────
  const fetchList = useCallback(async (reset = false) => {
    if (isLocal) {
      // Local Zustand emails — filter by folder mapping
      const dirMap = { INBOX: 'in', Sent: 'out', UNASSIGNED: null }
      const dir = dirMap[folder]
      let filtered = dir === null
        ? emails.filter(e => !e.customerId)
        : emails.filter(e => e.direction === dir)
      if (search) {
        const q = search.toLowerCase()
        filtered = filtered.filter(e =>
          (e.subject || '').toLowerCase().includes(q) ||
          (e.from || '').toLowerCase().includes(q)
        )
      }
      setMailList(filtered)
      setHasMore(false)
      return
    }
    setLoadingList(true)
    try {
      const newOffset = reset ? 0 : offset
      const actualFolder = folder === 'UNASSIGNED' ? 'INBOX' : folder
      const result = await invoke('email_list', {
        accountId: activeAccountId,
        folder: actualFolder,
        limit: LIMIT,
        offset: newOffset,
        search,
      })
      let items = result
      if (folder === 'UNASSIGNED') {
        items = items.filter(m => !m.customer_id)
      }
      setMailList(prev => reset ? items : [...prev, ...items])
      setOffset(newOffset + LIMIT)
      setHasMore(result.length === LIMIT)
    } catch (e) {
      console.error('email_list error:', e)
    } finally {
      setLoadingList(false)
    }
  }, [activeAccountId, folder, search, offset, isLocal, emails])

  useEffect(() => {
    setOffset(0)
    setMailList([])
    setSelectedMail(null)
    fetchList(true)
  }, [activeAccountId, folder, search])

  // ── Sync ────────────────────────────────────────────────────────────────────
  const handleSync = async () => {
    if (isLocal || syncing) return
    setSyncing(true)
    setEmailSyncStatus(activeAccountId, { phase: 'syncing', progress: 0, error: null })
    try {
      const customersJson = JSON.stringify(
        customers.map(c => ({ id: c.id, email: c.email || null }))
      )
      await invoke('email_sync', { accountId: activeAccountId, customersJson })
      fetchList(true)
    } catch (e) {
      setEmailSyncStatus(activeAccountId, { phase: 'error', progress: 0, error: String(e) })
    } finally {
      setSyncing(false)
    }
  }

  const handleRemoveAccount = async (id) => {
    if (!window.confirm('Konto entfernen? Alle lokalen E-Mails werden gelöscht.')) return
    try {
      await invoke('email_remove_account', { accountId: id })
      removeEmailAccount(id)
      if (activeAccountId === id) setActiveAccountId('local')
    } catch (e) {
      alert(String(e))
    }
  }

  const handleAssign = async (emailId, customerId) => {
    if (isLocal) return
    await invoke('email_assign_customer', { emailId, customerId })
    setMailList(prev => prev.map(m => m.id === emailId ? { ...m, customer_id: customerId } : m))
    if (selectedMail?.id === emailId) setSelectedMail(m => ({ ...m, customer_id: customerId }))
  }

  const handleMarkRead = async (emailId, isRead) => {
    if (isLocal) return
    await invoke('email_mark_read', { emailId, isRead })
    setMailList(prev => prev.map(m => m.id === emailId ? { ...m, is_read: isRead } : m))
  }

  const handleDelete = async (emailId) => {
    if (isLocal) return
    await invoke('email_delete', { emailId })
    setMailList(prev => prev.filter(m => m.id !== emailId))
    if (selectedMail?.id === emailId) setSelectedMail(null)
  }

  // ── Unread count badge ──────────────────────────────────────────────────────
  const unreadCount = mailList.filter(m => !m.is_read).length

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: 'var(--bg)' }}>

      {/* ── Left Nav ── */}
      <div style={{
        width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column',
        background: 'var(--bg1)', borderRight: '1px solid var(--border)',
      }}>
        <div style={{ padding: '16px 14px 10px', fontSize: 11, fontWeight: 800,
          letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3)' }}>
          Mail
        </div>

        {/* Account selector */}
        <div style={{ padding: '0 10px 10px' }}>
          <select
            value={activeAccountId}
            onChange={e => setActiveAccountId(e.target.value)}
            style={{ width: '100%', padding: '7px 10px', borderRadius: 8, fontSize: 12,
              background: 'var(--bg2)', border: '1px solid var(--border2)',
              color: 'var(--text)', fontFamily: 'inherit', cursor: 'pointer', outline: 'none' }}
          >
            <option value="local">Lokal</option>
            {emailAccounts.map(a => (
              <option key={a.id} value={a.id}>{a.displayName || a.email}</option>
            ))}
          </select>
        </div>

        {/* Add account */}
        <div style={{ padding: '0 10px 12px' }}>
          <button
            onClick={() => setSetupOpen(true)}
            style={{
              width: '100%', padding: '7px 0', borderRadius: 8,
              background: 'var(--p5)', border: '1px solid var(--border3)',
              color: 'var(--p)', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >+ Konto hinzufügen</button>
        </div>

        {/* Folder list */}
        <div style={{ padding: '0 8px' }}>
          {FOLDERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFolder(f.id)}
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 8, marginBottom: 2,
                textAlign: 'left', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                background: folder === f.id ? 'var(--p5)' : 'transparent',
                color: folder === f.id ? 'var(--p)' : 'var(--text2)',
                fontSize: 12, fontWeight: folder === f.id ? 700 : 400,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
            >
              {f.label}
              {f.id === 'INBOX' && unreadCount > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--p)',
                  color: '#fff', padding: '1px 6px', borderRadius: 99 }}>
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Sync button */}
        {!isLocal && (
          <div style={{ padding: '12px 10px', marginTop: 'auto', borderTop: '1px solid var(--border)' }}>
            <button
              onClick={handleSync}
              disabled={syncing}
              style={{
                width: '100%', padding: '7px 0', borderRadius: 8, fontSize: 12,
                background: syncing ? 'var(--bg3)' : 'var(--bg2)',
                border: '1px solid var(--border2)',
                color: syncing ? 'var(--text4)' : 'var(--text2)',
                cursor: syncing ? 'wait' : 'pointer', fontFamily: 'inherit',
              }}
            >{syncing ? 'Synchronisiert…' : '↻ Synchronisieren'}</button>
            {emailAccounts.find(a => a.id === activeAccountId)?.lastSyncedAt && (
              <div style={{ fontSize: 10, color: 'var(--text4)', marginTop: 5, textAlign: 'center' }}>
                Zuletzt: {new Date(
                  emailAccounts.find(a => a.id === activeAccountId).lastSyncedAt
                ).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </div>
        )}

        {/* Sync progress */}
        {syncing && (
          <SyncProgressBar
            accountId={activeAccountId}
            onDone={() => setSyncing(false)}
          />
        )}

        {/* Remove account */}
        {!isLocal && (
          <div style={{ padding: '0 10px 12px' }}>
            <button
              onClick={() => handleRemoveAccount(activeAccountId)}
              style={{
                width: '100%', padding: '6px 0', borderRadius: 8, fontSize: 11,
                background: 'transparent', border: '1px solid var(--border)',
                color: 'var(--text4)', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >Konto entfernen</button>
          </div>
        )}
      </div>

      {/* ── Mail List ── */}
      <div style={{
        width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column',
        borderRight: '1px solid var(--border)', background: 'var(--bg)',
      }}>
        {/* Search */}
        <div style={{ padding: '10px 10px 8px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Suche…"
            style={{ width: '100%', padding: '7px 10px', borderRadius: 8, boxSizing: 'border-box',
              background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)',
              fontSize: 12, fontFamily: 'inherit', outline: 'none' }}
          />
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {mailList.length === 0 && !loadingList && (
            <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text4)', fontSize: 13 }}>
              {isLocal && emailAccounts.length === 0
                ? 'Kein Konto verbunden.\nKlicke "+ Konto hinzufügen".'
                : 'Keine E-Mails'}
            </div>
          )}
          {mailList.map(mail => (
            <MailRow
              key={mail.id}
              mail={mail}
              active={selectedMail?.id === mail.id}
              onClick={() => setSelectedMail(mail)}
            />
          ))}
          {hasMore && (
            <button
              onClick={() => fetchList(false)}
              disabled={loadingList}
              style={{ width: '100%', padding: '10px', border: 'none', background: 'var(--bg2)',
                color: 'var(--text3)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
            >{loadingList ? 'Lädt…' : 'Mehr laden'}</button>
          )}
        </div>
      </div>

      {/* ── Detail ── */}
      <MailDetail
        mail={selectedMail}
        customers={customers}
        onAssign={handleAssign}
        onMarkRead={handleMarkRead}
        onDelete={handleDelete}
      />

      {/* ── Account Setup Modal ── */}
      <AccountSetupModal
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
      />
    </div>
  )
}
```

- [ ] **Step 3: Verify in browser**

Open `http://localhost:1420` → click "Mail" in sidebar.
- [ ] Left nav renders with "Lokal" + "+ Konto hinzufügen"
- [ ] Empty state shows "Kein Konto verbunden"
- [ ] Click "+ Konto hinzufügen" → AccountSetupModal öffnet (3 Schritte sichtbar)

- [ ] **Step 4: Commit**

```powershell
git add src/store/index.js src/components/mail/
git commit -m "feat(email): AccountSetupModal, SyncProgressBar, GlobalMailClient rewrite"
```

---

## Task 13: Full Tauri build and end-to-end test

**Files:** none new

- [ ] **Step 1: Build the full app**

```powershell
npm run tauri build -- --debug
```

Expected: build succeeds, outputs to `src-tauri/target/debug/`.

- [ ] **Step 2: Launch the debug build**

```powershell
.\src-tauri\target\debug\cynera-system-os.exe
```

- [ ] **Step 3: Test account setup with a real IMAP account**

1. Click "Mail" in sidebar
2. Click "+ Konto hinzufügen"
3. Enter an email address (e.g. `test@gmx.de`)
4. Verify: host auto-detected as `imap.gmx.net:993`
5. Enter password → click "Verbindung testen"
6. Expected: either "Verbindung erfolgreich ✓" or clear auth error message
7. If successful: click "Konto hinzufügen"
8. Click "↻ Synchronisieren"
9. Verify: SyncProgressBar shows folder + progress
10. After sync: mail list shows emails from INBOX

- [ ] **Step 4: Test unknown domain fallback**

1. Open AccountSetupModal
2. Enter `test@mycompany.de`
3. Verify: no auto-detection, manual host/port fields appear
4. Enter custom IMAP server → proceed normally

- [ ] **Step 5: Commit**

```powershell
git add -A
git commit -m "feat(email): complete IMAP integration — connect, sync, auto-assign"
```

---

## Self-Review Checklist

- [x] **Spec coverage:**
  - ✅ IMAP universal (15 Provider auto-detect) → Task 5
  - ✅ Passwörter nur im OS-Keychain → Task 4, 7
  - ✅ SQLite für E-Mail-Inhalte → Task 3
  - ✅ Sync Inbox + Sent (mit Ordner-Erkennung) → Task 6
  - ✅ Flags (gelesen/ungelesen) → Task 3, 7, 12
  - ✅ Auto-Customer-Matching → Task 6 (`match_customer`)
  - ✅ Unassigned-Folder → Task 12 (UNASSIGNED filter)
  - ✅ Manuelle Kundenzuordnung → Task 12 (`handleAssign`)
  - ✅ Lokal-Konto Fallback → Task 12 (`isLocal` branch)
  - ✅ Progress-Events → Task 6, 11

- [x] **Type consistency:**
  - `EmailHeader.customer_id` (Rust snake_case) ↔ `mail.customer_id` (JS) — consistent
  - `Account.display_name` (Rust) → deserialized as `displayName` via Tauri's camelCase transform ⚠️

  **Important:** Tauri v1 automatically converts snake_case Rust fields to camelCase in JSON.
  So `display_name` becomes `displayName`, `imap_host` becomes `imapHost`, etc.
  The JS code in Task 12 already uses camelCase (`a.displayName`, `a.imapHost`) — this is correct.
  The invoke parameters must use camelCase too (already done: `imapHost`, `imapPort`, etc.).

- [x] **No placeholders found.**
