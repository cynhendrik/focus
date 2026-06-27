# Lokal-Standard-Workspace + volles Cloud-Teilen — Design-Spec

**Datum:** 2026-06-27
**Branch-Kontext:** baut auf der Cloud-first/Realtime-Suite + Team-Chat (Phase 1–3) auf (Supabase-Projekt `mqbjmquscjtytpjebosw`)
**Status:** Design freigegeben + adversarisch geprüft (4 Agenten, 2026-06-27); Teilprojekt ① plan-reif

## Problem / Ziel

Heute entscheidet die App pro Datentyp **lokal vs. Cloud** an einer Stelle:
`if (!isActiveWorkspaceShared()) → lokal (SQLite) else → Cloud (Supabase)`, wobei
`isActiveWorkspaceShared()` aktuell aus der **Mitgliederzahl** abgeleitet wird
(`> 1` = geteilt). Daraus folgen mehrere Bugs:

- Ein frisch angelegter Solo-Cloud-Workspace liest **lokal**, gefiltert nach der
  neuen Workspace-ID → Bestandsdaten (andere ID) sind **unsichtbar** („Login zeigt
  nichts").
- Tritt ein 2. Mitglied bei, **flippt** die App automatisch auf Cloud — **ohne die
  lokalen Daten mitzunehmen** → Cloud ist leer.
- Es gibt **keine Brücke lokal → Cloud**. Der einzige „lokale" Pfad ist der
  „überspringen"-Hack (Fake-User, Workspace-ID `'dev'`).
- Der Backup-Import schreibt Zeilen mit ihrer **ursprünglichen** `workspace_id`
  zurück → unsichtbar im aktiven Workspace („Import erfolgreich, aber keine Daten").

**Ziel:** Ein sauberes Modell — **lokal als Standard**, **„Teilen" als bewusste
Aktion**, die die lokalen Daten in die Cloud migriert. Im geteilten Workspace
müssen **beide** (Chef + Mitarbeiter) **jede Funktion** nutzen können.

## Getroffene Entscheidungen (Brainstorming 2026-06-27)

| Frage | Entscheidung |
|---|---|
| Login für lokalen Workspace | **Pflicht** — einmal online einloggen; Daten bleiben lokal bis „Teilen". |
| Cloud-Zeitpunkt | **Nichts in der Cloud bis „Teilen"** — lokaler Workspace ist rein lokal. |
| Modus-Quelle | **Strukturell** (lokaler vs. Cloud-Workspace), **nicht** aus Mitgliederzahl. |
| Migrations-Engine | **Ansatz A** — Frontend, dediziertes `migration-runner.ts`, reuse der **Mapper** (nicht der Gateway-Methoden), idempotent, re-scoped. |
| Teilen-Richtung | **Einbahnig** — ein geteilter Workspace bleibt Cloud (kein „un-share" in v1). |
| „Überspringen"-Modus | **Entfernen** — Login ist Pflicht. |
| Voll-funktionsfähiger Team-Workspace | Endziel als **Programm** in 4 Teilprojekten (s. u.). Mails/KORA bleiben pro Person. |

## Coverage-Audit (Grundlage des Scopings, 2026-06-27)

- **Cloud-fähig (migrierbar):** `accounts`, `contacts`, `deals`, `activities`
  (absorbiert Alt-`todos`/`notes`/`deadlines`/`crm_follow_ups`/`time_entries`),
  `pipeline_stages`, `lead_stages`, `invoices`, `invoice_items`, `offers`,
  `offer_items`, `payments`, `calendar_events`, `contracts`→Cloud-`vertraege`,
  `note_folders`, `note_entries`, `auftraege`, `zeiteintraege`, `company_settings`.
- **Bereits weg (v5-SQLite-Migration `migrations.rs` ~787–1040 droppt sie, Daten
  längst in `accounts`/`activities`):** `customers`, `todos`, `notes`, `deadlines`,
  `crm_follow_ups`, `time_entries`, `health_scores`. Verifiziert — kein Verlust.
- **Bewusst pro Person / gerätegebunden:** IMAP `email_accounts`/`emails`, KORA
  `chat_messages`, `app_state`, `automation_rules`, `campaigns`/`campaign_recipients`,
  Kunden-Dateien `folders`/`files`, PDF-Ablage `workspace_folders`/`workspace_files`,
  `kpis`, `follow_up_queue`, `note_docs` (tote Tabelle), `smart_lists` (dormant).
- **Nummernkreise** `invoice_sequences`/`offer_sequences`: lokal; Cloud nutzt
  `allocate_*_number`-RPC. **Nicht** als Tabelle migrieren — aber Cloud-Zähler beim
  Teilen auf `MAX(nummer)+1` der migrierten Belege setzen (s. §3-Regeln, GoBD).
- **Lücke (Business-Daten ohne Cloud-Heimat):** `kpis`, Kunden-Dateien, PDF-Ablage,
  Automationen, Kampagnen → Teilprojekte ②③④.

## Programm-Zerlegung (Reihenfolge ①→②→③→④, ein Release am Ende)

| # | Teilprojekt | Inhalt |
|---|---|---|
| **①** | **Fundament** (dieser Spec) | Workspace-Modus · Login/Picker · „Teilen"-Flow + Migrations-Runner für den cloud-fähigen Kern · Backup-Import-Re-scope · „Überspringen" entfernen. |
| ② | KPIs cloud | Cloud-`kpis` (Tabelle + RLS + Realtime + Gateway), in die Migration aufnehmen. |
| ③ | Dateien via Supabase Storage | Kunden-Dateien **und** PDF-Ablage. |
| ④ | Automationen + Kampagnen cloud | Cloud-Tabellen + RLS + Gateways. |

Jedes Teilprojekt bekommt eigenen Spec → Plan. Dieser Spec deckt **nur ①** im Detail.

---

# Teilprojekt ① — Fundament (Detail-Design)

## 1. Workspace-Modell (zentraler Hebel)

Zwei strukturell getrennte Arten:
- **Lokaler Workspace** — nur auf dem Gerät. Identität in `workspace.store` als neues
  persistiertes Feld `localWorkspaces: { id, name }[]` (`id = crypto.randomUUID()`).
  Alle lokalen SQLite-Daten sind nach dieser ID gescoped. Kein Supabase-Eintrag.
- **Geteilter Workspace** — Supabase-`workspaces`-Zeile (+ `workspace_members`).

**Konkreter Store-Vertrag (Reviewer C3/R4, C1/R3):**
- `Workspace`-Objekte für lokale Einträge bekommen **Default-Felder**, damit
  Cloud-geprägte Consumer nicht crashen: `role: 'owner'`, `capabilities: []`,
  `join_code: null`, `isShared: false`. (Sonst `ROLE_LABEL[ws.role]` in
  `WorkspaceSwitcher.tsx:115` = `undefined`.)
- `loadWorkspaces()` **merged** beide Quellen: lokale (`isShared: false`) + Supabase
  (`isShared: true`, **unbedingt** — kein `deriveShared`). Die `deriveShared`-Funktion
  **und** die sekundäre `workspace_members`-Count-Query werden **gelöscht**.
- `isActiveWorkspaceShared()` bleibt `workspaces.find(id)?.isShared ?? false` — liefert
  nun strukturell korrekt (Cloud=true, lokal=false).
- **Persistenz:** `localWorkspaces` in `partialize` aufnehmen; persist-key
  `'focus-workspace-v1'` → `'focus-workspace-v2'` mit `migrate`-Funktion
  (`state => ({ ...state, localWorkspaces: state.localWorkspaces ?? [] })`).
- `useWorkspaceRealtime` leitet „shared" aus **Cloud-Listen-Mitgliedschaft** ab
  (`workspaces.find(active)?.isShared`), Dependency `[activeWorkspaceId, isShared]` —
  greift damit auch im frisch geteilten 1-Mitglied-Workspace.

> **Konsequenz (gewollt):** Cloud-Workspace liest **immer** Cloud, auch direkt nach
> „Teilen" (RLS erlaubt es, Owner ist Mitglied). Behebt „Solo-Cloud zeigt leer".

## 2. Login, Picker, Workspace-Erstellung, Adoption

- **„Überspringen"/DEV_BYPASS vollständig entfernen** (Reviewer I1/R3): `handleDevSkip`
  (`LoginScreen.tsx`), der `DEV_BYPASS`-Effekt (`App.tsx:166–170`), die Konstante
  (`App.tsx:23`), die `&& !DEV_BYPASS`-Guards (`App.tsx:232/234/236` → unbedingt), und
  der stale `VITE_LOCAL_MODE`-Hinweis in `.github/workflows/build.yml`. Login ist Pflicht.
- **Picker** listet lokale + Cloud-Workspaces mit Badge (🔒 Lokal / ☁ Geteilt).
- **„Neuer Workspace" = lokal:** neue Store-Aktion `createLocalWorkspace(name)` —
  schreibt **nur** in `localWorkspaces`, kein Supabase, setzt `activeWorkspaceId`.
  Der heutige `createWorkspace` (schreibt Supabase) wird **nicht** mehr vom Picker
  benutzt; seine Cloud-Logik wird als nebenwirkungsfreies
  `createCloudWorkspaceRecord(name): Promise<cloudWsId>` extrahiert (für Teilen-Step 1,
  **ohne** `setActiveWorkspace`).
- **„Beitreten (Code)" = Cloud** (bestehender `join_workspace_by_code`-Pfad).
- **Bestandsdaten-Adoption (einmalig):** neues Rust-Command-Paar
  `cmd_has_local_orphan_data() -> bool` (prüft SQLite auf Zeilen mit `workspace_id='dev'`)
  und `cmd_rescope_workspace(from: String, to: String)` (in-place
  `UPDATE <tabelle> SET workspace_id=?, (created_by=? falls Spalte existiert) WHERE
  workspace_id=?` über alle workspace-scoped Tabellen, schema-introspektiv wie
  `reset_workspace_local`, mit `defer_foreign_keys`). Ablauf **am Ende von
  `loadWorkspaces`**, **bevor** `activeWorkspaceId` observierbar wird: wenn
  `localWorkspaces.length===0 && cmd_has_local_orphan_data()` → lokalen Workspace
  „Mein Workspace" anlegen, `cmd_rescope_workspace('dev', newLocalId)`, aktiv setzen.
  (Dies ist eine **in-place SQLite-Operation**, NICHT der §4-Import-Pfad.)

## 3. „Teilen"-Flow + Migrations-Runner

**Einstieg:** Aktion **„Workspace teilen"** im Workspace-Menü (nur bei lokalen
Workspaces). Bestätigungsdialog: einbahnig, lädt Daten in die Cloud.

**Ablauf** (idempotent, wiederholbar; flippt erst bei Erfolg):
1. `createCloudWorkspaceRecord(name)` → `cloudWsId` (Supabase `workspaces` +
   `workspace_members` Owner). **Noch nicht** aktiv setzen.
2. **Migration je Entität** in **FK-Reihenfolge** (verifiziert gegen Cloud-Schema):
   ```
   company_settings → pipeline_stages → lead_stages → accounts → contacts →
   deals → activities → calendar_events → invoices → invoice_items → payments →
   offers → offer_items → vertraege → note_folders → note_entries →
   auftraege → zeiteintraege
   ```
3. **Erfolg:** `loadWorkspaces()` (lädt neue Cloud-Zeile mit `isShared:true`), dann
   `setActiveWorkspace(cloudWsId)` (→ `useWorkspaceRealtime` re-abonniert); lokalen
   Workspace als „migriert" markieren (aus Picker entfernen); **Beitritts-Code** zeigen.
4. **Fehler unterwegs:** kein Flip; Cloud hat ggf. idempotente Teildaten; Re-Run
   gefahrlos. Fortschritts-UI pro Entität.

### 3a. Migrator-Architektur (Reviewer C1/R4 — die Kern-Entscheidung)

Ein **dediziertes Modul `src/data/migration-runner.ts`**, das den Gateway-Switch
**umgeht** (während der Migration ist `isActiveWorkspaceShared()` noch `false`):
- **Lesen:** direkt aus der lokalen Quelle — Tauri `invoke('get_*', { workspaceId:
  localWsId })` bzw. für `auftraege`/`zeiteintraege` direkt aus **localStorage**
  (Keys `cynera-auftraege-v1` / `cynera-zeiteintraege-v1`), für `company_settings`
  direkt `CompanyService.get()` (Singleton).
- **Schreiben:** direkt `supabase.from(t).upsert(rows, { onConflict: 'id' })` mit
  injiziertem `workspace_id = cloudWsId` + `created_by = uid`. **Bestehende
  Mapper-Funktionen** (`*PayloadToRow` / row-Builder) werden wiederverwendet; die
  **Gateway-Methoden NICHT** (sie schalten um bzw. allozieren Nummern).
- Pro Entität eine kleine `migrate<Entity>(localWsId, cloudWsId, uid)`-Funktion.

### 3b. Migrations-Regeln (verbindlich — aus den Review-Funden)

- **Upsert, nicht Insert:** alle Cloud-Writes des Runners nutzen
  `upsert(..., { onConflict: 'id' })`. (Die Gateways `activities`, `invoices`,
  `offers`, `payments`, `note_entries`, `note_folders` nutzen intern blindes
  `insert` — daher schreibt der Runner **selbst** per Upsert, nicht über sie.)
- **Nummern erhalten (GoBD):** beim Migrieren von `invoices`/`offers` die
  **vorhandene `number`** 1:1 übernehmen — **niemals** `allocate_invoice_number` /
  `allocate_offer_number` aufrufen. Nach der Migration den Cloud-Zähler setzen:
  `invoice_sequences.next_number = MAX(number)+1` (analog Angebote) für `cloudWsId`.
- **`created_at` erhalten:** der Runner übernimmt `created_at` (und `updated_at`) aus
  der Lokalzeile in die Upsert-Row — **nicht** den DB-Default (= Migrationszeitpunkt)
  greifen lassen. Gilt für alle Entitäten.
- **`invoice_items` / `offer_items`:** kein Upsert-by-id, sondern **Delete+Insert**:
  pro Parent erst `delete().eq('invoice_id'/'offer_id', parentId)`, dann Items neu
  einfügen (Parent muss vorher upserted sein). Diese Tabellen haben kein
  `workspace_id` (nur FK auf Parent).
- **`company_settings` Sonderfall:** lokal Singleton (`id='singleton'`, kein
  `workspace_id`). Runner liest `CompanyService.get()`, schreibt Cloud mit
  `{ id: cloudWsId, workspace_id: cloudWsId, ...payload, updated_at }`. Kein
  generischer Re-scope.
- **`contracts`→`vertraege`:** Namens-/Form-Unterschied über den vorhandenen
  vertraege-Mapper (Items jsonb) abbilden.
- **Redundante lazy-Migrationen entfernen** (feuern sonst unkontrolliert,
  Reviewer C2/R2, I3/R4): die „push local stages to cloud"-Blöcke in
  `PipelineStagesGateway.getAll()` + `LeadStagesGateway.getAll()` und die
  localStorage→Cloud-Auto-Migration in `auftraege.store.ts` (`MIGRATED_KEY`-Guard)
  werden **gelöscht**; der einzige Migrationspfad ist der Teilen-Runner.

## 4. Backup-Import re-scopen

`cmd_import_backup` (Rust, `commands/export.rs`) bekommt zwei neue Parameter
(`active_workspace_id`, `user_id`); der Caller (`GefahrenzoneSettings.tsx:76`) liest
beide aus den Stores und **guardt auf non-null** (Fehler-Toast sonst). In
`import_into`: **nur Tabellen mit `workspace_id`-Spalte** (via `PRAGMA table_info`)
bekommen `workspace_id`/`created_by` auf die aktive ID umgeschrieben; Tabellen **ohne**
`workspace_id` (`company_settings`, `app_state`, `time_planning`,
`invoice_sequences`/`offer_sequences` mit workspace_id als PK) werden **unverändert**
importiert (bestehende `INSERT OR REPLACE`-Semantik). Der bereits gefixte
`defer_foreign_keys`-Schutz bleibt. Import zielt auf **lokale** Workspaces.

## 5. Edge-Cases & Sicherheit

- **Bestehende Solo-Cloud-Workspaces mit lokalen Daten (Reviewer C1/R2):** Unter dem
  neuen Modell läse so ein Workspace „geteilt" → leer, obwohl lokale SQLite-Daten unter
  seiner ID liegen. **Erkennung in `loadWorkspaces`:** für jede Cloud-Workspace, deren
  Cloud-Kerndaten leer sind **und** für die `cmd_has_local_data(workspaceId)` lokal
  Zeilen findet → Workspace in Zustand „needs-migration", vorerst weiter **lokal**
  lesen + blockierender „Daten migrieren"-Schritt (führt den Teilen-Runner mit
  derselben Cloud-ID aus). Für die aktuelle Tester-Lage (Daten unter `'dev'`, kein
  Cloud-Workspace) greift §2-Adoption; dieser Pfad ist defensiv.
- **Neues Gerät / Geräteverlust:** ein lokaler Workspace hat **keine Cloud-Redundanz**.
  Recovery nur über exportiertes Backup (Gefahrenzone). Onboarding-Hinweis empfehlen.
- **Self/RLS:** Cloud-Schreiben erzwingt `is_workspace_member(workspace_id)` +
  `created_by = auth.uid()`.
- **Abbruch/Netz weg während Teilen:** kein Flip; gefahrloser Re-run (Upsert).
- **Kein Datenverlust:** Migration additiv; lokale Quelle wird nicht gelöscht.

## 6. Betroffene UI/Consumer (Blast-Radius `shared`)

- **Texte korrigieren:** `TeamChatRoute.tsx` + `ChatDrawer.tsx` Leerzustand zeigt für
  lokale Workspaces eine **„Workspace teilen"-CTA** statt „sobald ein 2. Mitglied …"
  (lokaler Workspace kann nie ein 2. Mitglied bekommen).
- **`MembersSettings` / `GefahrenzoneSettings` / `WorkspaceSwitcher` / `SettingsSidebar`:**
  „geteilt"-Semantik = Cloud-Workspace (statt Mitgliederzahl) — Badges/Warnungen
  bleiben korrekt; Reset-Warnung darf im frisch-geteilten 1-Mann-WS milder sein (Minor).
- **`capabilities.ts` Fast-Path** `if (!isShared) return true` bleibt korrekt (lokal =
  voller Zugriff).

## 7. Tests

- **Unit (TS):** `migration-runner` pro Entität — Idempotenz (zweiter Run = gleiche
  Cloud-Zeilen, kein Duplikat-Fehler; Mocks für Tauri-`invoke` + `supabase.upsert`,
  Assertion auf Upsert-Aufrufe/`onConflict`), Nummern-/`created_at`-Erhalt,
  items Delete+Insert, company_settings-ID-Mapping; Modus-Auflösung (lokal vs. Cloud)
  inkl. strukturellem `isActiveWorkspaceShared`; `createLocalWorkspace` schreibt nicht
  Supabase. **`deriveShared`-Tests entfernen**, `isShared`-Mocks anpassen.
- **Rust:** `import_into`-Re-scope (nur workspace_id-Spalten-Tabellen umgeschrieben,
  FK-Defer grün); `cmd_rescope_workspace` (in-place UPDATE über alle Tabellen).
- **Manuell (2 Logins):** lokal anlegen → Daten → „Teilen" → Cloud gefüllt
  (Nummern/Daten korrekt) → Mitarbeiter tritt per Code bei → beide sehen + ändern
  Stammdaten/Aufgaben; Zuweisung + Chat (Realtime sofort, 1-Mann-WS).

## 8. Bewusst NICHT in ① (Scope-Grenze)

- KPIs, Kunden-Dateien/PDF-Ablage (Storage), Automationen, Kampagnen → ②③④.
- Mails (IMAP) + KORA-KI-Chat bleiben pro Person.
- „Un-share" (Cloud→lokal), Offline-Cache-Sync nach Teilen, Import-in-geteilten-WS.
- Exakte Funktionssignaturen, Datei-Layout, Schritt-für-Schritt-Reihenfolge → Plan.

---

## Anhang: Adversarische Review (4 Agenten, 2026-06-27) — eingearbeitet

Eingearbeitete Funde: Upsert-statt-Insert (6 Gateways), Nummern-Erhalt (GoBD),
`created_at`-Erhalt, items Delete+Insert, Nummernkreis-Continuity,
auftraege/zeiteintraege=localStorage, company_settings-Singleton-Mapping,
Migrator-Bypass-Architektur (`migration-runner.ts`), `localWorkspaces`-Persistenz +
persist-key-Bump, `createLocalWorkspace`/`createCloudWorkspaceRecord`-Split,
Adoption-Rust-Commands + Call-Site, vollständige DEV_BYPASS-Entfernung,
Realtime-Re-Subscribe nach Teilen, Entfernen redundanter lazy-Migrationen,
Backup-Re-scope nur für workspace_id-Spalten, Solo-Cloud-mit-Lokaldaten-Erkennung,
Geräteverlust-Hinweis, lokale-Workspace-Default-Felder, Chat-Leertext-CTA,
`deriveShared`-Test-Bereinigung.
