# CRM Backbone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Account/Activity/Deal model with configurable pipeline stages, lead score, and activity outcomes — the data foundation for the Rules Engine (Sub-project B).

**Architecture:** New `pipeline_stages` table (per workspace, 10 defaults seeded at migration time). `accounts` gets `primary_deal_id` (soft ref to deals) and `lead_score`. `activities` gets `outcome`. Pipeline phase is always computed via JOIN — never stored on accounts. All changes additive; no existing commands break.

**Tech Stack:** Rust/Tauri v2, rusqlite 0.31, SQLite, React/TypeScript, Zustand

**Spec:** `docs/superpowers/specs/2026-05-17-crm-backbone-design.md`

---

## File Map

**Created (Rust)**
- `src-tauri/src/db/pipeline_stage.rs` — PipelineStage CRUD + seed_defaults
- `src-tauri/src/commands/pipeline_stage.rs` — 4 Tauri commands

**Modified (Rust)**
- `src-tauri/src/db/schema.rs` — add pipeline_stages table + 2 new account columns + 1 activity column
- `src-tauri/src/db/migrations.rs` — v6: column ALTERs + CREATE pipeline_stages + seed
- `src-tauri/src/db/account.rs` — extend Account struct, CTE query for pipeline_phase, add get_by_id + set_primary_deal
- `src-tauri/src/db/activity.rs` — add outcome field to struct + all queries
- `src-tauri/src/db/mod.rs` — expose pipeline_stage
- `src-tauri/src/commands/account.rs` — add set_primary_deal command
- `src-tauri/src/commands/mod.rs` — expose pipeline_stage
- `src-tauri/src/main.rs` — register 5 new commands

**Created (TypeScript)**
- `src/types/pipeline.types.ts`
- `src/store/pipeline.store.ts`

**Modified (TypeScript)**
- `src/types/account.types.ts` — add primaryDealId, leadScore, pipelinePhase, pipelinePhaseLabel
- `src/types/activity.types.ts` — add ActivityOutcome type + outcome field
- `src/store/accounts.store.ts` — add setPrimaryDeal action
- `src/store/activities.store.ts` — outcome in create/update payloads

---

### Task 1: schema.rs — Add pipeline_stages table + new columns

**Files:**
- Modify: `src-tauri/src/db/schema.rs`

- [ ] **Step 1: Write the failing test**

Add inside `#[cfg(test)] mod tests` in `src-tauri/src/db/schema.rs`:

```rust
#[test]
fn schema_has_pipeline_stages_table() {
    let conn = rusqlite::Connection::open_in_memory().unwrap();
    conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
    create_tables(&conn).unwrap();
    let tables: Vec<String> = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .unwrap()
        .query_map([], |r| r.get(0))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();
    assert!(tables.contains(&"pipeline_stages".to_string()));
    // Check new account columns exist
    let cols: Vec<String> = conn
        .prepare("PRAGMA table_info(accounts)").unwrap()
        .query_map([], |r| r.get(1)).unwrap()
        .filter_map(|r| r.ok()).collect();
    assert!(cols.contains(&"primary_deal_id".to_string()));
    assert!(cols.contains(&"lead_score".to_string()));
    // Check new activity column exists
    let act_cols: Vec<String> = conn
        .prepare("PRAGMA table_info(activities)").unwrap()
        .query_map([], |r| r.get(1)).unwrap()
        .filter_map(|r| r.ok()).collect();
    assert!(act_cols.contains(&"outcome".to_string()));
}
```

- [ ] **Step 2: Run — expect FAIL**

```
cargo test --manifest-path src-tauri/Cargo.toml schema::tests::schema_has_pipeline_stages_table
```

Expected: FAIL — pipeline_stages table not found

- [ ] **Step 3: Add to schema.rs**

In `create_tables`, after the `CREATE TABLE IF NOT EXISTS activities` block (before the index lines), add `outcome TEXT` to the activities table definition:

```rust
        CREATE TABLE IF NOT EXISTS activities (
            id              TEXT PRIMARY KEY,
            workspace_id    TEXT NOT NULL DEFAULT '',
            created_by      TEXT NOT NULL DEFAULT '',
            account_id      TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            contact_id      TEXT REFERENCES contacts(id) ON DELETE SET NULL,
            deal_id         TEXT REFERENCES deals(id) ON DELETE SET NULL,
            type            TEXT NOT NULL,
            title           TEXT,
            body            TEXT,
            payload         TEXT NOT NULL DEFAULT '{}',
            status          TEXT NOT NULL DEFAULT 'open',
            due_at          TEXT,
            assignee        TEXT,
            outcome         TEXT,
            pending_sync    INTEGER NOT NULL DEFAULT 0,
            created_at      TEXT NOT NULL,
            updated_at      TEXT NOT NULL
        );
```

Add `primary_deal_id` and `lead_score` to the accounts table definition:

```rust
        CREATE TABLE IF NOT EXISTS accounts (
            id              TEXT PRIMARY KEY,
            workspace_id    TEXT NOT NULL DEFAULT '',
            created_by      TEXT NOT NULL DEFAULT '',
            name            TEXT NOT NULL,
            kind            TEXT NOT NULL DEFAULT 'company',
            industry        TEXT,
            website         TEXT,
            status          TEXT NOT NULL DEFAULT 'prospect',
            priority        TEXT NOT NULL DEFAULT 'normal',
            tags            TEXT NOT NULL DEFAULT '[]',
            goals           TEXT NOT NULL DEFAULT '[]',
            health_score    REAL,
            internal_notes  TEXT,
            is_private      INTEGER NOT NULL DEFAULT 0,
            social_links    TEXT NOT NULL DEFAULT '{}',
            primary_deal_id TEXT,
            lead_score      REAL NOT NULL DEFAULT 0,
            pending_sync    INTEGER NOT NULL DEFAULT 0,
            created_at      TEXT NOT NULL,
            updated_at      TEXT NOT NULL
        );
```

After the activities indexes block, add the pipeline_stages table. Insert this before the `CREATE TABLE IF NOT EXISTS customers` line:

```rust
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

Also update the existing `new_tables_created_in_schema` test to add the pipeline_stages assertion:

```rust
assert!(tables.contains(&"pipeline_stages".to_string()));
```

- [ ] **Step 4: Run — expect PASS**

```
cargo test --manifest-path src-tauri/Cargo.toml db::schema
```

- [ ] **Step 5: Commit**

```
git add src-tauri/src/db/schema.rs
git commit -m "feat(db): add pipeline_stages table + primary_deal_id, lead_score, outcome columns to schema"
```

---

### Task 2: db/pipeline_stage.rs — CRUD + seed_defaults

**Files:**
- Create: `src-tauri/src/db/pipeline_stage.rs`

- [ ] **Step 1: Create the file with structs and failing tests**

Create `src-tauri/src/db/pipeline_stage.rs`:

```rust
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::AppError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
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

fn map_stage_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<PipelineStage> {
    Ok(PipelineStage {
        id:           r.get(0)?,
        workspace_id: r.get(1)?,
        name:         r.get(2)?,
        label:        r.get(3)?,
        order_index:  r.get(4)?,
        color:        r.get(5)?,
        is_won:       r.get::<_, i32>(6)? != 0,
        is_lost:      r.get::<_, i32>(7)? != 0,
        created_at:   r.get(8)?,
    })
}

pub fn get_all(conn: &Connection, workspace_id: &str) -> Result<Vec<PipelineStage>, AppError> {
    todo!()
}

pub fn upsert(conn: &Connection, payload: UpsertPipelineStagePayload) -> Result<PipelineStage, AppError> {
    todo!()
}

pub fn delete(conn: &Connection, id: &str, workspace_id: &str) -> Result<(), AppError> {
    todo!()
}

pub fn reorder(conn: &Connection, workspace_id: &str, ordered_ids: &[String]) -> Result<(), AppError> {
    todo!()
}

pub fn seed_defaults(conn: &Connection, workspace_id: &str) -> Result<(), AppError> {
    todo!()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{schema, migrations};

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        schema::create_tables(&conn).unwrap();
        migrations::run(&conn).unwrap();
        conn
    }

    #[test]
    fn seed_defaults_creates_10_stages() {
        let conn = setup();
        seed_defaults(&conn, "ws-1").unwrap();
        let stages = get_all(&conn, "ws-1").unwrap();
        assert_eq!(stages.len(), 10);
        assert!(stages.iter().any(|s| s.name == "lead"));
        assert!(stages.iter().any(|s| s.name == "won" && s.is_won));
        assert!(stages.iter().any(|s| s.name == "lost" && s.is_lost));
    }

    #[test]
    fn seed_defaults_is_idempotent() {
        let conn = setup();
        seed_defaults(&conn, "ws-1").unwrap();
        seed_defaults(&conn, "ws-1").unwrap();
        let stages = get_all(&conn, "ws-1").unwrap();
        assert_eq!(stages.len(), 10);
    }

    #[test]
    fn upsert_creates_new_stage() {
        let conn = setup();
        let stage = upsert(&conn, UpsertPipelineStagePayload {
            id: None,
            workspace_id: "ws-1".into(),
            name: "custom".into(),
            label: "Custom Phase".into(),
            order_index: Some(99),
            color: Some("#FF0000".into()),
            is_won: None,
            is_lost: None,
        }).unwrap();
        assert_eq!(stage.name, "custom");
        assert_eq!(stage.label, "Custom Phase");
        assert_eq!(stage.order_index, 99);
        assert!(!stage.is_won);
    }

    #[test]
    fn upsert_updates_existing_stage() {
        let conn = setup();
        let created = upsert(&conn, UpsertPipelineStagePayload {
            id: None, workspace_id: "ws-1".into(),
            name: "custom".into(), label: "Old".into(),
            order_index: None, color: None, is_won: None, is_lost: None,
        }).unwrap();
        let updated = upsert(&conn, UpsertPipelineStagePayload {
            id: Some(created.id.clone()), workspace_id: "ws-1".into(),
            name: "custom".into(), label: "New".into(),
            order_index: None, color: None, is_won: None, is_lost: None,
        }).unwrap();
        assert_eq!(updated.id, created.id);
        assert_eq!(updated.label, "New");
    }

    #[test]
    fn delete_removes_stage_not_in_use() {
        let conn = setup();
        let stage = upsert(&conn, UpsertPipelineStagePayload {
            id: None, workspace_id: "ws-1".into(),
            name: "temp".into(), label: "Temp".into(),
            order_index: None, color: None, is_won: None, is_lost: None,
        }).unwrap();
        delete(&conn, &stage.id, "ws-1").unwrap();
        let stages = get_all(&conn, "ws-1").unwrap();
        assert!(stages.iter().all(|s| s.id != stage.id));
    }

    #[test]
    fn delete_blocks_stage_in_use() {
        let conn = setup();
        seed_defaults(&conn, "ws-1").unwrap();
        // Insert an account and a deal using 'lead' stage
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, created_at, updated_at)
             VALUES ('a1','ws-1','u-1','Test','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO deals (id, workspace_id, created_by, account_id, title, stage, created_at, updated_at)
             VALUES ('d1','ws-1','u-1','a1','Deal','lead','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')",
            [],
        ).unwrap();
        let lead_stage = get_all(&conn, "ws-1").unwrap()
            .into_iter().find(|s| s.name == "lead").unwrap();
        let result = delete(&conn, &lead_stage.id, "ws-1");
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), AppError::Validation(_)));
    }

    #[test]
    fn reorder_updates_order_index() {
        let conn = setup();
        seed_defaults(&conn, "ws-1").unwrap();
        let stages = get_all(&conn, "ws-1").unwrap();
        // Reverse order
        let reversed_ids: Vec<String> = stages.iter().rev().map(|s| s.id.clone()).collect();
        reorder(&conn, "ws-1", &reversed_ids).unwrap();
        let reordered = get_all(&conn, "ws-1").unwrap();
        // First stage after reorder should have been last before
        assert_eq!(reordered[0].id, stages.last().unwrap().id);
    }

    #[test]
    fn get_all_returns_stages_for_workspace_only() {
        let conn = setup();
        seed_defaults(&conn, "ws-1").unwrap();
        seed_defaults(&conn, "ws-2").unwrap();
        let ws1_stages = get_all(&conn, "ws-1").unwrap();
        let ws2_stages = get_all(&conn, "ws-2").unwrap();
        assert_eq!(ws1_stages.len(), 10);
        assert_eq!(ws2_stages.len(), 10);
        assert_ne!(ws1_stages[0].id, ws2_stages[0].id);
    }
}
```

- [ ] **Step 2: Run — expect FAIL (todo! panics)**

```
cargo test --manifest-path src-tauri/Cargo.toml db::pipeline_stage
```

Expected: FAIL with "not yet implemented"

- [ ] **Step 3: Implement all functions**

Replace the `todo!()` stubs in `src-tauri/src/db/pipeline_stage.rs`:

```rust
pub fn get_all(conn: &Connection, workspace_id: &str) -> Result<Vec<PipelineStage>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, name, label, order_index, color, is_won, is_lost, created_at
         FROM pipeline_stages WHERE workspace_id = ?1 ORDER BY order_index ASC"
    )?;
    let rows = stmt.query_map([workspace_id], map_stage_row)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn upsert(conn: &Connection, payload: UpsertPipelineStagePayload) -> Result<PipelineStage, AppError> {
    let id = payload.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO pipeline_stages
         (id, workspace_id, name, label, order_index, color, is_won, is_lost, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name, label=excluded.label,
           order_index=excluded.order_index, color=excluded.color,
           is_won=excluded.is_won, is_lost=excluded.is_lost",
        rusqlite::params![
            id, payload.workspace_id, payload.name, payload.label,
            payload.order_index.unwrap_or(0),
            payload.color.unwrap_or_else(|| "#6B7280".to_string()),
            payload.is_won.unwrap_or(false) as i32,
            payload.is_lost.unwrap_or(false) as i32,
            now,
        ],
    )?;
    conn.query_row(
        "SELECT id, workspace_id, name, label, order_index, color, is_won, is_lost, created_at
         FROM pipeline_stages WHERE id = ?1",
        [&id], map_stage_row,
    ).map_err(AppError::from)
}

pub fn delete(conn: &Connection, id: &str, workspace_id: &str) -> Result<(), AppError> {
    let exists: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pipeline_stages WHERE id = ?1 AND workspace_id = ?2",
        rusqlite::params![id, workspace_id],
        |r| r.get(0),
    )?;
    if exists == 0 {
        return Err(AppError::NotFound(format!("Stage {id} not found")));
    }
    let name: String = conn.query_row(
        "SELECT name FROM pipeline_stages WHERE id = ?1",
        [id], |r| r.get(0),
    )?;
    let in_use: i64 = conn.query_row(
        "SELECT COUNT(*) FROM deals WHERE stage = ?1",
        [&name], |r| r.get(0),
    )?;
    if in_use > 0 {
        return Err(AppError::Validation(format!(
            "Stage '{name}' is used by {in_use} deal(s) — reassign deals before deleting"
        )));
    }
    conn.execute(
        "DELETE FROM pipeline_stages WHERE id = ?1 AND workspace_id = ?2",
        rusqlite::params![id, workspace_id],
    )?;
    Ok(())
}

pub fn reorder(conn: &Connection, workspace_id: &str, ordered_ids: &[String]) -> Result<(), AppError> {
    for (idx, id) in ordered_ids.iter().enumerate() {
        conn.execute(
            "UPDATE pipeline_stages SET order_index = ?1
             WHERE id = ?2 AND workspace_id = ?3",
            rusqlite::params![idx as i32, id, workspace_id],
        )?;
    }
    Ok(())
}

pub fn seed_defaults(conn: &Connection, workspace_id: &str) -> Result<(), AppError> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pipeline_stages WHERE workspace_id = ?1",
        [workspace_id], |r| r.get(0),
    )?;
    if count > 0 { return Ok(()); }
    let defaults: &[(&str, &str, &str, bool, bool)] = &[
        ("lead",           "Lead",                "#6B7280", false, false),
        ("qualified",      "Qualifiziert",        "#3B82F6", false, false),
        ("call_1_planned", "Call 1 geplant",      "#8B5CF6", false, false),
        ("call_1_done",    "Call 1 durchgeführt", "#F59E0B", false, false),
        ("follow_up",      "Follow-Up Phase",     "#F97316", false, false),
        ("call_2",         "Call 2 / Vertiefung", "#EF4444", false, false),
        ("proposal_sent",  "Angebot gesendet",    "#06B6D4", false, false),
        ("closing",        "Closing-Phase",       "#10B981", false, false),
        ("won",            "Won",                 "#22C55E", true,  false),
        ("lost",           "Lost",                "#6B7280", false, true),
    ];
    let now = chrono::Utc::now().to_rfc3339();
    for (idx, (name, label, color, is_won, is_lost)) in defaults.iter().enumerate() {
        let id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT OR IGNORE INTO pipeline_stages
             (id, workspace_id, name, label, order_index, color, is_won, is_lost, created_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
            rusqlite::params![
                id, workspace_id, name, label, idx as i32,
                color, *is_won as i32, *is_lost as i32, now,
            ],
        )?;
    }
    Ok(())
}
```

- [ ] **Step 4: Run — expect PASS**

```
cargo test --manifest-path src-tauri/Cargo.toml db::pipeline_stage
```

- [ ] **Step 5: Commit**

```
git add src-tauri/src/db/pipeline_stage.rs
git commit -m "feat(db): pipeline_stage CRUD — get_all, upsert, delete, reorder, seed_defaults"
```

---

### Task 3: migrations.rs — Add v6

**Files:**
- Modify: `src-tauri/src/db/migrations.rs`

- [ ] **Step 1: Register module in db/mod.rs first**

Add to `src-tauri/src/db/mod.rs`:

```rust
pub mod pipeline_stage;
```

Run to confirm it compiles:
```
cargo check --manifest-path src-tauri/Cargo.toml
```

- [ ] **Step 2: Write the failing migration test**

Add inside `#[cfg(test)]` at the bottom of `src-tauri/src/db/migrations.rs`:

```rust
#[test]
fn migration_v6_adds_backbone_columns() {
    let conn = in_memory_db();
    run(&conn).unwrap();
    let acc_cols: Vec<String> = conn.prepare("PRAGMA table_info(accounts)").unwrap()
        .query_map([], |r| r.get(1)).unwrap()
        .filter_map(|r| r.ok()).collect();
    assert!(acc_cols.contains(&"primary_deal_id".to_string()));
    assert!(acc_cols.contains(&"lead_score".to_string()));
    let act_cols: Vec<String> = conn.prepare("PRAGMA table_info(activities)").unwrap()
        .query_map([], |r| r.get(1)).unwrap()
        .filter_map(|r| r.ok()).collect();
    assert!(act_cols.contains(&"outcome".to_string()));
    assert!(table_exists(&conn, "pipeline_stages"));
}

#[test]
fn migration_v6_seeds_defaults_for_existing_workspace() {
    let conn = in_memory_db();
    // Insert an account with a workspace so seed runs during migration
    conn.execute(
        "INSERT INTO accounts (id, workspace_id, created_by, name, created_at, updated_at)
         VALUES ('a1','ws-test','u-1','Test','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')",
        [],
    ).unwrap();
    run(&conn).unwrap();
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pipeline_stages WHERE workspace_id = 'ws-test'",
        [], |r| r.get(0),
    ).unwrap();
    assert_eq!(count, 10);
}
```

- [ ] **Step 3: Run — expect FAIL**

```
cargo test --manifest-path src-tauri/Cargo.toml migrations::tests::migration_v6
```

Expected: FAIL — columns not found (v6 doesn't exist yet)

- [ ] **Step 4: Implement v6 in migrations.rs**

Change `CURRENT_VERSION` from `5` to `6`:

```rust
const CURRENT_VERSION: u32 = 6;
```

Add the `6 =>` arm to the `match version` in `fn apply`:

```rust
6 => {
    if !column_exists(conn, "accounts", "primary_deal_id") {
        conn.execute_batch(
            "ALTER TABLE accounts ADD COLUMN primary_deal_id TEXT;
             ALTER TABLE accounts ADD COLUMN lead_score REAL NOT NULL DEFAULT 0;"
        )?;
    }
    if !column_exists(conn, "activities", "outcome") {
        conn.execute_batch("ALTER TABLE activities ADD COLUMN outcome TEXT;")?;
    }
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS pipeline_stages (
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
            ON pipeline_stages(workspace_id, order_index);"
    )?;
    // Seed defaults for every existing workspace
    let workspace_ids: Vec<String> = conn
        .prepare("SELECT DISTINCT workspace_id FROM accounts WHERE workspace_id != ''")?
        .query_map([], |r| r.get(0))?
        .filter_map(|r| r.ok())
        .collect();
    for ws_id in &workspace_ids {
        crate::db::pipeline_stage::seed_defaults(conn, ws_id)?;
    }
    Ok(())
}
```

- [ ] **Step 5: Run — expect PASS**

```
cargo test --manifest-path src-tauri/Cargo.toml migrations
```

- [ ] **Step 6: Commit**

```
git add src-tauri/src/db/migrations.rs src-tauri/src/db/mod.rs
git commit -m "feat(db): migration v6 — pipeline_stages, primary_deal_id, lead_score, outcome"
```

---

### Task 4: db/account.rs — Extend struct + CTE pipeline_phase query + set_primary_deal

**Files:**
- Modify: `src-tauri/src/db/account.rs`

- [ ] **Step 1: Write the failing tests**

Add to the existing `#[cfg(test)] mod tests` in `src-tauri/src/db/account.rs`:

```rust
fn seed_stages(conn: &Connection) {
    crate::db::pipeline_stage::seed_defaults(conn, "ws-1").unwrap();
}

fn seed_deal(conn: &Connection, id: &str, account_id: &str, stage: &str) {
    conn.execute(
        "INSERT INTO deals (id, workspace_id, created_by, account_id, title, stage, created_at, updated_at)
         VALUES (?1,'ws-1','u-1',?2,'Deal',?3,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')",
        rusqlite::params![id, account_id, stage],
    ).unwrap();
}

#[test]
fn get_all_pipeline_phase_from_primary_deal() {
    let conn = setup();
    seed_stages(&conn);
    let acc = upsert(&conn, UpsertAccountPayload {
        id: None, workspace_id: "ws-1".into(), created_by: "u-1".into(),
        name: "Phase Test".into(), kind: None, industry: None, website: None,
        status: None, priority: None, tags: None, goals: None,
        internal_notes: None, social_links: None,
    }).unwrap();
    seed_deal(&conn, "d1", &acc.id, "qualified");
    set_primary_deal(&conn, &acc.id, Some("d1")).unwrap();
    let accounts = get_all(&conn, "ws-1").unwrap();
    let a = accounts.iter().find(|a| a.id == acc.id).unwrap();
    assert_eq!(a.pipeline_phase.as_deref(), Some("qualified"));
    assert_eq!(a.pipeline_phase_label.as_deref(), Some("Qualifiziert"));
    assert_eq!(a.primary_deal_id.as_deref(), Some("d1"));
}

#[test]
fn get_all_fallback_to_newest_active_deal() {
    let conn = setup();
    seed_stages(&conn);
    let acc = upsert(&conn, UpsertAccountPayload {
        id: None, workspace_id: "ws-1".into(), created_by: "u-1".into(),
        name: "Fallback Test".into(), kind: None, industry: None, website: None,
        status: None, priority: None, tags: None, goals: None,
        internal_notes: None, social_links: None,
    }).unwrap();
    // Insert older deal
    conn.execute(
        "INSERT INTO deals (id, workspace_id, created_by, account_id, title, stage, created_at, updated_at)
         VALUES ('old','ws-1','u-1',?1,'Old','lead','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')",
        [&acc.id],
    ).unwrap();
    // Insert newer deal
    conn.execute(
        "INSERT INTO deals (id, workspace_id, created_by, account_id, title, stage, created_at, updated_at)
         VALUES ('new','ws-1','u-1',?1,'New','follow_up','2026-06-01T00:00:00Z','2026-06-01T00:00:00Z')",
        [&acc.id],
    ).unwrap();
    let accounts = get_all(&conn, "ws-1").unwrap();
    let a = accounts.iter().find(|a| a.id == acc.id).unwrap();
    assert_eq!(a.pipeline_phase.as_deref(), Some("follow_up"));
}

#[test]
fn get_all_null_phase_when_no_deals() {
    let conn = setup();
    seed_stages(&conn);
    let acc = upsert(&conn, UpsertAccountPayload {
        id: None, workspace_id: "ws-1".into(), created_by: "u-1".into(),
        name: "No Deal".into(), kind: None, industry: None, website: None,
        status: None, priority: None, tags: None, goals: None,
        internal_notes: None, social_links: None,
    }).unwrap();
    let accounts = get_all(&conn, "ws-1").unwrap();
    let a = accounts.iter().find(|a| a.id == acc.id).unwrap();
    assert!(a.pipeline_phase.is_none());
}

#[test]
fn set_primary_deal_updates_account() {
    let conn = setup();
    seed_stages(&conn);
    let acc = upsert(&conn, UpsertAccountPayload {
        id: None, workspace_id: "ws-1".into(), created_by: "u-1".into(),
        name: "Set Primary".into(), kind: None, industry: None, website: None,
        status: None, priority: None, tags: None, goals: None,
        internal_notes: None, social_links: None,
    }).unwrap();
    seed_deal(&conn, "d-set", &acc.id, "proposal_sent");
    let updated = set_primary_deal(&conn, &acc.id, Some("d-set")).unwrap();
    assert_eq!(updated.primary_deal_id.as_deref(), Some("d-set"));
    assert_eq!(updated.pipeline_phase.as_deref(), Some("proposal_sent"));
}
```

- [ ] **Step 2: Run — expect FAIL**

```
cargo test --manifest-path src-tauri/Cargo.toml db::account::tests::get_all_pipeline_phase
```

Expected: FAIL — fields `pipeline_phase`, `primary_deal_id` don't exist on Account yet

- [ ] **Step 3: Update Account struct and all functions**

Replace the entire content of `src-tauri/src/db/account.rs` (keeping tests at bottom) with:

```rust
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::AppError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    pub workspace_id: String,
    pub created_by: String,
    pub name: String,
    pub kind: String,
    pub industry: Option<String>,
    pub website: Option<String>,
    pub status: String,
    pub priority: String,
    pub tags: Vec<String>,
    pub goals: Vec<String>,
    pub health_score: Option<f64>,
    pub internal_notes: Option<String>,
    pub is_private: bool,
    pub social_links: String,
    pub created_at: String,
    pub updated_at: String,
    pub primary_deal_id: Option<String>,
    pub lead_score: f64,
    pub pipeline_phase: Option<String>,
    pub pipeline_phase_label: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertAccountPayload {
    pub id: Option<String>,
    pub workspace_id: String,
    pub created_by: String,
    pub name: String,
    pub kind: Option<String>,
    pub industry: Option<String>,
    pub website: Option<String>,
    pub status: Option<String>,
    pub priority: Option<String>,
    pub tags: Option<Vec<String>>,
    pub goals: Option<Vec<String>>,
    pub internal_notes: Option<String>,
    pub social_links: Option<String>,
}

// Returns columns 0-20:
// 0 id, 1 workspace_id, 2 created_by, 3 name, 4 kind, 5 industry, 6 website,
// 7 status, 8 priority, 9 tags, 10 goals, 11 health_score, 12 internal_notes,
// 13 is_private, 14 social_links, 15 created_at, 16 updated_at,
// 17 primary_deal_id, 18 lead_score, 19 pipeline_phase, 20 pipeline_phase_label
fn map_account_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Account> {
    let tags_json: String = row.get(9)?;
    let goals_json: String = row.get(10)?;
    Ok(Account {
        id:                   row.get(0)?,
        workspace_id:         row.get(1)?,
        created_by:           row.get(2)?,
        name:                 row.get(3)?,
        kind:                 row.get(4)?,
        industry:             row.get(5)?,
        website:              row.get(6)?,
        status:               row.get(7)?,
        priority:             row.get(8)?,
        tags:                 serde_json::from_str(&tags_json).unwrap_or_default(),
        goals:                serde_json::from_str(&goals_json).unwrap_or_default(),
        health_score:         row.get(11)?,
        internal_notes:       row.get(12)?,
        is_private:           row.get::<_, i32>(13)? != 0,
        social_links:         row.get::<_, Option<String>>(14)?.unwrap_or_else(|| "{}".to_string()),
        created_at:           row.get(15)?,
        updated_at:           row.get(16)?,
        primary_deal_id:      row.get(17)?,
        lead_score:           row.get::<_, Option<f64>>(18)?.unwrap_or(0.0),
        pipeline_phase:       row.get(19)?,
        pipeline_phase_label: row.get(20)?,
    })
}

const ACCOUNT_SELECT: &str = "
    WITH effective_deal AS (
        SELECT
            a.id AS account_id,
            COALESCE(
                (SELECT d.stage FROM deals d WHERE d.id = a.primary_deal_id LIMIT 1),
                (SELECT d.stage FROM deals d
                 WHERE d.account_id = a.id
                   AND d.stage NOT IN (
                       SELECT ps2.name FROM pipeline_stages ps2
                       WHERE ps2.workspace_id = a.workspace_id
                         AND (ps2.is_won = 1 OR ps2.is_lost = 1)
                   )
                 ORDER BY d.updated_at DESC LIMIT 1)
            ) AS stage
        FROM accounts a
        WHERE {filter}
    )
    SELECT a.id, a.workspace_id, a.created_by, a.name, a.kind, a.industry, a.website,
           a.status, a.priority, a.tags, a.goals, a.health_score, a.internal_notes,
           a.is_private, a.social_links, a.created_at, a.updated_at,
           a.primary_deal_id, a.lead_score,
           ps.name  AS pipeline_phase,
           ps.label AS pipeline_phase_label
    FROM accounts a
    LEFT JOIN effective_deal ed ON ed.account_id = a.id
    LEFT JOIN pipeline_stages ps
        ON ps.workspace_id = a.workspace_id AND ps.name = ed.stage
    WHERE {filter}
";
```

Wait — using a const with {filter} placeholder in Rust is awkward. Instead, define two separate const strings or just inline the query in each function. The queries are nearly identical except for the WHERE clause. Let me use two separate functions with inlined queries instead.

Replace the `ACCOUNT_SELECT` const with the full inlined queries directly in the functions:

```rust
pub fn get_all(conn: &Connection, workspace_id: &str) -> Result<Vec<Account>, AppError> {
    let mut stmt = conn.prepare("
        WITH effective_deal AS (
            SELECT a.id AS account_id,
                COALESCE(
                    (SELECT d.stage FROM deals d WHERE d.id = a.primary_deal_id LIMIT 1),
                    (SELECT d.stage FROM deals d
                     WHERE d.account_id = a.id
                       AND d.stage NOT IN (
                           SELECT ps2.name FROM pipeline_stages ps2
                           WHERE ps2.workspace_id = a.workspace_id
                             AND (ps2.is_won = 1 OR ps2.is_lost = 1)
                       )
                     ORDER BY d.updated_at DESC LIMIT 1)
                ) AS stage
            FROM accounts a
            WHERE a.workspace_id = ?1 AND a.is_private = 0
        )
        SELECT a.id, a.workspace_id, a.created_by, a.name, a.kind, a.industry, a.website,
               a.status, a.priority, a.tags, a.goals, a.health_score, a.internal_notes,
               a.is_private, a.social_links, a.created_at, a.updated_at,
               a.primary_deal_id, a.lead_score,
               ps.name AS pipeline_phase, ps.label AS pipeline_phase_label
        FROM accounts a
        LEFT JOIN effective_deal ed ON ed.account_id = a.id
        LEFT JOIN pipeline_stages ps ON ps.workspace_id = a.workspace_id AND ps.name = ed.stage
        WHERE a.is_private = 0 AND a.workspace_id = ?1
        ORDER BY a.name ASC"
    )?;
    let accounts = stmt.query_map([workspace_id], map_account_row)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(accounts)
}

pub fn get_by_id(conn: &Connection, id: &str) -> Result<Account, AppError> {
    conn.query_row("
        WITH effective_deal AS (
            SELECT a.id AS account_id,
                COALESCE(
                    (SELECT d.stage FROM deals d WHERE d.id = a.primary_deal_id LIMIT 1),
                    (SELECT d.stage FROM deals d
                     WHERE d.account_id = a.id
                       AND d.stage NOT IN (
                           SELECT ps2.name FROM pipeline_stages ps2
                           WHERE ps2.workspace_id = a.workspace_id
                             AND (ps2.is_won = 1 OR ps2.is_lost = 1)
                       )
                     ORDER BY d.updated_at DESC LIMIT 1)
                ) AS stage
            FROM accounts a WHERE a.id = ?1
        )
        SELECT a.id, a.workspace_id, a.created_by, a.name, a.kind, a.industry, a.website,
               a.status, a.priority, a.tags, a.goals, a.health_score, a.internal_notes,
               a.is_private, a.social_links, a.created_at, a.updated_at,
               a.primary_deal_id, a.lead_score,
               ps.name AS pipeline_phase, ps.label AS pipeline_phase_label
        FROM accounts a
        LEFT JOIN effective_deal ed ON ed.account_id = a.id
        LEFT JOIN pipeline_stages ps ON ps.workspace_id = a.workspace_id AND ps.name = ed.stage
        WHERE a.id = ?1",
        [id], map_account_row,
    ).map_err(AppError::from)
}

pub fn upsert(conn: &Connection, payload: UpsertAccountPayload) -> Result<Account, AppError> {
    let id = payload.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let now = chrono::Utc::now().to_rfc3339();
    let tags_json = serde_json::to_string(&payload.tags.unwrap_or_default())
        .map_err(|e| AppError::Validation(e.to_string()))?;
    let goals_json = serde_json::to_string(&payload.goals.unwrap_or_default())
        .map_err(|e| AppError::Validation(e.to_string()))?;
    conn.execute(
        "INSERT INTO accounts (id, workspace_id, created_by, name, kind, industry, website,
                               status, priority, tags, goals, internal_notes,
                               pending_sync, social_links, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,1,?13,?14,?14)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name, kind=excluded.kind, industry=excluded.industry,
           website=excluded.website, status=excluded.status, priority=excluded.priority,
           tags=excluded.tags, goals=excluded.goals, internal_notes=excluded.internal_notes,
           social_links=excluded.social_links, pending_sync=1, updated_at=excluded.updated_at",
        rusqlite::params![
            id, payload.workspace_id, payload.created_by, payload.name,
            payload.kind.unwrap_or_else(|| "company".to_string()),
            payload.industry, payload.website,
            payload.status.unwrap_or_else(|| "aktiv".to_string()),
            payload.priority.unwrap_or_else(|| "normal".to_string()),
            tags_json, goals_json, payload.internal_notes,
            payload.social_links.unwrap_or_else(|| "{}".to_string()), now,
        ],
    )?;
    let account_json = serde_json::json!({
        "id": id, "name": payload.name,
        "workspace_id": payload.workspace_id, "updated_at": now,
    });
    crate::core::sync::enqueue(conn, "accounts", &id, "INSERT", account_json)?;
    get_by_id(conn, &id)
}

pub fn set_primary_deal(conn: &Connection, account_id: &str, deal_id: Option<&str>) -> Result<Account, AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    let n = conn.execute(
        "UPDATE accounts SET primary_deal_id = ?1, updated_at = ?2
         WHERE id = ?3 AND is_private = 0",
        rusqlite::params![deal_id, now, account_id],
    )?;
    if n == 0 {
        return Err(AppError::NotFound(format!("Account {account_id} not found")));
    }
    get_by_id(conn, account_id)
}

pub fn delete(conn: &Connection, id: &str, workspace_id: &str) -> Result<(), AppError> {
    crate::core::sync::enqueue(
        conn, "accounts", id, "DELETE",
        serde_json::json!({"id": id, "workspace_id": workspace_id}),
    )?;
    let affected = conn.execute(
        "DELETE FROM accounts WHERE id = ?1 AND is_private = 0 AND workspace_id = ?2",
        rusqlite::params![id, workspace_id],
    )?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("Account {id} not found")));
    }
    Ok(())
}
```

- [ ] **Step 4: Run — expect PASS**

```
cargo test --manifest-path src-tauri/Cargo.toml db::account
```

- [ ] **Step 5: Commit**

```
git add src-tauri/src/db/account.rs
git commit -m "feat(db): account — pipeline_phase CTE, get_by_id, set_primary_deal, lead_score field"
```

---

### Task 5: db/activity.rs — Add outcome field

**Files:**
- Modify: `src-tauri/src/db/activity.rs`

- [ ] **Step 1: Write failing tests**

Add to `#[cfg(test)] mod tests` in `src-tauri/src/db/activity.rs`:

```rust
#[test]
fn insert_with_outcome_stores_outcome() {
    let conn = setup();
    seed_account(&conn, "a1");
    let a = insert(&conn, CreateActivityPayload {
        workspace_id: "ws-1".into(), created_by: "u-1".into(),
        account_id: "a1".into(), contact_id: None, deal_id: None,
        activity_type: "call".into(), title: Some("Sales Call".into()),
        body: None, payload: None, status: None, due_at: None, assignee: None,
        outcome: Some("strong_interest".into()),
    }).unwrap();
    assert_eq!(a.outcome.as_deref(), Some("strong_interest"));
}

#[test]
fn update_sets_outcome() {
    let conn = setup();
    seed_account(&conn, "a1");
    let a = insert(&conn, make_payload("a1", "call")).unwrap();
    assert!(a.outcome.is_none());
    let updated = update(&conn, &a.id, UpdateActivityPayload {
        title: None, body: None, payload: None,
        status: None, due_at: None, assignee: None,
        outcome: Some("reply_received".into()),
    }).unwrap();
    assert_eq!(updated.outcome.as_deref(), Some("reply_received"));
}

#[test]
fn get_by_account_includes_outcome() {
    let conn = setup();
    seed_account(&conn, "a1");
    insert(&conn, CreateActivityPayload {
        workspace_id: "ws-1".into(), created_by: "u-1".into(),
        account_id: "a1".into(), contact_id: None, deal_id: None,
        activity_type: "meeting".into(), title: Some("Meeting".into()),
        body: None, payload: None, status: None, due_at: None, assignee: None,
        outcome: Some("deal_won".into()),
    }).unwrap();
    let activities = get_by_account(&conn, "a1").unwrap();
    assert_eq!(activities[0].outcome.as_deref(), Some("deal_won"));
}
```

- [ ] **Step 2: Run — expect FAIL**

```
cargo test --manifest-path src-tauri/Cargo.toml db::activity::tests::insert_with_outcome
```

Expected: FAIL — field `outcome` doesn't exist on Activity / CreateActivityPayload

- [ ] **Step 3: Update Activity struct, payloads, map_row, and all queries**

In `src-tauri/src/db/activity.rs`, make these changes:

Add `outcome: Option<String>` to `Activity` struct (after `assignee`):
```rust
pub struct Activity {
    // ... existing fields
    pub assignee: Option<String>,
    pub outcome: Option<String>,   // ← add this
    pub created_at: String,
    pub updated_at: String,
}
```

Add `outcome: Option<String>` to `CreateActivityPayload` (after `assignee`):
```rust
pub struct CreateActivityPayload {
    // ... existing fields
    pub assignee: Option<String>,
    pub outcome: Option<String>,   // ← add this
}
```

Add `outcome: Option<String>` to `UpdateActivityPayload` (after `assignee`):
```rust
pub struct UpdateActivityPayload {
    // ... existing fields
    pub assignee: Option<String>,
    pub outcome: Option<String>,   // ← add this
}
```

Update `map_row` — add `outcome` at column 15 (shift `created_at` to 16, `updated_at` to 17). All SELECT queries must be updated to include `outcome`:

```rust
fn map_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<Activity> {
    Ok(Activity {
        id: r.get(0)?, workspace_id: r.get(1)?, created_by: r.get(2)?,
        account_id: r.get(3)?, contact_id: r.get(4)?, deal_id: r.get(5)?,
        activity_type: r.get(6)?, title: r.get(7)?, body: r.get(8)?,
        payload: r.get::<_, Option<String>>(9)?.unwrap_or_else(|| "{}".into()),
        status: r.get(10)?, due_at: r.get(11)?, assignee: r.get(12)?,
        outcome: r.get(13)?,
        created_at: r.get(14)?, updated_at: r.get(15)?,
    })
}
```

Update every SELECT in the file to add `outcome` between `assignee` and `created_at`. There are 4 SELECT strings in `insert`, `update`, `get_by_account`, `get_by_deal`, `get_open_tasks`. Change all to:

```sql
SELECT id, workspace_id, created_by, account_id, contact_id, deal_id, type,
       title, body, payload, status, due_at, assignee, outcome, created_at, updated_at
FROM activities WHERE ...
```

Update `insert` to include `outcome` in the INSERT:

```rust
conn.execute(
    "INSERT INTO activities
     (id, workspace_id, created_by, account_id, contact_id, deal_id, type,
      title, body, payload, status, due_at, assignee, outcome, pending_sync, created_at, updated_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,1,?15,?15)",
    rusqlite::params![
        id, payload.workspace_id, payload.created_by, payload.account_id,
        payload.contact_id, payload.deal_id, payload.activity_type,
        payload.title, payload.body,
        payload.payload.unwrap_or_else(|| "{}".into()),
        payload.status.unwrap_or_else(|| "open".into()),
        payload.due_at, payload.assignee,
        payload.outcome,   // ← add
        now,
    ],
)?;
```

Update `update` to include `outcome` with COALESCE:

```rust
conn.execute(
    "UPDATE activities SET
       title = COALESCE(?1, title),
       body = COALESCE(?2, body),
       payload = COALESCE(?3, payload),
       status = COALESCE(?4, status),
       due_at = COALESCE(?5, due_at),
       assignee = COALESCE(?6, assignee),
       outcome = COALESCE(?7, outcome),
       pending_sync = 1, updated_at = ?8
     WHERE id = ?9",
    rusqlite::params![
        payload.title, payload.body, payload.payload,
        payload.status, payload.due_at, payload.assignee,
        payload.outcome,   // ← add
        now, id,
    ],
)?;
```

- [ ] **Step 4: Run — expect PASS**

```
cargo test --manifest-path src-tauri/Cargo.toml db::activity
```

- [ ] **Step 5: Run full Rust test suite**

```
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: all tests pass

- [ ] **Step 6: Commit**

```
git add src-tauri/src/db/activity.rs
git commit -m "feat(db): activity — add outcome field to struct, insert, update, all queries"
```

---

### Task 6: commands + wire-up

**Files:**
- Create: `src-tauri/src/commands/pipeline_stage.rs`
- Modify: `src-tauri/src/commands/account.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Create commands/pipeline_stage.rs**

Create `src-tauri/src/commands/pipeline_stage.rs`:

```rust
use tauri::State;
use crate::{AppError, db::{self, pipeline_stage::{PipelineStage, UpsertPipelineStagePayload}}, db::pool::DbPool};

#[tauri::command]
pub fn get_pipeline_stages(db: State<'_, DbPool>, workspace_id: String) -> Result<Vec<PipelineStage>, AppError> {
    db::pipeline_stage::get_all(&db.conn(), &workspace_id)
}

#[tauri::command]
pub fn upsert_pipeline_stage(db: State<'_, DbPool>, payload: UpsertPipelineStagePayload) -> Result<PipelineStage, AppError> {
    db::pipeline_stage::upsert(&db.conn(), payload)
}

#[tauri::command]
pub fn delete_pipeline_stage(db: State<'_, DbPool>, id: String, workspace_id: String) -> Result<(), AppError> {
    db::pipeline_stage::delete(&db.conn(), &id, &workspace_id)
}

#[tauri::command]
pub fn reorder_pipeline_stages(db: State<'_, DbPool>, workspace_id: String, ordered_ids: Vec<String>) -> Result<(), AppError> {
    db::pipeline_stage::reorder(&db.conn(), &workspace_id, &ordered_ids)
}
```

- [ ] **Step 2: Add set_primary_deal command to commands/account.rs**

Append to the end of `src-tauri/src/commands/account.rs`:

```rust
#[tauri::command]
pub fn set_primary_deal(
    db: State<'_, DbPool>,
    account_id: String,
    deal_id: Option<String>,
) -> Result<Account, AppError> {
    db::account::set_primary_deal(&db.conn(), &account_id, deal_id.as_deref())
}
```

Also add `Account` to the import at the top — the existing import already includes it via `account::{Account, UpsertAccountPayload}`, so no change needed there.

- [ ] **Step 3: Register modules in mod.rs files**

Add to `src-tauri/src/commands/mod.rs`:
```rust
pub mod pipeline_stage;
```

- [ ] **Step 4: Register commands in main.rs**

In the `tauri::generate_handler![...]` block in `src-tauri/src/main.rs`, add after `commands::account::delete_account,`:

```rust
            commands::account::set_primary_deal,
            commands::pipeline_stage::get_pipeline_stages,
            commands::pipeline_stage::upsert_pipeline_stage,
            commands::pipeline_stage::delete_pipeline_stage,
            commands::pipeline_stage::reorder_pipeline_stages,
```

- [ ] **Step 5: Verify compilation**

```
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: no errors

- [ ] **Step 6: Commit**

```
git add src-tauri/src/commands/pipeline_stage.rs src-tauri/src/commands/account.rs src-tauri/src/commands/mod.rs src-tauri/src/main.rs
git commit -m "feat(commands): pipeline_stage commands + set_primary_deal command, wire up in main.rs"
```

---

### Task 7: TypeScript types

**Files:**
- Create: `src/types/pipeline.types.ts`
- Modify: `src/types/account.types.ts`
- Modify: `src/types/activity.types.ts`

- [ ] **Step 1: Create src/types/pipeline.types.ts**

```typescript
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

- [ ] **Step 2: Update src/types/account.types.ts**

Add four fields to the `Account` interface (after `updatedAt`):

```typescript
export interface Account extends TimestampedEntity {
  // ... existing fields unchanged ...
  updatedAt: string
  // CRM Backbone additions:
  primaryDealId?: string
  leadScore: number
  pipelinePhase?: string
  pipelinePhaseLabel?: string
}
```

- [ ] **Step 3: Update src/types/activity.types.ts**

Add `ActivityOutcome` type and `outcome` field:

```typescript
export type ActivityOutcome =
  | 'strong_interest'
  | 'interest_follow_up'
  | 'proposal_requested'
  | 'deal_won'
  | 'deal_lost'
  | 'no_interest_later'
  | 'no_interest_lost'
  | 'no_show'
  | 'reply_received'
  | 'no_reply'
  | 'waiting_for_reply'
```

Add `outcome?: ActivityOutcome` to `Activity`, `CreateActivityPayload`, and `UpdateActivityPayload` interfaces.

- [ ] **Step 4: Verify TypeScript compiles**

```
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Commit**

```
git add src/types/pipeline.types.ts src/types/account.types.ts src/types/activity.types.ts
git commit -m "feat(types): PipelineStage, ActivityOutcome, extend Account + Activity types"
```

---

### Task 8: TypeScript stores

**Files:**
- Create: `src/store/pipeline.store.ts`
- Modify: `src/store/accounts.store.ts`
- Modify: `src/store/activities.store.ts`

- [ ] **Step 1: Create src/store/pipeline.store.ts**

```typescript
import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import type { PipelineStage, UpsertPipelineStagePayload } from '@/types/pipeline.types'

interface PipelineState {
  stages: PipelineStage[]
  isLoading: boolean
  load: (workspaceId: string) => Promise<void>
  upsert: (payload: UpsertPipelineStagePayload) => Promise<void>
  remove: (id: string, workspaceId: string) => Promise<void>
  reorder: (workspaceId: string, orderedIds: string[]) => Promise<void>
  activeStages: () => PipelineStage[]
  wonStage: () => PipelineStage | undefined
  lostStage: () => PipelineStage | undefined
}

export const usePipelineStore = create<PipelineState>()((set, get) => ({
  stages: [],
  isLoading: false,

  load: async (workspaceId) => {
    set({ isLoading: true })
    try {
      const stages = await invoke<PipelineStage[]>('get_pipeline_stages', { workspaceId })
      set({ stages, isLoading: false })
    } catch {
      set({ isLoading: false })
    }
  },

  upsert: async (payload) => {
    const stage = await invoke<PipelineStage>('upsert_pipeline_stage', { payload })
    set(s => {
      const idx = s.stages.findIndex(st => st.id === stage.id)
      if (idx >= 0) {
        const next = [...s.stages]
        next[idx] = stage
        return { stages: next }
      }
      return { stages: [...s.stages, stage].sort((a, b) => a.orderIndex - b.orderIndex) }
    })
  },

  remove: async (id, workspaceId) => {
    await invoke<void>('delete_pipeline_stage', { id, workspaceId })
    set(s => ({ stages: s.stages.filter(st => st.id !== id) }))
  },

  reorder: async (workspaceId, orderedIds) => {
    await invoke<void>('reorder_pipeline_stages', { workspaceId, orderedIds })
    set(s => ({
      stages: orderedIds
        .map((id, idx) => {
          const stage = s.stages.find(st => st.id === id)
          return stage ? { ...stage, orderIndex: idx } : null
        })
        .filter((s): s is PipelineStage => s !== null),
    }))
  },

  activeStages: () => get().stages.filter(s => !s.isWon && !s.isLost),
  wonStage: () => get().stages.find(s => s.isWon),
  lostStage: () => get().stages.find(s => s.isLost),
}))
```

- [ ] **Step 2: Add setPrimaryDeal to src/store/accounts.store.ts**

Add `setPrimaryDeal` to the `AccountsState` interface:

```typescript
interface AccountsState {
  // ... existing
  setPrimaryDeal: (accountId: string, dealId: string | null) => Promise<Account>
}
```

Add the implementation inside the `create` call (after `remove`):

```typescript
  setPrimaryDeal: async (accountId, dealId) => {
    const updated = await invoke<Account>('set_primary_deal', { accountId, dealId })
    set(s => ({ accounts: upsertById(s.accounts, updated) }))
    return updated
  },
```

- [ ] **Step 3: Add outcome to src/store/activities.store.ts**

The store's `create` and `update` methods already accept `CreateActivityPayload` and `UpdateActivityPayload`. Since those types now include `outcome?: ActivityOutcome`, no store code changes are needed — the types flow through automatically. Only verify the import still resolves correctly by running tsc.

- [ ] **Step 4: Verify TypeScript compiles**

```
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Run full Rust test suite one final time**

```
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: all tests pass

- [ ] **Step 6: Commit**

```
git add src/store/pipeline.store.ts src/store/accounts.store.ts src/store/activities.store.ts
git commit -m "feat(store): pipeline.store, setPrimaryDeal in accounts.store — CRM Backbone complete"
```
