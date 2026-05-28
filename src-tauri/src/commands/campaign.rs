use tauri::{Emitter, WebviewWindow as Window};
use serde::{Deserialize, Serialize};
use crate::{AppError, db, email};
use crate::db::pool::DbPool;
use crate::email::db::EmailDb;
use crate::db::campaign::{Campaign, CampaignWithStats, CampaignRecipient, CreateCampaignPayload};
use crate::email::types::SendEmailPayload;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CampaignProgress {
    campaign_id: String,
    sent: usize,
    total: usize,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeadRef {
    pub id: String,
    pub email: String,
    pub name: String,
    pub company: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCampaignCmd {
    pub workspace_id: String,
    pub name: String,
    pub subject: String,
    pub body: String,
    pub sender_account_id: String,
    pub smart_list_id: Option<String>,
    pub leads: Vec<LeadRef>,
}

#[tauri::command]
pub fn cmd_list_campaigns(
    workspace_id: String,
    pool: tauri::State<'_, DbPool>,
) -> Result<Vec<CampaignWithStats>, AppError> {
    db::campaign::list(&pool.conn(), &workspace_id)
}

#[tauri::command]
pub fn cmd_get_campaign(
    id: String,
    pool: tauri::State<'_, DbPool>,
) -> Result<Option<Campaign>, AppError> {
    db::campaign::get(&pool.conn(), &id)
}

#[tauri::command]
pub fn cmd_get_campaign_recipients(
    campaign_id: String,
    pool: tauri::State<'_, DbPool>,
) -> Result<Vec<CampaignRecipient>, AppError> {
    db::campaign::get_recipients(&pool.conn(), &campaign_id)
}

#[tauri::command]
pub fn cmd_create_campaign(
    payload: CreateCampaignCmd,
    pool: tauri::State<'_, DbPool>,
) -> Result<Campaign, AppError> {
    let lead_ids: Vec<String> = payload.leads.iter().map(|l| l.id.clone()).collect();
    let lead_emails: Vec<String> = payload.leads.iter().map(|l| l.email.clone()).collect();
    let db_payload = CreateCampaignPayload {
        workspace_id: payload.workspace_id,
        name: payload.name,
        subject: payload.subject,
        body: payload.body,
        sender_account_id: payload.sender_account_id,
        smart_list_id: payload.smart_list_id,
        lead_ids,
        lead_emails,
    };
    db::campaign::create(&pool.conn(), db_payload)
}

#[tauri::command]
pub async fn cmd_send_campaign(
    campaign_id: String,
    leads_json: String,
    window: Window,
    pool: tauri::State<'_, DbPool>,
    email_db: tauri::State<'_, EmailDb>,
) -> Result<(), AppError> {
    // 1. Load campaign
    let campaign = {
        db::campaign::get(&pool.conn(), &campaign_id)?
            .ok_or_else(|| AppError::NotFound(format!("Campaign {campaign_id}")))?
    };

    // 2. Load recipients
    let recipients = db::campaign::get_recipients(&pool.conn(), &campaign_id)?;

    // 3. Load email account + SMTP credentials
    let account = {
        let conn = email_db.0.lock().map_err(|e| AppError::Db(e.to_string()))?;
        email::db::get_account(&conn, &campaign.sender_account_id)
            .map_err(|e| AppError::Db(e.to_string()))?
            .ok_or_else(|| AppError::NotFound(format!("EmailAccount {}", campaign.sender_account_id)))?
    };
    let password = email::keychain::get(&account.email)
        .map_err(AppError::Db)?;

    // 4. Parse lead refs for personalization
    let leads: Vec<LeadRef> = serde_json::from_str(&leads_json)
        .map_err(|e| AppError::Db(format!("leads_json parse error: {}", e)))?;
    let lead_map: std::collections::HashMap<String, &LeadRef> =
        leads.iter().map(|l| (l.email.clone(), l)).collect();

    // 5. Update status to "sending"
    db::campaign::update_status(&pool.conn(), &campaign_id, "sending")?;

    let total = recipients.len();
    let mut sent = 0usize;
    let mut had_error = false;

    for recipient in &recipients {
        let lead_ref = lead_map.get(&recipient.email);
        let name    = lead_ref.map(|l| l.name.as_str()).unwrap_or("");
        let company = lead_ref.and_then(|l| l.company.as_deref()).unwrap_or("");

        let subject = campaign.subject
            .replace("{{name}}", name)
            .replace("{{company}}", company);
        let body = campaign.body
            .replace("{{name}}", name)
            .replace("{{company}}", company);

        let smtp_payload = SendEmailPayload {
            account_id: account.id.clone(),
            to: vec![recipient.email.clone()],
            cc: vec![],
            subject,
            body_text: body,
            attachment_paths: vec![],
        };

        let send_result = email::smtp::send_email(
            &account.smtp_host,
            account.smtp_port,
            account.smtp_starttls,
            &account.email,
            &account.display_name,
            &password,
            &smtp_payload,
        ).await;

        match send_result {
            Ok(()) => {
                db::campaign::mark_sent(&pool.conn(), &recipient.id)?;
                sent += 1;
            }
            Err(e) => {
                let _ = db::campaign::mark_error(&pool.conn(), &recipient.id, &e);
                had_error = true;
            }
        }

        let _ = window.emit("campaign-progress", &CampaignProgress {
            campaign_id: campaign_id.clone(),
            sent,
            total,
            error: None,
        });
    }

    // 6. Update final status
    let final_status = if had_error && sent == 0 { "error" } else { "sent" };
    db::campaign::update_status(&pool.conn(), &campaign_id, final_status)?;

    let _ = window.emit("campaign-done", &serde_json::json!({
        "campaignId": campaign_id,
        "sentCount": sent,
        "errorCount": total - sent,
    }));

    Ok(())
}
