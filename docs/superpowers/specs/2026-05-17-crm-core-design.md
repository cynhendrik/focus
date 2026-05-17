# CRM Core — Design Spec
**Date:** 2026-05-17  
**Branch:** feature/v2-redesign  
**Status:** Approved

---

## Context

Cynera Focus ist ein Tauri + React Business-OS mit CRM-Kern. Die bisherige `customers`-Tabelle ist ein flaches Modell das Personen und Firmen vermischt, Interaktionen sind über sieben siloisierte Tabellen verteilt, und es gibt keine unified Timeline oder Events-Infrastruktur.

Dieses Spec definiert den Umbau zum skalierbaren CRM-Fundament: Account/Contact/Deal-Hierarchie + Unified Activity Engine + Event Bus als Foundation für die spätere Rules Engine.

---

## Entscheidungen

| Frage | Entscheidung | Begründung |
|---|---|---|
| Persons vs Companies | Contact + Account getrennt | B2B: Firma hat mehrere Ansprechpartner |
| Interactions | Unified Activity Model | Eine Timeline, eine Engine, Rules Engine-fähig |
| Pipeline | Account → Deals | Mehrere Projekte/Angebote pro Kunde möglich |
| Rules Engine | Foundation (Event Bus), kein Evaluator | Sauberer Hook-Punkt ohne Over-Engineering |
| Migration | Clean Cut, kein Rollback-Puffer | feature/v2-redesign, keine Produktionsdaten |

---

## Entity Model

### `accounts` — ersetzt `customers`

```sql
CREATE TABLE accounts (
    id              TEXT PRIMARY KEY,
    workspace_id    TEXT NOT NULL,
    created_by      TEXT NOT NULL,
    name            TEXT NOT NULL,
    kind            TEXT NOT NULL DEFAULT 'company',  -- 'company' | 'individual'
    industry        TEXT,
    website         TEXT,
    status          TEXT NOT NULL DEFAULT 'prospect', -- 'prospect'|'aktiv'|'inaktiv'|'churned'
    priority        TEXT NOT NULL DEFAULT 'normal',   -- 'low'|'normal'|'high'|'vip'
    tags            TEXT NOT NULL DEFAULT '[]',        -- JSON Array
    goals           TEXT NOT NULL DEFAULT '[]',        -- JSON Array
    health_score    REAL,                              -- gecacht, berechnet aus Activities
    internal_notes  TEXT,
    is_private      INTEGER NOT NULL DEFAULT 0,        -- 1 = __cynera_privat__
    social_links    TEXT NOT NULL DEFAULT '{}',        -- JSON
    pending_sync    INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
```

**Seed:** `__cynera_privat__` wird als Account mit `is_private = 1` übernommen.

### `contacts` — neu

```sql
CREATE TABLE contacts (
    id              TEXT PRIMARY KEY,
    workspace_id    TEXT NOT NULL,
    created_by      TEXT NOT NULL,
    account_id      TEXT REFERENCES accounts(id) ON DELETE SET NULL,  -- nullable
    first_name      TEXT NOT NULL,
    last_name       TEXT,
    email           TEXT,
    phone           TEXT,
    role            TEXT,                              -- z.B. "CEO", "Projektleiter"
    is_primary      INTEGER NOT NULL DEFAULT 0,        -- Hauptkontakt des Accounts
    avatar_url      TEXT,
    pending_sync    INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
```

Ein Contact ohne Account ist erlaubt (Netzwerkkontakt ohne Firmenzuordnung).

### `deals` — neu

```sql
CREATE TABLE deals (
    id              TEXT PRIMARY KEY,
    workspace_id    TEXT NOT NULL,
    created_by      TEXT NOT NULL,
    account_id      TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    contact_id      TEXT REFERENCES contacts(id) ON DELETE SET NULL,
    title           TEXT NOT NULL,
    stage           TEXT NOT NULL DEFAULT 'prospect',
                    -- 'prospect'|'qualified'|'proposal'|'negotiation'|'won'|'lost'
    value           REAL,
    currency        TEXT NOT NULL DEFAULT 'EUR',
    probability     INTEGER,                           -- 0–100
    expected_close  TEXT,
    owner           TEXT,                              -- user_id
    pending_sync    INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
```

Pipeline-Stages sind vorerst hardcoded; konfigurierbar über `company_settings.crm_config` wenn nötig.

---

## Activity Engine

### `activities` — ersetzt notes, todos, crm_follow_ups, deadlines, time_entries

```sql
CREATE TABLE activities (
    id              TEXT PRIMARY KEY,
    workspace_id    TEXT NOT NULL,
    created_by      TEXT NOT NULL,

    -- Entity-Links (explizit, nicht polymorph)
    account_id      TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    contact_id      TEXT REFERENCES contacts(id) ON DELETE SET NULL,
    deal_id         TEXT REFERENCES deals(id) ON DELETE SET NULL,

    -- Inhalt
    type            TEXT NOT NULL,
                    -- 'note'|'task'|'call'|'meeting'|'email'|'file'|'time_entry'|'stage_change'
    title           TEXT,
    body            TEXT,
    payload         TEXT NOT NULL DEFAULT '{}',        -- JSON, typisiert per type

    -- Task-Felder (nur relevant wenn type = 'task')
    status          TEXT NOT NULL DEFAULT 'open',      -- 'open'|'done'|'cancelled'
    due_at          TEXT,
    assignee        TEXT,                              -- user_id; als Spalte für SQL-Queries ("alle Tasks von User X")

    pending_sync    INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE INDEX idx_activities_account    ON activities(account_id, created_at DESC);
CREATE INDEX idx_activities_deal       ON activities(deal_id, created_at DESC);
CREATE INDEX idx_activities_contact    ON activities(contact_id, created_at DESC);
CREATE INDEX idx_activities_open_tasks ON activities(workspace_id, status, due_at)
    WHERE type = 'task' AND status = 'open';
```

### Payload-Typen

```
note        →  { note_type: 'gespraech'|'intern'|'meeting', waiting_reply: bool }
task        →  { checklist: [], tags: [], is_follow_up: bool }
call        →  { duration_minutes: int, direction: 'in'|'out', outcome: string }
meeting     →  { location: string, attendees: string[] }
email       →  { email_id: string, direction: 'in'|'out' }
file        →  { file_id: string, file_name: string, mime_type: string }
time_entry  →  { minutes: int }
stage_change→  { from_stage: string, to_stage: string }
```

`emails` und `files` bleiben als eigene Tabellen (IMAP-Komplexität, Binärdaten). Ein eingehendes Mail / ein Upload erzeugt zusätzlich einen Activity-Eintrag als Spiegel. Quelle der Wahrheit für Inhalt: die jeweilige Tabelle. Quelle der Wahrheit für die Timeline: `activities`.

`kpis` und `time_planning` bleiben als eigene Tabellen — sie sind Metriken/Konfiguration, keine Interaktions-Events.

### Abgekündigt (werden gedroppt)

| Alt | Neu |
|---|---|
| `notes` | `activities(type:'note')` |
| `todos` | `activities(type:'task')` |
| `crm_follow_ups` | `activities(type:'task', payload.is_follow_up:true)` |
| `deadlines` | `activities(type:'task')` |
| `time_entries` | `activities(type:'time_entry')` |
| `health_scores` | Gecacht als `accounts.health_score` |
| `customers` | `accounts` + `contacts` |

---

## Event Bus — Rules Engine Foundation

Alle Activity-Inserts laufen durch eine zentrale Engine-Funktion:

```rust
// src-tauri/src/activity_engine/mod.rs
pub fn create(
    conn: &Connection,
    handle: &AppHandle,
    payload: CreateActivityPayload,
) -> Result<Activity, AppError> {
    let activity = db::activity::insert(conn, &payload)?;
    sync::enqueue(conn, "activities", &activity.id, "INSERT", ...)?;
    handle.emit("activity:created", &activity).ok();  // Hook-Punkt für Rules Engine
    Ok(activity)
}
```

Das Frontend abonniert:
```typescript
await listen('activity:created', (event) => {
  // Rules Engine (späterer Sprint), UI-Updates, Notifications
})
```

Kein Rules-Evaluator jetzt. Aber jede Activity geht durch diese Funktion — das ist die Disziplin die später zahlt.

---

## Migration (SQLite v5)

Eine einzelne Transaktion. `customer.id`-Werte werden 1:1 als `account.id` übernommen — alle `sync_queue`-Einträge bleiben valide.

**Reihenfolge:**
1. Neue Tabellen anlegen: `accounts`, `contacts`, `deals`, `activities` + Indexes
2. `customers` → `accounts` (kind aus `company IS NOT NULL` ableiten)
3. `contacts` aus `customers` extrahieren: bei `kind='company'` aus `contact_person`/`email`/`phone`; bei `kind='individual'` aus `name`/`email`/`phone` des Customers selbst
4. `notes` → `activities(type:'note')`
5. `todos` → `activities(type:'task')`
6. `crm_follow_ups` → `activities(type:'task', is_follow_up:true)`
7. `deadlines` → `activities(type:'task')`
8. `time_entries` → `activities(type:'time_entry')`
9. `kpis`, `folders`, `files`, `chat_messages`, `emails`: Tabellen neu anlegen mit `account_id`, Daten migrieren, alte Tabellen droppen
10. `health_scores`: letzten Score pro Customer → `accounts.health_score`, dann droppen
11. `customers`, `notes`, `todos`, `crm_follow_ups`, `deadlines`, `time_entries` droppen

---

## Modul-Struktur

### Rust

```
src-tauri/src/
  activity_engine/
    mod.rs            ← create(), update(), delete() mit Event-Emission
  db/
    account.rs        ← ersetzt db/customer.rs
    contact.rs        ← neu
    deal.rs           ← neu
    activity.rs       ← ersetzt db/note.rs, db/todo.rs, db/crm.rs, db/deadline.rs, db/time_entry.rs
  commands/
    account.rs        ← ersetzt commands/customer.rs
    contact.rs        ← neu
    deal.rs           ← neu
    activity.rs       ← ersetzt commands/note.rs, commands/todo.rs, commands/crm.rs, etc.
```

Bestehende Module die bleiben: `db/kpi.rs`, `db/folder.rs`, `db/company.rs`, `email/*`, `core/auth`, `core/sync`.

### Frontend

```
src/store/
  accounts.store.ts   ← ersetzt customers.store.ts
  contacts.store.ts   ← neu
  deals.store.ts      ← neu
  activities.store.ts ← ersetzt alle Interaktions-Stores
```

---

## Privat-Modus

`__cynera_privat__` wird als Account mit `is_private = 1` aus der Migration übernommen und bleibt geseedet. Alle persönlichen Activities laufen auf diesen Account. Das ist die natürliche Basis für den späteren Privat-Modus — kein zusätzlicher Architektur-Aufwand jetzt nötig.

---

## Out of Scope (spätere Sprints)

- Rules Engine Evaluator (Conditions + Actions)
- Fokus-Modus / Creator-Modus
- Konfigurierbare Pipeline-Stages als eigene Tabelle
- Multi-Contact-Linking auf Activities
- Server-seitige Automations via Supabase Edge Functions
