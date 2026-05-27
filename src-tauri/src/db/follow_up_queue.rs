use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::AppError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FollowUpQueueItem {
    pub id: String,
    pub workspace_id: String,
    pub lead_id: String,
    pub trigger_activity_id: Option<String>,
    pub sequence_index: i64,
    pub send_at: String,
    pub status: String,
    pub template_key: String,
    pub draft_subject: Option<String>,
    pub draft_body: Option<String>,
    pub sent_activity_id: Option<String>,
    pub sent_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFollowUpItemPayload {
    pub workspace_id: String,
    pub lead_id: String,
    pub trigger_activity_id: Option<String>,
    pub sequence_index: i64,
    pub send_at: String,
    pub template_key: String,
    pub draft_subject: Option<String>,
    pub draft_body: Option<String>,
}

const SELECT: &str =
    "SELECT id, workspace_id, lead_id, trigger_activity_id, sequence_index, send_at, status,
            template_key, draft_subject, draft_body, sent_activity_id, sent_at,
            created_at, updated_at
     FROM follow_up_queue";

fn map_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<FollowUpQueueItem> {
    Ok(FollowUpQueueItem {
        id: r.get(0)?,
        workspace_id: r.get(1)?,
        lead_id: r.get(2)?,
        trigger_activity_id: r.get(3)?,
        sequence_index: r.get(4)?,
        send_at: r.get(5)?,
        status: r.get(6)?,
        template_key: r.get(7)?,
        draft_subject: r.get(8)?,
        draft_body: r.get(9)?,
        sent_activity_id: r.get(10)?,
        sent_at: r.get(11)?,
        created_at: r.get(12)?,
        updated_at: r.get(13)?,
    })
}

pub fn create_item(conn: &Connection, payload: CreateFollowUpItemPayload) -> Result<FollowUpQueueItem, AppError> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO follow_up_queue
         (id, workspace_id, lead_id, trigger_activity_id, sequence_index, send_at, status,
          template_key, draft_subject, draft_body, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,'pending',?7,?8,?9,?10,?10)",
        rusqlite::params![
            id, payload.workspace_id, payload.lead_id, payload.trigger_activity_id,
            payload.sequence_index, payload.send_at, payload.template_key,
            payload.draft_subject, payload.draft_body, now,
        ],
    )?;
    conn.query_row(&format!("{SELECT} WHERE id=?1"), [&id], map_row)
        .map_err(AppError::from)
}

pub fn cancel_for_lead(conn: &Connection, lead_id: &str) -> Result<usize, AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    let n = conn.execute(
        "UPDATE follow_up_queue SET status='cancelled', updated_at=?1 WHERE lead_id=?2 AND status='pending'",
        rusqlite::params![now, lead_id],
    )?;
    Ok(n)
}

pub fn get_due(conn: &Connection, workspace_id: &str) -> Result<Vec<FollowUpQueueItem>, AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    let mut stmt = conn.prepare(
        &format!("{SELECT} WHERE workspace_id=?1 AND status='pending' AND send_at <= ?2 ORDER BY send_at ASC")
    )?;
    let rows = stmt.query_map(rusqlite::params![workspace_id, now], map_row)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn get_for_lead(conn: &Connection, lead_id: &str) -> Result<Vec<FollowUpQueueItem>, AppError> {
    let mut stmt = conn.prepare(&format!(
        "{SELECT} WHERE lead_id=?1 ORDER BY sequence_index ASC"
    ))?;
    let rows = stmt.query_map([lead_id], map_row)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn mark_sent(conn: &Connection, id: &str, sent_activity_id: &str) -> Result<FollowUpQueueItem, AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    let n = conn.execute(
        "UPDATE follow_up_queue SET status='sent', sent_activity_id=?1, sent_at=?2, updated_at=?2 WHERE id=?3",
        rusqlite::params![sent_activity_id, now, id],
    )?;
    if n == 0 { return Err(AppError::NotFound(format!("FollowUpQueueItem {id} not found"))); }
    conn.query_row(&format!("{SELECT} WHERE id=?1"), [id], map_row)
        .map_err(AppError::from)
}

pub fn mark_skipped(conn: &Connection, id: &str) -> Result<FollowUpQueueItem, AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    let n = conn.execute(
        "UPDATE follow_up_queue SET status='skipped', updated_at=?1 WHERE id=?2",
        rusqlite::params![now, id],
    )?;
    if n == 0 { return Err(AppError::NotFound(format!("FollowUpQueueItem {id} not found"))); }
    conn.query_row(&format!("{SELECT} WHERE id=?1"), [id], map_row)
        .map_err(AppError::from)
}

pub fn update_draft(
    conn: &Connection,
    id: &str,
    subject: Option<&str>,
    body: Option<&str>,
) -> Result<FollowUpQueueItem, AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    let n = conn.execute(
        "UPDATE follow_up_queue SET
           draft_subject = COALESCE(?1, draft_subject),
           draft_body = COALESCE(?2, draft_body),
           updated_at = ?3
         WHERE id = ?4",
        rusqlite::params![subject, body, now, id],
    )?;
    if n == 0 { return Err(AppError::NotFound(format!("FollowUpQueueItem {id} not found"))); }
    conn.query_row(&format!("{SELECT} WHERE id=?1"), [id], map_row)
        .map_err(AppError::from)
}

pub fn create_sequence(
    conn: &Connection,
    workspace_id: &str,
    lead_id: &str,
    trigger_activity_id: &str,
    lead_name: &str,
    company_name: Option<&str>,
) -> Result<Vec<FollowUpQueueItem>, AppError> {
    let company_or_name = company_name.unwrap_or(lead_name);
    let now = chrono::Utc::now();

    let steps: &[(i64, i64, &str)] = &[
        (1, 2, "value"),
        (2, 5, "social_proof"),
        (3, 10, "question"),
        (4, 21, "urgency"),
    ];

    let mut items = Vec::with_capacity(4);

    for &(index, days_offset, template_key) in steps {
        let send_at = (now + chrono::Duration::days(days_offset)).to_rfc3339();

        let (draft_subject, draft_body) = match template_key {
            "value" => (
                format!("Noch ein Gedanke — für {company_or_name}"),
                format!(
                    "Hallo {lead_name},\n\nich wollte kurz nachfassen und dir gleichzeitig etwas Konkretes mitgeben.\n\n[Füge hier einen relevanten Mehrwert ein: Insight, Mini-Case oder Ressource]\n\nGibt es eine passende Zeit für ein kurzes Gespräch diese Woche?\n\nViele Grüße"
                ),
            ),
            "social_proof" => (
                format!("Was unsere Kunden erreichen — relevant für {company_or_name}?"),
                format!(
                    "Hallo {lead_name},\n\nein kurzes Update: Wir haben gerade ein Projekt abgeschlossen, das interessant für dich sein könnte.\n\nDas Ergebnis: [konkretes Ergebnis in einer Zeile].\n\nHätten wir 20 Minuten für einen kurzen Austausch?\n\nViele Grüße"
                ),
            ),
            "question" => (
                format!("Kurze Frage, {lead_name}"),
                format!(
                    "Hallo {lead_name},\n\nist das Thema aktuell noch relevant für {company_or_name}, oder hat sich die Priorität verschoben?\n\nDein ehrliches Feedback hilft mir, keine unpassenden Nachrichten zu senden.\n\nViele Grüße"
                ),
            ),
            "urgency" => (
                format!("Letzte Nachricht von mir, {lead_name}"),
                format!(
                    "Hallo {lead_name},\n\nich möchte dir keine weiteren Nachrichten schicken, wenn der Zeitpunkt nicht passt.\n\nFalls du irgendwann über [Thema] sprechen möchtest, stehe ich gerne zur Verfügung. Andernfalls wünsche ich viel Erfolg — und melde mich nur noch, wenn es wirklich etwas Relevantes gibt.\n\nViele Grüße"
                ),
            ),
            _ => unreachable!(),
        };

        let item = create_item(conn, CreateFollowUpItemPayload {
            workspace_id: workspace_id.to_string(),
            lead_id: lead_id.to_string(),
            trigger_activity_id: Some(trigger_activity_id.to_string()),
            sequence_index: index,
            send_at,
            template_key: template_key.to_string(),
            draft_subject: Some(draft_subject),
            draft_body: Some(draft_body),
        })?;
        items.push(item);
    }

    Ok(items)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{schema, migrations};

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        schema::create_tables(&conn).unwrap();
        migrations::run(&conn).unwrap();
        conn
    }

    fn seed_account(conn: &Connection, id: &str, workspace_id: &str) {
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, account_type, created_at, updated_at)
             VALUES (?1,?2,'','Test Lead','lead',?3,?3)",
            rusqlite::params![id, workspace_id, now],
        ).unwrap();
    }

    #[test]
    fn create_sequence_creates_4_items() {
        let conn = setup();
        seed_account(&conn, "lead-1", "ws-1");
        let items = create_sequence(&conn, "ws-1", "lead-1", "act-1", "Max Mustermann", Some("ACME GmbH")).unwrap();
        assert_eq!(items.len(), 4);
        assert_eq!(items[0].sequence_index, 1);
        assert_eq!(items[0].template_key, "value");
        assert_eq!(items[1].template_key, "social_proof");
        assert_eq!(items[2].template_key, "question");
        assert_eq!(items[3].template_key, "urgency");
        // All should be pending
        assert!(items.iter().all(|i| i.status == "pending"));
        // send_at should be in the future
        let now = chrono::Utc::now().to_rfc3339();
        assert!(items[0].send_at > now);
    }

    #[test]
    fn cancel_for_lead_cancels_pending_items() {
        let conn = setup();
        seed_account(&conn, "lead-1", "ws-1");
        create_sequence(&conn, "ws-1", "lead-1", "act-1", "Test", None).unwrap();
        let cancelled = cancel_for_lead(&conn, "lead-1").unwrap();
        assert_eq!(cancelled, 4);
        let items = get_for_lead(&conn, "lead-1").unwrap();
        assert!(items.iter().all(|i| i.status == "cancelled"));
    }

    #[test]
    fn mark_sent_updates_status_and_activity_id() {
        let conn = setup();
        seed_account(&conn, "lead-1", "ws-1");
        let items = create_sequence(&conn, "ws-1", "lead-1", "act-1", "Test", None).unwrap();
        let updated = mark_sent(&conn, &items[0].id, "sent-act-123").unwrap();
        assert_eq!(updated.status, "sent");
        assert_eq!(updated.sent_activity_id.as_deref(), Some("sent-act-123"));
        assert!(updated.sent_at.is_some());
    }

    #[test]
    fn get_due_returns_overdue_pending_only() {
        let conn = setup();
        seed_account(&conn, "lead-1", "ws-1");
        // Insert one item with send_at in the past (overdue)
        let now = chrono::Utc::now().to_rfc3339();
        let past = (chrono::Utc::now() - chrono::Duration::days(1)).to_rfc3339();
        conn.execute(
            "INSERT INTO follow_up_queue (id, workspace_id, lead_id, sequence_index, send_at, status, template_key, created_at, updated_at)
             VALUES ('fq-past','ws-1','lead-1',1,?1,'pending','value',?2,?2)",
            rusqlite::params![past, now],
        ).unwrap();
        // Insert one item with send_at in the future (not due)
        let future = (chrono::Utc::now() + chrono::Duration::days(2)).to_rfc3339();
        conn.execute(
            "INSERT INTO follow_up_queue (id, workspace_id, lead_id, sequence_index, send_at, status, template_key, created_at, updated_at)
             VALUES ('fq-future','ws-1','lead-1',2,?1,'pending','social_proof',?2,?2)",
            rusqlite::params![future, now],
        ).unwrap();
        let due = get_due(&conn, "ws-1").unwrap();
        assert_eq!(due.len(), 1);
        assert_eq!(due[0].id, "fq-past");
    }

    #[test]
    fn mark_skipped_updates_status() {
        let conn = setup();
        seed_account(&conn, "lead-1", "ws-1");
        let items = create_sequence(&conn, "ws-1", "lead-1", "act-1", "Test", None).unwrap();
        let skipped = mark_skipped(&conn, &items[0].id).unwrap();
        assert_eq!(skipped.status, "skipped");
    }

    #[test]
    fn update_draft_updates_subject_and_body() {
        let conn = setup();
        seed_account(&conn, "lead-1", "ws-1");
        let items = create_sequence(&conn, "ws-1", "lead-1", "act-1", "Test", None).unwrap();
        let updated = update_draft(&conn, &items[0].id, Some("New Subject"), Some("New Body")).unwrap();
        assert_eq!(updated.draft_subject.as_deref(), Some("New Subject"));
        assert_eq!(updated.draft_body.as_deref(), Some("New Body"));
    }

    #[test]
    fn get_for_lead_returns_all_in_order() {
        let conn = setup();
        seed_account(&conn, "lead-1", "ws-1");
        create_sequence(&conn, "ws-1", "lead-1", "act-1", "Test", None).unwrap();
        let items = get_for_lead(&conn, "lead-1").unwrap();
        assert_eq!(items.len(), 4);
        // should be ordered by sequence_index
        let indices: Vec<i64> = items.iter().map(|i| i.sequence_index).collect();
        assert_eq!(indices, vec![1, 2, 3, 4]);
    }
}
