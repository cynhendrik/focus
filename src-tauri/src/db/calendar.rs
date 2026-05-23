use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::AppError;

// ── Typen ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEvent {
    pub id: String,
    pub workspace_id: String,
    pub created_by: String,
    pub account_id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub location: Option<String>,
    pub start_at: String,
    pub end_at: String,
    pub all_day: bool,
    pub color: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertCalendarEventPayload {
    pub id: Option<String>,
    pub workspace_id: String,
    pub created_by: String,
    pub account_id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub location: Option<String>,
    pub start_at: String,
    pub end_at: String,
    pub all_day: bool,
    pub color: Option<String>,
}

// ── Mapper ────────────────────────────────────────────────────────────────────

fn map_event(r: &rusqlite::Row<'_>) -> rusqlite::Result<CalendarEvent> {
    Ok(CalendarEvent {
        id:           r.get(0)?,
        workspace_id: r.get(1)?,
        created_by:   r.get(2)?,
        account_id:   r.get(3)?,
        title:        r.get(4)?,
        description:  r.get(5)?,
        location:     r.get(6)?,
        start_at:     r.get(7)?,
        end_at:       r.get(8)?,
        all_day:      r.get::<_, i32>(9)? != 0,
        color:        r.get(10)?,
        created_at:   r.get(11)?,
        updated_at:   r.get(12)?,
    })
}

const EVENT_COLS: &str =
    "id, workspace_id, created_by, account_id, title, description, location, \
     start_at, end_at, all_day, color, created_at, updated_at";

// ── DB-Funktionen ─────────────────────────────────────────────────────────────

pub fn get_events(
    conn: &Connection,
    workspace_id: &str,
    from: &str,
    to: &str,
) -> Result<Vec<CalendarEvent>, AppError> {
    let sql = format!(
        "SELECT {EVENT_COLS} FROM calendar_events \
         WHERE workspace_id = ?1 AND start_at >= ?2 AND start_at <= ?3 \
         ORDER BY start_at ASC"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt
        .query_map(rusqlite::params![workspace_id, from, to], map_event)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn upsert_event(
    conn: &Connection,
    payload: UpsertCalendarEventPayload,
) -> Result<CalendarEvent, AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    let id = payload.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let all_day_int: i32 = if payload.all_day { 1 } else { 0 };

    conn.execute(
        "INSERT INTO calendar_events \
         (id, workspace_id, created_by, account_id, title, description, location, \
          start_at, end_at, all_day, color, created_at, updated_at) \
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13) \
         ON CONFLICT(id) DO UPDATE SET \
          account_id=excluded.account_id, title=excluded.title, \
          description=excluded.description, location=excluded.location, \
          start_at=excluded.start_at, end_at=excluded.end_at, \
          all_day=excluded.all_day, color=excluded.color, updated_at=excluded.updated_at",
        rusqlite::params![
            id, payload.workspace_id, payload.created_by, payload.account_id,
            payload.title, payload.description, payload.location,
            payload.start_at, payload.end_at, all_day_int, payload.color,
            now, now,
        ],
    )?;

    let sql = format!("SELECT {EVENT_COLS} FROM calendar_events WHERE id = ?1");
    let mut stmt = conn.prepare(&sql)?;
    let event = stmt.query_row([&id], map_event)?;
    Ok(event)
}

pub fn delete_event(
    conn: &Connection,
    id: &str,
    workspace_id: &str,
) -> Result<(), AppError> {
    conn.execute(
        "DELETE FROM calendar_events WHERE id = ?1 AND workspace_id = ?2",
        rusqlite::params![id, workspace_id],
    )?;
    Ok(())
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::schema::create_tables;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        create_tables(&conn).unwrap();
        conn
    }

    fn sample_payload(id: Option<String>) -> UpsertCalendarEventPayload {
        UpsertCalendarEventPayload {
            id,
            workspace_id: "ws1".into(),
            created_by: "user1".into(),
            account_id: None,
            title: "Test Meeting".into(),
            description: None,
            location: None,
            start_at: "2026-05-23T10:00:00".into(),
            end_at: "2026-05-23T11:00:00".into(),
            all_day: false,
            color: None,
        }
    }

    #[test]
    fn upsert_creates_event() {
        let conn = setup();
        let event = upsert_event(&conn, sample_payload(None)).unwrap();
        assert_eq!(event.title, "Test Meeting");
        assert_eq!(event.workspace_id, "ws1");
        assert!(!event.all_day);
    }

    #[test]
    fn upsert_updates_existing_event() {
        let conn = setup();
        let created = upsert_event(&conn, sample_payload(None)).unwrap();
        let mut updated_payload = sample_payload(Some(created.id.clone()));
        updated_payload.title = "Updated Meeting".into();
        let updated = upsert_event(&conn, updated_payload).unwrap();
        assert_eq!(updated.id, created.id);
        assert_eq!(updated.title, "Updated Meeting");
    }

    #[test]
    fn get_events_filters_by_range() {
        let conn = setup();
        upsert_event(&conn, sample_payload(None)).unwrap();
        let mut other = sample_payload(None);
        other.start_at = "2026-06-01T10:00:00".into();
        other.end_at   = "2026-06-01T11:00:00".into();
        upsert_event(&conn, other).unwrap();

        let events = get_events(&conn, "ws1", "2026-05-01T00:00:00", "2026-05-31T23:59:59").unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].title, "Test Meeting");
    }

    #[test]
    fn delete_event_removes_it() {
        let conn = setup();
        let event = upsert_event(&conn, sample_payload(None)).unwrap();
        delete_event(&conn, &event.id, "ws1").unwrap();
        let events = get_events(&conn, "ws1", "2026-01-01T00:00:00", "2026-12-31T23:59:59").unwrap();
        assert!(events.is_empty());
    }
}
