# IMAP Email Integration — Design Spec

**Goal:** Universelle IMAP-E-Mail-Integration für Cynera Focus — verbindet beliebige E-Mail-Konten, synchronisiert den vollständigen Posteingang lokal in SQLite, und ordnet E-Mails automatisch Kunden zu.

**Architecture:** Rust-Backend (Tauri) übernimmt alle IMAP-Operationen und Credential-Verwaltung. E-Mail-Inhalte leben ausschließlich in SQLite, niemals in Zustand/localStorage. Passwörter werden direkt im OS-Keychain gespeichert — JavaScript sieht sie nie.

**Tech Stack:** async-imap, rusqlite (bundled SQLite), keyring, native-tls, mail-parser, Tauri commands, React (GlobalMailClient.jsx enhanced)

---

## 1. Architektur

```
React Frontend
  GlobalMailClient.jsx (enhanced — ruft Tauri Commands)
  AccountSetupModal.jsx (neu)
  SyncProgressBar.jsx (neu)
  Zustand: emailAccounts[], emailSyncStatus{} (kein E-Mail-Inhalt)
        ↕ invoke() / listen()
Tauri Commands (Rust)
  email_add_account / email_test_connection / email_remove_account
  email_get_accounts / email_sync / email_list
  email_get_body / email_mark_read / email_assign_customer / email_delete
        ↕
OS Keychain (keyring)          SQLite: $APPDATA/cynera/emails.db
  Passwörter (einziger Ort)      accounts + emails Tabellen
        ↕
IMAP Server (TLS:993) — 15 Provider auto-detektiert
```

**Kernprinzipien:**
- E-Mail-Inhalte in SQLite, nicht in Zustand
- Passwörter nur im OS-Keychain (Windows Credential Manager / macOS Keychain)
- JS hat niemals Zugriff auf Passwörter
- Bestehende lokale Mails (Zustand) bleiben als "Lokal"-Konto erhalten

---

## 2. Rust-Backend

### 2.1 Neue Crates (`Cargo.toml`)

```toml
async-imap   = { version = "0.9", features = ["runtime-tokio-rustls"] }
tokio        = { version = "1", features = ["full"] }
rusqlite     = { version = "0.31", features = ["bundled"] }
keyring      = "2"
native-tls   = "0.2"
mail-parser  = "0.9"
uuid         = { version = "1", features = ["v4"] }
chrono       = { version = "0.4", features = ["serde"] }
```

### 2.2 Dateistruktur

```
src-tauri/src/
  main.rs               (erweitert: commands registrieren, DB init)
  email/
    mod.rs
    types.rs            (Account, EmailHeader, EmailBody, SyncProgress Structs)
    db.rs               (SQLite init, CRUD Operationen)
    keychain.rs         (set/get/delete Passwort via keyring)
    auto_detect.rs      (Domain → IMAP Host/Port Tabelle)
    imap.rs             (IMAP Verbindung, Sync, MIME-Parsing)
    commands.rs         (alle #[tauri::command] Definitionen)
```

### 2.3 SQLite-Schema

```sql
CREATE TABLE IF NOT EXISTS accounts (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  display_name  TEXT,
  imap_host     TEXT NOT NULL,
  imap_port     INTEGER NOT NULL DEFAULT 993,
  last_synced_uid  INTEGER DEFAULT 0,
  last_synced_at   TEXT,
  status        TEXT DEFAULT 'active'  -- 'active' | 'auth_error' | 'error'
);

CREATE TABLE IF NOT EXISTS emails (
  id          TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL,
  uid         INTEGER NOT NULL,
  folder      TEXT NOT NULL,      -- 'INBOX' | 'Sent'
  message_id  TEXT,
  subject     TEXT,
  from_addr   TEXT,
  from_name   TEXT,
  to_addrs    TEXT,               -- JSON: ["a@b.de"]
  body_text   TEXT,
  body_html   TEXT,
  sent_at     TEXT,               -- ISO 8601
  is_read     INTEGER DEFAULT 0,
  customer_id TEXT,               -- NULL = Unassigned
  UNIQUE(account_id, folder, uid)
);

CREATE INDEX IF NOT EXISTS idx_emails_date     ON emails(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_emails_folder   ON emails(account_id, folder);
CREATE INDEX IF NOT EXISTS idx_emails_customer ON emails(customer_id);
CREATE INDEX IF NOT EXISTS idx_emails_from     ON emails(from_addr);
```

### 2.4 Auto-Detect Provider (`auto_detect.rs`)

| Domain | IMAP Host | Port |
|--------|-----------|------|
| gmx.de / gmx.net | imap.gmx.net | 993 |
| web.de | imap.web.de | 993 |
| freenet.de | imap.freenet.de | 993 |
| ionos.de / 1und1.de | imap.ionos.de | 993 |
| strato.de | imap.strato.de | 993 |
| hosteurope.de | imap.hosteurope.de | 993 |
| gmail.com / googlemail.com | imap.gmail.com | 993 |
| outlook.com / hotmail.com / live.de | imap-mail.outlook.com | 993 |
| t-online.de | secureimap.t-online.de | 993 |
| yahoo.de / yahoo.com | imap.mail.yahoo.com | 993 |
| posteo.de | posteo.de | 993 |
| (alle anderen) | manuell eingeben | 993 |

### 2.5 Tauri Commands

```rust
// Konto-Verwaltung
email_add_account(email, password, imap_host, imap_port, display_name) -> Result<Account>
email_test_connection(email, password, imap_host, imap_port) -> Result<()>
email_remove_account(account_id) -> Result<()>
email_get_accounts() -> Result<Vec<Account>>

// Synchronisation
// Emits Tauri-Event "email-sync-progress": { folder, done, total, phase }
email_sync(account_id, customers_json, window) -> Result<SyncResult>

// E-Mail Operationen
email_list(account_id, folder, limit, offset, search) -> Result<Vec<EmailHeader>>
email_get_body(email_id) -> Result<EmailBody>
email_mark_read(email_id, is_read) -> Result<()>
email_assign_customer(email_id, customer_id) -> Result<()>
email_delete(email_id) -> Result<()>
```

### 2.6 Sync-Ablauf (`imap.rs`)

1. Passwort aus OS-Keychain lesen (`keychain::get`)
2. TLS-Verbindung zu `imap_host:imap_port` aufbauen
3. `LOGIN email password`
4. Ordner ermitteln:
   - `LIST "" "*"` → alle Ordner abrufen
   - Sent-Ordner finden: RFC 6154 `\Sent` Special-Use-Flag prüfen, sonst Fallback-Liste:
     `["Sent", "Sent Items", "Sent Messages", "Gesendet", "[Gmail]/Sent Mail"]`
   - Sync-Ordner: `[("INBOX", "INBOX"), (erkannter_sent_name, "Sent")]`
5. Für jeden Sync-Ordner:
   - `SELECT` → alle UIDs holen
   - UIDs > `last_synced_uid` filtern (Erstsync = alle)
   - In 50er-Batches: `FETCH uid RFC822` → MIME parsen
   - Auto-Customer-Matching (s. 2.7)
   - Batch in SQLite schreiben (folder-Spalte immer als normalisierter Name: `"INBOX"` / `"Sent"`)
   - Event emittieren: `{ folder, done, total }`
6. `last_synced_uid` + `last_synced_at` in `accounts` updaten

Timeout: 15s pro Verbindungsversuch, 3 Retries mit 5s Abstand.

### 2.7 Auto-Customer-Matching

Läuft in Rust beim Sync. `customers_json` wird als Parameter übergeben.

```
Priorität 1: from_addr exact match → customer.email
Priorität 2: from_addr domain match → customer.email domain
Priorität 3: to_addrs exact/domain match
Kein Match  → customer_id = NULL (Unassigned)
```

---

## 3. Frontend

### 3.1 Store-Erweiterungen (`store/index.js`)

```js
// Neuer State (kein E-Mail-Inhalt)
emailAccounts:   [],   // [{ id, email, displayName, imapHost, lastSyncedAt, status }]
emailSyncStatus: {},   // { [accountId]: { phase, progress: 0–100, error } }

// Neue Actions
addEmailAccount(account)
removeEmailAccount(id)
setEmailSyncStatus(accountId, status)
```

### 3.2 Neue Komponenten

**`AccountSetupModal.jsx`**

3-Schritte-Flow:
1. E-Mail-Adresse eingeben → Domain auto-detektiert Host/Port → oder manuell überschreiben
2. Passwort eingeben + "Verbindung testen" (`email_test_connection`)
3. Bei Erfolg: Konto speichern → sofortiger Hintergrund-Sync

**`SyncProgressBar.jsx`**

Reagiert auf Tauri-Event `email-sync-progress`. Zeigt Ordner-Name, Fortschrittsbalken, Anzahl.

### 3.3 `GlobalMailClient.jsx` — überarbeitete Architektur

Linke Nav:
- Konto-Selector (Dropdown bei mehreren Konten)
- "+ Konto hinzufügen" → AccountSetupModal
- Ordner-Liste: Posteingang · Gesendet · Unassigned
- Kunden-Filter
- Sync-Button + letzte Sync-Zeit + SyncProgressBar

Mittlere Liste:
- Ruft `email_list(account_id, folder, 50, offset, search)` auf
- Infinite Scroll (50 pro Page)
- Kein E-Mail-Inhalt im React-State

Rechtes Detail:
- Ruft `email_get_body(email_id)` on-demand
- Assign-to-customer Dropdown
- Mark read/unread, Löschen

**Fallback — kein Konto verbunden:**
Leerer Zustand mit "E-Mail-Konto verbinden" CTA → öffnet AccountSetupModal.

**Fallback — bestehende lokale Mails:**
Lokale Zustand-Mails erscheinen als "Lokal"-Konto in der Konto-Liste. Kein Breaking Change.

---

## 4. Sicherheitsmodell

| Datei / Speicher | Inhalt |
|---|---|
| OS Keychain | Passwörter (einziger Ort, niemals woanders) |
| SQLite `emails.db` | E-Mail-Inhalte, Metadaten, Konto-Konfiguration |
| Zustand (localStorage) | Konto-Metadaten (ohne Passwort), Sync-Status |
| **Nirgendwo** | Klartext-Passwörter |

**Credential-Flow:**
```
User gibt Passwort ein (React)
  → invoke('email_add_account', { ..., password })
  → Rust: keyring::Entry::new("cynera-email", &email).set_password(&password)
  → Rust gibt Account OHNE Passwort zurück
  → Zustand speichert Account-Metadaten (kein Passwort)
  → Bei Sync: Rust liest Passwort aus Keychain — JS erfährt es nie
```

---

## 5. Fehlerbehandlung

| Fehler | Verhalten |
|---|---|
| Falsches Passwort | Status `auth_error`, Toast "Authentifizierung fehlgeschlagen" |
| Server nicht erreichbar | 3 Retries à 5s, dann Status `error` |
| Sync unterbrochen | Teilfortschritt bleibt erhalten, nächster Sync setzt fort |
| Keychain nicht verfügbar | Klare Fehlermeldung, kein Silent Fail |
| Unbekannte MIME-Struktur | Body als plain text fallback, kein Absturz |

---

## 6. Was nicht im Scope ist (Phase 2)

- Gmail OAuth / Microsoft Graph OAuth
- IMAP IDLE (Push-Benachrichtigungen in Echtzeit)
- Anhänge speichern/öffnen
- E-Mail senden via SMTP
- Automatisches Intervall-Polling (nur App-Start + manuell)
