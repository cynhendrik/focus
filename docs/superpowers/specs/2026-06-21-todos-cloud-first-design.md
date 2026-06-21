# Todos cloud-first — Design

**Datum:** 2026-06-21
**Branch:** `feature/erechnung-2026-06-21` (Phase 2.2, baut auf der Activities-Scheibe)
**Verwandt:** [[shared-workspace-multiplayer]], `2026-06-21-activities-cloud-first-design.md`

## Problem & Ziel

Todos werden **als `activities` mit `type='task'`** gespeichert (`TodoService` ist ein View auf die `activities`-Tabelle, genau wie der frühere `NoteService`). Alle Zugriffe gehen rein lokal über Tauri → im geteilten Workspace funktionieren To-dos nicht (lokale activities, Cloud-Lead).

Die separate Supabase-`todos`-**Tabelle** ist **Legacy/ungenutzt** (anderes Schema, kein Code referenziert sie) → **kein RLS-Bau, keine neue Tabelle**. RLS auf `activities` ist bereits workspace-scoped (Activities-Scheibe).

**Ziel:** `todos.store` über das bestehende **`ActivitiesGateway`** routen (solo→Tauri / shared→Supabase) + Realtime, sodass To-dos im geteilten Workspace funktionieren. Kleine Erweiterung, kein neues Gateway.

## Architektur

```
useTodosStore ──► ActivitiesGateway (erweitert) ──┬─ solo  → invoke(get_open_tasks / get_activities_by_account / create_activity / …)
                  (+ todos.mapper)                 └─ shared→ supabase.from('activities')  (type='task')
```

### `ActivitiesGateway` (erweitern)
- **Neu** `getOpenTasks(workspaceId): Promise<Activity[]>` — solo `invoke('get_open_tasks', { workspaceId })`; shared `select * where workspace_id=X and type='task' and status='open' order by due_at asc nullsFirst:false`.
- Wiederverwendet: `getByAccount` (Kunden-Tasks, Filter `type==='task'` im Store), `create`, `update`, `delete`.

### `activities.mapper` / Gateway-Signaturen (kleine Erweiterung)
Todos sind **zuweisbar** → `assignee` muss durchlaufen (Activity-Tabelle hat die Spalte; die aktuellen Mapper lassen sie aus):
- `activityPayloadToRow`: `assignee: p.assignee ?? null` ergänzen.
- `activityUpdateToPatch`: `if (p.assignee !== undefined) patch.assignee = p.assignee`.
- Gateway `create`/`update`-Param-Typen um optionales `assignee` erweitern (`CreateActivityPayload & { assignee?: string }` bzw. Update analog).

### `todos.mapper.ts` (neu, aus `TodoService` ausgelagert)
- `activityToTodo(a): Todo` — Task-Activity → Todo: liest `checklist`/`tags`/`priority`/`bucket`/`scheduledAt`/`plannedMinutes`/`notes`/`aiSummary`/`calendarEventId`/`source`/`actionType`/`sourceRef` aus `payload`-JSON; Legacy-Priority-Map (high→p1 etc.) + `normalizePriority`; `deriveBucket(status, scheduledAt)`; `status`-Ableitung (done/in_progress/open).
- `todoToCreatePayload(p, ctx: { workspaceId, createdBy }): CreateActivityPayload & { assignee?: string }` — Todo → Activity-Create (type='task', title, status, dueAt, assignee, payload-JSON mit allen Todo-Feldern + `is_follow_up:false`).
- `todoToUpdatePayload(p): UpdateActivityPayload & { payload?: string; assignee?: string }` — Todo-Update → Activity-Update (title, status, dueAt, assignee, payload-JSON).

(Logik 1:1 aus `TodoService` übernehmen — `activityToTodo`, der payload-JSON-Bau in `upsert`, `deriveBucket`, `normalizePriority`, `LEGACY_PRIORITY_MAP`.)

### `todos.store`
Routet über `ActivitiesGateway` + `todos.mapper`:
- `loadAll(workspaceId)` → `getOpenTasks` → `activityToTodo`
- `loadForCustomer(customerId)` → `getByAccount(customerId)` → Filter `type==='task'` → `activityToTodo`
- `upsert(payload)` → bei `id` `gateway.update(id, todoToUpdatePayload(payload))` sonst `gateway.create(todoToCreatePayload(payload, { workspaceId, createdBy }))` → `activityToTodo`
- `remove(id)` → `gateway.delete(id)`
- Die Kalender-Sync-/Convenience-Methoden (`syncLinkedEvent`, `complete`, `postpone`, `setBucket`, …) bleiben unverändert (rufen intern `upsert`/`remove`).
- `TodoService` auflösen (Consumer prüfen; falls außer dem Store noch wo genutzt → dort auch übers Gateway/Store routen oder Service belassen).

### Realtime
Der `activities`-Channel (Activities-Scheibe) lädt schon Follow-ups + offenen Kunden nach. **Ergänzen:** Todos neu laden — `useTodosStore.getState().loadAll(activeWorkspaceId)` (offene Tasks) und, falls ein Kunde offen ist, dessen Tasks. (currentCustomerId-Muster wie bei activities/notes, oder loadAll genügt fürs Erste — siehe Plan.)

## Datenmodell-Befunde (verifiziert)
- Todos liegen in `activities` (type='task'); `get_open_tasks` = `type='task' and status='open' order by due_at asc nulls last`.
- `activities.assignee`-Spalte existiert (Activity-Tabelle) → Mapper muss sie schreiben.
- `payload` jsonb (in Activities-Scheibe schon String↔Objekt behandelt); `created_at`/`updated_at` werden vom Activity-Mapper gesetzt.
- Supabase-`todos`-Tabelle: **ungenutzt**, bleibt unangetastet.

## Fehlerbehandlung
Gateway wirft lesbare Errors; `todos.store` behält sein `AppError`-Muster.

## Tests
- **`todos.mapper.test.ts`**: `activityToTodo` (payload-Felder, Legacy-Priority-Map, deriveBucket, status); `todoToCreatePayload`/`todoToUpdatePayload` (type='task', assignee, payload-JSON-Schlüssel).
- **`activities.mapper.test.ts`** erweitern: `assignee` in `activityPayloadToRow` + `activityUpdateToPatch`.
- **`activities.gateway.test.ts`** erweitern: `getOpenTasks` solo→invoke / shared→supabase (`type='task'`+`status='open'`-Filter).
- **`todos.store.test.ts`**: Gateway gemockt; loadAll/upsert/remove + eine Convenience-Methode (`complete`).

## Out of scope (bewusst)
- deny-all `todos`-Tabelle (Legacy, ungenutzt).
- Kalender (`calendar_events`) = eigene nächste Scheibe (todos.store synct zu Kalender, aber der Kalender-Store ist noch lokal — im Shared evtl. kurz inkonsistent, kein Bruch; wird mit der Kalender-Scheibe gelöst).
- Deadlines, Kontakte = eigene Scheiben.
- Typ-Fragmentierung aufräumen (nur routen).

## Erfolgskriterien
1. Im geteilten Workspace: To-do anlegen/ändern/abschließen/löschen funktioniert und erscheint live in einer zweiten Instanz.
2. Offene Tasks (`loadAll`) + Kunden-Tasks laden aus der Cloud.
3. `assignee` bleibt im geteilten Workspace erhalten.
4. Solo-Workspace unverändert; alle Tests grün.
