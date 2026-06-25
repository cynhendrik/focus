# Workspace-Reset (echte „Gefahrenzone") — Design

**Datum:** 2026-06-25
**Status:** freigegeben (Design), bereit für Implementierungsplan

## Problem

In den Einstellungen → Gefahrenzone gibt es „Workspace zurücksetzen" mit Bestätigungs-UI
(„zurücksetzen" tippen), aber `handleReset` ist ein **Stub** (nur Toast, kein echtes
Löschen — `GefahrenzoneSettings.tsx:16-27`). Es fehlt ein echtes, abgesichertes Reset.
Der Workspace des Nutzers ist **geteilt/Cloud** (Supabase), die Daten liegen also lokal
(SQLite) **und** in der Cloud.

## Entscheidungen

| Frage | Entscheidung |
|-------|--------------|
| Umfang | **Nur Inhalte** löschen (Kunden, Kontakte, Rechnungen, Angebote, Zahlungen, Deals, Leads, Notizen, Kalender, Aufgaben, Verträge, Zeiten, Kampagnen, Ablage-Dateien). **Setup bleibt:** Firmenprofil + Einstellungen + Mail-Konto + Rechnungs-Nummernkreis. |
| Ziel | **Lokal + Cloud** (echtes Reset des aktiven Workspace). Bei geteiltem Workspace betrifft das ALLE Mitglieder. |
| Berechtigung | Nur **Owner/Inhaber** des Workspace. Doppelt geprüft (Client-Gate + serverseitig in der RPC). |
| Cloud-Mechanismus | **Supabase-RPC** (Server-Funktion, atomar, owner-enforced) — nicht client-seitig pro Tabelle. |

## Ausgangslage (verifiziert)

- `GefahrenzoneSettings.tsx`: Export (`cmd_export_backup`) + Import (`cmd_import_backup`)
  funktionieren bereits (lokale SQLite). Die Reset-UI (Confirm-Input „zurücksetzen",
  gateter Button) existiert; nur `handleReset` ist ein Stub.
- Cloud-synchronisierte Domänen (eigene Supabase-Tabellen, je `workspace_id`):
  `accounts`, `contacts`, `activities` (Aufgaben/Follow-ups/Notizen), `invoices`,
  `invoice_items`, `payments`, `offers`, `offer_items`, Aufträge/Zeiten, Notizen-Modul,
  Kampagnen u. a. — siehe `src/data/*.gateway.ts`. `company_settings` ist cloud,
  bleibt aber erhalten.
- Lokale „alle Tabellen"-Liste existiert bereits implizit in `cmd_export_backup`
  (Rust) — sie ist die Quelle der Wahrheit für die lokal zu leerenden Tabellen.

## Komponenten

### 1. Lokal — Rust `cmd_reset_workspace`
`src-tauri/src/commands/...` (neuer Command) + DB-Funktion.
- Löscht in **einer Transaktion** aus allen lokalen Workspace-Tabellen, **außer**:
  `company_settings` und `invoice_sequences` (Nummernkreis bleibt → Nummerierung läuft fort).
- Die Tabellen-Liste muss **zentral** geführt werden (gleiche Quelle wie der Export, damit
  beide nicht auseinanderdriften, wenn künftig eine Tabelle dazukommt). Konkret: eine
  geteilte Konstante/Funktion `workspace_data_tables()` definieren, die sowohl `export`
  als auch `reset` nutzen; `company_settings`/`invoice_sequences` sind explizit ausgenommen.
- Signatur: `cmd_reset_workspace(workspace_id: String) -> Result<(), AppError>`.

### 2. Cloud — Supabase-RPC `reset_workspace(ws_id uuid)`
Postgres-Funktion (deployt via Supabase Management-API / PAT).
- `SECURITY DEFINER`, prüft am Anfang: der **aufrufende User ist Owner** von `ws_id`
  (gegen die Mitglieder-/Rollen-Tabelle); sonst `RAISE EXCEPTION`.
- Löscht in **einer Transaktion** alle Zeilen mit `workspace_id = ws_id` aus den
  Cloud-Datentabellen, **außer `company_settings`**.
- Reihenfolge beachtet FKs (Kind-Tabellen vor Eltern, z. B. `invoice_items` vor `invoices`),
  oder die FKs sind `ON DELETE CASCADE` — beim Implementieren am realen Schema prüfen.
- Aufruf vom Client: `supabase.rpc('reset_workspace', { ws_id })`.

### 3. Client — `GefahrenzoneSettings.handleReset`
- **Owner-Gate:** Reset nur ausführbar, wenn der aktive Workspace dem Nutzer als Owner
  gehört (Rolle aus `useWorkspaceStore`). Für Nicht-Owner: Button deaktiviert + klarer Hinweis.
- **Extra-Warnung bei geteiltem Workspace:** vor dem Ausführen ein deutlicher Hinweis
  („Dies löscht die Daten für ALLE Mitglieder dieses geteilten Workspace. Unwiderruflich.")
  zusätzlich zum vorhandenen „zurücksetzen"-Tippen.
- **Ablauf:** lokales Reset (`invoke('cmd_reset_workspace', { workspaceId })`) **und**, wenn
  der Workspace shared ist, Cloud-Reset (`supabase.rpc('reset_workspace', { ws_id })`).
  Danach App neu laden (`window.location.reload()`), damit alle Stores frisch laden.
- **UI-Hinweis:** Empfehlung „Vorher Backup exportieren" (der Export-Button ist direkt darüber).

## Datenfluss

```
Owner tippt "zurücksetzen" + bestätigt Extra-Warnung (shared)
  └─► invoke('cmd_reset_workspace', { workspaceId })   // lokal, Transaktion, Setup bleibt
  └─► if shared: supabase.rpc('reset_workspace', { ws_id })  // Cloud, owner-checked, Transaktion
       └─► window.location.reload()  → Stores laden leeren Workspace (Setup intakt)
```

## Fehlerbehandlung / Edge-Cases

- **Owner-Check** doppelt: Client deaktiviert für Nicht-Owner; die RPC wirft serverseitig,
  falls der Aufrufer nicht Owner ist (Schutz, auch wenn jemand den Client umgeht).
- **Teilausfall:** Wenn das lokale Reset klappt, aber die Cloud-RPC fehlschlägt → klare
  Meldung „Lokal geleert, Cloud-Reset fehlgeschlagen — bitte erneut ausführen". Erneutes
  Ausführen ist idempotent (DELETE auf bereits leere Tabellen ist harmlos).
- **Solo/lokaler Workspace** (nicht shared): nur lokales Reset, kein RPC-Aufruf.
- **`company_settings` + `invoice_sequences`** werden nie gelöscht (lokal explizit
  ausgenommen; Cloud-RPC lässt `company_settings` aus).

## Nicht-Ziele

- Bereichs-Auswahl (nur Finanzen / nur CRM) — bewusst nicht (volles Inhalts-Reset).
- Löschen des Workspace selbst oder der Mitgliedschaft/Rollen — der Workspace bleibt bestehen,
  nur die Inhalte werden geleert.
- Account/Auth-Löschung, Mail-Konto-Löschung (device-/keychain-seitig) — bleiben.
- „Nur dieses Gerät leeren" als separate Aktion — verworfen (echtes Reset = lokal + Cloud).

## Tests

- **Rust** (`cmd_reset_workspace`, in-memory SQLite): nach Reset sind die Datentabellen leer,
  `company_settings` und `invoice_sequences` bleiben erhalten; läuft in einer Transaktion.
- **Client**: Owner-Gate — Nicht-Owner kann den Reset nicht auslösen (Button disabled /
  Guard greift). (Der RPC-Aufruf selbst wird im Unit-Test gemockt.)
- **RPC**: manuell/integrativ gegen Supabase verifizieren (Owner löscht, Nicht-Owner bekommt
  Exception) — kein automatisierter DB-Test im Repo.

## Berührte Dateien

- **Neu (Rust):** Reset-Command + DB-Funktion (`src-tauri/src/commands/…`, `src-tauri/src/db/…`),
  Registrierung in `src-tauri/src/main.rs`. Geteilte Tabellen-Liste (Refactor aus Export).
- **Neu (Supabase):** Postgres-Funktion `reset_workspace(ws_id)` (Deploy via Management-API).
- **Geändert:** `src/components/settings/GefahrenzoneSettings.tsx` (`handleReset` echt,
  Owner-Gate, Shared-Warnung), ggf. `src/store/workspace.store` (Owner-Rolle lesen, falls
  noch nicht verfügbar).
