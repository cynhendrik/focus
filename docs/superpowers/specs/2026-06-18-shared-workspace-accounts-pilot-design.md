# Shared Workspace — Pilot: geteilte `accounts` (Leads + Kunden), Cloud-Direct + Realtime

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
Schreib-Backup.

Gleichzeitig existiert das Cloud-Fundament für Mehrbenutzer schon: Tabellen
`workspaces` + `workspace_members` mit Rollen `owner`/`member`
(`src/store/workspace.store.ts:5-22`), und die Daten werden ohnehin nach
Supabase gepusht.

## Ziel

Ein Testkunde soll mit **einem** Mitarbeiter auf demselben Workspace arbeiten
und Änderungen **quasi in Echtzeit** sehen — im Desktop-Client.

Dieser Pilot beweist das Muster an **einer** Tabelle und ist die Blaupause für
den späteren Ausbau auf die restliche App.

### Pilot-Umfang

- **Genau eine Tabelle: `accounts`.** Leads und Kunden sind dieselbe Tabelle,
  unterschieden über `account_type` ('lead' / 'client')
  (`src-tauri/src/db/lead.rs:79,135`). Damit deckt der Pilot Leads-Liste,
  Leads-Board und die Kundenliste/-stammdaten ab.
- Betroffene Stores: `leads.store`, `customers.store`.

### Nicht-Ziele (bewusst draußen, YAGNI)

- Andere Tabellen (Rechnungen, Pipeline-Deals als eigene Entität, Aktivitäten,
  Notizen, Verträge, Mail). Kommen erst nach erfolgreichem Pilot.
- Präsenz / „wer ist online" / Live-Cursor.
- Feldweises Merge / CRDT. Es gilt **last-write-wins** über `updated_at`.
- Echtes Offline-Weiterarbeiten mit Merge im geteilten Modus.
- E-Mail-basierte Einladung (wir nehmen Beitritts-Code).

## Erfolgskriterien

1. Owner (Testkunde) erstellt einen Beitritts-Code und gibt ihn weiter.
2. Mitarbeiter loggt sich mit eigenem Account ein, gibt den Code ein und wird
   Mitglied des Workspaces.
3. Owner legt in der Leads-Liste einen Lead an → Mitarbeiter sieht ihn
   **innerhalb weniger Sekunden ohne Reload**.
4. Mitarbeiter macht den Lead zum Kunden (`convertToClient`) → bei beiden
   verschwindet er aus der Leads-Liste und erscheint in der Kundenliste.
5. Ein zweiter Nutzer kann **nur** Daten der Workspaces sehen, in denen er
   Mitglied ist (RLS verifiziert).
6. Solo-Workspaces funktionieren unverändert offline weiter.

## Architektur — Überblick

Wir führen einen **Workspace-Modus** ein. Ist der aktive Workspace *geteilt*
(`isShared`), läuft der Datenzugriff für `accounts` **direkt gegen Supabase**
(Lesen/Schreiben) statt gegen die lokale SQLite, plus eine Supabase-Realtime-
Subscription. Solo-Workspaces bleiben unverändert auf dem lokalen Pfad.

```
Solo-Workspace:     Store → AccountsGateway → invoke('get_leads') → SQLite (lokal)
Shared-Workspace:   Store → AccountsGateway → supabase.from('accounts')  → Postgres
                                                   ↑ postgres_changes ↓
                                              useWorkspaceRealtime → Store
```

Schlüsselprinzip: Der Store kennt **nur** das Gateway-Interface. Ob lokal oder
Cloud entschieden wird, ist im Gateway gekapselt — kein `if (shared)` in der UI.

## Komponenten

### 1. Workspace-Modus (`isShared`)

- `Workspace` (`workspace.store.ts`) bekommt ein abgeleitetes Feld
  `isShared: boolean`.
- Beim `loadWorkspaces` wird pro Workspace die Mitgliederzahl ermittelt
  (Count auf `workspace_members`); `isShared = memberCount > 1`.
- Helper `useIsSharedWorkspace()` / Selektor liefert den Modus des aktiven
  Workspaces.
- **Schnittstelle:** `isShared` ist die einzige Information, die das Gateway und
  der Realtime-Hook zur Entscheidung brauchen.

### 2. AccountsGateway (Kernstück)

- Neues Modul `src/data/accounts.gateway.ts` mit demselben Methodenumfang, den
  `LeadsService`/`CustomerService` heute bieten, mindestens:
  `getLeads(workspaceId)`, `getCustomers(workspaceId)`,
  `upsertLead(payload)`, `convertToClient(id)`, `deleteAccount(id)`,
  `updateStage(id, stage)`.
- Intern:
  - **Solo:** delegiert an die bestehenden `invoke(...)`-Aufrufe (heutiger
    Code, unverändert).
  - **Shared:** `supabase.from('accounts')...` mit Filter auf `workspace_id`
    und `account_type`.
- Stores (`leads.store`, `customers.store`) rufen künftig das Gateway statt
  direkt `LeadsService`/`CustomerService`.
- **Abhängigkeit:** liest `isShared` + `activeWorkspaceId` aus
  `useWorkspaceStore` (nicht-reaktiv via `getState()` im Service-Kontext).

### 3. Mapper (TS ↔ Supabase-Spalten)

- Reines Modul `src/data/accounts.mapper.ts`:
  `rowToLead(row)`, `rowToCustomer(row)`, `leadPayloadToRow(payload)`.
- Übersetzt camelCase ↔ snake_case und Account-Felder. Orientiert sich an
  vorhandener Logik (`normalizePendingLead` in `leads.service.ts`,
  Push-Payload-Aufbau).
- **Unabhängig testbar** (Round-Trip-Tests), keine Netz-Abhängigkeit.

### 4. Realtime-Hook

- `src/core/sync/useWorkspaceRealtime.ts`.
- Aktiv nur, wenn aktiver Workspace `isShared`. Abonniert
  `supabase.channel(...).on('postgres_changes', { event: '*', schema:
  'public', table: 'accounts', filter: 'workspace_id=eq.<id>' }, …)`.
- Bei INSERT/UPDATE/DELETE: mappt die Row und ruft die passenden Setter in
  `leads.store` / `customers.store` (Routing nach `account_type`).
- Unsubscribe bei Workspace-Wechsel/Unmount.
- Mount-Punkt: dort, wo heute `useSyncBridge` eingehängt ist.

### 5. Beitritts-Code + Beitritt

- **Schema:** Spalte `join_code text unique` auf `workspaces` (kurzer
  Zufallscode, z. B. 8 alphanumerische Zeichen), beim Anlegen generiert;
  rotierbar per Owner-Aktion.
- **Owner-UI:** Code in den Workspace-Einstellungen anzeigen + „Code neu
  generieren".
- **Beitritt:** Postgres-RPC `join_workspace_by_code(code text)` als
  `SECURITY DEFINER`: validiert den Code und legt für `auth.uid()` eine Zeile
  in `workspace_members` mit Rolle `member` an. Verhindert das Offenlegen aller
  Codes und umgeht client-seitiges User-Lookup.
- **Member-UI:** Nach Login Eingabefeld „Workspace beitreten" → ruft die RPC,
  danach `loadWorkspaces` + aktiven Workspace setzen.
- Login selbst existiert bereits (Supabase-Auth, `LoginScreen.tsx`); die
  Member-Rolle wird in `loadWorkspaces` schon unterstützt.

### 6. RLS-Policies (Pflicht bei Multi-User)

- Auf `accounts`, `workspaces`, `workspace_members`:
  Zugriff (select/insert/update/delete) nur, wenn
  `workspace_id in (select workspace_id from workspace_members where user_id =
  auth.uid())`.
- `workspace_members`: ein Nutzer darf seine eigene Zeile sehen; Insert läuft
  ausschließlich über die `SECURITY DEFINER`-RPC.
- Aktueller RLS-Stand wird zu Beginn der Umsetzung verifiziert (der Push nutzt
  bereits das User-Bearer-Token, also existiert vermutlich eine Owner-Policy).

### 7. Offline-Verhalten (geteilter Modus)

- **Lesen:** braucht Verbindung. Bei offline klare Anzeige „Geteilter
  Workspace — Verbindung nötig" (nutzt das vorhandene
  `cultera://connectivity-changed`-Event / `isOnline`).
- **Schreiben:** offen getätigte Schreibvorgänge werden über die bestehende
  `sync_queue` gepuffert und beim Reconnect via `flush_pending` nachgeschoben
  (last-write-wins). Best-effort; kein Merge.

## Datenfluss — Beispiel (A legt Lead an, B sieht ihn)

1. A (shared WS) erstellt Lead → `leads.store.upsert` → `AccountsGateway`
   (shared) → `supabase.from('accounts').insert(...)`.
2. Postgres persistiert, RLS erlaubt (A ist Mitglied).
3. Supabase Realtime sendet `INSERT` an alle Abonnenten des Workspace-Channels.
4. B's `useWorkspaceRealtime` empfängt das Event → `rowToLead` →
   `leads.store` fügt den Lead ein → B's Liste rendert neu.
5. A aktualisiert seinen Store optimistisch beim Insert (und/oder über das
   eigene Realtime-Echo).

## Fehlerbehandlung

- **Supabase-Schreibfehler (shared):** Toast + Rollback der optimistischen
  Store-Änderung. Bei Netzfehler → in `sync_queue` puffern statt verwerfen.
- **RPC-Beitritt mit ungültigem Code:** klare Fehlermeldung „Code ungültig".
- **Realtime-Verbindungsabbruch:** automatischer Reconnect von Supabase;
  beim Reconnect einmaliger Full-Refetch der `accounts` des Workspaces, damit
  während des Ausfalls verpasste Änderungen aufgeholt werden.
- **Workspace-Wechsel:** alte Subscription sauber abmelden, Stores für den
  neuen Workspace neu laden.

## Teststrategie

- **Unit:** Gateway-Routing (solo → `invoke`, shared → supabase) mit Mocks;
  `accounts.mapper` Round-Trip; `isShared`-Ableitung aus Mitgliederzahl.
- **Integration (Supabase, Testprojekt):** RLS — Nutzer ohne Mitgliedschaft
  bekommt keine Zeilen; `join_workspace_by_code` legt Mitgliedschaft an.
- **Manuell (zwei Sessions):** zwei Logins, Erfolgskriterien 1–6 durchspielen;
  Lead-Anlage und Convert in Echtzeit beobachten; Offline-Write → Reconnect.

## Risiken / offene Punkte

- **Doppelter Datenpfad** (lokal vs. Cloud) in der Service-Schicht — der Pilot
  muss zeigen, dass das Gateway-Muster sauber bleibt, bevor wir es auf ~20
  weitere Services ausrollen.
- **RLS korrekt aufsetzen** ist sicherheitskritisch (sonst Datenleck über
  Workspaces hinweg).
- **Eingebetteter Anthropic-Key** (separates Thema, siehe Memory) wird durch
  Multi-User heikler, ist aber **nicht** Teil dieses Piloten.
- **localStorage-Reste** (Aufträge/Zeit, Journal) sind nicht im Scope und
  bleiben im Pilot gerätelokal.

## Ausbau nach dem Piloten (nicht Teil dieser Spec)

Wenn das Muster trägt: dieselbe Gateway-+-Realtime-Mechanik tabellenweise auf
Rechnungen, Pipeline, Aktivitäten/Notizen usw. ausrollen; localStorage-Stores
vorher nach SQLite/Supabase migrieren.
