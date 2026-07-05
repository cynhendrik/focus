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

    let mut all_ok = true;
    for entry in &entries {
        // Netzfehler (Err) brechen den Batch ab: temporär, nicht als Ablehnung werten.
        match send_entry(client, state, &token, entry).await? {
            PushOutcome::Delivered => delete_entry(pool, &entry.id)?,
            PushOutcome::Rejected(reason) => {
                mark_failed(pool, &entry.id, &reason)?;
                all_ok = false;
            }
        }
    }

    // Ehrlich bleiben: „synchronisiert" nur, wenn wirklich alles durchging.
    if all_ok {
        let now = chrono::Utc::now().to_rfc3339();
        let conn = pool.conn();
        set_last_synced_at(&conn, &now)?;
    }

    Ok(())
}

enum PushOutcome { Delivered, Rejected(String) }

async fn send_entry(
    client: &reqwest::Client,
    state: &SyncState,
    token: &str,
    entry: &SyncEntry,
) -> Result<PushOutcome, AppError> {
    match entry.operation.as_str() {
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
            let status = resp.status();
            if status.is_success() || status.as_u16() == 409 {
                Ok(PushOutcome::Delivered)
            } else {
                let body = resp.text().await.unwrap_or_default();
                Ok(PushOutcome::Rejected(format!("HTTP {}: {}", status.as_u16(), truncate(&body, 200))))
            }
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
            let status = resp.status();
            if status.is_success() || status.as_u16() == 404 {
                Ok(PushOutcome::Delivered)
            } else {
                let body = resp.text().await.unwrap_or_default();
                Ok(PushOutcome::Rejected(format!("HTTP {}: {}", status.as_u16(), truncate(&body, 200))))
            }
        }
        other => Ok(PushOutcome::Rejected(format!("Unbekannte Operation: {other}"))),
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max { s.to_string() }
    else { s.chars().take(max).collect::<String>() + "…" }
}

fn mark_failed(pool: &DbPool, id: &str, reason: &str) -> Result<(), AppError> {
    let conn = pool.conn();
    super::mark_entry_failed(&conn, id, reason)
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
