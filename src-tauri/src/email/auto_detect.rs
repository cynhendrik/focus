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
}
