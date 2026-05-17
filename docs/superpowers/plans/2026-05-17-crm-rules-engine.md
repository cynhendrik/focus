# CRM Rules Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a synchronous event-based Rules Engine that fires after DB writes, updates `lead_score` + `score_factors` on Accounts, sets Account/Deal status, and ships with 15 seeded default rules configurable per workspace.

**Architecture:** `engine/` module in Rust receives `CrmEvent` values (ActivityOutcome, DealStageChanged), loads active `automation_rules` rows for the workspace, evaluates trigger_filter conditions, and dispatches actions (score delta, status change) — all synchronous in the same request context. Hybrid model: system rules are seeded DB rows, user rules added later without architecture change.

**Tech Stack:** Rust (rusqlite, serde_json, chrono, uuid), TypeScript (Zustand, Tauri invoke)

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src-tauri/src/db/schema.rs` | Modify | Add `automation_rules` table definition |
| `src-tauri/src/db/automation_rule.rs` | Create | AutomationRule struct, CRUD, seed_defaults |
| `src-tauri/src/db/mod.rs` | Modify | Expose `pub mod automation_rule` |
| `src-tauri/src/db/account.rs` | Modify | Add `score_factors` field to Account + SELECT + map_account_row |
| `src-tauri/src/db/migrations.rs` | Modify | v7: score_factors column + automation_rules table + seed |
| `src-tauri/src/engine/mod.rs` | Create | `CrmEvent` enum + `evaluate()` entry point |
| `src-tauri/src/engine/rules.rs` | Create | Rule loading, condition matching, action dispatch |
| `src-tauri/src/main.rs` | Modify | `mod engine;` + register new commands |
| `src-tauri/src/commands/automation_rule.rs` | Create | `cmd_get_automation_rules`, `cmd_set_rule_active` |
| `src-tauri/src/commands/mod.rs` | Modify | `pub mod automation_rule` |
| `src-tauri/src/commands/activity.rs` | Modify | Call engine after create/update when outcome is set |
| `src-tauri/src/commands/deal.rs` | Modify | Call engine after `update_deal_stage` |
| `src/types/automation.types.ts` | Create | `AutomationRule` TypeScript interface |
| `src/types/account.types.ts` | Modify | Add `scoreFactors: Record<string, number>` to Account |
| `src/store/automation.store.ts` | Create | `useAutomationStore` Zustand store |
| `src/store/activities.store.ts` | Modify | Refresh accounts after create/update with outcome |
| `src/store/deals.store.ts` | Modify | Refresh accounts after stage change |

---

## Task 1: `automation_rules` DB layer

**Files:**
- Modify: `src-tauri/src/db/schema.rs`
- Create: `src-tauri/src/db/automation_rule.rs`
- Modify: `src-tauri/src/db/mod.rs`

- [ ] **Step 1: Write the failing test**

In `src-tauri/src/db/automation_rule.rs`, create the file and add the test module first:

```rust
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::AppError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AutomationRule {
    pub id: String,
    pub workspace_id: String,
    pub name: String,
    pub is_system: bool,
    pub is_active: bool,
    pub trigger_type: String,
    pub trigger_filter: String,
    pub action_type: String,
    pub action_params: String,
    pub order_index: i32,
    pub created_at: String,
    pub updated_at: String,
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
    fn seed_defaults_is_idempotent() {
        let conn = setup();
        seed_defaults(&conn, "ws-1").unwrap();
        seed_defaults(&conn, "ws-1").unwrap();
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM automation_rules WHERE workspace_id = 'ws-1' AND is_system = 1",
            [], |r| r.get(0),
        ).unwrap();
        assert_eq!(count, 15);
    }

    #[test]
    fn get_active_returns_only_active_rules_for_trigger_type() {
        let conn = setup();
        seed_defaults(&conn, "ws-1").unwrap();
        let rules = get_active(&conn, "ws-1", "activity_outcome").unwrap();
        assert!(!rules.is_empty());
        assert!(rules.iter().all(|r| r.is_active && r.trigger_type == "activity_outcome"));
    }

    #[test]
    fn set_active_disables_rule() {
        let conn = setup();
        seed_defaults(&conn, "ws-1").unwrap();
        let all = get_all(&conn, "ws-1").unwrap();
        let first_id = all[0].id.clone();
        set_active(&conn, &first_id, "ws-1", false).unwrap();
        let updated = get_all(&conn, "ws-1").unwrap();
        let rule = updated.iter().find(|r| r.id == first_id).unwrap();
        assert!(!rule.is_active);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```
cd src-tauri && cargo test db::automation_rule::tests
```

Expected: FAIL — functions and table don't exist yet.

- [ ] **Step 3: Add `automation_rules` table to schema**

In `src-tauri/src/db/schema.rs`, add before the closing `"#)?;` of `create_tables`:

```rust
        CREATE TABLE IF NOT EXISTS automation_rules (
            id             TEXT PRIMARY KEY,
            workspace_id   TEXT NOT NULL,
            name           TEXT NOT NULL,
            is_system      INTEGER NOT NULL DEFAULT 0,
            is_active      INTEGER NOT NULL DEFAULT 1,
            trigger_type   TEXT NOT NULL,
            trigger_filter TEXT NOT NULL DEFAULT '{}',
            action_type    TEXT NOT NULL,
            action_params  TEXT NOT NULL DEFAULT '{}',
            order_index    INTEGER NOT NULL DEFAULT 0,
            created_at     TEXT NOT NULL,
            updated_at     TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_automation_rules_workspace
            ON automation_rules(workspace_id, is_active, trigger_type);
```

The full INSERT block in `create_tables` already ends with `INSERT OR IGNORE INTO time_planning ...` before the `"#)?;`. Add the automation_rules table before that closing `"#)?;`.

- [ ] **Step 4: Implement functions in `automation_rule.rs`**

Add the following after the `AutomationRule` struct definition:

```rust
fn map_row(row: &rusqlite::Row) -> rusqlite::Result<AutomationRule> {
    Ok(AutomationRule {
        id:             row.get(0)?,
        workspace_id:   row.get(1)?,
        name:           row.get(2)?,
        is_system:      row.get::<_, i32>(3)? != 0,
        is_active:      row.get::<_, i32>(4)? != 0,
        trigger_type:   row.get(5)?,
        trigger_filter: row.get(6)?,
        action_type:    row.get(7)?,
        action_params:  row.get(8)?,
        order_index:    row.get(9)?,
        created_at:     row.get(10)?,
        updated_at:     row.get(11)?,
    })
}

const SELECT_COLS: &str =
    "id, workspace_id, name, is_system, is_active, trigger_type, trigger_filter,
     action_type, action_params, order_index, created_at, updated_at";

pub fn get_all(conn: &Connection, workspace_id: &str) -> Result<Vec<AutomationRule>, AppError> {
    let sql = format!(
        "SELECT {SELECT_COLS} FROM automation_rules WHERE workspace_id = ?1 ORDER BY order_index ASC"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([workspace_id], map_row)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn get_active(
    conn: &Connection,
    workspace_id: &str,
    trigger_type: &str,
) -> Result<Vec<AutomationRule>, AppError> {
    let sql = format!(
        "SELECT {SELECT_COLS} FROM automation_rules
         WHERE workspace_id = ?1 AND is_active = 1 AND trigger_type = ?2
         ORDER BY order_index ASC"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt
        .query_map(rusqlite::params![workspace_id, trigger_type], map_row)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn set_active(
    conn: &Connection,
    id: &str,
    workspace_id: &str,
    active: bool,
) -> Result<(), AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE automation_rules SET is_active = ?1, updated_at = ?2 WHERE id = ?3 AND workspace_id = ?4",
        rusqlite::params![active as i32, now, id, workspace_id],
    )?;
    Ok(())
}

pub fn seed_defaults(conn: &Connection, workspace_id: &str) -> Result<(), AppError> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM automation_rules WHERE workspace_id = ?1 AND is_system = 1",
        [workspace_id],
        |r| r.get(0),
    )?;
    if count > 0 {
        return Ok(());
    }

    let now = chrono::Utc::now().to_rfc3339();

    #[rustfmt::skip]
    let rules: &[(&str, &str, &str, &str, &str, i32)] = &[
        // (name, trigger_type, trigger_filter, action_type, action_params, order_index)
        ("Score: Strong Interest",    "activity_outcome", r#"{"outcome":"strong_interest"}"#,    "update_lead_score", r#"{"delta":25,"factor":"strong_interest"}"#,    0),
        ("Score: Interest Follow-Up", "activity_outcome", r#"{"outcome":"interest_follow_up"}"#, "update_lead_score", r#"{"delta":15,"factor":"interest_follow_up"}"#, 1),
        ("Score: Proposal Requested", "activity_outcome", r#"{"outcome":"proposal_requested"}"#, "update_lead_score", r#"{"delta":30,"factor":"proposal_requested"}"#, 2),
        ("Score: Deal Won",           "activity_outcome", r#"{"outcome":"deal_won"}"#,           "update_lead_score", r#"{"delta":50,"factor":"deal_won"}"#,           3),
        ("Status: Deal Won",          "activity_outcome", r#"{"outcome":"deal_won"}"#,           "set_account_status",r#"{"status":"aktiv"}"#,                         4),
        ("Score: Deal Lost",          "activity_outcome", r#"{"outcome":"deal_lost"}"#,          "update_lead_score", r#"{"delta":-30,"factor":"deal_lost"}"#,         5),
        ("Score: No Interest Later",  "activity_outcome", r#"{"outcome":"no_interest_later"}"#,  "update_lead_score", r#"{"delta":-10,"factor":"no_interest_later"}"#, 6),
        ("Score: No Interest Lost",   "activity_outcome", r#"{"outcome":"no_interest_lost"}"#,   "update_lead_score", r#"{"delta":-25,"factor":"no_interest_lost"}"#,  7),
        ("Score: No Show",            "activity_outcome", r#"{"outcome":"no_show"}"#,            "update_lead_score", r#"{"delta":-5,"factor":"no_show"}"#,            8),
        ("Score: Reply Received",     "activity_outcome", r#"{"outcome":"reply_received"}"#,     "update_lead_score", r#"{"delta":10,"factor":"reply_received"}"#,     9),
        ("Score: No Reply",           "activity_outcome", r#"{"outcome":"no_reply"}"#,           "update_lead_score", r#"{"delta":-5,"factor":"no_reply"}"#,           10),
        ("Score: Stage Won",          "deal_stage_changed",r#"{"to_stage":"won"}"#,              "update_lead_score", r#"{"delta":40,"factor":"stage_won"}"#,          11),
        ("Status: Stage Won",         "deal_stage_changed",r#"{"to_stage":"won"}"#,              "set_account_status",r#"{"status":"aktiv"}"#,                         12),
        ("Score: Stage Lost",         "deal_stage_changed",r#"{"to_stage":"lost"}"#,             "update_lead_score", r#"{"delta":-20,"factor":"stage_lost"}"#,        13),
        ("Status: Stage Lost",        "deal_stage_changed",r#"{"to_stage":"lost"}"#,             "set_account_status",r#"{"status":"inaktiv"}"#,                       14),
    ];

    let tx = conn.unchecked_transaction()?;
    for (name, trigger_type, trigger_filter, action_type, action_params, order_index) in rules {
        let id = uuid::Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO automation_rules
             (id, workspace_id, name, is_system, is_active, trigger_type, trigger_filter,
              action_type, action_params, order_index, created_at, updated_at)
             VALUES (?1,?2,?3,1,1,?4,?5,?6,?7,?8,?9,?9)",
            rusqlite::params![
                id, workspace_id, name,
                trigger_type, trigger_filter, action_type, action_params,
                order_index, now,
            ],
        )?;
    }
    tx.commit()?;
    Ok(())
}
```

- [ ] **Step 5: Register module in `src-tauri/src/db/mod.rs`**

Add at the end:

```rust
pub mod automation_rule;
```

- [ ] **Step 6: Run tests to verify they pass**

```
cd src-tauri && cargo test db::automation_rule::tests
```

Expected: 3 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/db/automation_rule.rs src-tauri/src/db/schema.rs src-tauri/src/db/mod.rs
git commit -m "feat(crm): automation_rule DB layer + schema"
```

---

## Task 2: `score_factors` on Account struct

**Files:**
- Modify: `src-tauri/src/db/account.rs`

The Account struct and queries need a new `score_factors` field. Currently the SELECT returns columns 0–20; adding `a.score_factors` at position 17 shifts `created_at` to 18, `updated_at` to 19, `pipeline_phase` to 20, `pipeline_phase_label` to 21.

- [ ] **Step 1: Write the failing test**

Add at the bottom of the `#[cfg(test)]` block in `src-tauri/src/db/account.rs`:

```rust
#[test]
fn upsert_returns_empty_score_factors_by_default() {
    let conn = setup();
    let acc = upsert(&conn, make_payload("acc-sf", "ws-1", "ScoreCo")).unwrap();
    assert_eq!(acc.score_factors.len(), 0);
}
```

- [ ] **Step 2: Run test to verify it fails**

```
cd src-tauri && cargo test db::account::tests::upsert_returns_empty_score_factors_by_default
```

Expected: FAIL — `score_factors` field doesn't exist on Account.

- [ ] **Step 3: Add `score_factors` to Account struct**

In `src-tauri/src/db/account.rs`, change the `Account` struct — add after `lead_score`:

```rust
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
    pub primary_deal_id: Option<String>,
    pub lead_score: f64,
    pub score_factors: std::collections::HashMap<String, f64>,
    // Computed via JOIN, never stored on Account
    pub pipeline_phase: Option<String>,
    pub pipeline_phase_label: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}
```

- [ ] **Step 4: Update `map_account_row` with new indices**

Replace the entire `map_account_row` function:

```rust
fn map_account_row(row: &rusqlite::Row) -> rusqlite::Result<Account> {
    let tags_json: String = row.get(9)?;
    let goals_json: String = row.get(10)?;
    let score_factors_json: String = row.get::<_, Option<String>>(17)?.unwrap_or_else(|| "{}".to_string());
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
        primary_deal_id:      row.get(15)?,
        lead_score:           row.get::<_, Option<f64>>(16)?.unwrap_or(0.0),
        score_factors:        serde_json::from_str(&score_factors_json).unwrap_or_default(),
        created_at:           row.get(18)?,
        updated_at:           row.get(19)?,
        pipeline_phase:       row.get(20)?,
        pipeline_phase_label: row.get(21)?,
    })
}
```

- [ ] **Step 5: Update `JOIN_QUERY_ALL` and `JOIN_QUERY_BY_ID`**

Replace both constants — add `a.score_factors` between `a.lead_score` and `a.created_at`:

```rust
const JOIN_QUERY_ALL: &str = "
SELECT
    a.id, a.workspace_id, a.created_by, a.name, a.kind, a.industry, a.website,
    a.status, a.priority, a.tags, a.goals, a.health_score, a.internal_notes,
    a.is_private, a.social_links, a.primary_deal_id, a.lead_score, a.score_factors,
    a.created_at, a.updated_at,
    ps.name   AS pipeline_phase,
    ps.label  AS pipeline_phase_label
FROM accounts a
LEFT JOIN deals d ON d.id = COALESCE(
    a.primary_deal_id,
    (SELECT d2.id FROM deals d2
     WHERE d2.account_id = a.id
       AND d2.stage NOT IN (
           SELECT name FROM pipeline_stages
           WHERE (is_won = 1 OR is_lost = 1) AND workspace_id = a.workspace_id
       )
     ORDER BY d2.updated_at DESC LIMIT 1)
)
LEFT JOIN pipeline_stages ps ON ps.name = d.stage AND ps.workspace_id = a.workspace_id
WHERE a.is_private = 0 AND a.workspace_id = ?1
ORDER BY a.name ASC";

const JOIN_QUERY_BY_ID: &str = "
SELECT
    a.id, a.workspace_id, a.created_by, a.name, a.kind, a.industry, a.website,
    a.status, a.priority, a.tags, a.goals, a.health_score, a.internal_notes,
    a.is_private, a.social_links, a.primary_deal_id, a.lead_score, a.score_factors,
    a.created_at, a.updated_at,
    ps.name   AS pipeline_phase,
    ps.label  AS pipeline_phase_label
FROM accounts a
LEFT JOIN deals d ON d.id = COALESCE(
    a.primary_deal_id,
    (SELECT d2.id FROM deals d2
     WHERE d2.account_id = a.id
       AND d2.stage NOT IN (
           SELECT name FROM pipeline_stages
           WHERE (is_won = 1 OR is_lost = 1) AND workspace_id = a.workspace_id
       )
     ORDER BY d2.updated_at DESC LIMIT 1)
)
LEFT JOIN pipeline_stages ps ON ps.name = d.stage AND ps.workspace_id = a.workspace_id
WHERE a.id = ?1";
```

- [ ] **Step 6: Run all account tests**

```
cd src-tauri && cargo test db::account::tests
```

Expected: All 9 existing tests + 1 new test PASS.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/db/account.rs
git commit -m "feat(crm): add score_factors to Account struct + SELECT queries"
```

---

## Task 3: Migration v7

**Files:**
- Modify: `src-tauri/src/db/migrations.rs`

- [ ] **Step 1: Write the failing test**

Add to `#[cfg(test)]` block in `src-tauri/src/db/migrations.rs`:

```rust
#[test]
fn migration_v7_adds_score_factors() {
    let conn = in_memory_db();
    run(&conn).unwrap();
    let cols: Vec<String> = conn.prepare("PRAGMA table_info(accounts)").unwrap()
        .query_map([], |r| r.get::<_, String>(1)).unwrap()
        .filter_map(|r| r.ok())
        .collect();
    assert!(cols.contains(&"score_factors".to_string()), "score_factors missing");
    assert!(table_exists_helper(&conn, "automation_rules"), "automation_rules missing");
}

#[test]
fn migration_v7_seeds_rules_for_workspace() {
    let conn = in_memory_db();
    let now = "2026-01-01T00:00:00Z";
    conn.execute(
        "INSERT INTO accounts (id, workspace_id, created_by, name, kind, is_private, created_at, updated_at)
         VALUES ('acc-1', 'ws-rules', '', 'Test', 'individual', 0, ?1, ?2)",
        rusqlite::params![now, now],
    ).unwrap();
    run(&conn).unwrap();
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM automation_rules WHERE workspace_id = 'ws-rules' AND is_system = 1",
        [], |r| r.get(0),
    ).unwrap();
    assert_eq!(count, 15);
}
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd src-tauri && cargo test db::migrations::tests::migration_v7
```

Expected: FAIL — CURRENT_VERSION is 6, no v7 arm.

- [ ] **Step 3: Implement v7 migration arm**

In `src-tauri/src/db/migrations.rs`:

**Change** `const CURRENT_VERSION: u32 = 6;` → `const CURRENT_VERSION: u32 = 7;`

**Add** the v7 arm inside the `match version {` block, after the v6 arm and before `_ => Ok(())`:

```rust
7 => {
    if !table_exists(conn, "accounts") { return Ok(()); }

    if !column_exists(conn, "accounts", "score_factors") {
        conn.execute_batch(
            "ALTER TABLE accounts ADD COLUMN score_factors TEXT NOT NULL DEFAULT '{}';"
        )?;
    }

    conn.execute_batch(r#"
        CREATE TABLE IF NOT EXISTS automation_rules (
            id             TEXT PRIMARY KEY,
            workspace_id   TEXT NOT NULL,
            name           TEXT NOT NULL,
            is_system      INTEGER NOT NULL DEFAULT 0,
            is_active      INTEGER NOT NULL DEFAULT 1,
            trigger_type   TEXT NOT NULL,
            trigger_filter TEXT NOT NULL DEFAULT '{}',
            action_type    TEXT NOT NULL,
            action_params  TEXT NOT NULL DEFAULT '{}',
            order_index    INTEGER NOT NULL DEFAULT 0,
            created_at     TEXT NOT NULL,
            updated_at     TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_automation_rules_workspace
            ON automation_rules(workspace_id, is_active, trigger_type);
    "#)?;

    let workspace_ids: Vec<String> = {
        let mut stmt = conn.prepare(
            "SELECT DISTINCT workspace_id FROM accounts WHERE workspace_id != ''"
        )?;
        stmt.query_map([], |r| r.get(0))?
            .collect::<Result<Vec<String>, _>>()
            .map_err(|e| AppError::Db(e.to_string()))?
    };
    for ws_id in &workspace_ids {
        crate::db::automation_rule::seed_defaults(conn, ws_id)?;
    }

    Ok(())
}
```

- [ ] **Step 4: Run all migration tests**

```
cd src-tauri && cargo test db::migrations::tests
```

Expected: All existing tests PASS + 2 new v7 tests PASS. `migration_runs_idempotently` verifies CURRENT_VERSION = 7 now.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/db/migrations.rs
git commit -m "feat(crm): migration v7 — score_factors + automation_rules table"
```

---

## Task 4: Engine module

**Files:**
- Create: `src-tauri/src/engine/mod.rs`
- Create: `src-tauri/src/engine/rules.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Write the failing test**

Create `src-tauri/src/engine/rules.rs` with only the test module first:

```rust
#[cfg(test)]
mod tests {
    use rusqlite::Connection;
    use crate::db::{schema, migrations, automation_rule};
    use super::super::{CrmEvent, evaluate};

    fn setup_with_rules(workspace_id: &str) -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        schema::create_tables(&conn).unwrap();
        migrations::run(&conn).unwrap();
        let now = "2026-01-01T00:00:00Z";
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, kind, is_private, created_at, updated_at)
             VALUES ('acc-1', ?1, '', 'Test', 'company', 0, ?2, ?3)",
            rusqlite::params![workspace_id, now, now],
        ).unwrap();
        automation_rule::seed_defaults(&conn, workspace_id).unwrap();
        conn
    }

    #[test]
    fn activity_outcome_strong_interest_increases_score() {
        let conn = setup_with_rules("ws-1");
        evaluate(&conn, CrmEvent::ActivityOutcome {
            account_id: "acc-1".to_string(),
            workspace_id: "ws-1".to_string(),
            outcome: "strong_interest".to_string(),
        }).unwrap();
        let (score, factors): (f64, String) = conn.query_row(
            "SELECT lead_score, score_factors FROM accounts WHERE id = 'acc-1'",
            [], |r| Ok((r.get(0)?, r.get(1)?)),
        ).unwrap();
        assert_eq!(score, 25.0);
        assert!(factors.contains("strong_interest"));
    }

    #[test]
    fn deal_stage_won_updates_score_and_status() {
        let conn = setup_with_rules("ws-2");
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, kind, is_private, created_at, updated_at)
             VALUES ('acc-2', 'ws-2', '', 'Test2', 'company', 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO deals (id, workspace_id, account_id, title, stage, created_at, updated_at)
             VALUES ('deal-1', 'ws-2', 'acc-2', 'Deal', 'prospect', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        ).unwrap();
        evaluate(&conn, CrmEvent::DealStageChanged {
            account_id: "acc-2".to_string(),
            workspace_id: "ws-2".to_string(),
            deal_id: "deal-1".to_string(),
            from_stage: Some("prospect".to_string()),
            to_stage: "won".to_string(),
        }).unwrap();
        let (score, status): (f64, String) = conn.query_row(
            "SELECT lead_score, status FROM accounts WHERE id = 'acc-2'",
            [], |r| Ok((r.get(0)?, r.get(1)?)),
        ).unwrap();
        assert_eq!(score, 40.0);
        assert_eq!(status, "aktiv");
    }

    #[test]
    fn score_clamps_to_100() {
        let conn = setup_with_rules("ws-3");
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, kind, is_private, lead_score, score_factors, created_at, updated_at)
             VALUES ('acc-3', 'ws-3', '', 'Test3', 'company', 0, 90.0, '{\"existing\":90}', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        ).unwrap();
        evaluate(&conn, CrmEvent::ActivityOutcome {
            account_id: "acc-3".to_string(),
            workspace_id: "ws-3".to_string(),
            outcome: "deal_won".to_string(),
        }).unwrap();
        let score: f64 = conn.query_row(
            "SELECT lead_score FROM accounts WHERE id = 'acc-3'",
            [], |r| r.get(0),
        ).unwrap();
        assert_eq!(score, 100.0);
    }

    #[test]
    fn score_clamps_to_0() {
        let conn = setup_with_rules("ws-4");
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, kind, is_private, lead_score, score_factors, created_at, updated_at)
             VALUES ('acc-4', 'ws-4', '', 'Test4', 'company', 0, 5.0, '{\"existing\":5}', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        ).unwrap();
        evaluate(&conn, CrmEvent::ActivityOutcome {
            account_id: "acc-4".to_string(),
            workspace_id: "ws-4".to_string(),
            outcome: "deal_lost".to_string(),
        }).unwrap();
        let score: f64 = conn.query_row(
            "SELECT lead_score FROM accounts WHERE id = 'acc-4'",
            [], |r| r.get(0),
        ).unwrap();
        assert_eq!(score, 0.0);
    }

    #[test]
    fn disabled_rule_does_not_fire() {
        let conn = setup_with_rules("ws-5");
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, kind, is_private, created_at, updated_at)
             VALUES ('acc-5', 'ws-5', '', 'Test5', 'company', 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        ).unwrap();
        // Disable all activity_outcome rules for ws-5
        conn.execute_batch(
            "UPDATE automation_rules SET is_active = 0 WHERE workspace_id = 'ws-5' AND trigger_type = 'activity_outcome'"
        ).unwrap();
        evaluate(&conn, CrmEvent::ActivityOutcome {
            account_id: "acc-5".to_string(),
            workspace_id: "ws-5".to_string(),
            outcome: "strong_interest".to_string(),
        }).unwrap();
        let score: f64 = conn.query_row(
            "SELECT lead_score FROM accounts WHERE id = 'acc-5'",
            [], |r| r.get(0),
        ).unwrap();
        assert_eq!(score, 0.0);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```
cd src-tauri && cargo test engine
```

Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Create `src-tauri/src/engine/mod.rs`**

```rust
pub mod rules;

use rusqlite::Connection;
use crate::AppError;

pub enum CrmEvent {
    ActivityOutcome {
        account_id:   String,
        workspace_id: String,
        outcome:      String,
    },
    DealStageChanged {
        account_id:   String,
        workspace_id: String,
        deal_id:      String,
        from_stage:   Option<String>,
        to_stage:     String,
    },
}

pub fn evaluate(conn: &Connection, event: CrmEvent) -> Result<(), AppError> {
    rules::evaluate(conn, event)
}
```

- [ ] **Step 4: Implement `src-tauri/src/engine/rules.rs`**

Add before the `#[cfg(test)]` block:

```rust
use rusqlite::Connection;
use crate::{AppError, db::automation_rule, engine::CrmEvent};

pub fn evaluate(conn: &Connection, event: CrmEvent) -> Result<(), AppError> {
    let (workspace_id, trigger_type) = match &event {
        CrmEvent::ActivityOutcome { workspace_id, .. } => (workspace_id.as_str(), "activity_outcome"),
        CrmEvent::DealStageChanged { workspace_id, .. } => (workspace_id.as_str(), "deal_stage_changed"),
    };

    let rules = automation_rule::get_active(conn, workspace_id, trigger_type)?;
    for rule in &rules {
        if matches_trigger(&rule.trigger_filter, &event) {
            execute_action(conn, &rule.action_type, &rule.action_params, &event)?;
        }
    }
    Ok(())
}

fn matches_trigger(filter_json: &str, event: &CrmEvent) -> bool {
    let Ok(filter) = serde_json::from_str::<serde_json::Value>(filter_json) else {
        return false;
    };
    match event {
        CrmEvent::ActivityOutcome { outcome, .. } => {
            filter.get("outcome").and_then(|v| v.as_str()) == Some(outcome.as_str())
        }
        CrmEvent::DealStageChanged { to_stage, .. } => {
            filter.get("to_stage").and_then(|v| v.as_str()) == Some(to_stage.as_str())
        }
    }
}

fn execute_action(
    conn: &Connection,
    action_type: &str,
    action_params: &str,
    event: &CrmEvent,
) -> Result<(), AppError> {
    let params: serde_json::Value =
        serde_json::from_str(action_params).unwrap_or(serde_json::Value::Object(Default::default()));

    let account_id = match event {
        CrmEvent::ActivityOutcome { account_id, .. } => account_id.as_str(),
        CrmEvent::DealStageChanged { account_id, .. } => account_id.as_str(),
    };

    match action_type {
        "update_lead_score" => {
            let delta = params["delta"].as_f64().unwrap_or(0.0);
            let factor = params["factor"].as_str().unwrap_or("unknown").to_string();
            update_lead_score(conn, account_id, &factor, delta)?;
        }
        "set_account_status" => {
            let status = params["status"].as_str().unwrap_or("aktiv").to_string();
            set_account_status(conn, account_id, &status)?;
        }
        "set_deal_stage" => {
            if let CrmEvent::DealStageChanged { deal_id, .. } = event {
                let stage = params["stage"].as_str().unwrap_or("").to_string();
                set_deal_stage(conn, deal_id, &stage)?;
            }
        }
        _ => {}
    }
    Ok(())
}

fn update_lead_score(
    conn: &Connection,
    account_id: &str,
    factor: &str,
    delta: f64,
) -> Result<(), AppError> {
    let current: String = conn
        .query_row(
            "SELECT COALESCE(score_factors, '{}') FROM accounts WHERE id = ?1",
            [account_id],
            |r| r.get(0),
        )
        .map_err(|e| AppError::Db(e.to_string()))?;

    let mut factors: serde_json::Map<String, serde_json::Value> =
        serde_json::from_str(&current).unwrap_or_default();

    let current_val = factors.get(factor).and_then(|v| v.as_f64()).unwrap_or(0.0);
    factors.insert(factor.to_string(), serde_json::json!(current_val + delta));

    let new_score: f64 = factors
        .values()
        .filter_map(|v| v.as_f64())
        .sum::<f64>()
        .clamp(0.0, 100.0);

    let factors_json = serde_json::to_string(&factors).unwrap_or_else(|_| "{}".to_string());
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE accounts SET score_factors = ?1, lead_score = ?2, updated_at = ?3 WHERE id = ?4",
        rusqlite::params![factors_json, new_score, now, account_id],
    )?;
    Ok(())
}

fn set_account_status(conn: &Connection, account_id: &str, status: &str) -> Result<(), AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE accounts SET status = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![status, now, account_id],
    )?;
    Ok(())
}

fn set_deal_stage(conn: &Connection, deal_id: &str, stage: &str) -> Result<(), AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE deals SET stage = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![stage, now, deal_id],
    )?;
    Ok(())
}
```

- [ ] **Step 5: Add `mod engine;` to `src-tauri/src/main.rs`**

In `src-tauri/src/main.rs`, add after the existing `mod activity_engine;` line:

```rust
mod engine;
```

- [ ] **Step 6: Run engine tests**

```
cd src-tauri && cargo test engine::rules::tests
```

Expected: 5 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/engine/mod.rs src-tauri/src/engine/rules.rs src-tauri/src/main.rs
git commit -m "feat(crm): engine module — CrmEvent + evaluate + rule dispatch"
```

---

## Task 5: Tauri commands + registration

**Files:**
- Create: `src-tauri/src/commands/automation_rule.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Create `src-tauri/src/commands/automation_rule.rs`**

```rust
use tauri::State;
use crate::{AppError, db::{self, automation_rule::AutomationRule}, db::pool::DbPool};

#[tauri::command]
pub fn cmd_get_automation_rules(
    db: State<'_, DbPool>,
    workspace_id: String,
) -> Result<Vec<AutomationRule>, AppError> {
    db::automation_rule::get_all(&db.conn(), &workspace_id)
}

#[tauri::command]
pub fn cmd_set_rule_active(
    db: State<'_, DbPool>,
    id: String,
    workspace_id: String,
    is_active: bool,
) -> Result<(), AppError> {
    db::automation_rule::set_active(&db.conn(), &id, &workspace_id, is_active)
}
```

- [ ] **Step 2: Register module in `src-tauri/src/commands/mod.rs`**

Add at the end:

```rust
pub mod automation_rule;
```

- [ ] **Step 3: Register commands in `src-tauri/src/main.rs`**

In the `invoke_handler!` macro, add after the `commands::pipeline_stage::cmd_reorder_pipeline_stages,` line:

```rust
commands::automation_rule::cmd_get_automation_rules,
commands::automation_rule::cmd_set_rule_active,
```

- [ ] **Step 4: Verify compilation**

```
cd src-tauri && cargo build
```

Expected: Compiles without errors.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/automation_rule.rs src-tauri/src/commands/mod.rs src-tauri/src/main.rs
git commit -m "feat(crm): Tauri commands for automation_rules"
```

---

## Task 6: Hook engine into activity commands

**Files:**
- Modify: `src-tauri/src/commands/activity.rs`

The `create_activity` and `update_activity` commands currently call `activity_engine::create/update` without holding a reference to the connection. We need to hold the connection to then call the engine.

- [ ] **Step 1: Rewrite `src-tauri/src/commands/activity.rs`**

Replace the entire file:

```rust
use tauri::{AppHandle, State};
use crate::{
    AppError, engine, activity_engine,
    db::{self, activity::{Activity, CreateActivityPayload, UpdateActivityPayload}},
    db::pool::DbPool,
};

#[tauri::command]
pub fn create_activity(
    db: State<'_, DbPool>,
    app: AppHandle,
    payload: CreateActivityPayload,
) -> Result<Activity, AppError> {
    let conn = db.conn();
    let activity = activity_engine::create(&*conn, &app, payload)?;
    if let Some(outcome) = &activity.outcome {
        engine::evaluate(&*conn, engine::CrmEvent::ActivityOutcome {
            account_id:   activity.account_id.clone(),
            workspace_id: activity.workspace_id.clone(),
            outcome:      outcome.clone(),
        })?;
    }
    Ok(activity)
}

#[tauri::command]
pub fn update_activity(
    db: State<'_, DbPool>,
    app: AppHandle,
    id: String,
    payload: UpdateActivityPayload,
) -> Result<Activity, AppError> {
    let conn = db.conn();
    let activity = activity_engine::update(&*conn, &app, &id, payload)?;
    if let Some(outcome) = &activity.outcome {
        engine::evaluate(&*conn, engine::CrmEvent::ActivityOutcome {
            account_id:   activity.account_id.clone(),
            workspace_id: activity.workspace_id.clone(),
            outcome:      outcome.clone(),
        })?;
    }
    Ok(activity)
}

#[tauri::command]
pub fn delete_activity(
    db: State<'_, DbPool>,
    app: AppHandle,
    id: String,
) -> Result<(), AppError> {
    activity_engine::delete(&db.conn(), &app, &id)
}

#[tauri::command]
pub fn get_activities_by_account(
    db: State<'_, DbPool>,
    account_id: String,
) -> Result<Vec<Activity>, AppError> {
    db::activity::get_by_account(&db.conn(), &account_id)
}

#[tauri::command]
pub fn get_activities_by_deal(
    db: State<'_, DbPool>,
    deal_id: String,
) -> Result<Vec<Activity>, AppError> {
    db::activity::get_by_deal(&db.conn(), &deal_id)
}

#[tauri::command]
pub fn get_open_tasks(
    db: State<'_, DbPool>,
    workspace_id: String,
) -> Result<Vec<Activity>, AppError> {
    db::activity::get_open_tasks(&db.conn(), &workspace_id)
}
```

- [ ] **Step 2: Verify compilation**

```
cd src-tauri && cargo build
```

Expected: Compiles without errors.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/commands/activity.rs
git commit -m "feat(crm): hook engine into activity create/update commands"
```

---

## Task 7: Hook engine into deal commands

**Files:**
- Modify: `src-tauri/src/commands/deal.rs`

- [ ] **Step 1: Update `update_deal_stage` in `src-tauri/src/commands/deal.rs`**

Replace only the `update_deal_stage` function:

```rust
#[tauri::command]
pub fn update_deal_stage(
    db: State<'_, DbPool>,
    app: AppHandle,
    id: String,
    stage: String,
) -> Result<Deal, AppError> {
    let conn = db.conn();
    // Read previous stage before updating
    let prev_stage: Option<String> = conn
        .query_row("SELECT stage FROM deals WHERE id = ?1", [&id], |r| r.get(0))
        .ok();
    let updated = db::deal::update_stage(&*conn, &id, &stage)?;
    // Emit stage_change activity
    let _ = crate::activity_engine::create(&*conn, &app, crate::db::activity::CreateActivityPayload {
        workspace_id: updated.workspace_id.clone(),
        created_by:   updated.created_by.clone(),
        account_id:   updated.account_id.clone(),
        contact_id:   updated.contact_id.clone(),
        deal_id:      Some(id.clone()),
        activity_type: "stage_change".into(),
        title:        Some(format!("Stage → {stage}")),
        body:         None,
        payload:      Some(serde_json::json!({"to_stage": stage}).to_string()),
        status:       Some("done".into()),
        due_at:       None,
        assignee:     None,
        outcome:      None,
    });
    // Fire rules engine
    engine::evaluate(&*conn, engine::CrmEvent::DealStageChanged {
        account_id:   updated.account_id.clone(),
        workspace_id: updated.workspace_id.clone(),
        deal_id:      id,
        from_stage:   prev_stage,
        to_stage:     stage,
    })?;
    Ok(updated)
}
```

Also add `engine` to the imports at the top of the file. The current imports line is:
```rust
use crate::{AppError, db::{self, deal::{Deal, UpsertDealPayload}}, db::pool::DbPool};
```

Replace with:
```rust
use crate::{AppError, engine, db::{self, deal::{Deal, UpsertDealPayload}}, db::pool::DbPool};
```

- [ ] **Step 2: Verify compilation**

```
cd src-tauri && cargo build
```

Expected: Compiles without errors.

- [ ] **Step 3: Run full test suite**

```
cd src-tauri && cargo test
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/deal.rs
git commit -m "feat(crm): hook engine into deal update_deal_stage command"
```

---

## Task 8: TypeScript layer

**Files:**
- Create: `src/types/automation.types.ts`
- Modify: `src/types/account.types.ts`
- Create: `src/store/automation.store.ts`
- Modify: `src/store/activities.store.ts`
- Modify: `src/store/deals.store.ts`

- [ ] **Step 1: Create `src/types/automation.types.ts`**

```ts
export type RuleTriggerType = 'activity_outcome' | 'deal_stage_changed'
export type RuleActionType = 'update_lead_score' | 'set_account_status' | 'set_deal_stage'

export interface AutomationRule {
  id: string
  workspaceId: string
  name: string
  isSystem: boolean
  isActive: boolean
  triggerType: RuleTriggerType
  triggerFilter: Record<string, string>
  actionType: RuleActionType
  actionParams: Record<string, string | number>
  orderIndex: number
  createdAt: string
  updatedAt: string
}
```

- [ ] **Step 2: Add `scoreFactors` to Account interface**

In `src/types/account.types.ts`, add `scoreFactors` to the `Account` interface after `leadScore`:

```ts
export interface Account extends TimestampedEntity {
  id: string
  workspaceId: string
  createdBy: string
  name: string
  kind: AccountKind
  industry?: string
  website?: string
  status: AccountStatus
  priority: AccountPriority
  tags: string[]
  goals: string[]
  healthScore?: number
  internalNotes?: string
  isPrivate: boolean
  socialLinks: string
  primaryDealId?: string
  leadScore: number
  scoreFactors: Record<string, number>
  pipelinePhase?: string
  pipelinePhaseLabel?: string
}
```

- [ ] **Step 3: Create `src/store/automation.store.ts`**

```ts
import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import type { AutomationRule } from '@/types/automation.types'

interface AutomationState {
  rules: AutomationRule[]
  isLoading: boolean
  load: (workspaceId: string) => Promise<void>
  toggle: (id: string, workspaceId: string, isActive: boolean) => Promise<void>
}

export const useAutomationStore = create<AutomationState>()((set) => ({
  rules: [],
  isLoading: false,

  load: async (workspaceId) => {
    set({ isLoading: true })
    try {
      const rules = await invoke<AutomationRule[]>('cmd_get_automation_rules', { workspaceId })
      set({ rules, isLoading: false })
    } catch {
      set({ isLoading: false })
    }
  },

  toggle: async (id, workspaceId, isActive) => {
    await invoke<void>('cmd_set_rule_active', { id, workspaceId, isActive })
    set(s => ({ rules: s.rules.map(r => r.id === id ? { ...r, isActive } : r) }))
  },
}))
```

- [ ] **Step 4: Update `src/store/activities.store.ts` to refresh accounts after mutations with outcome**

Replace the `create` and `update` actions:

```ts
import { useAccountsStore } from './accounts.store'

// replace the create action:
create: async (payload) => {
  const workspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? ''
  const createdBy = useAuthStore.getState().user?.id ?? ''
  const activity = await invoke<Activity>('create_activity', { payload: { ...payload, workspaceId, createdBy } })
  set(s => ({ activities: [activity, ...s.activities] }))
  if (payload.outcome) {
    await useAccountsStore.getState().init()
  }
  return activity
},

// replace the update action:
update: async (id, payload) => {
  const updated = await invoke<Activity>('update_activity', { id, payload })
  set(s => ({ activities: s.activities.map(a => a.id === id ? updated : a) }))
  if (payload.outcome) {
    await useAccountsStore.getState().init()
  }
  return updated
},
```

The full file after changes:

```ts
import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { useWorkspaceStore } from './workspace.store'
import { useAuthStore } from './auth.store'
import { useAccountsStore } from './accounts.store'
import type { Activity, CreateActivityPayload, UpdateActivityPayload } from '@/types/activity.types'

interface ActivitiesState {
  activities: Activity[]
  openTasks: Activity[]
  isLoading: boolean
  loadByAccount: (accountId: string) => Promise<void>
  loadByDeal: (dealId: string) => Promise<void>
  loadOpenTasks: () => Promise<void>
  create: (payload: Omit<CreateActivityPayload, 'workspaceId' | 'createdBy'>) => Promise<Activity>
  update: (id: string, payload: UpdateActivityPayload) => Promise<Activity>
  remove: (id: string) => Promise<void>
}

export const useActivitiesStore = create<ActivitiesState>()((set) => ({
  activities: [],
  openTasks: [],
  isLoading: false,

  loadByAccount: async (accountId) => {
    set({ isLoading: true })
    try {
      const activities = await invoke<Activity[]>('get_activities_by_account', { accountId })
      set({ activities, isLoading: false })
    } catch { set({ isLoading: false }) }
  },

  loadByDeal: async (dealId) => {
    set({ isLoading: true })
    try {
      const activities = await invoke<Activity[]>('get_activities_by_deal', { dealId })
      set({ activities, isLoading: false })
    } catch { set({ isLoading: false }) }
  },

  loadOpenTasks: async () => {
    const workspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? ''
    try {
      const openTasks = await invoke<Activity[]>('get_open_tasks', { workspaceId })
      set({ openTasks })
    } catch {}
  },

  create: async (payload) => {
    const workspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? ''
    const createdBy = useAuthStore.getState().user?.id ?? ''
    const activity = await invoke<Activity>('create_activity', { payload: { ...payload, workspaceId, createdBy } })
    set(s => ({ activities: [activity, ...s.activities] }))
    if (payload.outcome) {
      await useAccountsStore.getState().init()
    }
    return activity
  },

  update: async (id, payload) => {
    const updated = await invoke<Activity>('update_activity', { id, payload })
    set(s => ({ activities: s.activities.map(a => a.id === id ? updated : a) }))
    if (payload.outcome) {
      await useAccountsStore.getState().init()
    }
    return updated
  },

  remove: async (id) => {
    await invoke<void>('delete_activity', { id })
    set(s => ({ activities: s.activities.filter(a => a.id !== id) }))
  },
}))
```

- [ ] **Step 5: Update `src/store/deals.store.ts` to refresh accounts after stage change**

Replace the `updateStage` action:

```ts
import { useAccountsStore } from './accounts.store'

// replace the updateStage action:
updateStage: async (id, stage) => {
  const updated = await invoke<Deal>('update_deal_stage', { id, stage })
  set(s => ({ deals: s.deals.map(d => d.id === id ? updated : d) }))
  await useAccountsStore.getState().init()
  return updated
},
```

The full file after changes:

```ts
import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { useWorkspaceStore } from './workspace.store'
import { useAuthStore } from './auth.store'
import { useAccountsStore } from './accounts.store'
import type { Deal, UpsertDealPayload, DealStage } from '@/types/deal.types'

interface DealsState {
  deals: Deal[]
  isLoading: boolean
  loadByAccount: (accountId: string) => Promise<void>
  upsert: (payload: Omit<UpsertDealPayload, 'workspaceId' | 'createdBy'>) => Promise<Deal>
  updateStage: (id: string, stage: DealStage) => Promise<Deal>
  remove: (id: string) => Promise<void>
}

export const useDealsStore = create<DealsState>()((set) => ({
  deals: [],
  isLoading: false,

  loadByAccount: async (accountId) => {
    set({ isLoading: true })
    try {
      const deals = await invoke<Deal[]>('get_deals', { accountId })
      set({ deals, isLoading: false })
    } catch {
      set({ isLoading: false })
    }
  },

  upsert: async (payload) => {
    const workspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? ''
    const createdBy = useAuthStore.getState().user?.id ?? ''
    const updated = await invoke<Deal>('upsert_deal', { payload: { ...payload, workspaceId, createdBy } })
    set(s => {
      const idx = s.deals.findIndex(d => d.id === updated.id)
      if (idx >= 0) { const next = [...s.deals]; next[idx] = updated; return { deals: next } }
      return { deals: [...s.deals, updated] }
    })
    return updated
  },

  updateStage: async (id, stage) => {
    const updated = await invoke<Deal>('update_deal_stage', { id, stage })
    set(s => ({ deals: s.deals.map(d => d.id === id ? updated : d) }))
    await useAccountsStore.getState().init()
    return updated
  },

  remove: async (id) => {
    await invoke<void>('delete_deal', { id })
    set(s => ({ deals: s.deals.filter(d => d.id !== id) }))
  },
}))
```

- [ ] **Step 6: Verify TypeScript compiles**

```
npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 7: Commit**

```bash
git add src/types/automation.types.ts src/types/account.types.ts src/store/automation.store.ts src/store/activities.store.ts src/store/deals.store.ts
git commit -m "feat(crm): TypeScript types + automation store + account refresh after engine events"
```
