use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Account {
    pub id: String,
    pub email: String,
    pub display_name: String,
    pub imap_host: String,
    pub imap_port: u16,
    pub smtp_host: String,
    pub smtp_port: u16,
    pub smtp_starttls: bool,
    pub last_synced_at: Option<String>,
    pub status: String, // "active" | "auth_error" | "error"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailHeader {
    pub id: String,
    pub account_id: String,
    pub uid: u32,
    pub folder: String,
    pub subject: String,
    pub from_addr: String,
    pub from_name: String,
    pub to_addrs: Vec<String>,
    pub sent_at: String,
    pub is_read: bool,
    pub customer_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailBody {
    pub id: String,
    pub body_text: String,
    pub body_html: String,
}

/// Attachment metadata returned to frontend (no content bytes)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailAttachment {
    pub id: String,
    pub email_id: String,
    pub filename: String,
    pub mime_type: String,
    pub size_bytes: usize,
}

/// Payload for send_email command (camelCase from frontend)
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendEmailPayload {
    pub account_id: String,
    pub to: Vec<String>,
    #[serde(default)]
    pub cc: Vec<String>,
    pub subject: String,
    pub body_text: String,
    #[serde(default)]
    pub attachment_paths: Vec<String>,
}

/// Raw attachment data from IMAP parsing (internal use)
#[derive(Debug)]
pub struct RawAttachment {
    pub email_id: String,   // UUID of the parent email row
    pub filename: String,
    pub mime_type: String,
    pub content: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncProgress {
    pub folder: String,
    pub done: usize,
    pub total: usize,
    pub phase: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncResult {
    pub inserted: usize,
    pub skipped: usize,
}

/// Minimal customer ref passed from frontend for auto-matching
#[derive(Debug, Deserialize)]
pub struct CustomerRef {
    pub id: String,
    pub email: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn send_email_payload_deserializes() {
        let json = r#"{
            "accountId": "acc1",
            "to": ["bob@example.com"],
            "cc": ["cc@example.com"],
            "subject": "Test",
            "bodyText": "Hello",
            "attachmentPaths": ["/tmp/file.pdf"]
        }"#;
        let p: SendEmailPayload = serde_json::from_str(json).unwrap();
        assert_eq!(p.account_id, "acc1");
        assert_eq!(p.to, vec!["bob@example.com"]);
        assert_eq!(p.cc, vec!["cc@example.com"]);
        assert_eq!(p.attachment_paths, vec!["/tmp/file.pdf"]);
    }

    #[test]
    fn account_has_smtp_fields() {
        let a = Account {
            id: "1".into(), email: "a@b.de".into(), display_name: "A".into(),
            imap_host: "imap.b.de".into(), imap_port: 993,
            smtp_host: "smtp.b.de".into(), smtp_port: 587, smtp_starttls: true,
            last_synced_at: None, status: "active".into(),
        };
        assert_eq!(a.smtp_host, "smtp.b.de");
        assert!(a.smtp_starttls);
    }
}
