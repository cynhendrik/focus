// src-tauri/src/email/smtp.rs

use lettre::{
    message::{
        header::ContentType,
        Attachment, Mailbox, Mailboxes, MultiPart, SinglePart,
    },
    transport::smtp::authentication::Credentials,
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
};
use std::path::Path;

use crate::email::types::SendEmailPayload;

// ── Address parsing ───────────────────────────────────────────────────────────

/// Parse a list of address strings into lettre Mailboxes.
/// Returns an error string if any address is invalid.
pub fn parse_addresses(addrs: &[String]) -> Result<Mailboxes, String> {
    addrs
        .iter()
        .map(|a| {
            a.parse::<Mailbox>()
                .map_err(|e| format!("Ungültige E-Mail-Adresse '{}': {}", a, e))
        })
        .collect()
}

// ── Transport factory ─────────────────────────────────────────────────────────

fn build_starttls_transport(
    smtp_host: &str,
    smtp_port: u16,
    email: &str,
    password: &str,
) -> Result<AsyncSmtpTransport<Tokio1Executor>, String> {
    let creds = Credentials::new(email.to_string(), password.to_string());
    let transport = AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(smtp_host)
        .map_err(|e| e.to_string())?
        .port(smtp_port)
        .credentials(creds)
        .build();
    Ok(transport)
}

fn build_tls_transport(
    smtp_host: &str,
    smtp_port: u16,
    email: &str,
    password: &str,
) -> Result<AsyncSmtpTransport<Tokio1Executor>, String> {
    let creds = Credentials::new(email.to_string(), password.to_string());
    let transport = AsyncSmtpTransport::<Tokio1Executor>::relay(smtp_host)
        .map_err(|e| e.to_string())?
        .port(smtp_port)
        .credentials(creds)
        .build();
    Ok(transport)
}

// ── Public API ────────────────────────────────────────────────────────────────

/// Test an SMTP connection. Returns Ok(()) if authentication succeeds.
pub async fn test_smtp_connection(
    smtp_host: &str,
    smtp_port: u16,
    starttls: bool,
    email: &str,
    password: &str,
) -> Result<(), String> {
    let transport = if starttls {
        build_starttls_transport(smtp_host, smtp_port, email, password)?
    } else {
        build_tls_transport(smtp_host, smtp_port, email, password)?
    };
    transport
        .test_connection()
        .await
        .map_err(|e| format!("SMTP-Verbindungstest fehlgeschlagen: {}", e))
        .map(|_| ())?;
    Ok(())
}

/// Send an email using the provided SMTP configuration.
/// Attachment paths are read from disk at send time.
pub async fn send_email(
    smtp_host: &str,
    smtp_port: u16,
    starttls: bool,
    from_email: &str,
    from_display_name: &str,
    password: &str,
    payload: &SendEmailPayload,
) -> Result<(), String> {
    // Build from mailbox
    let from_addr: lettre::Address = from_email
        .parse()
        .map_err(|e| format!("Ungültige Absenderadresse: {}", e))?;
    let from_mailbox = Mailbox::new(
        if from_display_name.is_empty() {
            None
        } else {
            Some(from_display_name.to_string())
        },
        from_addr,
    );

    // Parse recipients
    let to_mailboxes = parse_addresses(&payload.to)?;
    let cc_mailboxes = parse_addresses(&payload.cc)?;

    if to_mailboxes.iter().count() == 0 {
        return Err("Mindestens ein Empfänger erforderlich".to_string());
    }

    // Build message
    let text_part = SinglePart::plain(payload.body_text.clone());

    let email_msg = if payload.attachment_paths.is_empty() {
        let mut builder = Message::builder()
            .from(from_mailbox.clone())
            .subject(&payload.subject);
        for mb in to_mailboxes {
            builder = builder.to(mb);
        }
        for mb in cc_mailboxes {
            builder = builder.cc(mb);
        }
        builder
            .singlepart(text_part)
            .map_err(|e| format!("Nachricht konnte nicht erstellt werden: {}", e))?
    } else {
        let mut mp = MultiPart::mixed().singlepart(text_part);
        let octet_stream =
            ContentType::parse("application/octet-stream").expect("valid mime type");
        for path_str in &payload.attachment_paths {
            let path = Path::new(path_str);
            let content = tokio::fs::read(path).await.map_err(|e| {
                format!("Anhang '{}' konnte nicht gelesen werden: {}", path_str, e)
            })?;
            let filename = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("anhang")
                .to_string();
            mp = mp.singlepart(
                Attachment::new(filename).body(content, octet_stream.clone()),
            );
        }
        let mut builder = Message::builder()
            .from(from_mailbox.clone())
            .subject(&payload.subject);
        for mb in to_mailboxes {
            builder = builder.to(mb);
        }
        for mb in cc_mailboxes {
            builder = builder.cc(mb);
        }
        builder
            .multipart(mp)
            .map_err(|e| format!("Nachricht konnte nicht erstellt werden: {}", e))?
    };

    // Build transport and send
    let transport = if starttls {
        build_starttls_transport(smtp_host, smtp_port, from_email, password)?
    } else {
        build_tls_transport(smtp_host, smtp_port, from_email, password)?
    };

    transport
        .send(email_msg)
        .await
        .map_err(|e| format!("E-Mail konnte nicht gesendet werden: {}", e))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_single_address_ok() {
        let mbs = parse_addresses(&["alice@example.com".to_string()]).unwrap();
        assert_eq!(mbs.iter().count(), 1);
    }

    #[test]
    fn parse_invalid_address_err() {
        let result = parse_addresses(&["not-an-email".to_string()]);
        assert!(result.is_err());
    }

    #[test]
    fn parse_empty_list_ok() {
        let mbs = parse_addresses(&[]).unwrap();
        assert_eq!(mbs.iter().count(), 0);
    }
}
