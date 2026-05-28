# E-Mail Kampagnen — Design-Dokument

**Datum:** 2026-05-28  
**Status:** Approved

---

## Ziel

Kampagnen-Feature in der Mail-Sektion: Bulk-E-Mails an Leads senden (über echten SMTP), Antworten automatisch per IMAP-Sync erkennen, Stats pro Kampagne einsehen (gesendet, geantwortet, Reply Rate).

---

## Navigation & Einstiegspunkt

Die bestehende `MailRoute` bekommt zwei Tabs direkt über dem Ordner-Tree:

- **Inbox** (Standard, bestehende Ansicht unverändert)
- **Kampagnen** (neue Ansicht)

Tab-State wird lokal in der Route gehalten (`useState`), kein Store-Eintrag nötig.

---

## Screens

### 1. Kampagnenliste

Tabelle / Liste aller Kampagnen des aktiven Workspace:

| Spalte | Inhalt |
|--------|--------|
| Name | Kampagnen-Name |
| Gesendet | Anzahl verschickter Mails |
| Geantwortet | Anzahl erkannter Antworten |
| Reply Rate | `replied / sent * 100` in % |
| Status | `Entwurf` / `Wird gesendet` / `Gesendet` |
| Datum | `sent_at` oder `created_at` |

Rechts oben: Button „+ Neue Kampagne" öffnet `CreateCampaignModal`.

Klick auf eine Kampagne → Kampagnen-Detail.

### 2. Kampagnen-Detail

**KPI-Kacheln (4 Stück):**
- Gesendet (Anzahl)
- Geantwortet (Anzahl, Farbe grün)
- Reply Rate (%, Farbe teal)
- Offen (noch keine Antwort, Farbe orange)

**Lead-Liste:**
Spalten: Lead-Name · Firma | Gesendet-Datum | Status

Status-Werte:
- `✓ Antwort` (grün) — `replied_at IS NOT NULL`
- `— Offen` (gedimmt) — noch keine Antwort
- `✗ Fehler` (rot) — Versand fehlgeschlagen

Keine Pagination für v1 (Kampagnen sind in der Regel ≤ 200 Empfänger).

### 3. CreateCampaignModal

Felder:
1. **Name** — Freitext, z.B. "Kalt-Outreach Mai 2026"
2. **E-Mail-Account** — Dropdown über bestehende `email_accounts` (Absender)
3. **Betreff** — Freitext
4. **Nachricht** — Textarea (Plain Text für v1, kein HTML-Editor)
5. **Empfänger** — zwei Optionen per Toggle:
   - Smart List wählen (Dropdown über `smart_lists`)
   - Manuell: Lead-Multiselect (Suche + Checkbox-Liste aus `accounts WHERE account_type='lead'`)
6. **Personalisierung** — Hinweistext: `{{name}}` und `{{company}}` werden automatisch ersetzt

Buttons: „Abbrechen" | „Als Entwurf speichern" | „Jetzt senden"

„Jetzt senden" triggert Bestätigungs-Dialog: „X Mails werden jetzt gesendet. Fortfahren?"

---

## Datenmodell

### Neue Tabelle: `campaigns`

```sql
CREATE TABLE IF NOT EXISTS campaigns (
    id              TEXT PRIMARY KEY,
    workspace_id    TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    subject         TEXT NOT NULL,
    body            TEXT NOT NULL,
    sender_account_id TEXT NOT NULL REFERENCES email_accounts(id),
    smart_list_id   TEXT REFERENCES smart_lists(id),
    status          TEXT NOT NULL DEFAULT 'draft',
    -- status: 'draft' | 'sending' | 'sent' | 'error'
    sent_at         TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
```

### Neue Tabelle: `campaign_recipients`

```sql
CREATE TABLE IF NOT EXISTS campaign_recipients (
    id          TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    lead_id     TEXT NOT NULL REFERENCES accounts(id),
    email       TEXT NOT NULL,
    sent_at     TEXT,
    replied_at  TEXT,
    error       TEXT,
    -- NULL = ausstehend, TEXT = Fehlermeldung beim Versand
    activity_id TEXT REFERENCES activities(id),
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign ON campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_email ON campaign_recipients(email);
```

DB-Migration: `CURRENT_VERSION` 15 → 16.

---

## Rust Backend

### Neues Modul: `src-tauri/src/db/campaign.rs`

Funktionen:
- `create(conn, payload) → Campaign`
- `list(conn, workspace_id) → Vec<CampaignWithStats>`
  - `CampaignWithStats` enthält berechnete `sent_count`, `replied_count`
- `get(conn, id) → Campaign`
- `get_recipients(conn, campaign_id) → Vec<CampaignRecipient>`
- `add_recipients(conn, campaign_id, leads: &[Lead]) → Result<()>`
- `mark_sent(conn, recipient_id, sent_at) → Result<()>`
- `mark_replied(conn, recipient_id, replied_at) → Result<()>`
- `mark_error(conn, recipient_id, error: &str) → Result<()>`
- `update_status(conn, campaign_id, status) → Result<()>`

### Neues Modul: `src-tauri/src/commands/campaign.rs`

Tauri-Commands:
- `cmd_list_campaigns(workspace_id)` → `Vec<CampaignWithStats>`
- `cmd_get_campaign(id)` → `Campaign`
- `cmd_get_campaign_recipients(campaign_id)` → `Vec<CampaignRecipient>`
- `cmd_create_campaign(payload)` → `Campaign`
- `cmd_send_campaign(campaign_id)` → `Result<(), AppError>`

`cmd_send_campaign` läuft als Tauri-Command (blockierend im Sinne: gibt OK zurück sobald alle Mails in die SMTP-Queue eingereiht wurden, sendet dann im Hintergrund und schickt Events):
- Tauri-Event `campaign-progress`: `{ campaign_id, sent, total, error? }`
- Tauri-Event `campaign-done`: `{ campaign_id, sent_count, error_count }`

### SMTP-Versand

Rust-Crate: `lettre` (bereits weit verbreitet in Tauri-Apps).

`src-tauri/Cargo.toml` braucht:
```toml
lettre = { version = "0.11", features = ["smtp-transport", "native-tls", "builder"] }
```

Ablauf in `cmd_send_campaign`:
1. Lade Kampagne + alle Empfänger aus DB
2. Lade SMTP-Credentials aus `email_accounts` (IMAP-Host als SMTP-Host, gleiche Credentials)
3. Für jeden Empfänger:
   - Ersetze `{{name}}` → Lead-Name, `{{company}}` → Lead-Company
   - Sende via `lettre::SmtpTransport`
   - `mark_sent` oder `mark_error` in DB
   - Emitte `campaign-progress` Event
4. `update_status(campaign_id, 'sent')` + `campaign-done` Event

**SMTP-Host-Ableitung:** Aus dem IMAP-Host wird der SMTP-Host abgeleitet:
- `imap.gmail.com` → `smtp.gmail.com`
- `imap.strato.de` → `smtp.strato.de`
- Fallback: SMTP-Host = IMAP-Host (Nutzer kann in Settings überschreiben — v2)

Port: 587 (STARTTLS), Fallback 465 (SSL). Für v1 probieren wir 587 zuerst.

### Reply-Detection

In der bestehenden IMAP-Sync-Pipeline (`src-tauri/src/core/mail/sync.rs` o.ä.) nach dem Speichern einer eingehenden Mail:

```rust
// Prüfe ob from_addr in campaign_recipients.email existiert
// UND email.received_at > campaign_recipient.sent_at
// UND campaign_recipient.replied_at IS NULL
if let Some(recipient) = db::campaign::find_by_email(conn, &from_addr)? {
    if let Some(sent_at) = &recipient.sent_at {
        if email_date > sent_at && recipient.replied_at.is_none() {
            db::campaign::mark_replied(conn, &recipient.id, &email_date)?;
        }
    }
}
```

---

## Frontend

### Neue Dateien

- `src/types/campaign.types.ts` — `Campaign`, `CampaignWithStats`, `CampaignRecipient`, `CreateCampaignPayload`
- `src/services/campaign.service.ts` — 5 Methoden (list, get, getRecipients, create, send)
- `src/store/campaign.store.ts` — `useCampaignStore` mit `campaigns`, `activeCampaign`, `recipients`, `isLoading`, `sendProgress`
- `src/components/mail/CampaignsTab.tsx` — Kampagnenliste + "Neue Kampagne"-Button
- `src/components/mail/CampaignDetail.tsx` — KPI-Kacheln + Recipient-Liste
- `src/components/mail/CreateCampaignModal.tsx` — Modal mit Formular

### Änderungen an bestehenden Dateien

- `src/routes/MailRoute.tsx` — Tab-Toggle "Inbox" | "Kampagnen" + bedingte Render-Logik
- `src-tauri/src/commands/mod.rs` — `pub mod campaign;`
- `src-tauri/src/main.rs` — neue Commands in `generate_handler![]`
- `src-tauri/src/db/mod.rs` — `pub mod campaign;`
- `src-tauri/src/db/migrations.rs` — v16 Migration
- `src-tauri/src/db/schema.rs` — `campaigns` + `campaign_recipients` in `CREATE TABLE`

---

## Personalisierung

Platzhalter im Body:
- `{{name}}` → `lead.name`
- `{{company}}` → `lead.company_name ?? ""`

Ersetzung in Rust vor dem Versand (`str::replace`).

---

## Fehlerbehandlung

- Ungültige E-Mail-Adresse eines Leads → `mark_error(recipient_id, "Ungültige E-Mail")`, Versand fortsetzen
- SMTP-Auth fehlgeschlagen → ganzer Versand stoppt, `update_status('error')`, `campaign-done` mit `error`-Feld
- Teilfehler → einzelne Empfänger auf `error`, Rest wird gesendet, Kampagne trotzdem `sent`

---

## Out of Scope (v1)

- HTML-E-Mail-Editor (nur Plain Text)
- Öffnungs-Tracking (Open Rate via Pixel — erfordert externen Server)
- Unsubscribe-Link
- Versand-Scheduling (zeitverzögert senden)
- SMTP-Host manuell konfigurierbar in Settings
- Kampagnen bearbeiten nach dem Senden
