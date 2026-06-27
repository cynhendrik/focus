# Lokal-Standard-Workspace + volles Cloud-Teilen — Design-Spec

**Datum:** 2026-06-27
**Branch-Kontext:** baut auf der Cloud-first/Realtime-Suite + Team-Chat (Phase 1–3) auf (Supabase-Projekt `mqbjmquscjtytpjebosw`)
**Status:** Design freigegeben (Brainstorming), Teilprojekt ① bereit für Implementierungsplan

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
müssen **beide** (Chef + Mitarbeiter) **jede Funktion** nutzen können (anlegen,
Stammdaten ändern, zuweisen …).

## Getroffene Entscheidungen (Brainstorming 2026-06-27)

| Frage | Entscheidung |
|---|---|
| Login für lokalen Workspace | **Pflicht** — einmal online einloggen; Daten bleiben lokal bis „Teilen". |
| Cloud-Zeitpunkt | **Nichts in der Cloud bis „Teilen"** — lokaler Workspace ist rein lokal. |
| Modus-Quelle | **Strukturell** (lokaler vs. Cloud-Workspace), **nicht** aus Mitgliederzahl. |
| Migrations-Engine | **Ansatz A** — Frontend, pro Entität über die bestehenden Gateways (reuse Mapper), idempotent, re-scoped. |
| Teilen-Richtung | **Einbahnig** — ein geteilter Workspace bleibt Cloud (kein „un-share" in v1). |
| „Überspringen"-Modus | **Entfernen** — Login ist Pflicht. |
| Voll-funktionsfähiger Team-Workspace | Endziel; wird als **Programm** in 4 Teilprojekte zerlegt (s. u.). Mails/KORA bleiben bewusst pro Person. |

## Coverage-Audit (Grundlage des Scopings, 2026-06-27)

Geprüft, welche lokalen SQLite-Tabellen ein Cloud-Gegenstück + Schreibpfad haben:

- **Cloud-fähig (migrierbar):** `accounts`, `contacts`, `deals`, `activities`
  (absorbiert Alt-`todos`/`notes`/`deadlines`/`crm_follow_ups`/`time_entries`),
  `pipeline_stages`, `lead_stages`, `invoices`, `invoice_items`, `offers`,
  `offer_items`, `payments`, `calendar_events`, `contracts`→Cloud-`vertraege`,
  `note_folders`, `note_entries`, `auftraege`, `zeiteintraege`, `company_settings`.
- **Bereits weg (v5-SQLite-Migration droppt sie):** `customers`, `todos`, `notes`,
  `deadlines`, `crm_follow_ups`, `time_entries`, `health_scores` — Daten leben längst
  in `accounts`/`activities`. Kein Verlust, nichts zu migrieren.
- **Bewusst pro Person / gerätegebunden:** IMAP `email_accounts`/`emails`, KORA
  `chat_messages`, `app_state`, `invoice_sequences`/`offer_sequences`,
  `time_planning`, `automation_rules`, `campaigns`/`campaign_recipients`,
  Kunden-Dateien `folders`/`files`, PDF-Ablage `workspace_folders`/`workspace_files`,
  `kpis`, `follow_up_queue`.
- **Lücke (Business-Daten ohne Cloud-Heimat):** `kpis`, Kunden-Dateien, PDF-Ablage,
  Automationen, Kampagnen → kommen in Teilprojekten ②③④.

## Programm-Zerlegung (Reihenfolge ①→②→③→④, ein Release am Ende)

| # | Teilprojekt | Inhalt |
|---|---|---|
| **①** | **Fundament** (dieser Spec) | Workspace-Modus (lokal\|geteilt) · Login/Picker · „Teilen"-Flow + Migrations-Runner für den cloud-fähigen Kern · Backup-Import-Re-scope · „Überspringen" entfernen. |
| ② | KPIs cloud | Cloud-`kpis` (Tabelle + RLS + Realtime + Gateway), in die Migration aufnehmen. |
| ③ | Dateien via Supabase Storage | Kunden-Dateien **und** PDF-Ablage: Upload, Cloud-Metadaten, Pfade→Storage-Refs, Migration lädt Binaries hoch. |
| ④ | Automationen + Kampagnen cloud | Cloud-Tabellen + RLS + Gateways, in die Migration aufnehmen. |

Jedes Teilprojekt bekommt einen eigenen Spec → Plan. Dieser Spec deckt **nur ①** im
Detail; ②③④ sind hier nur als Rahmen genannt.

---

# Teilprojekt ① — Fundament (Detail-Design)

## 1. Workspace-Modell

Zwei strukturell getrennte Arten:

- **Lokaler Workspace** — existiert nur auf dem Gerät. Identität in einem **lokalen
  Register**, persistiert im `workspace.store` (z. B. `localWorkspaces: { id, name }[]`,
  `id = crypto.randomUUID()`). Alle lokalen SQLite-Daten sind nach dieser ID gescoped
  (`workspace_id`). Kein Supabase-Eintrag.
- **Geteilter Workspace** — die Supabase-`workspaces`-Zeile (+ `workspace_members`).
  Daten in der Cloud.

**`isActiveWorkspaceShared()` wird strukturell:** `true` ⇔ der aktive Workspace ist
ein Cloud-Workspace (in der aus Supabase geladenen Liste enthalten); `false` ⇔ er ist
im lokalen Register. Die Ableitung aus der Mitgliederzahl (`deriveShared`) entfällt;
Cloud-Workspaces haben `isShared = true` per Definition. Dieselbe Quelle nutzt
`useWorkspaceRealtime` (damit Chat-/Daten-Realtime auch im frisch geteilten
1-Mitglied-Workspace greift).

> **Konsequenz (gewollt):** Ein Cloud-Workspace liest **immer** Cloud — auch direkt
> nach „Teilen", bevor der Mitarbeiter beitritt. RLS erlaubt das (der Owner ist
> Mitglied). Das behebt den „Solo-Cloud zeigt leer"-Bug.

## 2. Login & Workspace-Picker

- **„Überspringen"-Hack entfernen** (`handleDevSkip` in `LoginScreen.tsx`); Login ist
  Pflicht. Kein Fake-User mehr.
- Nach Login lädt `workspace.store` **beide** Quellen: Cloud-Workspaces (Supabase,
  via `loadWorkspaces`) **und** lokale (Register). Der Picker listet beide mit Badge
  (🔒 Lokal / ☁ Geteilt).
- **„Neuer Workspace" = lokal** (lokale ID, kein Supabase-Schreiben).
- **„Beitreten (Code)" = Cloud** (bestehender `join_workspace_by_code`-Pfad).
- **Bestandsdaten adoptieren (einmalig, beim ersten Start der neuen Version):**
  Existieren lokale Daten unter der Alt-ID `'dev'` und ist noch kein lokaler Workspace
  registriert, wird ein lokaler Workspace „Mein Workspace" angelegt und die `'dev'`-
  Daten darauf re-scoped (lokale `workspace_id` `'dev'` → neue lokale ID). Nichts geht
  verloren. (Wiederverwendung der Re-scope-Primitive aus §4.)

## 3. „Teilen"-Flow + Migrations-Runner

**Einstieg:** Aktion **„Workspace teilen"** im Workspace-Menü (nur bei lokalen
Workspaces sichtbar). Bestätigungsdialog erklärt: einbahnig, lädt Daten in die Cloud.

**Ablauf** (idempotent, wiederholbar; flippt erst bei Erfolg):

1. **Cloud-Workspace anlegen:** Supabase-`workspaces`-Zeile + `workspace_members`
   (Owner = ich) → `cloudWsId`. (Logik aus `createWorkspace`, aber ohne sofortiges
   „aktiv setzen".)
2. **Migration je Entität** in **FK-sicherer Reihenfolge** (Eltern vor Kindern),
   lokal lesen → Cloud upserten, re-scoped auf `cloudWsId` + `created_by = ich`,
   idempotent (Upsert per `id`):
   ```
   company_settings → pipeline_stages → lead_stages → accounts → contacts →
   deals → activities → calendar_events → invoices → invoice_items → payments →
   offers → offer_items → vertraege → note_folders → note_entries →
   auftraege → zeiteintraege
   ```
   Engine = **Ansatz A**: pro Entität ein dünner Migrator, der den **vorhandenen**
   Cloud-Schreibpfad des Gateways nutzt (reuse Mapper). Wo ein Gateway nur den
   auto-umschaltenden Pfad hat, wird eine explizite „lokal lesen"- bzw.
   „cloud schreiben"-Hilfsfunktion ergänzt (da `isActiveWorkspaceShared()` während
   der Migration noch `false` ist).
3. **Erfolg:** aktiver Workspace = `cloudWsId`; lokaler Workspace als „migriert"
   markiert (aus dem Picker entfernt); **Beitritts-Code** anzeigen.
4. **Fehler unterwegs:** nichts wird „geteilt"-geflippt; in der Cloud liegen ggf.
   Teildaten (idempotent), erneuter Klick setzt die Upserts gefahrlos fort.
   Fortschritts-UI pro Entität (Anzahl migrierter Zeilen, analog Reset/Import-Toasts).

**Idempotenz/Re-run:** Upsert `onConflict: id`. FK-Reihenfolge gilt auch bei Upsert
(Eltern zuerst), da Postgres-FKs aktiv sind.

**Lokale Daten nach Teilen:** bleiben als (ignorierte) Kopie auf dem Gerät — die App
liest ab jetzt Cloud (Workspace ist geteilt). Kein Offline-Cache-Sync in v1 (YAGNI).

## 4. Backup-Import re-scopen (aus „später/zusammen")

`import_into` (Rust, `commands/export.rs`) schreibt künftig für **workspace-scoped
Tabellen** die `workspace_id` (und `created_by`) auf den **aktiven** Workspace um,
statt die ursprünglichen Werte zu übernehmen → importierte Backups sind sofort
sichtbar. Die aktive Workspace-ID + User-ID werden dem Command als Parameter
übergeben (vom Client). Der bereits gefixte `defer_foreign_keys`-Schutz bleibt.
Import zielt auf **lokale** Workspaces (Import-in-geteilt = außerhalb ①).

## 5. Edge-Cases & Sicherheit

- **Bestehende Solo-Cloud-Workspaces (Altzustand):** Falls ein Nutzer früher per
  altem `createWorkspace` einen Cloud-Workspace mit lokal liegenden Daten hat, würde
  er unter dem neuen Modell „geteilt" lesen → leer. Für die aktuelle Tester-Lage
  (Daten unter `'dev'`) irrelevant; wird über die Adoption (§2) abgefangen. Falls doch
  vorhanden: einmaliger Hinweis + Teilen-Migration nachholen. (Kein automatischer
  Datenverlust — lokale Daten bleiben erhalten.)
- **Self/RLS:** Cloud-Schreiben erzwingt `is_workspace_member(workspace_id)` +
  `created_by = auth.uid()` (bestehende Policies). Migration läuft als der einloggte
  Owner.
- **Abbruch/Netz weg während Teilen:** kein Flip; gefahrloser Re-run.
- **Kein Datenverlust:** Migration ist additiv (Upsert); lokale Quelle wird nicht
  gelöscht.

## 6. Tests

- **Unit (TS):** Re-scope-Logik; Modus-Auflösung (lokal vs. geteilt) inkl.
  `isActiveWorkspaceShared()` strukturell; Migrations-Reihenfolge; Idempotenz
  (Re-run erzeugt keine Duplikate, gleiche Zeilenzahl).
- **Rust:** `import_into`-Re-scope-Test (workspace_id/created_by werden umgeschrieben;
  FK-Defer bleibt grün).
- **Manuell (2 Logins):** lokalen Workspace anlegen → Daten erfassen → „Teilen" →
  Cloud enthält Daten → Mitarbeiter tritt per Code bei → beide sehen + ändern
  Stammdaten/Aufgaben; Aufgaben-Zuweisung + Chat funktionieren (Team-Chat-Smoke-Test).

## 7. Bewusst NICHT in ① (Scope-Grenze)

- KPIs, Kunden-Dateien/PDF-Ablage (Storage), Automationen, Kampagnen → ②③④.
- Mails (IMAP) + KORA-KI-Chat bleiben pro Person (kein Migrationspfad).
- „Un-share" (Cloud→lokal zurück), Offline-Cache-Sync nach Teilen, Import-in-
  geteilten-Workspace.
- Code-Struktur/Datei-Layout, exakte Funktionssignaturen und Schritt-für-Schritt-
  Reihenfolge gehören in den Implementierungsplan, nicht in diesen Spec.
