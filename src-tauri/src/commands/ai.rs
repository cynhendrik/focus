use serde_json::Value;

const ANTHROPIC_URL: &str = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION: &str = "2023-06-01";

/// Zur Compile-Zeit eingebetteter Anthropic-Key (aus .cargo/config.toml).
/// Wird genutzt, wenn kein per-User-Key übergeben wurde — so können Tester
/// die KI ohne eigenen Key über deinen Key nutzen.
fn embedded_key() -> &'static str {
    option_env!("ANTHROPIC_API_KEY").unwrap_or("")
}

#[tauri::command]
pub async fn cmd_anthropic_messages(
    api_key: String,
    body: Value,
) -> Result<Value, String> {
    // Per-User-Key bevorzugen, sonst auf den eingebetteten Key zurückfallen.
    let key = if api_key.trim().is_empty() {
        embedded_key().to_string()
    } else {
        api_key
    };
    if key.trim().is_empty() {
        return Err("Kein API-Key konfiguriert.".to_string());
    }

    let client = reqwest::Client::new();
    let response = client
        .post(ANTHROPIC_URL)
        .header("x-api-key", key)
        .header("anthropic-version", ANTHROPIC_VERSION)
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Netzwerkfehler: {}", e))?;

    let status = response.status();
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Antwort lesen: {}", e))?;

    let json: Value = serde_json::from_slice(&bytes)
        .map_err(|e| format!("Antwort ist kein JSON: {}", e))?;

    if !status.is_success() {
        let msg = json
            .get("error")
            .and_then(|e| e.get("message"))
            .and_then(|m| m.as_str())
            .unwrap_or("Unbekannter API-Fehler");
        return Err(format!("HTTP {}: {}", status.as_u16(), msg));
    }

    Ok(json)
}
