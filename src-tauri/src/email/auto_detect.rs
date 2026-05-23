/// Returns (imap_host, imap_port) for known providers, None for unknowns.
pub fn detect(email: &str) -> Option<(&'static str, u16)> {
    let domain = email.split('@').nth(1)?.to_lowercase();
    match domain.as_str() {
        "gmx.de" | "gmx.net" | "gmx.at" | "gmx.ch"
            => Some(("imap.gmx.net", 993)),
        "web.de"
            => Some(("imap.web.de", 993)),
        "freenet.de"
            => Some(("imap.freenet.de", 993)),
        "ionos.de" | "1und1.de" | "ionos.com"
            => Some(("imap.ionos.de", 993)),
        "strato.de" | "strato.com"
            => Some(("imap.strato.de", 993)),
        "hosteurope.de"
            => Some(("imap.hosteurope.de", 993)),
        "gmail.com" | "googlemail.com"
            => Some(("imap.gmail.com", 993)),
        "outlook.com" | "hotmail.com" | "hotmail.de"
        | "live.de" | "live.com" | "msn.com"
            => Some(("imap-mail.outlook.com", 993)),
        "t-online.de"
            => Some(("secureimap.t-online.de", 993)),
        "yahoo.de" | "yahoo.com" | "yahoo.co.uk"
            => Some(("imap.mail.yahoo.com", 993)),
        "posteo.de"
            => Some(("posteo.de", 993)),
        "protonmail.com" | "proton.me" | "pm.me"
            => Some(("127.0.0.1", 1143)), // ProtonMail Bridge
        _ => None,
    }
}

/// Derives the SMTP host from an IMAP host by replacing the "imap" prefix.
/// "imap.gmx.net"           → "smtp.gmx.net"
/// "secureimap.t-online.de" → "securesmtp.t-online.de"
/// Falls back to the original host if "imap" not found.
pub fn derive_smtp_host(imap_host: &str) -> String {
    if imap_host.starts_with("imap.") {
        format!("smtp.{}", &imap_host[5..])
    } else if imap_host.contains("imap") {
        imap_host.replace("imap", "smtp")
    } else {
        imap_host.to_string()
    }
}

/// Default SMTP port for new accounts — 587 (STARTTLS).
pub const DEFAULT_SMTP_PORT: u16 = 587;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_gmx() {
        assert_eq!(detect("user@gmx.de"), Some(("imap.gmx.net", 993)));
    }

    #[test]
    fn detects_gmx_net() {
        assert_eq!(detect("user@gmx.net"), Some(("imap.gmx.net", 993)));
    }

    #[test]
    fn detects_web_de() {
        assert_eq!(detect("user@web.de"), Some(("imap.web.de", 993)));
    }

    #[test]
    fn detects_gmail() {
        assert_eq!(detect("user@gmail.com"), Some(("imap.gmail.com", 993)));
    }

    #[test]
    fn detects_outlook() {
        assert_eq!(detect("user@outlook.com"), Some(("imap-mail.outlook.com", 993)));
    }

    #[test]
    fn detects_ionos() {
        assert_eq!(detect("user@ionos.de"), Some(("imap.ionos.de", 993)));
    }

    #[test]
    fn returns_none_for_unknown() {
        assert_eq!(detect("user@mycompany.de"), None);
    }

    #[test]
    fn returns_none_for_invalid_email() {
        assert_eq!(detect("notanemail"), None);
    }

    #[test]
    fn case_insensitive() {
        assert_eq!(detect("user@GMX.DE"), Some(("imap.gmx.net", 993)));
    }

    #[test]
    fn derives_smtp_from_imap_prefix() {
        assert_eq!(derive_smtp_host("imap.gmx.net"), "smtp.gmx.net");
        assert_eq!(derive_smtp_host("imap.gmail.com"), "smtp.gmail.com");
    }

    #[test]
    fn derives_smtp_without_imap_prefix() {
        // t-online uses "secureimap.t-online.de" → "securesmtp.t-online.de"
        assert_eq!(derive_smtp_host("secureimap.t-online.de"), "securesmtp.t-online.de");
        // fallback: no "imap" in host → return unchanged
        assert_eq!(derive_smtp_host("mail.example.com"), "mail.example.com");
    }
}
