# E-Mail Kampagnen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kampagnen-Tab in der Mail-Route: Bulk-E-Mails an Leads senden (echter SMTP über bestehenden lettre-Stack), Antworten automatisch per IMAP-Sync erkennen, Stats pro Kampagne einsehen.

**Architecture:** Campaign-Daten in `focus.db` (DbPool), Versand über bestehende `email::smtp::send_email` mit Credentials aus `emails.db` (EmailDb) + Keychain. Reply-Detection durch Erweiterung des `email_sync`-Commands. Tab-Toggle in `MailRoute.tsx`.

**Tech Stack:** Rust/rusqlite (focus.db Migration v16), lettre (bereits in Cargo.toml), Tauri v2 Events für Send-Progress, TypeScript/React/Zustand, bestehende `email::smtp` + `email::keychain` Module.

---

## Datei-Übersicht

**Neu erstellen:**
- `src-tauri/src/db/campaign.rs` — Campaign + Recipient DB-Funktionen
- `src-tauri/src/commands/campaign.rs` — 5 Tauri-Commands inkl. send_campaign
- `src/types/campaign.types.ts` — TypeScript-Typen
- `src/services/campaign.service.ts` — invoke-Wrapper
- `src/store/campaign.store.ts` — Zustand-Store
- `src/components/mail/CampaignsTab.tsx` — Kampagnenliste-Ansicht
- `src/components/mail/CampaignDetail.tsx` — Detail mit KPIs + Empfänger-Liste
- `src/components/mail/CreateCampaignModal.tsx` — Formular-Modal

**Ändern:**
- `src-tauri/src/db/migrations.rs` — CURRENT_VERSION 15→16, v16-Arm
- `src-tauri/src/db/schema.rs` — CREATE TABLE campaigns, campaign_recipients
- `src-tauri/src/db/mod.rs` — `pub mod campaign;`
- `src-tauri/src/commands/mod.rs` — `pub mod campaign;`
- `src-tauri/src/main.rs` — 5 Commands registrieren
- `src-tauri/src/email/commands.rs` — email_sync: DbPool state + Reply-Detection
- `src/routes/MailRoute.tsx` — Tab-Toggle + CampaignsTab einbinden

---

## Task 1: DB Migration v16 — campaigns + campaign_recipients

**Files:**
- Modify: `src-tauri/src/db/migrations.rs`
- Modify: `src-tauri/src/db/schema.rs`

### Kontext

`CURRENT_VERSION` ist aktuell `15`. Das Muster für Migrationen:

```rust
// In apply():
16 => {
    conn.execute_batch(r#"
        CREATE TABLE IF NOT EXISTS campaigns ( ... );
        CREATE TABLE IF NOT EXISTS campaign_recipients ( ... );
    "#)?;
    Ok(())
}
```

- [ ] **Step 1: Schreibe den Test** in `src-tauri/src/db/migrations.rs` am Ende der `#[cfg(test)]`-Sektion:

```rust
#[test]
fn migration_v16_creates_campaign_tables() {
    let conn = rusqlite::Connection::open_in_memory().unwrap();
    crate::db::schema::create_tables(&conn).unwrap();
    // Apply v16
    for v in 1..=16 { apply(&conn, v).unwrap(); set_version(&conn, v).unwrap(); }
    // campaigns table exists
    let n: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='campaigns'",
        [], |r| r.get(0),
    ).unwrap();
    assert_eq!(n, 1, "campaigns table missing");
    // campaign_recipients table exists
    let m: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='campaign_recipients'",
        [], |r| r.get(0),
    ).unwrap();
    assert_eq!(m, 1, "campaign_recipients table missing");
}
```

- [ ] **Step 2: Lass den Test fehlschlagen**

```
cd src-tauri && cargo test migration_v16 -- --nocapture
```
Erwartet: FAIL mit "apply called with unknown version 16" o.ä.

- [ ] **Step 3: Erhöhe `CURRENT_VERSION` auf 16**

In `src-tauri/src/db/migrations.rs` Zeile 4:
```rust
const CURRENT_VERSION: u32 = 16;
```

- [ ] **Step 4: Füge den v16-Arm in `apply()` hinzu** (NACH dem v15-Arm, VOR `_`):

```rust
16 => {
    conn.execute_batch(r#"
        CREATE TABLE IF NOT EXISTS campaigns (
            id                TEXT PRIMARY KEY,
            workspace_id      TEXT NOT NULL,
            name              TEXT NOT NULL,
            subject           TEXT NOT NULL,
            body              TEXT NOT NULL,
            sender_account_id TEXT NOT NULL,
            smart_list_id     TEXT,
            status            TEXT NOT NULL DEFAULT 'draft',
            sent_at           TEXT,
            created_at        TEXT NOT NULL,
            updated_at        TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_campaigns_workspace
            ON campaigns(workspace_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS campaign_recipients (
            id          TEXT PRIMARY KEY,
            campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
            lead_id     TEXT NOT NULL,
            email       TEXT NOT NULL,
            sent_at     TEXT,
            replied_at  TEXT,
            error       TEXT,
            activity_id TEXT,
            created_at  TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign
            ON campaign_recipients(campaign_id);
        CREATE INDEX IF NOT EXISTS idx_campaign_recipients_email
            ON campaign_recipients(email);
    "#)?;
    Ok(())
}
```

- [ ] **Step 5: Füge die Tabellen auch in `schema.rs` hinzu** (am Ende von `create_tables`, vor dem letzten `Ok(())`):

```rust
        CREATE TABLE IF NOT EXISTS campaigns (
            id                TEXT PRIMARY KEY,
            workspace_id      TEXT NOT NULL,
            name              TEXT NOT NULL,
            subject           TEXT NOT NULL,
            body              TEXT NOT NULL,
            sender_account_id TEXT NOT NULL,
            smart_list_id     TEXT,
            status            TEXT NOT NULL DEFAULT 'draft',
            sent_at           TEXT,
            created_at        TEXT NOT NULL,
            updated_at        TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_campaigns_workspace
            ON campaigns(workspace_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS campaign_recipients (
            id          TEXT PRIMARY KEY,
            campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
            lead_id     TEXT NOT NULL,
            email       TEXT NOT NULL,
            sent_at     TEXT,
            replied_at  TEXT,
            error       TEXT,
            activity_id TEXT,
            created_at  TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign
            ON campaign_recipients(campaign_id);
        CREATE INDEX IF NOT EXISTS idx_campaign_recipients_email
            ON campaign_recipients(email);
```

- [ ] **Step 6: Test grün machen**

```
cd src-tauri && cargo test migration_v16 -- --nocapture
```
Erwartet: PASS

- [ ] **Step 7: Alle Tests noch grün**

```
cd src-tauri && cargo test 2>&1 | tail -5
```
Erwartet: `test result: ok. X passed`

- [ ] **Step 8: Commit**

```
git add src-tauri/src/db/migrations.rs src-tauri/src/db/schema.rs
git commit -m "feat(db): Migration v16 — campaigns + campaign_recipients"
```

---

## Task 2: Rust DB Layer — src-tauri/src/db/campaign.rs

**Files:**
- Create: `src-tauri/src/db/campaign.rs`
- Modify: `src-tauri/src/db/mod.rs`

### Kontext

Muster aus `src-tauri/src/db/follow_up_queue.rs`:
- Structs mit `#[serde(rename_all = "camelCase")]` für Frontend-Serialisierung
- `SELECT`-Konstante + `map_row`-Funktion
- `uuid::Uuid::new_v4().to_string()` für IDs
- `chrono::Utc::now().to_rfc3339()` für Timestamps
- `conn.query_row(&format!("{SELECT} WHERE id=?1"), [&id], map_row)` nach INSERT

- [ ] **Step 1: Schreibe Tests** am Ende von `src-tauri/src/db/campaign.rs` (erstelle die Datei mit Tests zuerst):

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn setup() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::schema::create_tables(&conn).unwrap();
        conn
    }

    #[test]
    fn create_and_get_campaign() {
        let conn = setup();
        let payload = CreateCampaignPayload {
            workspace_id: "ws1".into(),
            name: "Test Kampagne".into(),
            subject: "Hallo {{name}}".into(),
            body: "Wie geht es dir, {{name}}?".into(),
            sender_account_id: "acc1".into(),
            smart_list_id: None,
            lead_ids: vec!["lead1".into()],
            lead_emails: vec!["lead@example.com".into()],
        };
        let c = create(&conn, payload).unwrap();
        assert_eq!(c.name, "Test Kampagne");
        assert_eq!(c.status, "draft");

        let got = get(&conn, &c.id).unwrap().unwrap();
        assert_eq!(got.id, c.id);
    }

    #[test]
    fn list_returns_stats() {
        let conn = setup();
        let payload = CreateCampaignPayload {
            workspace_id: "ws1".into(),
            name: "Stats Test".into(),
            subject: "Subj".into(),
            body: "Body".into(),
            sender_account_id: "acc1".into(),
            smart_list_id: None,
            lead_ids: vec!["l1".into(), "l2".into()],
            lead_emails: vec!["a@a.de".into(), "b@b.de".into()],
        };
        let c = create(&conn, payload).unwrap();
        let recipients = get_recipients(&conn, &c.id).unwrap();
        assert_eq!(recipients.len(), 2);

        mark_sent(&conn, &recipients[0].id).unwrap();
        mark_replied(&conn, "a@a.de").unwrap();

        let list = list(&conn, "ws1").unwrap();
        let found = list.iter().find(|x| x.campaign.id == c.id).unwrap();
        assert_eq!(found.sent_count, 1);
        assert_eq!(found.replied_count, 1);
    }

    #[test]
    fn mark_error_sets_field() {
        let conn = setup();
        let payload = CreateCampaignPayload {
            workspace_id: "ws1".into(),
            name: "Err Test".into(),
            subject: "S".into(),
            body: "B".into(),
            sender_account_id: "acc1".into(),
            smart_list_id: None,
            lead_ids: vec!["l1".into()],
            lead_emails: vec!["err@example.com".into()],
        };
        let c = create(&conn, payload).unwrap();
        let recipients = get_recipients(&conn, &c.id).unwrap();
        mark_error(&conn, &recipients[0].id, "SMTP timeout").unwrap();
        let updated = get_recipients(&conn, &c.id).unwrap();
        assert_eq!(updated[0].error.as_deref(), Some("SMTP timeout"));
    }
}
```

- [ ] **Step 2: Füge `pub mod campaign;` in `src-tauri/src/db/mod.rs` hinzu**

Öffne `src-tauri/src/db/mod.rs` und füge nach dem letzten `pub mod`-Eintrag hinzu:
```rust
pub mod campaign;
```

- [ ] **Step 3: Lass die Tests fehlschlagen**

```
cd src-tauri && cargo test db::campaign -- --nocapture
```
Erwartet: Compile-Fehler (Modul leer / nicht gefunden)

- [ ] **Step 4: Implementiere `src-tauri/src/db/campaign.rs`**

```rust
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::AppError;

// ── Typen ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Campaign {
    pub id: String,
    pub workspace_id: String,
    pub name: String,
    pub subject: String,
    pub body: String,
    pub sender_account_id: String,
    pub smart_list_id: Option<String>,
    pub status: String,  // "draft" | "sending" | "sent" | "error"
    pub sent_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CampaignWithStats {
    #[serde(flatten)]
    pub campaign: Campaign,
    pub sent_count: i64,
    pub replied_count: i64,
    pub total_recipients: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CampaignRecipient {
    pub id: String,
    pub campaign_id: String,
    pub lead_id: String,
    pub email: String,
    pub sent_at: Option<String>,
    pub replied_at: Option<String>,
    pub error: Option<String>,
    pub activity_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCampaignPayload {
    pub workspace_id: String,
    pub name: String,
    pub subject: String,
    pub body: String,
    pub sender_account_id: String,
    pub smart_list_id: Option<String>,
    // Resolved lead IDs + emails (frontend resolves smart list before calling)
    pub lead_ids: Vec<String>,
    pub lead_emails: Vec<String>,
}

// ── SELECT helpers ────────────────────────────────────────────────────────────

const SELECT_CAMPAIGN: &str =
    "SELECT id, workspace_id, name, subject, body, sender_account_id,
            smart_list_id, status, sent_at, created_at, updated_at
     FROM campaigns";

fn map_campaign(r: &rusqlite::Row<'_>) -> rusqlite::Result<Campaign> {
    Ok(Campaign {
        id: r.get(0)?,
        workspace_id: r.get(1)?,
        name: r.get(2)?,
        subject: r.get(3)?,
        body: r.get(4)?,
        sender_account_id: r.get(5)?,
        smart_list_id: r.get(6)?,
        status: r.get(7)?,
        sent_at: r.get(8)?,
        created_at: r.get(9)?,
        updated_at: r.get(10)?,
    })
}

const SELECT_RECIPIENT: &str =
    "SELECT id, campaign_id, lead_id, email, sent_at, replied_at, error, activity_id, created_at
     FROM campaign_recipients";

fn map_recipient(r: &rusqlite::Row<'_>) -> rusqlite::Result<CampaignRecipient> {
    Ok(CampaignRecipient {
        id: r.get(0)?,
        campaign_id: r.get(1)?,
        lead_id: r.get(2)?,
        email: r.get(3)?,
        sent_at: r.get(4)?,
        replied_at: r.get(5)?,
        error: r.get(6)?,
        activity_id: r.get(7)?,
        created_at: r.get(8)?,
    })
}

// ── Public API ────────────────────────────────────────────────────────────────

/// Erstellt eine Kampagne + alle Empfänger in einer Transaktion.
pub fn create(conn: &Connection, payload: CreateCampaignPayload) -> Result<Campaign, AppError> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO campaigns
         (id, workspace_id, name, subject, body, sender_account_id,
          smart_list_id, status, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,'draft',?8,?8)",
        rusqlite::params![
            id, payload.workspace_id, payload.name, payload.subject,
            payload.body, payload.sender_account_id, payload.smart_list_id, now,
        ],
    )?;

    // Insert recipients
    for (lead_id, email) in payload.lead_ids.iter().zip(payload.lead_emails.iter()) {
        let rid = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO campaign_recipients
             (id, campaign_id, lead_id, email, created_at)
             VALUES (?1,?2,?3,?4,?5)",
            rusqlite::params![rid, id, lead_id, email, now],
        )?;
    }

    conn.query_row(
        &format!("{SELECT_CAMPAIGN} WHERE id=?1"),
        [&id],
        map_campaign,
    ).map_err(AppError::from)
}

/// Alle Kampagnen des Workspace mit berechneten Stats.
pub fn list(conn: &Connection, workspace_id: &str) -> Result<Vec<CampaignWithStats>, AppError> {
    let mut stmt = conn.prepare(&format!(
        "{SELECT_CAMPAIGN}
         WHERE workspace_id=?1
         ORDER BY created_at DESC"
    ))?;
    let campaigns: Vec<Campaign> = stmt
        .query_map([workspace_id], map_campaign)?
        .filter_map(|r| r.ok())
        .collect();

    campaigns.into_iter().map(|c| {
        let total: i64 = conn.query_row(
            "SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id=?1",
            [&c.id], |r| r.get(0),
        ).unwrap_or(0);
        let sent: i64 = conn.query_row(
            "SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id=?1 AND sent_at IS NOT NULL",
            [&c.id], |r| r.get(0),
        ).unwrap_or(0);
        let replied: i64 = conn.query_row(
            "SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id=?1 AND replied_at IS NOT NULL",
            [&c.id], |r| r.get(0),
        ).unwrap_or(0);
        Ok(CampaignWithStats { campaign: c, sent_count: sent, replied_count: replied, total_recipients: total })
    }).collect()
}

/// Eine Kampagne per ID laden.
pub fn get(conn: &Connection, id: &str) -> Result<Option<Campaign>, AppError> {
    let mut stmt = conn.prepare(&format!("{SELECT_CAMPAIGN} WHERE id=?1"))?;
    let mut rows = stmt.query_map([id], map_campaign)?;
    Ok(rows.next().transpose().map_err(AppError::from)?)
}

/// Alle Empfänger einer Kampagne.
pub fn get_recipients(conn: &Connection, campaign_id: &str) -> Result<Vec<CampaignRecipient>, AppError> {
    let mut stmt = conn.prepare(&format!(
        "{SELECT_RECIPIENT} WHERE campaign_id=?1 ORDER BY created_at"
    ))?;
    let rows = stmt.query_map([campaign_id], map_recipient)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

/// Setzt sent_at eines Empfängers auf jetzt.
pub fn mark_sent(conn: &Connection, recipient_id: &str) -> Result<(), AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    let n = conn.execute(
        "UPDATE campaign_recipients SET sent_at=?1 WHERE id=?2",
        rusqlite::params![now, recipient_id],
    )?;
    if n == 0 { return Err(AppError::NotFound(format!("CampaignRecipient {recipient_id}"))); }
    Ok(())
}

/// Markiert den ersten passenden Empfänger als beantwortet (by email address).
/// Wird vom Reply-Detection-Hook aufgerufen.
pub fn mark_replied(conn: &Connection, email: &str) -> Result<(), AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE campaign_recipients SET replied_at=?1
         WHERE email=?2 AND replied_at IS NULL AND sent_at IS NOT NULL",
        rusqlite::params![now, email],
    )?;
    Ok(())
}

/// Setzt Fehler-Text eines Empfängers.
pub fn mark_error(conn: &Connection, recipient_id: &str, error: &str) -> Result<(), AppError> {
    let n = conn.execute(
        "UPDATE campaign_recipients SET error=?1 WHERE id=?2",
        rusqlite::params![error, recipient_id],
    )?;
    if n == 0 { return Err(AppError::NotFound(format!("CampaignRecipient {recipient_id}"))); }
    Ok(())
}

/// Aktualisiert den Status der Kampagne.
pub fn update_status(conn: &Connection, campaign_id: &str, status: &str) -> Result<(), AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    let sent_at = if status == "sent" { Some(now.clone()) } else { None };
    conn.execute(
        "UPDATE campaigns SET status=?1, sent_at=?2, updated_at=?3 WHERE id=?4",
        rusqlite::params![status, sent_at, now, campaign_id],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    // (tests written in Step 1 above)
}
```

- [ ] **Step 5: Tests grün**

```
cd src-tauri && cargo test db::campaign -- --nocapture
```
Erwartet: `test result: ok. 3 passed`

- [ ] **Step 6: Alle Tests noch grün**

```
cd src-tauri && cargo test 2>&1 | tail -5
```

- [ ] **Step 7: Commit**

```
git add src-tauri/src/db/campaign.rs src-tauri/src/db/mod.rs
git commit -m "feat(db): campaign.rs — Campaign DB layer"
```

---

## Task 3: Rust Commands — campaign.rs + Reply-Detection in email_sync

**Files:**
- Create: `src-tauri/src/commands/campaign.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/email/commands.rs`
- Modify: `src-tauri/src/main.rs`

### Kontext

- `DbPool` ist Tauri-State für focus.db: `pool: tauri::State<'_, DbPool>` → `pool.get()?`
- `EmailDb` ist Tauri-State für emails.db: `email_db: tauri::State<'_, EmailDb>` → `email_db.0.lock()`
- SMTP-Credentials: `email::keychain::get(&account.email)` liefert Passwort
- Versand: `email::smtp::send_email(smtp_host, smtp_port, starttls, from_email, display_name, password, &payload).await`
- `SendEmailPayload` aus `email::types`: `{ account_id, to: Vec<String>, cc: Vec<String>, subject, body_text, attachment_paths }`
- Tauri-Events: `window.emit("campaign-progress", &progress_payload)` — `window: tauri::WebviewWindow`
- Personalisierung: ersetze `{{name}}` und `{{company}}` im subject und body vor dem Senden

- [ ] **Step 1: Füge `pub mod campaign;` in `src-tauri/src/commands/mod.rs` hinzu**

- [ ] **Step 2: Erstelle `src-tauri/src/commands/campaign.rs`**

```rust
use tauri::WebviewWindow as Window;
use serde::{Deserialize, Serialize};
use crate::{AppError, db, email};
use crate::db::pool::DbPool;
use crate::email::db::EmailDb;
use crate::db::campaign::{Campaign, CampaignWithStats, CampaignRecipient, CreateCampaignPayload};
use crate::email::types::SendEmailPayload;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CampaignProgress {
    campaign_id: String,
    sent: usize,
    total: usize,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeadRef {
    pub id: String,
    pub email: String,
    pub name: String,
    pub company: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCampaignCmd {
    pub workspace_id: String,
    pub name: String,
    pub subject: String,
    pub body: String,
    pub sender_account_id: String,
    pub smart_list_id: Option<String>,
    pub leads: Vec<LeadRef>,  // frontend resolves smart list first
}

#[tauri::command]
pub fn cmd_list_campaigns(
    workspace_id: String,
    pool: tauri::State<'_, DbPool>,
) -> Result<Vec<CampaignWithStats>, AppError> {
    let conn = pool.get()?;
    db::campaign::list(&conn, &workspace_id)
}

#[tauri::command]
pub fn cmd_get_campaign(
    id: String,
    pool: tauri::State<'_, DbPool>,
) -> Result<Option<Campaign>, AppError> {
    let conn = pool.get()?;
    db::campaign::get(&conn, &id)
}

#[tauri::command]
pub fn cmd_get_campaign_recipients(
    campaign_id: String,
    pool: tauri::State<'_, DbPool>,
) -> Result<Vec<CampaignRecipient>, AppError> {
    let conn = pool.get()?;
    db::campaign::get_recipients(&conn, &campaign_id)
}

#[tauri::command]
pub fn cmd_create_campaign(
    payload: CreateCampaignCmd,
    pool: tauri::State<'_, DbPool>,
) -> Result<Campaign, AppError> {
    let lead_ids: Vec<String> = payload.leads.iter().map(|l| l.id.clone()).collect();
    let lead_emails: Vec<String> = payload.leads.iter().map(|l| l.email.clone()).collect();
    let db_payload = CreateCampaignPayload {
        workspace_id: payload.workspace_id,
        name: payload.name,
        subject: payload.subject,
        body: payload.body,
        sender_account_id: payload.sender_account_id,
        smart_list_id: payload.smart_list_id,
        lead_ids,
        lead_emails,
    };
    let conn = pool.get()?;
    db::campaign::create(&conn, db_payload)
}

#[tauri::command]
pub async fn cmd_send_campaign(
    campaign_id: String,
    leads_json: String,  // Vec<LeadRef> als JSON — für Personalisierung
    window: Window,
    pool: tauri::State<'_, DbPool>,
    email_db: tauri::State<'_, EmailDb>,
) -> Result<(), AppError> {
    // 1. Load campaign
    let campaign = {
        let conn = pool.get()?;
        db::campaign::get(&conn, &campaign_id)?
            .ok_or_else(|| AppError::NotFound(format!("Campaign {campaign_id}")))?
    };

    // 2. Load recipients
    let recipients = {
        let conn = pool.get()?;
        db::campaign::get_recipients(&conn, &campaign_id)?
    };

    // 3. Load email account + SMTP credentials
    let account = {
        let conn = email_db.0.lock().map_err(|e| AppError::Db(e.to_string()))?;
        email::db::get_account(&conn, &campaign.sender_account_id)
            .map_err(|e| AppError::Db(e.to_string()))?
            .ok_or_else(|| AppError::NotFound(format!("EmailAccount {}", campaign.sender_account_id)))?
    };
    let password = email::keychain::get(&account.email)
        .map_err(|e| AppError::Db(e))?;

    // 4. Parse lead refs for personalization
    let leads: Vec<LeadRef> = serde_json::from_str(&leads_json)
        .map_err(|e| AppError::Db(format!("leads_json parse error: {}", e)))?;
    let lead_map: std::collections::HashMap<String, &LeadRef> =
        leads.iter().map(|l| (l.email.clone(), l)).collect();

    // 5. Update status to "sending"
    {
        let conn = pool.get()?;
        db::campaign::update_status(&conn, &campaign_id, "sending")?;
    }

    let total = recipients.len();
    let mut sent = 0usize;
    let mut had_error = false;

    for recipient in &recipients {
        let lead_ref = lead_map.get(&recipient.email);
        let name = lead_ref.map(|l| l.name.as_str()).unwrap_or("");
        let company = lead_ref.and_then(|l| l.company.as_deref()).unwrap_or("");

        let subject = campaign.subject
            .replace("{{name}}", name)
            .replace("{{company}}", company);
        let body = campaign.body
            .replace("{{name}}", name)
            .replace("{{company}}", company);

        let smtp_payload = SendEmailPayload {
            account_id: account.id.clone(),
            to: vec![recipient.email.clone()],
            cc: vec![],
            subject,
            body_text: body,
            attachment_paths: vec![],
        };

        let send_result = email::smtp::send_email(
            &account.smtp_host,
            account.smtp_port,
            account.smtp_starttls,
            &account.email,
            &account.display_name,
            &password,
            &smtp_payload,
        ).await;

        let conn = pool.get()?;
        match send_result {
            Ok(()) => {
                db::campaign::mark_sent(&conn, &recipient.id)?;
                sent += 1;
            }
            Err(e) => {
                db::campaign::mark_error(&conn, &recipient.id, &e)?;
                had_error = true;
            }
        }

        let _ = window.emit("campaign-progress", &CampaignProgress {
            campaign_id: campaign_id.clone(),
            sent,
            total,
            error: None,
        });
    }

    // 6. Update final status
    let final_status = if had_error && sent == 0 { "error" } else { "sent" };
    let conn = pool.get()?;
    db::campaign::update_status(&conn, &campaign_id, final_status)?;

    let _ = window.emit("campaign-done", &serde_json::json!({
        "campaignId": campaign_id,
        "sentCount": sent,
        "errorCount": total - sent,
    }));

    Ok(())
}
```

- [ ] **Step 3: Reply-Detection in `email_sync` einbauen**

Öffne `src-tauri/src/email/commands.rs`. Ändere die Signatur von `email_sync` um `DbPool` als Tauri-State hinzuzufügen:

```rust
// Oben neue imports hinzufügen:
use crate::db::pool::DbPool;

// Signatur von email_sync ändern:
pub async fn email_sync(
    account_id: String,
    folder: Option<String>,
    customers_json: String,
    window: Window,
    db: tauri::State<'_, EmailDb>,
    pool: tauri::State<'_, DbPool>,   // NEU
) -> Result<SyncResult, String> {
```

Dann direkt nach `db::insert_emails(&conn, &out.rows)` (also innerhalb des `Ok(out) =>` Blocks, nach dem `inserted`-Block) folgenden Code einfügen:

```rust
// Reply-Detection: prüfe ob neu gesyncter Absender eine Kampagnen-Antwort ist
if inserted > 0 {
    for row in &out.rows {
        if !row.from_addr.is_empty() {
            if let Ok(conn) = pool.get() {
                let _ = crate::db::campaign::mark_replied(&conn, &row.from_addr);
            }
        }
    }
}
```

- [ ] **Step 4: Commands in `main.rs` registrieren**

In `src-tauri/src/main.rs` in der `generate_handler![]`-Liste **nach** dem letzten `commands::follow_up::...`-Eintrag hinzufügen:

```rust
commands::campaign::cmd_list_campaigns,
commands::campaign::cmd_get_campaign,
commands::campaign::cmd_get_campaign_recipients,
commands::campaign::cmd_create_campaign,
commands::campaign::cmd_send_campaign,
```

- [ ] **Step 5: Build-Check**

```
cd src-tauri && cargo build 2>&1 | grep "^error" | head -20
```
Erwartet: Keine Fehler (ggf. Warnings ignorieren)

- [ ] **Step 6: Alle Tests grün**

```
cd src-tauri && cargo test 2>&1 | tail -5
```

- [ ] **Step 7: Commit**

```
git add src-tauri/src/commands/campaign.rs src-tauri/src/commands/mod.rs src-tauri/src/email/commands.rs src-tauri/src/main.rs
git commit -m "feat(commands): campaign commands + reply-detection in email_sync"
```

---

## Task 4: TypeScript Types + Service + Store

**Files:**
- Create: `src/types/campaign.types.ts`
- Create: `src/services/campaign.service.ts`
- Create: `src/store/campaign.store.ts`

### Kontext

Muster aus `src/services/follow-up-queue.service.ts` und `src/store/follow-up-queue.store.ts`.
`invoke` aus `@tauri-apps/api/core`.

- [ ] **Step 1: Erstelle `src/types/campaign.types.ts`**

```typescript
export type CampaignStatus = 'draft' | 'sending' | 'sent' | 'error'

export interface Campaign {
  id: string
  workspaceId: string
  name: string
  subject: string
  body: string
  senderAccountId: string
  smartListId: string | null
  status: CampaignStatus
  sentAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CampaignWithStats extends Campaign {
  sentCount: number
  repliedCount: number
  totalRecipients: number
}

export interface CampaignRecipient {
  id: string
  campaignId: string
  leadId: string
  email: string
  sentAt: string | null
  repliedAt: string | null
  error: string | null
  activityId: string | null
  createdAt: string
}

export interface LeadRef {
  id: string
  email: string
  name: string
  company?: string
}

export interface CreateCampaignPayload {
  workspaceId: string
  name: string
  subject: string
  body: string
  senderAccountId: string
  smartListId?: string
  leads: LeadRef[]
}

export interface CampaignProgress {
  campaignId: string
  sent: number
  total: number
  error?: string
}
```

- [ ] **Step 2: Erstelle `src/services/campaign.service.ts`**

```typescript
import { invoke } from '@tauri-apps/api/core'
import type {
  Campaign, CampaignWithStats, CampaignRecipient, CreateCampaignPayload,
} from '@/types/campaign.types'

export const CampaignService = {
  list(workspaceId: string): Promise<CampaignWithStats[]> {
    return invoke('cmd_list_campaigns', { workspaceId })
  },

  get(id: string): Promise<Campaign | null> {
    return invoke('cmd_get_campaign', { id })
  },

  getRecipients(campaignId: string): Promise<CampaignRecipient[]> {
    return invoke('cmd_get_campaign_recipients', { campaignId })
  },

  create(payload: CreateCampaignPayload): Promise<Campaign> {
    return invoke('cmd_create_campaign', { payload })
  },

  send(campaignId: string, leadsJson: string): Promise<void> {
    return invoke('cmd_send_campaign', { campaignId, leadsJson })
  },
}
```

- [ ] **Step 3: Erstelle `src/store/campaign.store.ts`**

```typescript
import { create } from 'zustand'
import { CampaignService } from '@/services/campaign.service'
import { log } from '@/lib/logger'
import type {
  CampaignWithStats, CampaignRecipient, CreateCampaignPayload, CampaignProgress,
} from '@/types/campaign.types'
import type { AppError } from '@/types/error.types'
import { isAppError, formatError } from '@/types/error.types'

interface CampaignState {
  campaigns: CampaignWithStats[]
  activeCampaignId: string | null
  recipients: CampaignRecipient[]
  sendProgress: CampaignProgress | null
  isLoading: boolean
  error: AppError | null

  load: (workspaceId: string) => Promise<void>
  loadRecipients: (campaignId: string) => Promise<void>
  setActive: (id: string | null) => void
  create: (payload: CreateCampaignPayload) => Promise<void>
  send: (campaignId: string, leadsJson: string, workspaceId: string) => Promise<void>
  setSendProgress: (p: CampaignProgress | null) => void
}

export const useCampaignStore = create<CampaignState>()((set, get) => ({
  campaigns: [],
  activeCampaignId: null,
  recipients: [],
  sendProgress: null,
  isLoading: false,
  error: null,

  load: async (workspaceId) => {
    set({ isLoading: true, error: null })
    try {
      const campaigns = await CampaignService.list(workspaceId)
      set({ campaigns, isLoading: false })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
      log.error('Failed to load campaigns', { error })
    }
  },

  loadRecipients: async (campaignId) => {
    set({ isLoading: true, error: null })
    try {
      const recipients = await CampaignService.getRecipients(campaignId)
      set({ recipients, isLoading: false })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ isLoading: false, error })
    }
  },

  setActive: (id) => set({ activeCampaignId: id, recipients: [] }),

  create: async (payload) => {
    try {
      const campaign = await CampaignService.create(payload)
      const campaigns = await CampaignService.list(campaign.workspaceId)
      set({ campaigns })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  send: async (campaignId, leadsJson, workspaceId) => {
    try {
      await CampaignService.send(campaignId, leadsJson)
      const campaigns = await CampaignService.list(workspaceId)
      set({ campaigns })
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error }); throw err
    }
  },

  setSendProgress: (p) => set({ sendProgress: p }),
}))
```

- [ ] **Step 4: TypeScript-Check**

```
npx tsc --noEmit
```
Erwartet: 0 Fehler

- [ ] **Step 5: Commit**

```
git add src/types/campaign.types.ts src/services/campaign.service.ts src/store/campaign.store.ts
git commit -m "feat(ts): campaign types, service, store"
```

---

## Task 5: Frontend-Komponenten — CampaignsTab, CampaignDetail, CreateCampaignModal

**Files:**
- Create: `src/components/mail/CampaignsTab.tsx`
- Create: `src/components/mail/CampaignDetail.tsx`
- Create: `src/components/mail/CreateCampaignModal.tsx`

### Kontext

UI-Muster aus `src/routes/FollowupsDashboardRoute.tsx` (inline Styles, `var(--fg)`, `var(--border)`, `var(--surface)`, `var(--surface-2)`, `.card`, `.section-head`, `.btn-primary`, `.btn-ghost`).

Für den `create`-Aufruf im Store: stelle sicher dass du Leads aus `useLeadsStore(s => s.leads)` holst und Smart Lists aus `useSmartListsStore`. Für `senderAccountId` braucht die CreateCampaignModal Zugriff auf Email-Accounts: importiere `useMailStore` und nutze `accounts`.

- [ ] **Step 1: Erstelle `src/components/mail/CampaignsTab.tsx`**

```typescript
import { useEffect } from 'react'
import { Plus, Send, AlertCircle } from 'lucide-react'
import { useCampaignStore } from '@/store/campaign.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import type { CampaignWithStats } from '@/types/campaign.types'

function replyRate(c: CampaignWithStats): string {
  if (c.sentCount === 0) return '—'
  return `${Math.round((c.repliedCount / c.sentCount) * 100)}%`
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    draft:   { label: 'Entwurf',        color: 'var(--fg-dim)', bg: 'rgba(255,255,255,0.06)' },
    sending: { label: 'Wird gesendet',  color: '#fb923c',        bg: 'rgba(251,146,60,0.12)' },
    sent:    { label: 'Gesendet',       color: '#a3e635',        bg: 'rgba(163,230,53,0.12)' },
    error:   { label: 'Fehler',         color: '#ef4444',        bg: 'rgba(239,68,68,0.12)'  },
  }
  const s = map[status] ?? map.draft
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  )
}

export function CampaignsTab({ onNew, onSelect }: {
  onNew: () => void
  onSelect: (id: string) => void
}) {
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const { campaigns, isLoading, load } = useCampaignStore()

  useEffect(() => {
    if (workspaceId) load(workspaceId)
  }, [workspaceId])

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 12px' }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>Kampagnen</h2>
          <p style={{ fontSize: 11, color: 'var(--fg-dim)', margin: '2px 0 0' }}>
            {campaigns.length} Kampagne{campaigns.length !== 1 ? 'n' : ''}
          </p>
        </div>
        <button
          onClick={onNew}
          className="btn-primary"
          style={{ fontSize: 11, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 5 }}
        >
          <Plus size={11} />
          Neue Kampagne
        </button>
      </div>

      {/* Table */}
      {isLoading && campaigns.length === 0 ? (
        <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--fg-dim)', fontSize: 12 }}>
          Lädt…
        </div>
      ) : campaigns.length === 0 ? (
        <div
          style={{ margin: '0 20px', padding: '32px', textAlign: 'center', border: '1.5px dashed var(--border)', borderRadius: 12, color: 'var(--fg-dim)', fontSize: 12, cursor: 'pointer' }}
          onClick={onNew}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
          onMouseLeave={e => (e.currentTarget.style.background = '')}
        >
          Keine Kampagnen — erste Kampagne erstellen
        </div>
      ) : (
        <div className="card" style={{ margin: '0 20px', padding: 0, overflow: 'hidden' }}>
          {/* Header row */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 70px 90px 80px 100px 80px',
            padding: '8px 16px', borderBottom: '1px solid var(--border)',
            fontSize: 10, fontWeight: 700, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            <span>Kampagne</span>
            <span style={{ textAlign: 'right' }}>Empfänger</span>
            <span style={{ textAlign: 'right' }}>Gesendet</span>
            <span style={{ textAlign: 'right' }}>Antworten</span>
            <span style={{ textAlign: 'right' }}>Reply Rate</span>
            <span style={{ textAlign: 'center' }}>Status</span>
          </div>
          {campaigns.map((c, i) => (
            <div
              key={c.id}
              onClick={() => onSelect(c.id)}
              style={{
                display: 'grid', gridTemplateColumns: '1fr 70px 90px 80px 100px 80px',
                padding: '12px 16px', cursor: 'pointer', transition: 'background 120ms',
                borderBottom: i < campaigns.length - 1 ? '1px solid var(--border)' : 'none',
                alignItems: 'center',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
            >
              <div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{c.name}</div>
                <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.subject}
                </div>
              </div>
              <div style={{ fontSize: 12, textAlign: 'right' }}>{c.totalRecipients}</div>
              <div style={{ fontSize: 12, textAlign: 'right', color: '#a3e635', fontWeight: 600 }}>{c.sentCount}</div>
              <div style={{ fontSize: 12, textAlign: 'right', color: '#2dd4bf', fontWeight: 600 }}>{c.repliedCount}</div>
              <div style={{ fontSize: 12, textAlign: 'right', fontWeight: 700, color: c.sentCount > 0 ? '#2dd4bf' : 'var(--fg-dim)' }}>
                {replyRate(c)}
              </div>
              <div style={{ textAlign: 'center' }}>
                <StatusChip status={c.status} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Erstelle `src/components/mail/CampaignDetail.tsx`**

```typescript
import { useEffect, useState } from 'react'
import { ArrowLeft, Send } from 'lucide-react'
import { useCampaignStore } from '@/store/campaign.store'
import { useLeadsStore } from '@/store/leads.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import type { CampaignRecipient } from '@/types/campaign.types'
import type { LeadRef } from '@/types/campaign.types'

function KpiTile({ value, label, color }: { value: string | number; label: string; color?: string }) {
  return (
    <div className="card" style={{ padding: '16px 20px', textAlign: 'center', flex: 1 }}>
      <div style={{ fontSize: 28, fontWeight: 800, color: color ?? 'var(--fg)', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 4 }}>{label}</div>
    </div>
  )
}

function RecipientRow({ r }: { r: CampaignRecipient }) {
  const statusColor = r.repliedAt ? '#a3e635' : r.error ? '#ef4444' : 'var(--fg-dim)'
  const statusText  = r.repliedAt ? '✓ Antwort' : r.error ? '✗ Fehler' : '— Offen'
  const sentDate = r.sentAt
    ? new Date(r.sentAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
    : '—'

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 80px 80px',
      padding: '10px 16px', alignItems: 'center', fontSize: 12,
    }}>
      <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {r.email}
      </div>
      <div style={{ color: 'var(--fg-dim)', textAlign: 'right' }}>{sentDate}</div>
      <div style={{ textAlign: 'right', fontWeight: 600, color: statusColor }}>{statusText}</div>
    </div>
  )
}

export function CampaignDetail({ campaignId, onBack }: { campaignId: string; onBack: () => void }) {
  const { campaigns, recipients, loadRecipients, isLoading, send } = useCampaignStore()
  const allLeads    = useLeadsStore(s => s.leads)
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const campaign    = campaigns.find(c => c.id === campaignId)
  const [sending, setSending] = useState(false)

  const handleSend = async () => {
    if (!campaign) return
    setSending(true)
    try {
      // Build LeadRef list from recipients by matching email to leads
      const emailToLead = new Map(allLeads.map(l => [l.email, l]))
      const leadRefs: LeadRef[] = recipients.map(r => {
        const lead = emailToLead.get(r.email)
        return { id: r.leadId, email: r.email, name: lead?.name ?? r.email, company: lead?.companyName ?? undefined }
      })
      await send(campaign.id, JSON.stringify(leadRefs), workspaceId)
      await loadRecipients(campaign.id)
    } finally {
      setSending(false)
    }
  }

  useEffect(() => {
    loadRecipients(campaignId)
  }, [campaignId])

  if (!campaign) return null

  const open = campaign.totalRecipients - campaign.repliedCount
  const replyRate = campaign.sentCount > 0
    ? `${Math.round((campaign.repliedCount / campaign.sentCount) * 100)}%`
    : '—'

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px 12px' }}>
        <button
          onClick={onBack}
          style={{ width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: '1px solid var(--border)', color: 'var(--fg-dim)', cursor: 'pointer' }}
        >
          <ArrowLeft size={13} />
        </button>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>{campaign.name}</h2>
          <p style={{ fontSize: 11, color: 'var(--fg-dim)', margin: '2px 0 0' }}>{campaign.subject}</p>
        </div>
        {campaign.status === 'draft' && (
          <button
            onClick={handleSend}
            disabled={sending || recipients.length === 0}
            className="btn-primary"
            style={{ fontSize: 11, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <Send size={11} />
            {sending ? 'Sendet…' : `Jetzt senden (${recipients.length})`}
          </button>
        )}
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 10, padding: '0 20px 16px' }}>
        <KpiTile value={campaign.sentCount}    label="Gesendet" />
        <KpiTile value={campaign.repliedCount} label="Geantwortet" color="#a3e635" />
        <KpiTile value={replyRate}             label="Reply Rate"  color="#2dd4bf" />
        <KpiTile value={open}                  label="Offen"       color="#fb923c" />
      </div>

      {/* Recipient list */}
      <div style={{ margin: '0 20px' }}>
        <div className="section-head" style={{ marginBottom: 8 }}>
          <h2 style={{ fontSize: 11 }}>Empfänger <span className="count">{String(recipients.length).padStart(2, '0')}</span></h2>
        </div>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 80px 80px',
            padding: '8px 16px', borderBottom: '1px solid var(--border)',
            fontSize: 10, fontWeight: 700, color: 'var(--fg-dim)', textTransform: 'uppercase',
          }}>
            <span>Lead</span>
            <span style={{ textAlign: 'right' }}>Gesendet</span>
            <span style={{ textAlign: 'right' }}>Status</span>
          </div>
          {isLoading && recipients.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--fg-dim)', fontSize: 11 }}>Lädt…</div>
          ) : recipients.map((r, i) => (
            <div key={r.id} style={{ borderBottom: i < recipients.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <RecipientRow r={r} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Erstelle `src/components/mail/CreateCampaignModal.tsx`**

```typescript
import { useState, useMemo } from 'react'
import { X, Send, Users, List } from 'lucide-react'
import { useCampaignStore } from '@/store/campaign.store'
import { useLeadsStore } from '@/store/leads.store'
import { useSmartListsStore } from '@/store/smart-lists.store'
import { useMailStore } from '@/store/mail.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import type { LeadRef } from '@/types/campaign.types'

type RecipientMode = 'smartlist' | 'manual'

export function CreateCampaignModal({ onClose, onCreated }: {
  onClose: () => void
  onCreated: (campaignId: string) => void
}) {
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const leads       = useLeadsStore(s => s.leads)
  const smartLists  = useSmartListsStore(s => s.lists)
  const accounts    = useMailStore(s => s.accounts)
  const create      = useCampaignStore(s => s.create)

  const [name,        setName]        = useState('')
  const [subject,     setSubject]     = useState('')
  const [body,        setBody]        = useState('')
  const [senderId,    setSenderId]    = useState(accounts[0]?.id ?? '')
  const [mode,        setMode]        = useState<RecipientMode>('smartlist')
  const [smartListId, setSmartListId] = useState<string>(smartLists[0]?.id ?? '')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  const leadsWithEmail = useMemo(() => leads.filter(l => l.email), [leads])

  const resolvedLeads = useMemo((): LeadRef[] => {
    if (mode === 'manual') {
      return leadsWithEmail
        .filter(l => selectedIds.has(l.id))
        .map(l => ({ id: l.id, email: l.email!, name: l.name, company: l.companyName ?? undefined }))
    }
    // Smart list: filter leads matching the smart list's criteria
    // For v1 simplicity: use all leads that have email
    return leadsWithEmail.map(l => ({
      id: l.id, email: l.email!, name: l.name, company: l.companyName ?? undefined,
    }))
  }, [mode, leadsWithEmail, selectedIds])

  const toggleLead = (id: string) => {
    setSelectedIds(s => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const handleCreate = async () => {
    if (!name.trim() || !subject.trim() || !body.trim() || !senderId || resolvedLeads.length === 0) {
      setError('Bitte alle Felder ausfüllen und mindestens einen Empfänger wählen.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await create({
        workspaceId,
        name: name.trim(),
        subject: subject.trim(),
        body: body.trim(),
        senderAccountId: senderId,
        smartListId: mode === 'smartlist' ? smartListId || undefined : undefined,
        leads: resolvedLeads,
      })
      onCreated('')
      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        width: 580, maxWidth: '94vw', maxHeight: '88vh',
        background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16,
        boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(45,212,191,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Send size={12} style={{ color: '#2dd4bf' }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Neue Kampagne</span>
          </div>
          <button onClick={onClose} style={{ width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: 'var(--fg-dim)', cursor: 'pointer' }}>
            <X size={13} />
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Name */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-dim)', display: 'block', marginBottom: 4 }}>Kampagnen-Name</label>
            <input value={name} onChange={e => setName(e.target.value)} className="mock-input" placeholder="Kalt-Outreach Mai 2026" style={{ width: '100%' }} />
          </div>

          {/* Sender */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-dim)', display: 'block', marginBottom: 4 }}>Absender-Konto</label>
            <select
              value={senderId}
              onChange={e => setSenderId(e.target.value)}
              className="mock-input"
              style={{ width: '100%' }}
            >
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.displayName || a.email}</option>
              ))}
            </select>
          </div>

          {/* Subject */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-dim)', display: 'block', marginBottom: 4 }}>
              Betreff
              <span style={{ fontWeight: 400, marginLeft: 6, color: 'var(--fg-muted)' }}>— {"{{name}}"} und {"{{company}}"} werden ersetzt</span>
            </label>
            <input value={subject} onChange={e => setSubject(e.target.value)} className="mock-input" placeholder="Kurze Vorstellung — {{name}}" style={{ width: '100%' }} />
          </div>

          {/* Body */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-dim)', display: 'block', marginBottom: 4 }}>Nachricht</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              className="mock-input"
              placeholder={`Hallo {{name}},\n\nkurze Frage…`}
              style={{ width: '100%', minHeight: 120, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
            />
          </div>

          {/* Recipient mode toggle */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-dim)', display: 'block', marginBottom: 6 }}>Empfänger</label>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <button
                onClick={() => setMode('smartlist')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '4px 12px', borderRadius: 99, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  background: mode === 'smartlist' ? 'rgba(45,212,191,0.12)' : 'rgba(255,255,255,0.05)',
                  color: mode === 'smartlist' ? '#2dd4bf' : 'var(--fg-dim)',
                  border: mode === 'smartlist' ? '1px solid rgba(45,212,191,0.25)' : '1px solid transparent',
                }}
              >
                <List size={11} /> Smart List
              </button>
              <button
                onClick={() => setMode('manual')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '4px 12px', borderRadius: 99, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  background: mode === 'manual' ? 'rgba(163,230,53,0.12)' : 'rgba(255,255,255,0.05)',
                  color: mode === 'manual' ? '#a3e635' : 'var(--fg-dim)',
                  border: mode === 'manual' ? '1px solid rgba(163,230,53,0.25)' : '1px solid transparent',
                }}
              >
                <Users size={11} /> Manuell
              </button>
            </div>

            {mode === 'smartlist' && (
              <select value={smartListId} onChange={e => setSmartListId(e.target.value)} className="mock-input" style={{ width: '100%' }}>
                {smartLists.map(sl => (
                  <option key={sl.id} value={sl.id}>{sl.icon} {sl.name}</option>
                ))}
              </select>
            )}

            {mode === 'manual' && (
              <div style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                {leadsWithEmail.map((l, i) => (
                  <label
                    key={l.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', cursor: 'pointer',
                      borderBottom: i < leadsWithEmail.length - 1 ? '1px solid var(--border)' : 'none',
                      fontSize: 12,
                    }}
                  >
                    <input type="checkbox" checked={selectedIds.has(l.id)} onChange={() => toggleLead(l.id)} />
                    <span style={{ fontWeight: 600 }}>{l.name}</span>
                    {l.companyName && <span style={{ color: 'var(--fg-dim)' }}>· {l.companyName}</span>}
                    <span style={{ color: 'var(--fg-dim)', marginLeft: 'auto', fontSize: 11 }}>{l.email}</span>
                  </label>
                ))}
              </div>
            )}

            <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 6 }}>
              {resolvedLeads.length} Empfänger ausgewählt
            </div>
          </div>

          {error && (
            <div style={{ fontSize: 11, color: '#ef4444', background: 'rgba(239,68,68,0.08)', padding: '8px 12px', borderRadius: 8 }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
          <button onClick={onClose} className="btn-ghost" style={{ fontSize: 12, padding: '6px 14px' }}>Abbrechen</button>
          <button
            onClick={handleCreate}
            disabled={saving}
            className="btn-primary"
            style={{ fontSize: 12, padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Send size={12} />
            {saving ? 'Erstelle…' : `Kampagne erstellen (${resolvedLeads.length})`}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: TypeScript-Check**

```
npx tsc --noEmit
```
Erwartet: 0 Fehler

- [ ] **Step 5: Commit**

```
git add src/components/mail/CampaignsTab.tsx src/components/mail/CampaignDetail.tsx src/components/mail/CreateCampaignModal.tsx
git commit -m "feat(ui): CampaignsTab, CampaignDetail, CreateCampaignModal"
```

---

## Task 6: MailRoute — Tab-Toggle + Kampagnen-Integration

**Files:**
- Modify: `src/routes/MailRoute.tsx`

### Kontext

Die aktuelle `MailRoute.tsx` hat keine Tabs — sie rendert direkt den Inbox-Bereich. Wir fügen oben in der Sidebar zwei Tabs ein: "Inbox" und "Kampagnen". Der Kampagnen-Tab zeigt entweder `CampaignsTab` oder `CampaignDetail`.

- [ ] **Step 1: Neue Imports hinzufügen**

Am Anfang von `src/routes/MailRoute.tsx` nach den bestehenden Imports:

```typescript
import { CampaignsTab }          from '@/components/mail/CampaignsTab'
import { CampaignDetail }        from '@/components/mail/CampaignDetail'
import { CreateCampaignModal }   from '@/components/mail/CreateCampaignModal'
import { useCampaignStore }      from '@/store/campaign.store'
```

- [ ] **Step 2: State für Tab + aktive Kampagne hinzufügen**

Innerhalb der `MailRoute`-Funktion nach den bestehenden `useState`-Zeilen:

```typescript
const [mailTab,         setMailTab]         = useState<'inbox' | 'campaigns'>('inbox')
const [showNewCampaign, setShowNewCampaign] = useState(false)
const setActiveCampaign = useCampaignStore(s => s.setActive)
const activeCampaignId  = useCampaignStore(s => s.activeCampaignId)
```

- [ ] **Step 3: Tab-Toggle in die linke Sidebar einfügen**

Suche die bestehende Stelle wo `<p className="text-xs font-semibold ...">Konten</p>` steht. Direkt **davor** füge den Tab-Toggle ein:

```tsx
{/* Tab Toggle */}
<div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
  <button
    onClick={() => setMailTab('inbox')}
    style={{
      flex: 1, padding: '5px 0', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer',
      background: mailTab === 'inbox' ? 'rgba(255,255,255,0.10)' : 'transparent',
      color: mailTab === 'inbox' ? 'var(--fg)' : 'var(--fg-dim)',
      border: 'none',
    }}
  >
    Inbox
  </button>
  <button
    onClick={() => setMailTab('campaigns')}
    style={{
      flex: 1, padding: '5px 0', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer',
      background: mailTab === 'campaigns' ? 'rgba(45,212,191,0.12)' : 'transparent',
      color: mailTab === 'campaigns' ? '#2dd4bf' : 'var(--fg-dim)',
      border: 'none',
    }}
  >
    Kampagnen
  </button>
</div>
```

- [ ] **Step 4: Kampagnen-Ansicht einbinden**

Suche die `return`-Anweisung. Das aktuelle Haupt-Layout ist in einem `<div style={{ display: 'flex', minHeight: 0, flex: 1 }}>`. Wrap die **rechte Seite** (alles rechts von der linken Sidebar) in eine Bedingung:

Finde den Bereich rechts der linken Sidebar (typischerweise das `<div className="card" style={{ flex: 1, ...}}>` für die E-Mail-Liste). **Wrapp** diesen gesamten rechten Bereich:

```tsx
{mailTab === 'inbox' ? (
  /* BESTEHENDE INBOX-INHALTE — unverändert lassen */
  <>
    {/* E-Mail-Liste + Detail Panel */}
    {/* ... alles was vorher da war ... */}
  </>
) : activeCampaignId ? (
  <CampaignDetail
    campaignId={activeCampaignId}
    onBack={() => setActiveCampaign(null)}
  />
) : (
  <CampaignsTab
    onNew={() => setShowNewCampaign(true)}
    onSelect={(id) => { setActiveCampaign(id) }}
  />
)}
```

**Wichtig:** Identifiziere die genauen JSX-Grenzen im bestehenden Code und wrap sie korrekt. Die linke Sidebar (accounts + folders) bleibt immer sichtbar — nur der rechte Bereich wechselt.

- [ ] **Step 5: CreateCampaignModal am Ende des returns einbinden**

Direkt vor dem letzten `</div>` (vor `{composeMode && showCompose && ...}`):

```tsx
{showNewCampaign && (
  <CreateCampaignModal
    onClose={() => setShowNewCampaign(false)}
    onCreated={(id) => {
      setShowNewCampaign(false)
      if (id) setActiveCampaign(id)
    }}
  />
)}
```

- [ ] **Step 6: TypeScript-Check**

```
npx tsc --noEmit
```
Erwartet: 0 Fehler

- [ ] **Step 7: Commit**

```
git add src/routes/MailRoute.tsx
git commit -m "feat(mail): Kampagnen-Tab in MailRoute — Tab-Toggle + CampaignsTab/Detail"
```

---

## Abschluss

Nach allen 6 Tasks:

- [ ] **Vollständiger Build-Check**

```
cd src-tauri && cargo build 2>&1 | grep "^error" | head -20
npx tsc --noEmit
```
Beide: 0 Fehler

- [ ] **Alle Rust-Tests grün**

```
cd src-tauri && cargo test 2>&1 | tail -5
```
Erwartet: `test result: ok. N passed`
