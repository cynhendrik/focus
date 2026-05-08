const SERVICE: &str = "cynera-email";

pub fn set(email: &str, password: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE, email)
        .map_err(|e| format!("Keychain-Fehler: {}", e))?;
    entry.set_password(password)
        .map_err(|e| format!("Passwort konnte nicht gespeichert werden: {}", e))
}

pub fn get(email: &str) -> Result<String, String> {
    let entry = keyring::Entry::new(SERVICE, email)
        .map_err(|e| format!("Keychain-Fehler: {}", e))?;
    entry.get_password()
        .map_err(|e| format!("Passwort nicht gefunden ({}): {}", email, e))
}

pub fn delete(email: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE, email)
        .map_err(|e| format!("Keychain-Fehler: {}", e))?;
    match entry.delete_password() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Passwort konnte nicht gelöscht werden: {}", e)),
    }
}
