use crate::{AppError, db::pool::DbPool};
use super::{set_last_synced_at, get_last_synced_at};
use super::super::auth::SyncState;

pub async fn pull_customers(
    client: &reqwest::Client,
    state: &SyncState,
    pool: &DbPool,
    workspace_id: &str,
) -> Result<usize, AppError> {
    let token = match state.get_token() {
        Some(t) => t,
        None => return Ok(0),
    };

    let last_sync = {
        let conn = pool.conn();
        get_last_synced_at(&conn)
    };

    let url = if last_sync.is_empty() {
        format!(
            "{}/rest/v1/customers?workspace_id=eq.{}&select=*",
            state.supabase_url, workspace_id
        )
    } else {
        format!(
            "{}/rest/v1/customers?workspace_id=eq.{}&updated_at=gt.{}&select=*",
            state.supabase_url, workspace_id, last_sync
        )
    };

    let resp = client.get(&url)
        .header("Authorization", format!("Bearer {token}"))
        .header("apikey", &state.anon_key)
        .send()
        .await
        .map_err(|e| AppError::ExternalApi(e.to_string()))?;

    if !resp.status().is_success() {
        return Ok(0);
    }

    let rows: Vec<serde_json::Value> = resp.json().await
        .map_err(|e| AppError::ExternalApi(e.to_string()))?;

    let count = rows.len();
    {
        let conn = pool.conn();
        for row in &rows {
            let id = row["id"].as_str().unwrap_or_default();
            let name = row["name"].as_str().unwrap_or_default();
            let ws_id = row["workspace_id"].as_str().unwrap_or_default();
            let updated_at = row["updated_at"].as_str().unwrap_or_default();
            let created_at = row["created_at"].as_str().unwrap_or(updated_at);

            conn.execute(
                "INSERT INTO customers (id, name, workspace_id, created_by, created_at, updated_at, pending_sync)
                 VALUES (?1, ?2, ?3, '', ?4, ?5, 0)
                 ON CONFLICT(id) DO UPDATE SET
                   name = excluded.name,
                   updated_at = excluded.updated_at,
                   pending_sync = 0
                 WHERE excluded.updated_at > customers.updated_at",
                rusqlite::params![id, name, ws_id, created_at, updated_at],
            ).map_err(AppError::from)?;
        }
        let now = chrono::Utc::now().to_rfc3339();
        set_last_synced_at(&conn, &now)?;
    }

    Ok(count)
}
