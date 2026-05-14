use crate::{AppError, db::pool::DbPool};
use super::{SyncEntry, set_last_synced_at};
use super::super::auth::SyncState;

pub async fn flush_pending(
    client: &reqwest::Client,
    state: &SyncState,
    pool: &DbPool,
) -> Result<(), AppError> {
    let token = match state.get_token() {
        Some(t) => t,
        None => return Ok(()),
    };

    let entries = get_queue(pool)?;
    if entries.is_empty() { return Ok(()); }

    for entry in &entries {
        let success = match entry.operation.as_str() {
            "INSERT" | "UPDATE" => {
                let url = format!("{}/rest/v1/{}", state.supabase_url, entry.table_name);
                let payload: serde_json::Value = serde_json::from_str(&entry.payload)
                    .map_err(|e| AppError::Validation(e.to_string()))?;

                let resp = client.post(&url)
                    .header("Authorization", format!("Bearer {token}"))
                    .header("apikey", &state.anon_key)
                    .header("Content-Type", "application/json")
                    .header("Prefer", "resolution=merge-duplicates,return=minimal")
                    .json(&payload)
                    .send()
                    .await
                    .map_err(|e| AppError::ExternalApi(e.to_string()))?;

                resp.status().is_success() || resp.status().as_u16() == 409
            }
            "DELETE" => {
                let url = format!(
                    "{}/rest/v1/{}?id=eq.{}",
                    state.supabase_url, entry.table_name, entry.record_id
                );
                let resp = client.delete(&url)
                    .header("Authorization", format!("Bearer {token}"))
                    .header("apikey", &state.anon_key)
                    .send()
                    .await
                    .map_err(|e| AppError::ExternalApi(e.to_string()))?;

                resp.status().is_success() || resp.status().as_u16() == 404
            }
            _ => false,
        };

        if success {
            delete_entry(pool, &entry.id)?;
        }
    }

    let now = chrono::Utc::now().to_rfc3339();
    let conn = pool.conn();
    set_last_synced_at(&conn, &now)?;

    Ok(())
}

fn get_queue(pool: &DbPool) -> Result<Vec<SyncEntry>, AppError> {
    let conn = pool.conn();
    let mut stmt = conn.prepare(
        "SELECT id, table_name, record_id, operation, payload, created_at
         FROM sync_queue ORDER BY created_at ASC LIMIT 100"
    )?;
    let entries = stmt.query_map([], |row| Ok(SyncEntry {
        id:         row.get(0)?,
        table_name: row.get(1)?,
        record_id:  row.get(2)?,
        operation:  row.get(3)?,
        payload:    row.get(4)?,
        created_at: row.get(5)?,
    }))?.collect::<Result<Vec<_>, _>>()?;
    Ok(entries)
}

fn delete_entry(pool: &DbPool, id: &str) -> Result<(), AppError> {
    pool.conn().execute("DELETE FROM sync_queue WHERE id = ?1", [id])?;
    Ok(())
}
