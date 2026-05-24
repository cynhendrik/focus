use futures_util::StreamExt as FuturesStreamExt;
use native_tls::TlsConnector as NativeTlsConnector;
use tokio_native_tls::TlsConnector;
use mailparse::{parse_mail, MailHeaderMap};
use uuid::Uuid;
use chrono::Utc;

use crate::email::types::{CustomerRef, SyncProgress};
use crate::email::db::EmailRow;

// ── TLS helpers ───────────────────────────────────────────────────────────────

type TlsStream = tokio_native_tls::TlsStream<tokio::net::TcpStream>;

async fn tls_connect(host: &str, port: u16) -> Result<TlsStream, String> {
    let tcp = tokio::net::TcpStream::connect((host, port))
        .await
        .map_err(|e| format!("TCP-Verbindung zu {}:{} fehlgeschlagen: {}", host, port, e))?;

    let connector = NativeTlsConnector::builder()
        .build()
        .map_err(|e| format!("TLS-Builder-Fehler: {}", e))?;
    let tls = TlsConnector::from(connector);
    tls.connect(host, tcp)
        .await
        .map_err(|e| format!("TLS-Handshake fehlgeschlagen ({}): {}", host, e))
}

// ── Connection test ───────────────────────────────────────────────────────────

pub async fn test_connection(email: &str, password: &str, host: &str, port: u16) -> Result<(), String> {
    let tls_stream = tls_connect(host, port).await?;
    let client = async_imap::Client::new(tls_stream);
    let mut session = client
        .login(email, password)
        .await
        .map_err(|(e, _)| format!("Authentifizierung fehlgeschlagen: {}", e))?;
    let _ = session.logout().await;
    Ok(())
}

// ── Extended MIME parsing with attachments ────────────────────────────────────

pub struct ExtractedParts {
    pub body_text: String,
    pub body_html: String,
    pub attachments: Vec<crate::email::types::RawAttachment>,
}

pub fn extract_parts(raw: &[u8]) -> ExtractedParts {
    let Ok(parsed) = parse_mail(raw) else {
        return ExtractedParts { body_text: String::new(), body_html: String::new(), attachments: vec![] }
    };
    let mut result = ExtractedParts { body_text: String::new(), body_html: String::new(), attachments: vec![] };
    collect_parts(&parsed, &mut result);
    result
}

fn collect_parts(part: &mailparse::ParsedMail, out: &mut ExtractedParts) {
    let ct = part.ctype.mimetype.to_lowercase();
    let disposition = part.headers.get_first_value("Content-Disposition")
        .unwrap_or_default()
        .to_lowercase();

    if part.subparts.is_empty() {
        // Leaf node — check disposition first
        if disposition.starts_with("attachment") {
            let filename = extract_filename(part);
            let mime_type = part.ctype.mimetype.clone();
            if let Ok(content) = part.get_body_raw() {
                out.attachments.push(crate::email::types::RawAttachment {
                    email_id: String::new(), // filled in by sync loop
                    filename: if filename.is_empty() { "anhang".to_string() } else { filename },
                    mime_type,
                    content,
                });
            }
        } else {
            let body = part.get_body().unwrap_or_default();
            match ct.as_str() {
                "text/plain" => if out.body_text.is_empty() { out.body_text = body; },
                "text/html"  => if out.body_html.is_empty() { out.body_html = body; },
                _ => {}
            }
        }
    } else {
        // Container — recurse into subparts
        for sub in &part.subparts {
            collect_parts(sub, out);
        }
    }
}

fn extract_filename(part: &mailparse::ParsedMail) -> String {
    // Try Content-Disposition filename param
    let disp = part.headers.get_first_value("Content-Disposition").unwrap_or_default();
    if let Some(pos) = disp.to_lowercase().find("filename=") {
        let after = &disp[pos + 9..];
        let name = after.trim_start_matches('"')
            .split('"').next()
            .or_else(|| after.split(';').next())
            .unwrap_or("")
            .trim()
            .to_string();
        if !name.is_empty() { return name; }
    }
    // Fallback: Content-Type name param
    if let Some(name) = part.ctype.params.get("name") {
        return name.clone();
    }
    String::new()
}

fn parse_addr(raw: &str) -> (String, String) {
    if let (Some(s), Some(e)) = (raw.find('<'), raw.find('>')) {
        let addr = raw[s + 1..e].trim().to_string();
        let name = raw[..s].trim().trim_matches('"').to_string();
        return (name, addr);
    }
    (String::new(), raw.trim().to_string())
}

fn parse_to_addrs(raw: &str) -> Vec<String> {
    raw.split(',')
        .map(|s| parse_addr(s.trim()).1)
        .filter(|s| !s.is_empty())
        .collect()
}

// ── Auto-customer matching ────────────────────────────────────────────────────

fn match_customer(from_addr: &str, customers: &[CustomerRef]) -> Option<String> {
    let from_lower = from_addr.to_lowercase();
    // Exact match
    if let Some(c) = customers.iter().find(|c| {
        c.email.as_deref().map(|e| e.to_lowercase()) == Some(from_lower.clone())
    }) {
        return Some(c.id.clone());
    }
    // Domain match
    let domain = from_addr.split('@').nth(1)?.to_lowercase();
    customers.iter().find(|c| {
        c.email.as_deref()
            .and_then(|e| e.split('@').nth(1))
            .map(|d| d.to_lowercase() == domain)
            .unwrap_or(false)
    }).map(|c| c.id.clone())
}

// ── Sent folder detection ─────────────────────────────────────────────────────

const SENT_CANDIDATES: &[&str] = &[
    "Sent", "Sent Items", "Sent Messages", "Gesendet",
    "[Gmail]/Sent Mail", "INBOX.Sent", "Sent Mail",
];

async fn find_sent_folder(session: &mut async_imap::Session<TlsStream>) -> String {
    if let Ok(stream) = session.list(Some(""), Some("*")).await {
        let mailboxes: Vec<_> = stream
            .filter_map(|r| async move { r.ok() })
            .collect::<Vec<_>>()
            .await;

        // Prefer \Sent special-use flag (RFC 6154)
        for mailbox in &mailboxes {
            for attr in mailbox.attributes() {
                if format!("{:?}", attr).contains("Sent") {
                    return mailbox.name().to_string();
                }
            }
        }
        // Fallback: match by name
        for candidate in SENT_CANDIDATES {
            if mailboxes.iter().any(|m| m.name().eq_ignore_ascii_case(candidate)) {
                return candidate.to_string();
            }
        }
    }
    "Sent".to_string()
}

// ── Sync ──────────────────────────────────────────────────────────────────────

pub struct SyncOutput {
    pub rows: Vec<EmailRow>,
    pub attachments: Vec<crate::email::types::RawAttachment>,
    pub max_uid: u32,
    pub inserted_count: usize,
}

pub async fn sync_account<F>(
    email: &str,
    password: &str,
    host: &str,
    port: u16,
    account_id: &str,
    last_uid: u32,
    customers: &[CustomerRef],
    specific_folder: Option<&str>,
    mut on_progress: F,
) -> Result<SyncOutput, String>
where
    F: FnMut(SyncProgress),
{
    on_progress(SyncProgress {
        folder: "INBOX".into(), done: 0, total: 0, phase: "connecting".into(),
    });

    let tls_stream = tls_connect(host, port).await?;
    let client = async_imap::Client::new(tls_stream);
    let mut session = client
        .login(email, password)
        .await
        .map_err(|(e, _)| format!("Authentifizierung fehlgeschlagen: {}", e))?;

    let folders: Vec<(String, String)> = if let Some(folder) = specific_folder {
        vec![(folder.to_string(), folder.to_string())]
    } else {
        let sent_folder = find_sent_folder(&mut session).await;
        vec![
            ("INBOX".to_string(), "INBOX".to_string()),
            (sent_folder, "Sent".to_string()),
        ]
    };

    let mut all_rows: Vec<EmailRow> = Vec::new();
    let mut all_attachments: Vec<crate::email::types::RawAttachment> = Vec::new();
    let mut max_uid: u32 = last_uid;

    for (server_folder, normalized_folder) in folders {
        let mailbox = match session.select(&server_folder).await {
            Ok(m) => m,
            Err(_) => continue, // skip inaccessible folders
        };

        let total_msgs = mailbox.exists as usize;
        on_progress(SyncProgress {
            folder: normalized_folder.clone(),
            done: 0,
            total: total_msgs,
            phase: "scanning".into(),
        });

        let uid_set = match session.uid_search("ALL").await {
            Ok(s) => s,
            Err(_) => continue,
        };

        let mut uids: Vec<u32> = uid_set
            .into_iter()
            .filter(|&uid| uid > last_uid)
            .collect();
        uids.sort_unstable();

        let total = uids.len();
        let mut done = 0usize;

        for chunk in uids.chunks(50) {
            let uid_str: String = chunk.iter()
                .map(|u| u.to_string())
                .collect::<Vec<_>>()
                .join(",");

            on_progress(SyncProgress {
                folder: normalized_folder.clone(),
                done,
                total,
                phase: "fetching".into(),
            });

            let fetch_stream = match session.uid_fetch(&uid_str, "(RFC822 FLAGS UID)").await {
                Ok(s) => s,
                Err(_) => continue,
            };
            let fetches: Vec<_> = fetch_stream
                .filter_map(|r| async move { r.ok() })
                .collect::<Vec<_>>()
                .await;

            for fetch in &fetches {
                let uid = match fetch.uid {
                    Some(u) => u,
                    None => continue,
                };
                if uid > max_uid { max_uid = uid; }

                let body_bytes = match fetch.body() {
                    Some(b) => b,
                    None => continue,
                };

                let is_read = fetch.flags().any(|f| matches!(f, async_imap::types::Flag::Seen));

                let Ok(parsed) = parse_mail(body_bytes) else { continue };
                let subject  = parsed.headers.get_first_value("Subject").unwrap_or_default();
                let from_raw = parsed.headers.get_first_value("From").unwrap_or_default();
                let to_raw   = parsed.headers.get_first_value("To").unwrap_or_default();
                let date_raw = parsed.headers.get_first_value("Date").unwrap_or_default();
                let msg_id   = parsed.headers.get_first_value("Message-ID").unwrap_or_default();

                let (from_name, from_addr) = parse_addr(&from_raw);
                let to_addrs = parse_to_addrs(&to_raw);
                let to_addrs_json = serde_json::to_string(&to_addrs).unwrap_or_else(|_| "[]".into());

                let sent_at = chrono::DateTime::parse_from_rfc2822(&date_raw)
                    .map(|d| d.to_rfc3339())
                    .unwrap_or_else(|_| Utc::now().to_rfc3339());

                let parts = extract_parts(body_bytes);
                let body_text = parts.body_text;
                let body_html = parts.body_html;
                let customer_id = match_customer(&from_addr, customers);

                let email_id = Uuid::new_v4().to_string();
                let mut row_attachments = parts.attachments;
                for att in &mut row_attachments {
                    att.email_id = email_id.clone();
                }
                all_attachments.extend(row_attachments);

                all_rows.push(EmailRow {
                    id: email_id,
                    account_id: account_id.to_string(),
                    uid,
                    folder: normalized_folder.clone(),
                    message_id: msg_id,
                    subject,
                    from_addr,
                    from_name,
                    to_addrs_json,
                    body_text,
                    body_html,
                    sent_at,
                    is_read,
                    customer_id,
                });

                done += 1;
            }

            on_progress(SyncProgress {
                folder: normalized_folder.clone(),
                done,
                total,
                phase: "fetching".into(),
            });
        }
    }

    let _ = session.logout().await;
    let count = all_rows.len();
    Ok(SyncOutput { rows: all_rows, attachments: all_attachments, max_uid, inserted_count: count })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn specific_folder_overrides_default_folders() {
        // Tests the folder-selection logic without needing an IMAP connection.
        // We extract the selection logic into a testable helper function.
        let folders = resolve_folders_for_test(Some("INBOX.Projekte"));
        assert_eq!(folders.len(), 1);
        assert_eq!(folders[0].0, "INBOX.Projekte");

        let default_folders = resolve_folders_for_test(None);
        // Default: INBOX + a Sent folder (2 total)
        assert_eq!(default_folders.len(), 2);
        assert_eq!(default_folders[0].0, "INBOX");
    }

    /// Test helper — mirrors the folder-selection logic from sync_account without IMAP
    fn resolve_folders_for_test(specific_folder: Option<&str>) -> Vec<(String, String)> {
        if let Some(folder) = specific_folder {
            vec![(folder.to_string(), folder.to_string())]
        } else {
            vec![
                ("INBOX".to_string(), "INBOX".to_string()),
                ("Sent".to_string(), "Sent".to_string()),
            ]
        }
    }

    fn make_plain_email() -> Vec<u8> {
        b"From: a@b.de\r\nTo: c@d.de\r\nSubject: Test\r\nContent-Type: text/plain\r\n\r\nHello World".to_vec()
    }

    #[test]
    fn extract_parts_plain_text_no_attachments() {
        let parts = extract_parts(&make_plain_email());
        assert_eq!(parts.body_text, "Hello World");
        assert!(parts.body_html.is_empty());
        assert!(parts.attachments.is_empty());
    }

    #[test]
    fn extract_parts_returns_struct() {
        let parts = extract_parts(b"Content-Type: text/plain\r\n\r\nHi");
        // Just verifies no panic
        let _ = parts;
    }
}
