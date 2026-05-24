// src-tauri/src/email/folders.rs

use futures_util::StreamExt as FuturesStreamExt;
use native_tls::TlsConnector as NativeTlsConnector;
use tokio_native_tls::TlsConnector;

use crate::email::types::RawFolder;

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

pub(crate) fn attr_to_string(attr: &async_imap::types::NameAttribute) -> String {
    use async_imap::types::NameAttribute;
    match attr {
        NameAttribute::NoSelect    => "\\Noselect".to_string(),
        NameAttribute::NoInferiors => "\\Noinferiors".to_string(),
        NameAttribute::Marked      => "\\Marked".to_string(),
        NameAttribute::Unmarked    => "\\Unmarked".to_string(),
        NameAttribute::All         => "\\All".to_string(),
        NameAttribute::Archive     => "\\Archive".to_string(),
        NameAttribute::Drafts      => "\\Drafts".to_string(),
        NameAttribute::Flagged     => "\\Flagged".to_string(),
        NameAttribute::Junk        => "\\Junk".to_string(),
        NameAttribute::Sent        => "\\Sent".to_string(),
        NameAttribute::Trash       => "\\Trash".to_string(),
        NameAttribute::Extension(s) => s.to_string(),
        // #[non_exhaustive] — catch any future variants added to the crate
        _ => format!("{:?}", attr),
    }
}

pub(crate) fn last_segment<'a>(path: &'a str, delimiter: &str) -> &'a str {
    path.rsplit(delimiter).next().unwrap_or(path)
}

pub(crate) fn parent_path(path: &str, delimiter: &str) -> Option<String> {
    let idx = path.rfind(delimiter)?;
    Some(path[..idx].to_string())
}

/// Verbindet mit IMAP und ruft alle Ordner via LIST "" * ab.
/// Gibt die Ordner in Server-Reihenfolge zurück.
pub async fn fetch_folders(
    email: &str,
    password: &str,
    host: &str,
    port: u16,
) -> Result<Vec<RawFolder>, String> {
    let tls_stream = tls_connect(host, port).await?;
    let client = async_imap::Client::new(tls_stream);
    let mut session = client
        .login(email, password)
        .await
        .map_err(|(e, _)| format!("Authentifizierung fehlgeschlagen: {}", e))?;

    let mailboxes = session
        .list(Some(""), Some("*"))
        .await
        .map_err(|e| format!("IMAP LIST fehlgeschlagen: {}", e))?
        .filter_map(|r| async move { r.ok() })
        .collect::<Vec<_>>()
        .await;

    let mut result = Vec::with_capacity(mailboxes.len());
    for mailbox in &mailboxes {
        let raw_delimiter = mailbox
            .delimiter()
            .map(|s| s.to_string())
            .unwrap_or_else(|| ".".to_string());

        let path = mailbox.name().to_string();
        let display_name = last_segment(&path, &raw_delimiter).to_string();
        let parent = parent_path(&path, &raw_delimiter);
        let flags: Vec<String> = mailbox.attributes().iter().map(attr_to_string).collect();
        let is_selectable = !flags.contains(&"\\Noselect".to_string());

        result.push(RawFolder {
            path,
            delimiter: raw_delimiter,
            display_name,
            parent_path: parent,
            flags,
            is_selectable,
        });
    }

    let _ = session.logout().await;
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn attr_to_string_maps_known_variants() {
        use async_imap::types::NameAttribute;
        assert_eq!(attr_to_string(&NameAttribute::NoSelect), "\\Noselect");
        assert_eq!(attr_to_string(&NameAttribute::NoInferiors), "\\Noinferiors");
        assert_eq!(attr_to_string(&NameAttribute::Marked), "\\Marked");
        assert_eq!(attr_to_string(&NameAttribute::Unmarked), "\\Unmarked");
        assert_eq!(
            attr_to_string(&NameAttribute::Extension("\\Sent".into())),
            "\\Sent"
        );
    }

    #[test]
    fn compute_display_name_from_delimiter() {
        let display = last_segment("INBOX.Projekte.Kunde-A", ".");
        assert_eq!(display, "Kunde-A");

        let top = last_segment("INBOX", ".");
        assert_eq!(top, "INBOX");
    }

    #[test]
    fn compute_parent_path_from_delimiter() {
        let parent = parent_path("INBOX.Projekte.Kunde-A", ".");
        assert_eq!(parent, Some("INBOX.Projekte".to_string()));

        let top_parent = parent_path("INBOX", ".");
        assert_eq!(top_parent, None);
    }
}
