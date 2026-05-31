use serde_json::Value;

const ANTHROPIC_URL: &str = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION: &str = "2023-06-01";

#[tauri::command]
pub async fn cmd_anthropic_messages(
    api_key: String,
    body: Value,
) -> Result<Value, String> {
    if api_key.trim().is_empty() {
        return Err("Kein API-Key übergeben.".to_string());
    }

    let client = reqwest::Client::new();
    let response = client
        .post(ANTHROPIC_URL)
        .header("x-api-key", api_key)
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
