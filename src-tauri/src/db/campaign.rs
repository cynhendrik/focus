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
    conn.execute_batch("SAVEPOINT create_campaign")?;
    let result = (|| -> Result<Campaign, AppError> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO campaigns (id, workspace_id, name, subject, body, sender_account_id, smart_list_id, status, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,'draft',?8,?8)",
            rusqlite::params![id, payload.workspace_id, payload.name, payload.subject, payload.body, payload.sender_account_id, payload.smart_list_id, now],
        )?;
        for (lead_id, email) in payload.lead_ids.iter().zip(payload.lead_emails.iter()) {
            let rid = uuid::Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO campaign_recipients (id, campaign_id, lead_id, email, created_at) VALUES (?1,?2,?3,?4,?5)",
                rusqlite::params![rid, id, lead_id, email, now],
            )?;
        }
        conn.query_row(
            &format!("{SELECT_CAMPAIGN} WHERE id=?1"),
            [&id],
            map_campaign,
        ).map_err(AppError::from)
    })();
    match &result {
        Ok(_) => { conn.execute_batch("RELEASE create_campaign")?; }
        Err(_) => { let _ = conn.execute_batch("ROLLBACK TO create_campaign"); }
    }
    result
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
        .collect::<Result<Vec<_>, _>>()
        .map_err(AppError::from)?;

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
    let n = conn.execute(
        "UPDATE campaigns SET status=?1, sent_at=?2, updated_at=?3 WHERE id=?4",
        rusqlite::params![status, sent_at, now, campaign_id],
    )?;
    if n == 0 { return Err(AppError::NotFound(format!("Campaign {campaign_id}"))); }
    Ok(())
}

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
