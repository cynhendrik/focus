# Activities (Notizen + Timeline + Follow-ups) cloud-first — Design

**Datum:** 2026-06-21
**Branch:** `feature/erechnung-2026-06-21` (Phase-2-Auftakt, baut auf Accounts/Finanzen cloud-first)
**Verwandt:** [[shared-workspace-multiplayer]], [[org-assessment-2026-06]]

## Problem & Ziel

Notizen und der Aktivitäts-Stream werden als Zeilen der `activities`-Tabelle gespeichert, aber **alle** Zugriffe gehen rein lokal über Tauri (`NoteService`, `ActivitiesService`, beide → `invoke('create_activity'/'get_activities_*'/…)`). Im geteilten Workspace lebt der Lead/Kunde in der Cloud → der lokale Insert/Read scheitert oder ist unsichtbar (= der „Lead-Notizen gehen nicht"-Bug + tote Timeline/Follow-ups).

**Ziel:** Die ganze Activities-Domäne cloud-first: beide Service-Views über **ein `ActivitiesGateway`** (solo→Tauri / shared→Supabase), + Realtime. Fixt Notizen, Timeline und Follow-ups im geteilten Workspace.

**RLS:** `activities` hat bereits eine Policy `workspace member` (`is_workspace_member(workspace_id)`) für **ALLE** Operationen → **kein DDL/RLS-Bau nötig**.

## Architektur

```
useNotesStore (Notiz-View)      ─┐                         ┌─ solo  → invoke(get_activities_by_account / create_activity / …)
useActivitiesStore (roh + FUp)  ─┼─► ActivitiesGateway ────┤
                                 │     (+ activities.mapper)└─ shared→ supabase.from('activities')
crm loadLastActivity            ─┘  (OUT OF SCOPE, s.u.)
```

### `src/data/activities.gateway.ts` (neu)
Methoden mit `if (!shared()) return <invoke> else <supabase>`:
- `getByAccount(accountId): Promise<Activity[]>` — solo `invoke('get_activities_by_account', { accountId })`; shared `select * where account_id = X order by created_at desc`.
- `getByCustomer(customerId): Promise<Activity[]>` — solo `invoke('get_activities_by_customer', { customerId })`; shared `select * where customer_id = X order by created_at desc`.
- `getOpenFollowups(workspaceId): Promise<Activity[]>` — solo `invoke('get_open_followups', { workspaceId })`; shared `select * where workspace_id = X and type='followup' and status='open' order by due_at asc nulls last, created_at asc`.
- `create(payload): Promise<Activity>` — solo `invoke('create_activity', { payload })`; shared Insert.
- `update(id, payload): Promise<Activity>` — solo `invoke('update_activity', { id, payload })`; shared Update.
- `delete(id): Promise<void>` — solo `invoke('delete_activity', { id })`; shared Delete.

Lesbare Errors über einen `fail()`-Helfer (wie finance.gateway).

### `src/data/activities.mapper.ts` (neu)
- `activityRowToActivity(r): Activity` — snake→camel; **`payload` jsonb→String** (`typeof r.payload === 'string' ? r.payload : JSON.stringify(r.payload ?? {})`); mappt beide `account_id`/`customer_id`.
- `activityPayloadToRow(p, ctx: { id, now }): Record<string,unknown>` — camel→snake; **`payload` String→Objekt** für jsonb (defensives `JSON.parse`, Fallback `{}`); setzt `created_at`+`updated_at` = `ctx.now` (beide NOT NULL ohne DB-Default!); `type` aus Payload, `status` default `'open'`; schreibt **beide** `account_id` (p.accountId) und `customer_id` (p.customerId) — spiegelt Rust `create`.

### `src/data/notes.mapper.ts` (neu) — aus `NoteService` ausgelagert
- `activityToNote(a: Activity): Note` (type='note' → Note-View; liest note_type/waiting_reply/pinned aus `payload`).
- `notePayloadToActivityPayload(p: UpsertNotePayload): CreateActivityPayload` (Note → Activity, type='note', body=content, payload=JSON{note_type,waiting_reply,pinned}).

### Stores
- **`useNotesStore`** → `ActivitiesGateway.getByAccount` + `activityToNote` (Filter `type==='note'`); `upsert` → `notePayloadToActivityPayload` → `ActivitiesGateway.create`/`update`; `remove` → `ActivitiesGateway.delete`. (NoteService-eigenes Mapping entfällt; `NoteService` wird zur reinen Solo-Hülle oder aufgelöst — Entscheidung im Plan.)
- **`useActivitiesStore`** → `ActivitiesGateway` direkt (rohe Activity + Follow-ups).
- `ActivitiesService` bleibt Solo-Implementierung hinter dem Gateway (oder aufgelöst — Plan entscheidet, je nachdem was sauberer ist).

### Realtime
`activities` zum Workspace-Realtime-Channel (`useWorkspaceRealtime`) hinzufügen: bei Änderung die offene Kunden-Timeline (`useActivitiesStore`/`useNotesStore` falls ein Kunde geladen ist) + Follow-ups neu laden. Muster wie der Finanz-Channel (reload-on-change), kein inkrementelles Merge nötig.

## Datenmodell-Befunde (verifiziert)
- `activities`: `created_at`/`updated_at` = NOT NULL **ohne Default** → Mapper setzt beide. `payload` = **jsonb** (default `'{}'`) → String↔Objekt konvertieren. `type` NOT NULL (Payload liefert), `status` default `'open'`, `pending_sync` default 0. Spalten **`account_id` UND `customer_id`** parallel (beide nullable) — beide werden geschrieben.
- Zwei TS-Typquellen (`activity.types` + `pipeline.types`) — **bewusst nicht vereinheitlicht** (nur routen). Das Gateway nimmt die Superset-`CreateActivityPayload` (mit `customerId`) entgegen.

## Fehlerbehandlung
Gateway wirft lesbare Errors; Stores behalten ihr `AppError`-Muster.

## Tests
- **`activities.mapper.test.ts`**: payload jsonb↔String, beide ID-Spalten, created_at/updated_at gesetzt, type/status-Defaults.
- **`notes.mapper.test.ts`**: activityToNote (note_type/pinned/waiting_reply aus payload), notePayload→activity (type='note', body, payload-JSON).
- **`activities.gateway.test.ts`**: je Methode solo→invoke vs shared→supabase Routing; getOpenFollowups shared mit `type='followup'`+`status='open'`-Filter.
- Store-Tests (notes/activities) mocken das Gateway.

## Out of scope (bewusst)
- **`crm loadLastActivity`** (`CrmService.getLastActivityDates`) = CRM-Aggregat, eigene Domäne → bleibt vorerst lokal; im geteilten Workspace evtl. kurz stale (kein Bruch). Eigene spätere „CRM-Aggregate cloud-first"-Scheibe.
- Notiz-**Modul** (`notes`/`note_docs`/`note_entries`/`note_folders`, Sticky-Notes) = andere Tabellen, separate Scheibe.
- `todos`/`deadlines`/`calendar`/`contacts` = eigene Phase-2-Scheiben danach.
- Typ-Fragmentierung *aufräumen* (nur routen).

## Erfolgskriterien
1. Im geteilten Workspace: Notiz an Lead/Kunde anlegen/ändern/löschen funktioniert und erscheint live in einer zweiten Instanz.
2. Aktivitäts-Timeline eines Kunden lädt im geteilten Workspace aus der Cloud.
3. Offene Follow-ups laden im geteilten Workspace (type='followup', status='open').
4. Solo-Workspace unverändert; alle Tests grün.
