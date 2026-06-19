# Beitritts-Code — Design (Shared-Workspace Pilot, Subsystem B)

**Datum:** 2026-06-19
**Status:** Genehmigt, bereit für Implementierungsplan
**Kontext:** Cultera Focus (Tauri 2 Desktop, local-first SQLite + Supabase). Übergeordnete Spec: `2026-06-18-shared-workspace-accounts-pilot-design.md`.

## Ziel

Ein zweiter Tester soll einem bestehenden Workspace **per Code** beitreten können. Erst dadurch wird ein Workspace `isShared` (>1 Mitglied) — und damit aktivieren sich die bereits gebauten Cloud-Gateways (Leads, Finanzen) und der Realtime-Hook. Der Beitritts-Code ist die Voraussetzung, um Mehrbenutzer überhaupt im Produkt testen zu können.

## Ist-Stand (verifiziert)

- `isShared` existiert (`workspace.store.ts`, abgeleitet aus Mitgliederzahl via `deriveShared`).
- `useWorkspaceRealtime` abonniert bereits `accounts` (Leads) + `invoices`/`offers`/`payments`.
- Cloud-Gateways für Leads (`accounts.gateway.ts`) und Finanzen (`finance.gateway.ts`) routen per `shared()`.
- Basis-RLS für `workspaces`, `workspace_members`, `accounts`, `deals`, `activities` (`0001_enable_rls.sql`).
- **Fehlt komplett:** jede Möglichkeit, als zweite Person beizutreten. `workspace.store` kann nur `createWorkspace`.
- Supabase-CLI ist **nicht** eingerichtet → SQL wird manuell im Dashboard angewendet (Projekt `mqbjmquscjtytpjebosw`).

## Architektur / Ablauf

```
Owner:  WorkspaceSettings → Beitritts-Code anzeigen (+ "neu generieren")
Member: WorkspacePicker → Code eingeben → rpc('join_workspace_by_code', { p_code })
                                              ↓ SECURITY DEFINER (umgeht RLS gezielt)
                          workspace_members-Zeile (role='member') angelegt
                                              ↓
                          loadWorkspaces() → join-ter Workspace aktiv + isShared=true
```

Kernprinzip: Der Beitretende ist noch **kein** Mitglied und kann den Workspace daher per RLS nicht lesen. Lookup-per-Code **und** Einfügen der Mitgliedschaft laufen deshalb über eine `SECURITY DEFINER`-RPC, die RLS kontrolliert umgeht und nur den Code validiert. Kein client-seitiges Offenlegen aller Codes/Workspaces.

## Komponenten

### 1. SQL-Migration `supabase/migrations/0002_join_code.sql` (manuell im Dashboard angewendet)

Wird als Datei geschrieben **und** dem Nutzer zum Einfügen in den Supabase SQL-Editor gegeben. Inhalt:

- **Spalte:** `alter table public.workspaces add column if not exists join_code text unique;`
- **Backfill:** bestehende Workspaces ohne Code erhalten einen Zufallscode (SQL-seitig generiert, 6 Zeichen aus dem sicheren Alphabet).
- **RPC** `public.join_workspace_by_code(p_code text) returns uuid`, `language plpgsql`, `security definer`, `set search_path = public`:
  - Workspace per `join_code = p_code` suchen.
  - Kein Treffer → `raise exception 'Ungültiger Code'`.
  - Treffer → `insert into workspace_members(workspace_id, user_id, role) values (ws_id, auth.uid(), 'member') on conflict do nothing;`
  - `return ws_id;`
  - `grant execute on function public.join_workspace_by_code(text) to authenticated;`
- **RLS** `workspaces`-Update nur für Owner (für „neu generieren"):
  `create policy ws_update_owner on public.workspaces for update using (id::text in (select workspace_id from public.workspace_members where user_id = auth.uid() and role = 'owner'));`
  (Spaltentypen `uuid` vs `text` an das reale Schema anpassen — beim Anwenden verifizieren.)

Die SQL selbst ist hier nicht unit-testbar (kein lokales Postgres) → manuell im Dashboard verifiziert.

### 2. Store — `src/store/workspace.store.ts`

- **`generateJoinCode(): string`** — exportierte reine Funktion (Muster wie `deriveShared`): 6 Zeichen aus dem Alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (32 Zeichen, ohne Verwechsler I/O/0/1). Unit-testbar.
- **`Workspace`-Interface** um `join_code: string | null` erweitern; im `loadWorkspaces`-Select ergänzen: `workspaces(id, name, logo_url, join_code)`; im Mapping durchreichen.
- **`createWorkspace`** schreibt zusätzlich `join_code: generateJoinCode()`.
- **`joinWorkspaceByCode(code: string): Promise<void>`** — `supabase.rpc('join_workspace_by_code', { p_code: code.trim() })`; bei Fehler werfen (lesbare Message); bei Erfolg `await loadWorkspaces()` und `setActiveWorkspace(returnedId)`.
- **`regenerateJoinCode(workspaceId: string): Promise<string>`** — neuen `generateJoinCode()` per `update workspaces` setzen; bei Unique-Kollision genau einmal neu würfeln; lokalen Workspace-State aktualisieren; neuen Code zurückgeben.

### 3. UI

- **Owner** — `src/components/settings/WorkspaceSettings.tsx`: in der bestehenden Workspace-Karte (unter „Workspace ID") eine Zeile **„Beitritts-Code"** mit dem vorhandenen `CopyField` (Code + Kopieren) plus kleinem Button **„Neu generieren"** (`regenerateJoinCode`). Nur sichtbar, wenn der aktive Workspace `role === 'owner'` ist.
- **Member** — `src/core/workspace/WorkspacePicker.tsx`: unter dem „Neuer Workspace"-Formular ein Abschnitt **„Einem Workspace beitreten"** — Text-Input für den Code + Button → `joinWorkspaceByCode`. Lade-/Fehlerzustand analog zum Erstellen-Formular („Ungültiger Code").

## Datenfluss — Beispiel (B tritt A's Workspace bei)

1. A (Owner) öffnet Einstellungen → sieht Beitritts-Code, teilt ihn mit B.
2. B loggt sich mit eigenem Account ein → `WorkspacePicker` → gibt Code ein → `joinWorkspaceByCode`.
3. RPC validiert Code, legt `workspace_members(ws, B, 'member')` an, gibt `ws_id` zurück.
4. B's `loadWorkspaces` lädt den Workspace; er wird aktiv. Mitgliederzahl ist nun 2 → `isShared = true` (bei A nach nächstem `loadWorkspaces` ebenso).
5. Ab jetzt routen Leads-/Finanz-Gateways gegen Supabase und Realtime ist aktiv → A und B sehen Leads/Finanzen live.

## Fehlerbehandlung

- **Ungültiger Code:** RPC `raise exception` → Store wirft → UI zeigt „Ungültiger Code".
- **Netzfehler:** generische Fehlermeldung, kein State-Update.
- **Schon Mitglied:** RPC ist idempotent (`on conflict do nothing`) und gibt die `ws_id` trotzdem zurück → Workspace wird einfach aktiviert.
- **Code-Kollision beim Generieren:** Unique-Constraint greift; `regenerateJoinCode` würfelt einmal neu.

## Teststrategie

- **Unit:** `generateJoinCode` (Länge 6, nur erlaubtes Alphabet); `joinWorkspaceByCode` (mockt `supabase.rpc` → ruft `loadWorkspaces` + `setActiveWorkspace`; wirft bei RPC-Fehler); `regenerateJoinCode` (mockt `update`, Kollisions-Retry); `join_code` landet im Workspace-Mapping.
- **Component:** Beitritts-Formular im `WorkspacePicker` (gemockter Store: Erfolg + Fehler); Code-Zeile in `WorkspaceSettings` nur für Owner sichtbar, „Neu generieren" ruft Store.
- **Manuell (echtes Supabase + 2. Account):** SQL anwenden → Owner sieht Code → 2. Nutzer tritt bei → wird Mitglied → Workspace `isShared` → Leads/Finanzen live (dabei Realtime-Replikation der Tabellen in Supabase mit verifizieren).

## Bewusst NICHT im Scope (YAGNI / spätere Scheiben)

- Nutzerprofile + Badges (Subsystem A), Attribution `created_by`/`updated_by` (Subsystem C).
- Realtime/Cloud für weitere Tabellen (Notizen, Todos, Aktivitäten, Dateien, Kontakte, Zeit) — eigene Fächer-Scheiben.
- Rollen über `owner`/`member` hinaus, E-Mail-Einladungen, Ablauf/Nutzungslimits für Codes, Mitglieder-Entfernen.
