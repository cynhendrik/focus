# Rollen & Rechte (RBAC) — Design

**Datum:** 2026-06-22
**Branch:** feature/erechnung-2026-06-21
**Status:** Freigegeben (Design), bereit für Implementierungsplanung

## Ziel & Kontext

Der geteilte Workspace (Supabase, multiplayer) funktioniert end-to-end (Workspace
erstellen → Join-Code → beitreten, Auth via Supabase). Alle Kern-Datenstores sind
cloud-first + realtime. Es fehlt ein **Rollen-/Rechte-Fundament**, damit nicht jeder
Mitarbeiter alles sieht/darf. Konkreter Treiber: **Verträge** und **Finanzen** sollen
Chef/Admin-Sache sein; der Owner soll einzelnen Mitarbeitern gezielt Bereiche
freischalten können ("kann, muss aber nicht").

Heute: `workspace_members(workspace_id, user_id, role)` mit `role ∈ {owner, member}`.
RLS der Datentabellen nutzt `is_workspace_member(workspace_id)` (jedes Mitglied darf
alles). `vertraege` hat abweichend `own data` (created_by = auth.uid()) — Interim, wird
hier abgelöst.

## Entscheidungen (mit User abgestimmt)

- **Gated Bereiche:** `finances`, `contracts`, `manage_members`. **Löschen ist NICHT
  gated** — normale Mitarbeiter dürfen CRM-Daten löschen.
- **Modell:** Rolle als Standard **+ gezielte Freischaltung pro Mitglied**.
- **Durchsetzung:** RLS = echte Grenze (Server), UI-Gating nur UX.
- **Scope dieser Scheibe:** Voll — Datenmodell + RLS + Store-Anbindung + UI-Gating +
  Owner-Verwaltungs-UI.

## Modell

### Rollen (`workspace_members.role`)
- `owner` — alles, inkl. `manage_members` (Mitglieder/Rollen/Capabilities verwalten,
  Workspace-Settings, Join-Code). Genau einer (Ersteller).
- `admin` — `finances` + `contracts` + volle CRM-Arbeit. **Kein** `manage_members`.
- `member` — volle CRM-Arbeit **inkl. Löschen**, aber **keine** Finanzen/Verträge.
  Per Freischaltung einzeln erweiterbar.

### Capabilities
Enum (als String): `finances`, `contracts`, `manage_members`.

### Per-Mitglied-Freischaltung (`workspace_members.capabilities text[]`)
Liste zusätzlich freigeschalteter Capabilities für `member` (und ignoriert/leer bei
owner/admin). Beispiel: `{contracts}` → Mitarbeiter sieht CRM + Verträge, aber keine
Finanzen. `manage_members` ist **nicht** über `capabilities` vergebbar (Owner-only).

### Effektives Recht (eine Quelle der Wahrheit)
`has_capability(ws, cap)` =
```
role = 'owner'
OR (role = 'admin' AND cap <> 'manage_members')
OR (cap = ANY(capabilities))
```
`manage_members` ist also nur über `role='owner'` erreichbar.

## Komponenten

### 1. Datenmodell (Supabase + lokal)
- `workspace_members.role`: Wertebereich um `'admin'` erweitern (Spalte existiert).
- `workspace_members.capabilities text[] not null default '{}'`: neue Spalte.
- Lokales SQLite-Schema (`workspace_members` falls vorhanden) analog — nur relevant,
  wenn der lokale Modus Mitglieder kennt; im Solo-Modus irrelevant (siehe unten).

### 2. SQL-Helper `has_capability(ws text, cap text) returns boolean`
`security invoker`, `stable`. Prüft die obige Logik gegen `workspace_members` für
`auth.uid()`. Wird von allen RLS-Policies genutzt. Bestehende `is_workspace_member`
bleibt für CRM-Tabellen (kein Capability-Gate dort).

### 3. RLS-Policies (Supabase) — die echte Grenze
- **`vertraege`**: Policy `own data` ersetzen durch
  `using/with check (is_workspace_member(workspace_id) AND has_capability(workspace_id,'contracts'))`.
  Wichtig: bestehende Verträge tragen `created_by` des Erstellers; nach Umstellung
  sehen sie alle mit `contracts`-Capability (gewollt: Chef/Admin + Freigeschaltete).
- **Finanzen** (`invoices`, `offers`, `payments`, `invoice_items`, `offer_items`):
  bestehende Workspace-Policy um `AND has_capability(workspace_id,'finances')` ergänzen.
  Kind-Tabellen (`*_items`) scopen über das Elternteil (invoice_id/offer_id → deren
  workspace_id) wie im 0001-Muster, plus Capability-Check über das Elternteil.
- **CRM** (`accounts`, `deals`, `activities`, `contacts`, `calendar_events`):
  **unverändert** (`is_workspace_member`) — alle Mitglieder lesen/schreiben/löschen.
- **`workspace_members` Schreibzugriff**: nur Owner darf `role`/`capabilities` anderer
  ändern → Policy `manage_members` (update/insert/delete) mit
  `has_capability(workspace_id,'manage_members')`. Self-Select bleibt erlaubt
  (jedes Mitglied liest die eigene Zeile + Mitglieder seiner Workspaces — bestehende
  `wm_select`-Logik beibehalten/erweitern).

### 4. Frontend: Capability-Quelle
- `workspace.store`: beim Laden des aktiven Workspace **role + capabilities** des
  aktuellen Users mitladen und im Store halten (`activeMembership: { role, capabilities }`).
- Selector-Hook `useCapability(cap): boolean`:
  - **Lokal/solo** (kein shared Workspace): immer `true` — kein Aussperren.
  - **Shared**: berechnet `has_capability` clientseitig aus `activeMembership`
    (gleiche Logik wie SQL, rein für UX).
- Realtime: `workspace_members`-Änderungen (Rolle/Capability) sollten die eigene
  Membership aktualisieren → optionaler Realtime-Channel auf `workspace_members`
  (oder Reload bei Workspace-Fokus). YAGNI-Abwägung: zunächst Reload beim
  Workspace-Wechsel/Start; Realtime später, falls nötig.

### 5. UI-Gating (nur UX, ersetzt RLS nicht)
- Finanzen-Tab/-Route (`CustomerRoute` Tab `finanzen`, Finanz-Hauptansicht):
  ausblenden, wenn `!useCapability('finances')`.
- Verträge-Ansicht: ausblenden, wenn `!useCapability('contracts')`.
- Mitglieder-Verwaltung & Rollen/Capability-Editor: nur wenn `useCapability('manage_members')`.
- Defensive: Falls eine ausgeblendete Route doch erreicht wird, lädt sie ohnehin keine
  Daten (RLS liefert leer/Fehler) → freundlicher "Keine Berechtigung"-Zustand.

### 6. Owner-Verwaltungs-UI
- Mitgliederliste im Workspace-Settings-Bereich (baut auf `core/workspace/*`,
  `JoinCodeRow`): pro Mitglied **Rollen-Dropdown** (member/admin; owner nicht änderbar)
  + **Capability-Checkboxen** (`finances`, `contracts`) für `member`.
- Schreibt über eine Gateway-Methode (`WorkspaceMembersGateway.updateMember`) →
  Supabase `update workspace_members set role/capabilities` (RLS erzwingt Owner).
- Owner kann sich selbst nicht degradieren (UI-Guard) und nicht den letzten Owner
  entfernen.

## Datenfluss

```
Owner setzt im Settings-UI: Anna = member + capabilities {contracts}
  → WorkspaceMembersGateway.updateMember(ws, anna, {role:'member', capabilities:['contracts']})
  → Supabase update (RLS: nur Owner)
Anna (anderes Gerät):
  → workspace.store lädt activeMembership {role:'member', capabilities:['contracts']}
  → useCapability('contracts')=true → Verträge sichtbar; useCapability('finances')=false → Finanzen verborgen
  → RLS: Anna SELECT vertraege ✓ (has_capability contracts), SELECT invoices ✗ (kein finances)
```

## Fehlerbehandlung
- RLS-Verweigerung beim Lesen → leere Liste / "Keine Berechtigung"-Zustand, kein Crash.
- Schreibversuch ohne Recht (sollte UI verhindern) → Gateway `fail()` mit lesbarer
  Meldung; UI zeigt Toast.
- Migration: additiv (Spalte + Default `{}`, Policy-Updates idempotent, reversibel).

## Testing
- **Mapper/Store-Tests:** `useCapability`-Logik (owner/admin/member/grants, lokal=true)
  als reine Unit-Tests.
- **Gateway-Test:** `WorkspaceMembersGateway.updateMember` Routing (shared→supabase,
  lokal→no-op/Service).
- **RLS-Verifikation (live, Management-API):** `has_capability` + Policies per
  Round-Trip gegen Testzeilen prüfen (analog zur bewährten Schema-Verifikation):
  Member ohne finances sieht keine invoices; mit contracts sieht vertraege.
- **Vollsuite + tsc** grün.

## Migration / Rollout (additiv, reversibel)
1. `alter table workspace_members add column capabilities text[] not null default '{}'`.
2. `has_capability`-Funktion anlegen.
3. RLS-Policies aktualisieren (vertraege ablösen, Finanzen-Policies erweitern,
   workspace_members manage-Policy).
4. Realtime/Publication für `workspace_members` prüfen (für späteren Realtime-Reload;
   optional jetzt).
Backfill: owner→owner, member→`capabilities '{}'`. Niemand verliert Daten; reine
Member verlieren nur die Finanz-/Vertrags-Sicht (gewollt).

## Solo/lokal
Kein shared Workspace ⇒ kein RLS-Pfad; `useCapability` gibt `true` zurück. Der
Solo-Nutzer hat immer volle Rechte und kann sich nicht aussperren.

## Bewusst NICHT enthalten (YAGNI)
- Feingranulare Rechte jenseits der drei Capabilities.
- Mehrere Owner / Owner-Übergabe-Flows (separater Bedarf, später).
- Audit-Log von Rechteänderungen.
- Rollen auf Lead-/Pipeline-Ebene.
