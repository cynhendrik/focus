use std::time::Duration;
use tauri::Emitter;
use crate::db::pool::DbPool;
use super::super::auth::SyncState;
use super::push;

pub async fn run_loop(app: tauri::AppHandle, state: SyncState, pool: DbPool) {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    let health_url = format!("{}/rest/v1/", state.supabase_url);
    let mut was_online = true;

    loop {
        tokio::time::sleep(Duration::from_secs(10)).await;

        if state.supabase_url.is_empty() { continue; }

        let is_online = client
            .head(&health_url)
            .header("apikey", &state.anon_key)
            .send()
            .await
            .map(|r| r.status().as_u16() < 500)
            .unwrap_or(false);

        if is_online != was_online {
            let _ = app.emit("cynera://connectivity-changed", is_online);
            was_online = is_online;
        }

        if is_online {
            if let Err(e) = push::flush_pending(&client, &state, &pool).await {
                eprintln!("[SyncWorker] Push failed: {e}");
            } else {
                let conn = pool.conn();
                if let Ok(count) = super::get_pending_count(&conn) {
                    let _ = app.emit("cynera://pending-count", count);
                }
            }
        }
    }
}
