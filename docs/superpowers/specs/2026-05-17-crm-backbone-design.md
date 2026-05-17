# CRM Backbone Design Spec

**Feature:** CRM Backbone — Pipeline Stages, Lead Score, Activity Outcomes
**Date:** 2026-05-17
**Status:** Approved

---

## Goal

Extend the existing Account/Activity/Deal model with three new capabilities:
1. **Configurable pipeline stages** per workspace (replaces hardcoded deal stages)
2. **Lead score** on accounts (auto-managed by Rules Engine, Sub-project B)
3. **Outcome field** on activities (drives automations in Sub-project B)

This is Sub-project A of the CRM system. It is purely a data model + backend extension — no automation logic, no UI beyond the store layer.

---

## Architecture

**Hybrid pipeline model:** An account's current pipeline phase is always derived from its deals, never stored directly on the account.

- If `accounts.primary_deal_id` is set → use that deal's stage
- Else → use the most recently updated active (non-won, non-lost) deal's stage
- Else → `null` (no phase)

`pipeline_stages` is the source of truth for stage definitions. `deals.stage` stores the stage `name` as a soft reference (no FK — avoids breaking existing deal CRUD).

`lead_score` is a stored column on `accounts`, written only by the Rules Engine (Sub-project B). Never manually updated.

`outcome` is a nullable column on `activities`, set when a user records the result of a call, meeting, or email.

---

## Data Model

### New Table: `pipeline_stages`

```sql
CREATE TABLE IF NOT EXISTS pipeline_stages (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name         TEXT NOT NULL,
    label        TEXT NOT NULL,
    order_index  INTEGER NOT NULL DEFAULT 0,
    color        TEXT NOT NULL DEFAULT '#6B7280',
    is_won       INTEGER NOT NULL DEFAULT 0,
    is_lost      INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_workspace
    ON pipeline_stages(workspace_id, order_index);
```

**Fields:**
- `name` — stable internal key (e.g. `lead`, `call_1_done`). Used as the value stored in `deals.stage`.
- `label` — user-facing display name (e.g. `Call 1 durchgeführt`). Editable.
- `order_index` — display order in Kanban/Funnel. Managed via `reorder` command.
- `color` — hex color for Kanban column header and stage badge.
- `is_won` / `is_lost` — marks terminal stages; exactly one `is_won=1` and one `is_lost=1` stage per workspace at any time.

**Default stages (seeded on workspace creation):**

| order | name | label | color | is_won | is_lost |
|-------|------|-------|-------|--------|---------|
| 0 | `lead` | Lead | `#6B7280` | 0 | 0 |
| 1 | `qualified` | Qualifiziert | `#3B82F6` | 0 | 0 |
| 2 | `call_1_planned` | Call 1 geplant | `#8B5CF6` | 0 | 0 |
| 3 | `call_1_done` | Call 1 durchgeführt | `#F59E0B` | 0 | 0 |
| 4 | `follow_up` | Follow-Up Phase | `#F97316` | 0 | 0 |
| 5 | `call_2` | Call 2 / Vertiefung | `#EF4444` | 0 | 0 |
| 6 | `proposal_sent` | Angebot gesendet | `#06B6D4` | 0 | 0 |
| 7 | `closing` | Closing-Phase | `#10B981` | 0 | 0 |
| 8 | `won` | Won | `#22C55E` | 1 | 0 |
| 9 | `lost` | Lost | `#6B7280` | 0 | 1 |

Seeding runs in Migration v6 only for workspaces that have zero existing pipeline_stages rows.

---

### Changes to `accounts`

Two new columns via `ALTER TABLE` in Migration v6:

```sql
ALTER TABLE accounts ADD COLUMN primary_deal_id TEXT;
ALTER TABLE accounts ADD COLUMN lead_score REAL NOT NULL DEFAULT 0;
```

`primary_deal_id` is a soft reference to `deals.id` (no FK — account can outlive deleted deals; set to NULL on deal delete via application logic).

The `Account` response struct gains two additional computed fields populated via JOIN at query time:

```rust
pub struct Account {
    // ... existing fields
    pub primary_deal_id: Option<String>,
    pub lead_score: f64,
    // computed via LEFT JOIN on deals + pipeline_stages:
    pub pipeline_phase: Option<String>,        // e.g. "call_1_done"
    pub pipeline_phase_label: Option<String>,  // e.g. "Call 1 durchgeführt"
}
```

The JOIN logic in `get_all` and `get_by_id`:
```sql
LEFT JOIN deals d ON (
    d.id = a.primary_deal_id
    OR (a.primary_deal_id IS NULL AND d.account_id = a.id
        AND d.stage NOT IN (
            SELECT name FROM pipeline_stages
            WHERE (is_won=1 OR is_lost=1) AND workspace_id = a.workspace_id
        ))
)
LEFT JOIN pipeline_stages ps ON ps.name = d.stage AND ps.workspace_id = a.workspace_id
```

When `primary_deal_id IS NULL`, use `ORDER BY d.updated_at DESC LIMIT 1` to get the newest active deal.

---

### Changes to `activities`

One new column via `ALTER TABLE` in Migration v6:

```sql
ALTER TABLE activities ADD COLUMN outcome TEXT;
```

**Allowed values** (enforced in Rust/TS, not via DB constraint):

| Value | Meaning |
|-------|---------|
| `strong_interest` | Starkes Interesse |
| `interest_follow_up` | Interesse, Follow-Up nötig |
| `proposal_requested` | Angebot gewünscht |
| `deal_won` | Deal gewonnen |
| `deal_lost` | Deal verloren |
| `no_interest_later` | Kein Interesse – später |
| `no_interest_lost` | Kein Interesse – qualifiziert lost |
| `no_show` | No-Show |
| `reply_received` | Antwort erhalten |
| `no_reply` | Keine Antwort |
| `waiting_for_reply` | Warten auf Antwort |

`outcome` is only meaningful on activities of type `call`, `meeting`, `email`. For other types it is ignored.

---

## Rust Backend

### New: `src-tauri/src/db/pipeline_stage.rs`

```rust
pub struct PipelineStage {
    pub id: String,
    pub workspace_id: String,
    pub name: String,
    pub label: String,
    pub order_index: i32,
    pub color: String,
    pub is_won: bool,
    pub is_lost: bool,
    pub created_at: String,
}

pub struct UpsertPipelineStagePayload {
    pub id: Option<String>,
    pub workspace_id: String,
    pub name: String,
    pub label: String,
    pub order_index: Option<i32>,
    pub color: Option<String>,
    pub is_won: Option<bool>,
    pub is_lost: Option<bool>,
}

pub fn get_all(conn: &Connection, workspace_id: &str) -> Result<Vec<PipelineStage>, AppError>
pub fn upsert(conn: &Connection, payload: UpsertPipelineStagePayload) -> Result<PipelineStage, AppError>
pub fn delete(conn: &Connection, id: &str, workspace_id: &str) -> Result<(), AppError>
pub fn reorder(conn: &Connection, workspace_id: &str, ordered_ids: &[String]) -> Result<(), AppError>
pub fn seed_defaults(conn: &Connection, workspace_id: &str) -> Result<(), AppError>
```

`seed_defaults` checks `SELECT COUNT(*) FROM pipeline_stages WHERE workspace_id=?` before inserting — idempotent.

`delete` returns `AppError::Validation` if the stage is referenced by any deal (`SELECT COUNT(*) FROM deals WHERE stage = name`). Stages in use cannot be deleted — must be reassigned first.

`reorder` runs a batch: `UPDATE pipeline_stages SET order_index=? WHERE id=? AND workspace_id=?` for each id in the ordered list.

### New: `src-tauri/src/commands/pipeline_stage.rs`

```rust
#[tauri::command] cmd_get_pipeline_stages(workspace_id: String) -> Result<Vec<PipelineStage>>
#[tauri::command] cmd_upsert_pipeline_stage(payload: UpsertPipelineStagePayload) -> Result<PipelineStage>
#[tauri::command] cmd_delete_pipeline_stage(id: String) -> Result<()>
#[tauri::command] cmd_reorder_pipeline_stages(workspace_id: String, ordered_ids: Vec<String>) -> Result<()>
```

### Changes to `src-tauri/src/db/account.rs`

- `get_all` and `get_by_id`: extend SELECT with LEFT JOINs for `pipeline_phase` and `pipeline_phase_label`
- `upsert`: accept `primary_deal_id: Option<String>` in payload, write to DB
- New function: `set_primary_deal(conn, account_id, deal_id: Option<String>) -> Result<Account>`

### Changes to `src-tauri/src/commands/account.rs`

- New command: `cmd_set_primary_deal(account_id: String, deal_id: Option<String>) -> Result<Account>`

### Migration v6 (`src-tauri/src/db/migrations.rs`)

```rust
// v6: CRM Backbone
conn.execute_batch(r#"
    ALTER TABLE accounts ADD COLUMN primary_deal_id TEXT;
    ALTER TABLE accounts ADD COLUMN lead_score REAL NOT NULL DEFAULT 0;
    ALTER TABLE activities ADD COLUMN outcome TEXT;
    CREATE TABLE IF NOT EXISTS pipeline_stages (
        id           TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        name         TEXT NOT NULL,
        label        TEXT NOT NULL,
        order_index  INTEGER NOT NULL DEFAULT 0,
        color        TEXT NOT NULL DEFAULT '#6B7280',
        is_won       INTEGER NOT NULL DEFAULT 0,
        is_lost      INTEGER NOT NULL DEFAULT 0,
        created_at   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pipeline_stages_workspace
        ON pipeline_stages(workspace_id, order_index);
"#)?;
// Seed defaults for all existing workspaces
for workspace_id in get_all_workspace_ids(conn)? {
    pipeline_stage::seed_defaults(conn, &workspace_id)?;
}
```

---

## TypeScript

### New: `src/types/pipeline.types.ts`

```ts
export interface PipelineStage {
  id: string
  workspaceId: string
  name: string
  label: string
  orderIndex: number
  color: string
  isWon: boolean
  isLost: boolean
  createdAt: string
}

export interface UpsertPipelineStagePayload {
  id?: string
  workspaceId: string
  name: string
  label: string
  orderIndex?: number
  color?: string
  isWon?: boolean
  isLost?: boolean
}
```

### Changes to `src/types/activity.types.ts`

```ts
export type ActivityOutcome =
  | 'strong_interest' | 'interest_follow_up' | 'proposal_requested'
  | 'deal_won' | 'deal_lost'
  | 'no_interest_later' | 'no_interest_lost'
  | 'no_show' | 'reply_received' | 'no_reply' | 'waiting_for_reply'

// Added to Activity interface:
outcome?: ActivityOutcome

// Added to CreateActivityPayload and UpdateActivityPayload:
outcome?: ActivityOutcome
```

### Changes to `src/types/account.types.ts`

```ts
// Added to Account interface:
primaryDealId?: string
leadScore: number
pipelinePhase?: string       // computed, read-only
pipelinePhaseLabel?: string  // computed, read-only
```

### New: `src/store/pipeline.store.ts`

```ts
interface PipelineStore {
  stages: PipelineStage[]
  isLoading: boolean
  load: (workspaceId: string) => Promise<void>
  upsert: (payload: UpsertPipelineStagePayload) => Promise<void>
  remove: (id: string) => Promise<void>
  reorder: (workspaceId: string, orderedIds: string[]) => Promise<void>
  // Derived helpers:
  activeStages: () => PipelineStage[]  // excludes is_won and is_lost
  wonStage: () => PipelineStage | undefined
  lostStage: () => PipelineStage | undefined
}
```

### Changes to `src/store/accounts.store.ts`

```ts
// New action:
setPrimaryDeal: (accountId: string, dealId: string | null) => Promise<void>
// Calls cmd_set_primary_deal, then refreshes the account in local state
// lead_score is NOT writable from the store — written only by Rules Engine
```

### Changes to `src/store/activities.store.ts`

- `create` and `update` payloads accept `outcome?: ActivityOutcome`

---

## What This Does NOT Include

- Automation logic (Rules Engine) — Sub-project B
- Follow-Up Engine UI — Sub-project C
- Dashboard Sales Cockpit — Sub-project D
- Any UI for pipeline stages (Settings screen) — part of Sub-project D or a dedicated settings sub-project
- lead_score write logic — Sub-project B (Rules Engine writes it)

---

## Testing

Each Rust function gets an in-memory SQLite test:
- `pipeline_stage::get_all` returns empty for unknown workspace
- `pipeline_stage::upsert` creates and updates
- `pipeline_stage::delete` blocks deletion of stages in use
- `pipeline_stage::reorder` updates order_index correctly
- `pipeline_stage::seed_defaults` is idempotent
- `account::get_all` returns `pipeline_phase` from primary deal when set
- `account::get_all` falls back to newest active deal when `primary_deal_id` is null
- `account::get_all` returns `null` pipeline_phase when no active deals exist
- `account::set_primary_deal` updates the account and returns computed phase
