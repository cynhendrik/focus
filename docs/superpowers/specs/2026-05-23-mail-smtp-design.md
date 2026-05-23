# Mail — SMTP Send & Anhänge Design Spec
**Datum:** 2026-05-23  
**Status:** Approved  
**Scope:** Sub-Projekt A — E-Mails senden (SMTP), Anhänge empfangen/senden, Auto-SMTP-Erkennung

---

## 1. Ziel

Den bestehenden IMAP-Only-Mailclient um vollständiges E-Mail-Senden erweitern: Neu verfassen, Antworten, Weiterleiten. Dazu Anhänge beim Empfang anzeigen/herunterladen und beim Senden anhängen. SMTP wird automatisch aus der IMAP-Konfiguration abgeleitet.

---

## 2. Datenmodell

### Änderung: `email_accounts`

Drei neue Felder (additive Migration):

```sql
ALTER TABLE email_accounts ADD COLUMN smtp_host     TEXT NOT NULL DEFAULT '';
ALTER TABLE email_accounts ADD COLUMN smtp_port     INTEGER NOT NULL DEFAULT 587;
ALTER TABLE email_accounts ADD COLUMN smtp_starttls INTEGER NOT NULL DEFAULT 1;
```

### Neue Tabelle: `email_attachments`

```sql
CREATE TABLE IF NOT EXISTS email_attachments (
    id          TEXT PRIMARY KEY,
    email_id    TEXT NOT NULL REFERENCES email_headers(id) ON DELETE CASCADE,
    filename    TEXT NOT NULL,
    mime_type   TEXT NOT NULL DEFAULT 'application/octet-stream',
    size_bytes  INTEGER NOT NULL DEFAULT 0,
    content     BLOB NOT NULL,
    created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_attachments_email
    ON email_attachments(email_id);
```

### TypeScript-Typen (Erweiterungen zu `src/types/mail.types.ts`)

```typescript
export interface EmailAttachment {
  id: string
  emailId: string
  filename: string
  mimeType: string
  sizeBytes: number
}

export interface SendEmailPayload {
  accountId: string
  to: string[]
  cc?: string[]
  subject: string
  bodyText: string
  attachmentPaths?: string[]  // temp file paths auf dem Dateisystem
}

// Erweiterung EmailAccount:
export interface EmailAccount {
  id: string
  email: string
  displayName: string
  imapHost: string
  imapPort: number
  smtpHost: string        // NEU
  smtpPort: number        // NEU
  smtpStarttls: boolean   // NEU
  lastSyncedAt: string | null
  status: 'active' | 'auth_error' | 'error'
}

// Erweiterung AddAccountPayload:
export interface AddAccountPayload {
  email: string
  password: string
  imapHost: string
  imapPort: number
  displayName: string
  smtpHost?: string       // NEU — leer = Auto-Erkennung
  smtpPort?: number       // NEU
  smtpStarttls?: boolean  // NEU
}
```

---

## 3. Backend (Rust / Tauri)

### Neue Dateien

| Datei | Inhalt |
|---|---|
| `src-tauri/src/email/smtp.rs` | SMTP-Verbindung, Auto-Erkennung, `send_email` |

### Geänderte Dateien

| Datei | Änderung |
|---|---|
| `src-tauri/src/email/imap.rs` | Anhang-Extraktion beim Sync |
| `src-tauri/src/email/db.rs` | Attachment-CRUD, SMTP-Felder in Account |
| `src-tauri/src/email/commands.rs` | Neue Commands |

### SMTP Auto-Erkennung (`smtp.rs`)

```rust
pub fn derive_smtp_host(imap_host: &str) -> String {
    if imap_host.starts_with("imap.") {
        format!("smtp.{}", &imap_host[5..])
    } else {
        imap_host.replace("imap", "smtp")
    }
}
```

Test-Reihenfolge:
1. `smtp_host:587` STARTTLS
2. `smtp_host:465` SSL
3. Falls beides schlägt fehl → Fehler zurück, Frontend zeigt manuelles Formular

### Tauri-Commands

```rust
#[tauri::command]
pub async fn test_smtp(
    email: String,
    password: String,
    smtp_host: String,
    smtp_port: u16,
    starttls: bool,
) -> Result<(), AppError>

#[tauri::command]
pub async fn send_email(
    state: State<'_, AppState>,
    payload: SendEmailPayload,
) -> Result<(), AppError>

#[tauri::command]
pub async fn get_attachments(
    state: State<'_, AppState>,
    email_id: String,
) -> Result<Vec<EmailAttachment>, AppError>

#[tauri::command]
pub async fn download_attachment(
    state: State<'_, AppState>,
    attachment_id: String,
) -> Result<String, AppError>   // gibt absoluten Dateipfad zurück, öffnet mit open::that()
```

Alle Commands in `commands/mod.rs` registrieren und in `main.rs` zum `invoke_handler` hinzufügen.

### IMAP Anhang-Extraktion

In `imap.rs`, Funktion `extract_bodies` wird zu `extract_parts` erweitert:

```rust
pub struct ExtractedParts {
    pub body_text: String,
    pub body_html: String,
    pub attachments: Vec<RawAttachment>,
}

pub struct RawAttachment {
    pub filename: String,
    pub mime_type: String,
    pub content: Vec<u8>,
}
```

Beim Sync wird `ExtractedParts` zurückgegeben. Attachments werden in `email_attachments` gespeichert.

### `send_email` Implementierung

- SMTP-Verbindung via `lettre` (async, STARTTLS oder SSL je nach Konfiguration)
- Authentifizierung: PLAIN mit Account-Email + Passwort (aus DB, verschlüsselt wie IMAP)
- Mail-Builder: `lettre::Message` mit To, CC, Subject, body_text (plain), Attachments via `lettre::message::Attachment`
- Nach erfolgreichem Senden: Kein automatisches Speichern in "Gesendet" (Phase A — IMAP APPEND ist komplex)

### Cargo.toml Ergänzungen

```toml
lettre = { version = "0.11", features = ["tokio1", "tokio1-native-tls", "builder"] }
open = "5"
```

---

## 4. Frontend

### Neue Datei

| Datei | Inhalt |
|---|---|
| `src/components/mail/ComposeModal.tsx` | Compose/Reply/Forward Modal |

### Geänderte Dateien

| Datei | Änderung |
|---|---|
| `src/routes/MailRoute.tsx` | Antworten/Weiterleiten-Buttons, Neu-verfassen-Button, Attachment-Anzeige, erweitertes AccountSetupForm |
| `src/store/mail.store.ts` | `sendEmail`, `getAttachments`, `downloadAttachment` Actions |
| `src/services/mail.service.ts` | Neue `invoke`-Wrapper |
| `src/types/mail.types.ts` | `EmailAttachment`, `SendEmailPayload`, erweiterte Typen |

### ComposeModal (`src/components/mail/ComposeModal.tsx`)

Slideout von rechts (480px, `position: fixed`), gleiches Pattern wie `EventForm`.

**Props:**
```typescript
interface ComposeModalProps {
  mode: 'new' | 'reply' | 'forward'
  replyTo?: EmailHeader      // für reply/forward
  replyBody?: string         // Body-Text der Original-Mail
  accountId: string
  onClose: () => void
  onSent: () => void
}
```

**Felder:**
- **An** — Tag-Input (Eingabe + Enter fügt Tag hinzu, X entfernt), Pflichtfeld
- **CC** — ausgeblendet, per "CC hinzufügen"-Link aufklappbar, gleiches Tag-Pattern
- **Betreff** — Textfeld, Pflichtfeld
- **Nachricht** — `<textarea>`, plain text, 12 Zeilen mindest
- **Anhänge** — Datei-Picker via `<input type="file" multiple>`, zeigt Chips (Dateiname + Größe + X)

**Reply-Vorausfüllung:**
```
To: [fromAddr der Original-Mail]
Subject: Re: [originalSubject]
Body: \n\n---\nAm [datum] schrieb [fromName]:\n\n> [originalBodyText, jede Zeile mit "> " präfixiert, max. 20 Zeilen]
```

**Forward-Vorausfüllung:**
```
Subject: Fwd: [originalSubject]
Body: \n\n---\nWeitergeleitete Nachricht:\nVon: [fromAddr]\nDatum: [datum]\nBetreff: [subject]\n\n[originalBodyText]
```

**Validierung:** To nicht leer, Betreff nicht leer, Senden nicht möglich wenn `isSending`.

**Footer:** Links Anhang-Button (📎), rechts Abbrechen + **Senden**.

### Attachment-Anzeige im Detail-Panel

Unterhalb des E-Mail-Textes, wenn `attachments.length > 0`:

```
── Anhänge (N) ────────────────────────────────
[📄 Dateiname.pdf  12 KB  ↓]  [📄 Bild.png  340 KB  ↓]
```

Klick auf `↓` → `downloadAttachment(id)` → OS öffnet Datei.

### Erweitertes AccountSetupForm

**Normaler Flow:**
1. E-Mail, Passwort, IMAP-Host, Port eingeben
2. "Verbinden" → testet IMAP + SMTP automatisch
3. Erfolg: Account gespeichert

**SMTP-Fehler-Flow:**
1. IMAP-Test erfolgreich, SMTP-Auto-Test schlägt fehl
2. Formular zeigt erweiterten Bereich: SMTP-Host (vorausgefüllt mit abgeleitetem Wert), SMTP-Port (587), STARTTLS-Toggle
3. Nutzer korrigiert und klickt "Erneut testen"

### Mail-Toolbar Ergänzungen

Im Detail-Panel oben rechts (neben "Löschen"):
- **Antworten** → öffnet ComposeModal mit `mode='reply'`
- **Weiterleiten** → öffnet ComposeModal mit `mode='forward'`

In der Gesamtansicht (über der E-Mail-Liste):
- **Neu verfassen** (Button, `mode='new'`)

### Store-Erweiterungen (`mail.store.ts`)

```typescript
attachments: EmailAttachment[]
isSending: boolean

sendEmail: (payload: SendEmailPayload) => Promise<void>
getAttachments: (emailId: string) => Promise<void>
downloadAttachment: (attachmentId: string) => Promise<void>
```

`getAttachments` wird in `selectEmail` automatisch aufgerufen.

---

## 5. Fehlerbehandlung

- SMTP-Verbindungsfehler beim Setup → roter Banner im Setup-Formular, erweiterter SMTP-Bereich erscheint
- `send_email` Fehler → roter Banner im ComposeModal, Modal bleibt offen
- Download-Fehler → Toast-artige Fehlermeldung
- Attachment zu groß (> 25 MB) → Frontend-Validierung vor Upload

---

## 6. Out of Scope (Phase A)

- Gesendete Mails automatisch in IMAP-"Gesendet"-Ordner speichern (APPEND)
- HTML-Compose (Rich Text Editor)
- Anhang-Vorschau in der App
- Drafts / Entwürfe speichern
- E-Mail-Signaturen
- OAuth2 / App-Passwörter (Gmail-spezifisch)

---

## 7. Dateistruktur (neu/geändert)

```
src-tauri/src/email/smtp.rs              NEU
src-tauri/src/email/imap.rs             +Anhang-Extraktion
src-tauri/src/email/db.rs               +Attachments, SMTP-Felder
src-tauri/src/email/commands.rs         +send_email, test_smtp, get_attachments, download_attachment
src-tauri/Cargo.toml                    +lettre, +open

src/types/mail.types.ts                 +EmailAttachment, +SendEmailPayload, erweiterte Typen
src/services/mail.service.ts            +sendEmail, +getAttachments, +downloadAttachment, +testSmtp
src/store/mail.store.ts                 +sendEmail, +getAttachments, +downloadAttachment
src/components/mail/ComposeModal.tsx    NEU
src/routes/MailRoute.tsx                +Buttons, +Attachment-Panel, +erweitertes Setup
```
