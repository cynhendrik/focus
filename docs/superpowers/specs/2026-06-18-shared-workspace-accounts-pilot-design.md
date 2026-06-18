# Shared Workspace — Pilot: geteilte Kunden-Oberfläche (alle Tabs) + Attribution

**Datum:** 2026-06-18
**Status:** Design — zur Umsetzung freigegeben
**Kontext:** Cultera Focus (Tauri Desktop, local-first, SQLite + Supabase-Push)

## Problem

Cultera Focus ist heute **local-first für einen Nutzer**. Geschäftsdaten liegen
lokal in SQLite; jede Änderung wird in eine `sync_queue` geschrieben und per
`flush_pending` **nur nach oben** zu Supabase gepusht
(`src-tauri/src/core/sync/push.rs`). Es gibt **keinen Pull, kein Realtime** —
`useSyncBridge.ts` überträgt nur den Auth-Token. Reads laufen ausschließlich
lokal (`leads.service.ts:18` → `invoke('get_leads')`).

Folge: Zwei Mitarbeiter können **nicht** gemeinsam auf einem Workspace
arbeiten — jeder hat eine isolierte lokale Kopie; die Cloud ist ein reines
Schreib-Backup. Man sieht auch nicht, **wer was gemacht hat**.

Das Cloud-Fundament für Mehrbenutzer existiert: `workspaces` +
`workspace_members` mit Rollen `owner`/`member`
(`src/store/workspace.store.ts:5-22`), und die Daten werden ohnehin gepusht.

## Ziel

Ein Testkunde soll mit **einem** Mitarbeiter auf demselben Workspace arbeiten,
Änderungen **quasi in Echtzeit** sehen, und erkennen, **wer eine Notiz/ein
Objekt angelegt hat, wer zuletzt drin war, und wer eine Aufgabe auf erledigt
gesetzt hat** — im Desktop-Client.

### Pilot-Umfang

**1) Geteilte Kunden-Oberfläche (Kernziel) — alle Tabs des Kundendetails plus
die Leads-Liste/-Board.** Betroffene Tabellen:

| Bereich (Tab) | Pane | Tabelle(n) |
|---|---|---|
| Leads-Liste/-Board + Profil/Header | LeverageLeadsRoute / ProfilPane | `accounts` (Leads+Kunden, `account_type`) |
| Aktivitäten | TimelinePane | `activities` |
| Aufgaben | WorkflowPane | `todos` |
| Notizen | CustomerNotesPane | `notes` |
| Dokumente | DateienPane | `files` |
| Finanzen | FinanzPane | `invoices`, `offers`, `deals` |

**2) Leichte Attribution.** Drei Signale, dargestellt als kleines farbiges
Initialen-Badge: (a) **erstellt von** (`created_by`, oft vorhanden) — v. a. an
Notizen/Objekten; (b) **zuletzt bearbeitet von** (`updated_by`, neu, „wer war
als letztes drin"); (c) **erledigt von** (`completed_by`, neu) — **nur bei
Aufgaben**, gesetzt beim Übergang auf `done`. **Rechnungen bekommen keine
Attribution.**

**3) Nutzerprofile** (Name + Farbe) als Grundlage für die Badges.

**4) Beitritts-Code** + Login (Login existiert).

**5) Zuweisung & Sichtbarkeit.** To-dos sind einer Person zuweisbar
(`assignee`); das **Heute-Modul** zeigt jedem primär seine zugewiesenen +
nicht zugewiesene Aufgaben, mit Umschalter „meine / alle". **Finanzen/Umsatz**
sind für Mitarbeiter standardmäßig verborgen; der Owner kann es pro Person
freischalten (`workspace_members.can_view_finance`).

### Reihenfolge der Umsetzung (innerhalb des Piloten)

Wir bauen **nicht** alle Tabellen gleichzeitig blind. Das Fundament wird zuerst
**end-to-end an `accounts`** bewiesen (Gateway-Routing, Realtime-Infra,
Nutzerprofile, Beitritts-Code, RLS, Badge), inklusive Attribution. Sobald dieser
eine Pfad sauber steht, werden die übrigen Kunden-Tab-Tabellen **nach demselben
Muster** ergänzt (`activities` → `todos` → `notes` → `files` →
`invoices/offers/deals`). Der Implementierungsplan schneidet das in einzelne,
je für sich testbare Schritte.

### Folge-Schritt (nach dem Piloten, eigene Spec)

- **Zeiterfassung teilen.** Liegt heute nur in `localStorage`
  (`auftraege.store.ts`) und wird nicht synchronisiert. **Voraussetzung:** erst
  nach SQLite/Supabase migrieren, dann nach demselben Muster teilbar machen.

### Nicht-Ziele (bewusst draußen, YAGNI)

- Mail (IMAP ist ohnehin pro Nutzer), Verträge, Notizen-Module-Stickies,
  Kalender — kommen später.
- Präsenz / „wer ist online" / Live-Cursor.
- Vollständiges Rollen-/Rechtesystem. Es gibt nur die eine Stufe
  „Finanzen sichtbar ja/nein" pro Mitglied.
- Volles Audit-Log jeder Aktion. Attribution beschränkt sich auf
  erstellt / zuletzt bearbeitet / Aufgabe-erledigt; keine Rechnungs-Attribution.
- Feldweises Merge / CRDT — es gilt **last-write-wins** über `updated_at`.
- Echtes Offline-Weiterarbeiten mit Merge im geteilten Modus.

## Erfolgskriterien

1. Owner erstellt einen Beitritts-Code; Mitarbeiter loggt sich mit eigenem
   Account ein, gibt den Code ein und wird Mitglied.
2. Owner legt einen Lead an → Mitarbeiter sieht ihn **in Sekunden ohne Reload**.
3. Im Kundendetail: Owner schreibt eine Notiz / legt eine Aufgabe / entwirft
   eine Rechnung → Mitarbeiter sieht es live im jeweiligen Tab.
4. Notizen/Objekte tragen ein Badge „erstellt von <Kürzel>" und „zuletzt von
   <Kürzel>". Schließt der Mitarbeiter eine **Aufgabe** ab, erscheint dort
   „erledigt von <Kürzel>".
5. Der Owner weist dem Mitarbeiter eine Aufgabe zu → sie erscheint in dessen
   Heute; im Umschalter „alle" sieht der Owner die Aufgaben beider.
6. Der Mitarbeiter sieht **keine** Umsatz-KPIs und keinen Finanzen-Tab, solange
   der Owner ihn nicht freigeschaltet hat.
7. Ein Nutzer sieht **nur** Daten der Workspaces, in denen er Mitglied ist
   (RLS verifiziert).
8. Solo-Workspaces funktionieren unverändert offline weiter.

## Architektur — Überblick

Wir führen einen **Workspace-Modus** ein. Ist der aktive Workspace *geteilt*
(`isShared`), läuft der Datenzugriff für die Pilot-Tabellen **direkt gegen
Supabase** statt gegen die lokale SQLite, plus Supabase-Realtime-Subscriptions.
Solo-Workspaces bleiben unverändert auf dem lokalen Pfad.

```
Solo:    Store → Gateway → invoke('get_*') → SQLite (lokal)
Shared:  Store → Gateway → supabase.from('<tabelle>')  → Postgres
                                  ↑ postgres_changes ↓
                             useWorkspaceRealtime → Store
```

Schlüsselprinzip: Stores kennen **nur** das Gateway-Interface. Ob lokal oder
Cloud, ist im Gateway gekapselt — kein `if (shared)` in der UI.

## Komponenten

### 1. Workspace-Modus (`isShared`)
- `Workspace` (`workspace.store.ts`) bekommt abgeleitetes `isShared: boolean`.
- Beim `loadWorkspaces` Mitgliederzahl je Workspace zählen
  (`workspace_members`); `isShared = memberCount > 1`.
- Selektor/Helper liefert den Modus des aktiven Workspaces. Einzige Information,
  die Gateways und Realtime-Hook zur Entscheidung brauchen.

### 2. Daten-Gateways (Kernstück)
- Pro Pilot-Entität ein Gateway mit demselben Methodenumfang wie heute die
  Services (`getAll/upsert/delete/…`), z. B. `accounts.gateway.ts`,
  `activities.gateway.ts`, `todos.gateway.ts`, `notes.gateway.ts`,
  `files.gateway.ts`, `finance.gateway.ts`.
- **Solo:** delegiert an die bestehenden `invoke(...)`-Aufrufe (unverändert).
- **Shared:** `supabase.from('<tabelle>')…`, gefiltert auf `workspace_id`.
- Die jeweiligen Stores rufen künftig das Gateway statt direkt den Service.
- Gemeinsamer Helper `resolveMode()` liest `isShared`+`activeWorkspaceId` aus
  `useWorkspaceStore.getState()`.

### 3. Mapper (TS ↔ Supabase-Spalten)
- Je Entität ein reines Mapper-Modul (camelCase ↔ snake_case), Round-Trip
  testbar, keine Netz-Abhängigkeit. Orientiert sich an `normalizePendingLead`
  und den Push-Payloads.

### 4. Realtime-Hook
- `src/core/sync/useWorkspaceRealtime.ts`. Aktiv nur bei `isShared`.
- Abonniert `postgres_changes` (event `*`) je Pilot-Tabelle mit Filter
  `workspace_id=eq.<id>` und spielt INSERT/UPDATE/DELETE über den Mapper in den
  passenden Store ein.
- Sauberes Unsubscribe bei Workspace-Wechsel/Unmount. Beim (Re)connect
  einmaliger Full-Refetch je Tabelle, um verpasste Änderungen aufzuholen.
- Mount-Punkt: dort, wo heute `useSyncBridge` eingehängt ist.

### 5. Nutzerprofile (Name + Farbe)
- Supabase-Tabelle `profiles` (`user_id` PK, `display_name`, `color`).
- Beim ersten Login angelegt: `display_name` aus E-Mail abgeleitet, `color`
  deterministisch aus `user_id` vergeben (stabil, kollisionsarm).
- Client lädt die Profile der Workspace-Mitglieder einmal und cached sie
  (`workspaceMembers.store` oder Erweiterung von `workspace.store`).
- Name in den Profil-Einstellungen editierbar (optional, geringe Prio).

### 6. Attribution-Felder + Badge
- **Felder:** Pilot-Tabellen führen `created_by` (vorhanden, sonst ergänzen)
  und `updated_by` (neu, bei jedem Update gesetzt = „wer als letztes drin war").
  **`todos`** zusätzlich `completed_by` (neu), gesetzt beim Übergang auf `done`.
  **Rechnungen bekommen keine Attribution.**
- **UI:** wiederverwendbares `<UserBadge userId>` — farbiges Kürzel (Initialen)
  aus dem Profil, Tooltip mit vollem Namen. Eingesetzt v. a. an Notiz-,
  Aktivitäts- und Aufgaben-Items: „erstellt von" / „zuletzt von"; bei Aufgaben
  zusätzlich „erledigt von".
- Im Solo-Modus zeigt das Badge schlicht den einzigen Nutzer (kein Sonderfall).

### 7. Beitritts-Code + Beitritt
- **Schema:** `join_code text unique` auf `workspaces` (kurzer Zufallscode,
  beim Anlegen generiert, vom Owner rotierbar).
- **Owner-UI:** Code in den Workspace-Einstellungen anzeigen + neu generieren.
- **Beitritt:** Postgres-RPC `join_workspace_by_code(code text)` als
  `SECURITY DEFINER`: validiert den Code, legt für `auth.uid()` eine
  `workspace_members`-Zeile mit Rolle `member` an. Keine Offenlegung aller
  Codes, kein client-seitiges User-Lookup.
- **Member-UI:** nach Login „Workspace beitreten" → RPC →
  `loadWorkspaces` + aktiven Workspace setzen.

### 8. RLS-Policies (Pflicht bei Multi-User)
- Auf **allen Pilot-Tabellen** + `workspaces`, `workspace_members`, `profiles`:
  Zugriff nur, wenn `workspace_id in (select workspace_id from
  workspace_members where user_id = auth.uid())`.
- `workspace_members`: eigene Zeile sichtbar; Insert nur über die
  `SECURITY DEFINER`-RPC. `profiles`: für Mitglieder gemeinsamer Workspaces
  lesbar.
- Aktueller RLS-Stand wird zu Beginn der Umsetzung verifiziert.

### 9. Offline-Verhalten (geteilter Modus)
- **Lesen:** braucht Verbindung; klare Anzeige „Geteilter Workspace —
  Verbindung nötig" (nutzt `cultera://connectivity-changed` / `isOnline`).
- **Schreiben:** offline getätigte Writes werden über die bestehende
  `sync_queue` gepuffert und beim Reconnect via `flush_pending` nachgeschoben
  (last-write-wins). Best-effort, kein Merge.

### 10. Zuweisung & Heute (To-dos)
- `todos` bekommt `assignee_id` (nullable). Setzen über einen kleinen
  Zuweisungs-Picker (Workspace-Mitglieder) an der Aufgabe.
- Das **Heute-Modul** (`useHeuteQueue`) filtert im Shared-Workspace auf
  `assignee_id = self OR assignee_id IS NULL`; Umschalter „meine / alle" hebt
  den Filter auf. Im Solo-Modus unverändert.
- `assignee` ist unabhängig von `created_by`/`completed_by` (zuständig ≠
  Ersteller ≠ Erlediger).

### 11. Finanz-Sichtbarkeit (minimale Rechte)
- `workspace_members.can_view_finance boolean` (Owner implizit `true`).
- Owner-UI: pro Mitglied in den Workspace-Einstellungen umschaltbar.
- Wirkung: Umsatz-KPIs (Dashboard/Heute) und der Finanzen-Tab werden
  ausgeblendet, wenn der aktive Nutzer kein `can_view_finance` hat. Beim
  späteren Teilen der Finanztabellen wird derselbe Check **auch per RLS**
  durchgesetzt (nicht nur UI), damit Member ohne Recht keine Rechnungszeilen
  laden können.
- Kein vollständiges Rollensystem — eine Stufe, bewusst minimal.

## Datenfluss — Beispiel (A schreibt Notiz, B sieht sie + Badge)

1. A (shared WS) schreibt im Notizen-Tab eine Notiz → `notes.store` →
   `notes.gateway` (shared) → `supabase.from('notes').insert({ …,
   created_by: A, updated_by: A })`.
2. Postgres persistiert (RLS erlaubt, A ist Mitglied).
3. Realtime sendet `INSERT` an den Workspace-Channel.
4. B's `useWorkspaceRealtime` empfängt es → Mapper → `notes.store` → B's
   Notizen-Tab rendert die Notiz mit Badge „erstellt von A".
5. B bearbeitet die Notiz → `updated_by: B` → bei A erscheint „zuletzt von B".
   Setzt B eine Aufgabe auf erledigt, erscheint dort „erledigt von B".

## Fehlerbehandlung
- **Supabase-Schreibfehler (shared):** Toast + Rollback der optimistischen
  Store-Änderung; bei Netzfehler in `sync_queue` puffern statt verwerfen.
- **Ungültiger Beitritts-Code:** klare Fehlermeldung.
- **Realtime-Abbruch:** Supabase-Auto-Reconnect; beim Reconnect Full-Refetch.
- **Workspace-Wechsel:** alte Subscriptions abmelden, Stores neu laden.
- **Fehlendes Profil eines Mitglieds:** Badge fällt auf Initialen aus
  E-Mail/Default-Farbe zurück.

## Teststrategie
- **Unit:** Gateway-Routing (solo → `invoke`, shared → supabase) mit Mocks je
  Entität; Mapper-Round-Trips; `isShared`-Ableitung; deterministische
  Farbvergabe.
- **Integration (Supabase-Testprojekt):** RLS — Nichtmitglied bekommt keine
  Zeilen; `join_workspace_by_code` legt Mitgliedschaft an; `completed_by` wird
  korrekt gesetzt.
- **Manuell (zwei Logins):** Erfolgskriterien 1–6 durchspielen — Lead-Anlage,
  Notiz/Aufgabe/Rechnung im Kundendetail live, Badges „erstellt/erledigt von",
  Offline-Write → Reconnect.

## Risiken / offene Punkte
- **Doppelter Datenpfad** (lokal vs. Cloud) über mehrere Services — der
  Accounts-Schritt muss zeigen, dass das Gateway-Muster sauber bleibt, bevor wir
  es fächern.
- **RLS korrekt** ist sicherheitskritisch (sonst Datenleck über Workspaces).
- **Neue Felder** (`updated_by` auf Pilot-Tabellen, `completed_by` + `assignee_id`
  bei `todos`, `can_view_finance` auf `workspace_members`) müssen in Backend
  (SQLite-Schema + Migrationen) und Supabase konsistent ergänzt werden.
- **Finanz-Sichtbarkeit** muss spätestens beim Teilen der Finanztabellen per
  RLS abgesichert sein, nicht nur in der UI.
- **Eingebetteter Anthropic-Key** (separates Thema, Memory) wird durch
  Multi-User heikler, ist aber nicht Teil dieses Piloten.
- **localStorage-Reste** (Aufträge/Zeit, Journal) sind nicht im Scope und
  bleiben gerätelokal, bis der Zeiterfassungs-Folgeschritt sie migriert.

## Ausbau nach dem Piloten (eigene Specs)
Dieselbe Gateway-+-Realtime-+-Attribution-Mechanik auf Zeiterfassung (nach
localStorage→DB-Migration), Mail-Zuordnung, Verträge, Kalender ausrollen.
