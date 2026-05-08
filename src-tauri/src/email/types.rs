use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Account {
    pub id: String,
    pub email: String,
    pub display_name: String,
    pub imap_host: String,
    pub imap_port: u16,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncProgress {
    pub folder: String,  // "INBOX" | "Sent" | "done"
    pub done: usize,
    pub total: usize,
    pub phase: String,   // "connecting" | "scanning" | "fetching" | "done" | "error"
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
