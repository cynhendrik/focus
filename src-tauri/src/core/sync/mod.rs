pub mod connectivity;
pub mod push;

use serde::{Deserialize, Serialize};
use crate::{AppError, db::pool::DbPool};
use super::auth::SyncState;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncEntry {
    pub id: String,
    pub table_name: String,
    pub record_id: String,
    pub operation: String,
    pub payload: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct SyncStatus {
    pub pending_count: u32,
    pub last_synced_at: String,
    pub is_online: bool,
}

pub fn enqueue(
    conn: &rusqlite::Connection,
    table_name: &str,
    record_id: &str,
    operation: &str,
    payload: serde_json::Value,
) -> Result<(), AppError> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO sync_queue (id, table_name, record_id, operation, payload, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![id, table_name, record_id, operation, payload.to_string(), now],
    )?;
    Ok(())
}

pub fn get_pending_count(conn: &rusqlite::Connection) -> Result<u32, AppError> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sync_queue", [], |r| r.get(0)
    )?;
    Ok(count as u32)
}

pub fn get_last_synced_at(conn: &rusqlite::Connection) -> String {
    conn.query_row(
        "SELECT value FROM sync_meta WHERE key = 'last_sync_at'",
        [],
        |r| r.get::<_, String>(0),
    ).unwrap_or_default()
}

pub fn set_last_synced_at(conn: &rusqlite::Connection, ts: &str) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO sync_meta (key, value) VALUES ('last_sync_at', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [ts],
    )?;
    Ok(())
}

#[tauri::command]
pub async fn get_sync_status(
    db: tauri::State<'_, DbPool>,
    sync: tauri::State<'_, SyncState>,
) -> Result<SyncStatus, AppError> {
    let conn = db.conn();
    let pending_count = get_pending_count(&conn)?;
    let last_synced_at = get_last_synced_at(&conn);
    let is_online = !sync.supabase_url.is_empty();
    Ok(SyncStatus { pending_count, last_synced_at, is_online })
}

#[tauri::command]
pub async fn sync_now(
    db: tauri::State<'_, DbPool>,
    sync: tauri::State<'_, SyncState>,
) -> Result<SyncStatus, AppError> {
    let client = reqwest::Client::new();
    push::flush_pending(&client, &sync, &db).await?;
    let conn = db.conn();
    let pending_count = get_pending_count(&conn)?;
    let last_synced_at = get_last_synced_at(&conn);
    Ok(SyncStatus { pending_count, last_synced_at, is_online: true })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{schema, migrations};

    fn setup() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        schema::create_tables(&conn).unwrap();
        migrations::run(&conn).unwrap();
        conn
    }

    #[test]
    fn enqueue_adds_entry() {
        let conn = setup();
        let payload = serde_json::json!({"id": "c1", "name": "Test"});
        enqueue(&conn, "customers", "c1", "INSERT", payload).unwrap();
        let count = get_pending_count(&conn).unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn last_synced_at_roundtrip() {
        let conn = setup();
        set_last_synced_at(&conn, "2026-05-14T10:00:00Z").unwrap();
        assert_eq!(get_last_synced_at(&conn), "2026-05-14T10:00:00Z");
    }
}
