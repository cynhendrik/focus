# Workspace löschen (lokal + Cloud) — Design

**Datum:** 2026-06-29
**Status:** freigegeben (Design), Spec zur Review

## Ziel
Ein Workspace muss vollständig löschbar sein — bei geteilten (Cloud-)Workspaces inkl. aller
Daten in Supabase, bei lokalen inkl. der lokalen SQLite-Daten. Heute gibt es nur „Zurücksetzen"
(leert Inhalte, behält den Workspace + Firmenprofil). Löschen entfernt den Workspace selbst.

## Scope
**In:**
- Cloud-Workspace löschen (Owner-only) inkl. aller workspace-gescopeten Daten + Mitgliedschaften + `workspaces`-Zeile.
- Lokalen Workspace löschen inkl. lokaler Daten.
- UI in der Gefahrenzone (Settings), Bestätigungsmuster wie „Zurücksetzen".
- Post-Delete: aktiven Workspace umschalten bzw. zum WorkspacePicker.

**Out (bewusst, später):**
- Paywall / 1-Workspace-Limit / Seat-Abrechnung (eigenes Thema nach Launch; Close-Modell = 1 Org + per-Seat).
- „Workspace verlassen" für Nicht-Owner (Mitglied entfernt nur sich selbst) — Folge-Feature.
- Storage-Bucket-Dateien (Dateien liegen aktuell lokal; Storage-Sync ist zurückgestellt — siehe [[shared-workspace-multiplayer]]).

## Architektur

### 1. Cloud-Cascade: Supabase-RPC `delete_workspace(ws_id)`
- **SECURITY DEFINER**, läuft mit erhöhten Rechten, prüft aber selbst:
  - Caller (`auth.uid()`) ist **Owner** des Workspace (`workspace_members.role = 'owner'` für `ws_id`). Sonst `raise exception` → kein Effekt.
- Löscht in **einer Transaktion** und in FK-sicherer Reihenfolge (bzw. `set constraints all deferred`):
  1. Alle workspace-gescopeten Inhalts-Tabellen — **dieselbe Tabellenmenge wie `reset_workspace`** (accounts, contacts, activities, deals, invoices, invoice_items, offers, payments, vertraege, auftraege, zeiteintraege, calendar_events, note_*, kpis, pipeline_stages, lead_stages, messages, conversations, conversation_participants, notifications, … — **exakte Liste beim Bau gegen Live-Schema verifizieren**, da Vorgänger-Tabellen-Drift möglich).
  2. `company_settings` (beim Reset behalten, beim Delete weg).
  3. `workspace_members` für `ws_id`.
  4. `workspaces`-Zeile.
- Idempotent (zweiter Aufruf auf bereits gelöschten WS = no-op, kein Fehler).
- Migration additiv (nur neue Funktion); per Supabase-Management-API anwenden. **Vor dem Bau Live-Schema + Policies der Zieltabellen prüfen.**

### 2. Lokaler Delete: Rust `cmd_delete_workspace`
- Neue Funktion `delete_workspace_local(conn)` analog zu `reset_workspace_local`, aber **ohne KEEP-Liste** (auch `company_settings` + Setup leeren) — schema-introspektiv, eine Transaktion, `PRAGMA defer_foreign_keys=ON`.
- `#[tauri::command] cmd_delete_workspace` ruft sie auf.
- **Bekannte Einschränkung:** Lokale Daten liegen in **einer** SQLite-DB (nicht pro Workspace gescoped). Bei mehreren lokalen Workspaces leert ein lokaler Delete die gemeinsamen Daten. Da Produktrichtung „1 Workspace": akzeptiert; UI warnt, wenn >1 lokaler WS existiert.

### 3. Store: `deleteWorkspace(id)` in `workspace.store`
- Routet über den Workspace-Typ:
  - **geteilt (`isShared`):** `supabase.rpc('delete_workspace', { ws_id: id })`; bei Erfolg aus `workspaces` entfernen.
  - **lokal:** `invoke('cmd_delete_workspace')`; Eintrag aus `localWorkspaces` (persisted) entfernen.
- Danach `activeWorkspaceId` neu setzen: erster verbleibender Workspace, sonst `null`.
- Fehler werden geworfen (UI vertoastet) — kein stiller Fehler.

### 4. UI: Gefahrenzone (`GefahrenzoneSettings.tsx`)
- Neue rote `SettingCard` **unter** „Zurücksetzen": „Workspace löschen".
- Bestätigung: Tippe **„löschen"**; Button erst dann aktiv.
- Owner-Gate: bei geteiltem WS nur für Owner sichtbar/aktiv; sonst Hinweis „Nur der Inhaber kann löschen."
- Geteilt-Warnung: „ACHTUNG: Dieser Workspace ist GETEILT — dies löscht ihn für ALLE Mitglieder. Unwiderruflich."
- Bei >1 lokalem Workspace: Hinweis, dass lokale Daten gemeinsam liegen.
- Nach Erfolg: Toast + `window.location.reload()` (wie Reset). Ohne aktiven WS landet die App im WorkspacePicker.

## Datenfluss (Cloud, Happy Path)
UI „löschen" bestätigt → `store.deleteWorkspace(id)` → `rpc('delete_workspace', {ws_id})`
→ RPC prüft Owner, löscht alles in TX → Store entfernt WS, setzt neuen aktiven WS → reload → Picker/Workspace.

## Fehlerbehandlung
- RPC-Fehler (z. B. nicht Owner) → Exception → Store wirft → roter Toast, kein Teil-Löschen (TX).
- Lokal: `cmd_delete_workspace`-Fehler → Toast, Eintrag bleibt erhalten.
- Netzwerk weg bei Cloud-Delete → Toast „erneut versuchen".

## Sicherheit
- Owner-Check **in** der RPC (nicht nur UI). Adversarisch testen: Nicht-Owner-Mitglied und Nicht-Mitglied → 0 Wirkung, Exception.
- RPC SECURITY DEFINER, aber strikt auf `ws_id` des Owners begrenzt — keine Möglichkeit, fremde Workspaces zu treffen.

## Tests
- **Store** (`workspace.store.test`): `deleteWorkspace` lokal entfernt `localWorkspaces`-Eintrag; geteilt ruft RPC mit `ws_id`; aktiver WS wird korrekt umgeschaltet (verbleibender bzw. null).
- **Rust** (`export.rs`-Tests): `delete_workspace_local` leert auch KEEP-Tabellen (company_settings) — im Gegensatz zu `reset_workspace_local`.
- **RPC adversarisch** (manuell/Live gegen mqbjmquscjtytpjebosw): Owner löscht → alle Zeilen weg; Nicht-Owner → Exception, nichts gelöscht.
- **UI**: Owner-Gating (kein Button für Nicht-Owner), Bestätigungs-Gate („löschen").

## Offene Punkte (beim Bau klären)
- Exakte Tabellenliste + Reihenfolge gegen Live-Schema verifizieren (Drift!).
- Reuse: Falls `reset_workspace` RPC die Tabellenliste schon sauber kapselt, `delete_workspace` darauf aufbauen (erst reset-Logik, dann company_settings + members + workspaces).
