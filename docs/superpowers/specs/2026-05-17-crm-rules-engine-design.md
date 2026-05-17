# CRM Rules Engine — Design Spec

**Feature:** CRM Sub-projekt B — Rules Engine
**Date:** 2026-05-17
**Branch:** feature/v2-redesign
**Status:** Approved

---

## Goal

Eine event-basierte Rules Engine die nach DB-Writes synchron feuert, `lead_score` + `score_factors` auf Accounts aktualisiert, Account-/Deal-Status setzt, und ein Hybrid-Modell bietet: fest codierte Default-Regeln als seedbare DB-Rows + spätere User-Regeln ohne Architektur-Änderung.

**Architecture:** Event Bus + Evaluator in Rust, synchron im selben Request-Kontext. Trigger: `activity_outcome` und `deal_stage_changed`. Aktionen: `update_lead_score`, `set_account_status`, `set_deal_stage`.

**Tech Stack:** Rust (rusqlite), Zustand (TypeScript), Tauri commands

---

## Datenmodell

### Neue Tabelle: `automation_rules`

```sql
CREATE TABLE IF NOT EXISTS automation_rules (
    id             TEXT PRIMARY KEY,
    workspace_id   TEXT NOT NULL,
    name           TEXT NOT NULL,
    is_system      INTEGER NOT NULL DEFAULT 0,   -- 1 = nicht löschbar
    is_active      INTEGER NOT NULL DEFAULT 1,
    trigger_type   TEXT NOT NULL,                -- 'activity_outcome' | 'deal_stage_changed'
    trigger_filter TEXT NOT NULL DEFAULT '{}',   -- JSON: {"outcome":"strong_interest"}
    action_type    TEXT NOT NULL,                -- 'update_lead_score' | 'set_account_status' | 'set_deal_stage'
    action_params  TEXT NOT NULL DEFAULT '{}',   -- JSON: {"delta":25,"factor":"strong_interest"}
    order_index    INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_automation_rules_workspace
    ON automation_rules(workspace_id, is_active, trigger_type);
```

### Änderung an `accounts`

Neues Feld via Migration v7:

```sql
ALTER TABLE accounts ADD COLUMN score_factors TEXT NOT NULL DEFAULT '{}';
```

`score_factors` ist ein JSON-Objekt mit akkumulierten Score-Beiträgen pro Faktor:

```json
{ "strong_interest": 25, "reply_received": 10, "deal_won": 40 }
```

`lead_score` = `clamp(sum(score_factors.values()), 0, 100)`. Jedes Mal wenn eine Scoring-Regel für Faktor X feuert, wird `score_factors[X]` um `delta` erhöht/verringert. Der Score ist dadurch immer transparent und erklärbar.

---

## Rust Backend

### Modul-Struktur

```
src-tauri/src/
  engine/
    mod.rs          -- pub fn evaluate(conn: &Connection, event: CrmEvent) -> Result<(), AppError>
    rules.rs        -- Evaluierungs-Logik: laden, filtern, dispatchen
  db/
    automation_rule.rs  -- CRUD für automation_rules
```

### Event-Typen (`engine/mod.rs`)

```rust
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
```

### Evaluierungs-Flow

`engine::evaluate(conn, event)` wird nach jedem relevanten DB-Write synchron aufgerufen:

1. Lade alle `is_active = 1` Regeln für `workspace_id` aus `automation_rules`
2. Filtere nach `trigger_type` passend zum Event-Typ
3. Prüfe für jede Regel: matcht `trigger_filter` JSON auf das Event?
   - `activity_outcome`: `trigger_filter.outcome == event.outcome`
   - `deal_stage_changed`: `trigger_filter.to_stage == event.to_stage`
4. Führe `action_type` aus:
   - `update_lead_score`: `score_factors[factor] = score_factors.get(factor).unwrap_or(0) + delta` (Key wird auf 0 initialisiert wenn nicht vorhanden), dann `lead_score = clamp(sum(all values), 0, 100)`
   - `set_account_status`: `UPDATE accounts SET status = ?`
   - `set_deal_stage`: `UPDATE deals SET stage = ?`
5. Kein Thread, kein Timer — alles synchron in der gleichen Connection

### `db/automation_rule.rs`

```rust
pub struct AutomationRule {
    pub id: String,
    pub workspace_id: String,
    pub name: String,
    pub is_system: bool,
    pub is_active: bool,
    pub trigger_type: String,
    pub trigger_filter: String,  // raw JSON
    pub action_type: String,
    pub action_params: String,   // raw JSON
    pub order_index: i32,
    pub created_at: String,
    pub updated_at: String,
}

pub fn get_all(conn: &Connection, workspace_id: &str) -> Result<Vec<AutomationRule>, AppError>
pub fn set_active(conn: &Connection, id: &str, workspace_id: &str, active: bool) -> Result<(), AppError>
pub fn seed_defaults(conn: &Connection, workspace_id: &str) -> Result<(), AppError>
// Kein delete für is_system=1 Regeln
```

`seed_defaults` ist idempotent: prüft `SELECT COUNT(*) FROM automation_rules WHERE workspace_id=? AND is_system=1` vor dem Insert.

### Tauri Commands (`commands/automation_rule.rs`)

```rust
#[tauri::command] cmd_get_automation_rules(workspace_id: String) -> Result<Vec<AutomationRule>>
#[tauri::command] cmd_set_rule_active(id: String, workspace_id: String, is_active: bool) -> Result<()>
```

### Integration in bestehende Commands

**`commands/activity.rs`** — nach `cmd_create_activity` und `cmd_update_activity`:
```rust
if let Some(outcome) = &activity.outcome {
    engine::evaluate(conn, CrmEvent::ActivityOutcome {
        account_id: activity.account_id.clone(),
        workspace_id: activity.workspace_id.clone(),
        outcome: outcome.clone(),
    })?;
}
```

**`commands/deal.rs`** — nach `cmd_upsert_deal` wenn Stage sich geändert hat:
```rust
if old_stage != new_stage {
    engine::evaluate(conn, CrmEvent::DealStageChanged {
        account_id: deal.account_id.clone(),
        workspace_id: deal.workspace_id.clone(),
        deal_id: deal.id.clone(),
        from_stage: Some(old_stage),
        to_stage: new_stage,
    })?;
}
```

---

## Default-Regeln (Seeding in Migration v7)

### Trigger: `activity_outcome`

| Name | Outcome | Action | Params |
|------|---------|--------|--------|
| Score: Strong Interest | `strong_interest` | `update_lead_score` | `{"delta":25,"factor":"strong_interest"}` |
| Score: Interest Follow-Up | `interest_follow_up` | `update_lead_score` | `{"delta":15,"factor":"interest_follow_up"}` |
| Score: Proposal Requested | `proposal_requested` | `update_lead_score` | `{"delta":30,"factor":"proposal_requested"}` |
| Score: Deal Won | `deal_won` | `update_lead_score` | `{"delta":50,"factor":"deal_won"}` |
| Status: Deal Won | `deal_won` | `set_account_status` | `{"status":"aktiv"}` |
| Score: Deal Lost | `deal_lost` | `update_lead_score` | `{"delta":-30,"factor":"deal_lost"}` |
| Score: No Interest Later | `no_interest_later` | `update_lead_score` | `{"delta":-10,"factor":"no_interest_later"}` |
| Score: No Interest Lost | `no_interest_lost` | `update_lead_score` | `{"delta":-25,"factor":"no_interest_lost"}` |
| Score: No Show | `no_show` | `update_lead_score` | `{"delta":-5,"factor":"no_show"}` |
| Score: Reply Received | `reply_received` | `update_lead_score` | `{"delta":10,"factor":"reply_received"}` |
| Score: No Reply | `no_reply` | `update_lead_score` | `{"delta":-5,"factor":"no_reply"}` |

### Trigger: `deal_stage_changed`

| Name | To Stage | Action | Params |
|------|----------|--------|--------|
| Score: Stage Won | `won` | `update_lead_score` | `{"delta":40,"factor":"stage_won"}` |
| Status: Stage Won | `won` | `set_account_status` | `{"status":"aktiv"}` |
| Score: Stage Lost | `lost` | `update_lead_score` | `{"delta":-20,"factor":"stage_lost"}` |
| Status: Stage Lost | `lost` | `set_account_status` | `{"status":"inaktiv"}` |

Score immer geclampet auf [0, 100].

---

## Migration v7

```rust
// v7: Rules Engine
// accounts: add score_factors
if !column_exists(conn, "accounts", "score_factors") {
    conn.execute_batch("ALTER TABLE accounts ADD COLUMN score_factors TEXT NOT NULL DEFAULT '{}';")?;
}
// automation_rules table
conn.execute_batch(r#"
    CREATE TABLE IF NOT EXISTS automation_rules ( ... );
    CREATE INDEX IF NOT EXISTS idx_automation_rules_workspace ...;
"#)?;
// Seed defaults for all existing workspaces
for ws_id in get_all_workspace_ids(conn)? {
    automation_rule::seed_defaults(conn, &ws_id)?;
}
```

---

## TypeScript

### Neue Types: `src/types/automation.types.ts`

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

### Änderung an `src/types/account.types.ts`

```ts
// Auf Account interface hinzufügen:
scoreFactors: Record<string, number>  // z.B. {"strong_interest": 25, "deal_won": 40}
```

### Neuer Store: `src/store/automation.store.ts`

```ts
interface AutomationStore {
  rules: AutomationRule[]
  isLoading: boolean
  load: (workspaceId: string) => Promise<void>
  toggle: (id: string, workspaceId: string, isActive: boolean) => Promise<void>
}
```

### Integration in bestehende Stores

Nach jeder Activity-Mutation (`create`/`update`) und Deal-Mutation (`upsert`) wird der betroffene Account via `accounts.store.ts` refreshed. Die Engine feuert synchron auf Rust-Seite — das Frontend bekommt einfach den aktualisierten Account zurück. Kein separater Event-Stream nötig.

---

## Was dieses Sub-projekt NICHT enthält

- Follow-Up-Activity automatisch erstellen — Sub-projekt C
- Sales Cockpit / Score-Breakdown UI — Sub-projekt D
- User-konfigurierbarer Rule-Builder UI — späteres Sub-projekt
- Account-Status-Änderung als Trigger — bewusst ausgelassen (ist Aktion, nicht Trigger)

---

## Testing

Jede Rust-Funktion bekommt In-Memory SQLite Tests:

- `automation_rule::seed_defaults` ist idempotent (zweimal aufrufen → gleiche Anzahl Rows)
- `engine::evaluate` mit `ActivityOutcome { outcome: "strong_interest" }` → `lead_score` erhöht sich, `score_factors` enthält Eintrag
- `engine::evaluate` mit `DealStageChanged { to_stage: "won" }` → `lead_score` steigt, Account-Status wird `aktiv`
- Score wird auf 100 geclampt wenn Summe > 100
- Score wird auf 0 geclampt wenn Summe < 0
- Deaktivierte Regel (`is_active = 0`) feuert nicht
- `set_active` für `is_system = 1` Regel funktioniert (deaktivieren erlaubt, löschen nicht)
