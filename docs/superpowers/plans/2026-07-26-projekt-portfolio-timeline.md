# Projekt-Portfolio-Timeline (Etappe 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `Project`/`ProjectPhase` with retainer- and gate-/zeitraum-fields, and replace the 3-Buckets-Übersicht with a rollierende Wochen-Timeline that shows phase bars and gate markers per active project.

**Architecture:** Additive SQLite migration (v38) mirrored by an additive Supabase migration (0027), extended Rust structs/commands, extended TS types/mapper/gateway/service/store, two new pure-logic TS modules (`timeline-weeks.ts`, `signals.ts`), and two new presentational components (`ProjectsTimeline`, `ProjectsArchiveList`) wired into a rewritten `ProjectsOverviewRoute`. `ProjectDetailRoute`'s phase-creation form gets required date/gate-name inputs and a progress-percent editor for the active phase.

**Tech Stack:** Rust + rusqlite (SQLite), Supabase Postgres (cloud path for shared workspaces), React + TypeScript, Zustand, Vitest.

## Global Constraints

- Geld wird als `f64`/`number` in Euro gespeichert, nicht Cent (bestehende `Invoice`-Konvention).
- Datumsfelder (`start_date`, `end_date`, `gate_date`) sind `YYYY-MM-DD`-Strings (keine Uhrzeit), passend zu `<input type="date">`.
- Nur `status=active`-Projekte erscheinen auf der Timeline; pausiert/abgeschlossen laufen über ein separates Archiv innerhalb derselben Route.
- Budget- und Stimmungs-Ampel sind in dieser Etappe fix `'ok'` — keine Fake-Berechnung.
- Alle neuen Rust-Payload-Felder sind so entworfen, dass bestehende Aufrufer (Tests, `NewProjectModal`) angepasst werden müssen — das ist Teil dieses Plans, keine spätere Aufräumarbeit.
- Kein neuer `AppView`-Eintrag nötig — das Archiv ist ein Umschalter innerhalb von `ProjectsOverviewRoute`, keine eigene Route.

---

## Task 1: SQLite-Migration v38 — Retainer- und Gate-Spalten

**Files:**
- Modify: `src-tauri/src/db/migrations.rs:4` (CURRENT_VERSION)
- Modify: `src-tauri/src/db/migrations.rs:840-874` (neuer `38 =>`-Arm nach dem bestehenden `37 =>`-Arm)
- Test: `src-tauri/src/db/migrations.rs` (neues `#[test]` im bestehenden `mod tests`-Block)

**Interfaces:**
- Produces: Spalten `projects.retainer_monthly REAL`, `projects.retainer_hours INTEGER`, `projects.retainer_months INTEGER`; Spalten `project_phases.start_date TEXT`, `end_date TEXT`, `gate_name TEXT`, `gate_state TEXT`, `gate_date TEXT`, `gate_approved_by TEXT`, `progress_percent INTEGER`. Alle folgenden Rust-Tasks lesen/schreiben diese Spalten per `rusqlite`.

- [ ] **Step 1: `CURRENT_VERSION` auf 38 anheben**

In `src-tauri/src/db/migrations.rs:4`:

```rust
const CURRENT_VERSION: u32 = 38;
```

- [ ] **Step 2: Migrations-Arm 38 einfügen**

Direkt vor der `_ => Ok(())`-Zeile (nach dem bestehenden `37 => { ... Ok(()) }`-Block, `src-tauri/src/db/migrations.rs:874`) einfügen:

```rust
        38 => {
            // Etappe 1 des Projekt-Ausbaus: Retainer am Projekt, Zeitraum + Gate
            // an der Phase. Additive Spalten mit Backfill fuer Bestandsdaten.
            if !column_exists(conn, "projects", "retainer_monthly") {
                conn.execute_batch(
                    "ALTER TABLE projects ADD COLUMN retainer_monthly REAL NOT NULL DEFAULT 0;
                     ALTER TABLE projects ADD COLUMN retainer_hours   INTEGER NOT NULL DEFAULT 0;
                     ALTER TABLE projects ADD COLUMN retainer_months  INTEGER;"
                )?;
            }
            if !column_exists(conn, "project_phases", "start_date") {
                conn.execute_batch(
                    "ALTER TABLE project_phases ADD COLUMN start_date        TEXT NOT NULL DEFAULT '';
                     ALTER TABLE project_phases ADD COLUMN end_date          TEXT NOT NULL DEFAULT '';
                     ALTER TABLE project_phases ADD COLUMN gate_name         TEXT NOT NULL DEFAULT 'Freigabe';
                     ALTER TABLE project_phases ADD COLUMN gate_state        TEXT NOT NULL DEFAULT 'open';
                     ALTER TABLE project_phases ADD COLUMN gate_date         TEXT;
                     ALTER TABLE project_phases ADD COLUMN gate_approved_by  TEXT;
                     ALTER TABLE project_phases ADD COLUMN progress_percent  INTEGER NOT NULL DEFAULT 0;"
                )?;
                conn.execute_batch(
                    "UPDATE project_phases
                     SET start_date = date(created_at), end_date = date(created_at, '+14 days')
                     WHERE start_date = '';"
                )?;
            }
            Ok(())
        }
```

- [ ] **Step 3: Migrationstest schreiben**

An das Ende des bestehenden `mod tests`-Blocks in `src-tauri/src/db/migrations.rs` (nach `migration_37_project_phases_cascade_delete_with_project`, vor der schließenden `}` des Moduls) einfügen:

```rust
    #[test]
    fn migration_38_adds_retainer_and_gate_columns_with_backfill() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        schema::create_tables(&conn).unwrap();

        // Bestandsdaten VOR Migration 38 anlegen, damit der Backfill-Pfad greift.
        // Migration 37 legt projects/project_phases bereits ohne die neuen Spalten an,
        // also reicht es, bis inklusive Version 37 zu laufen.
        for v in 1..=37u32 {
            apply(&conn, v).unwrap();
            set_version(&conn, v).unwrap();
        }
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, created_at, updated_at)
             VALUES ('a1','ws-1','u-1','Test','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO projects (id, workspace_id, account_id, title, status, created_at, updated_at)
             VALUES ('p1','ws-1','a1','Test-Projekt','active','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO project_phases (id, project_id, name, order_index, created_at)
             VALUES ('ph1','p1','Konzept',0,'2026-01-01T00:00:00Z')",
            [],
        ).unwrap();

        run(&conn).unwrap();

        assert!(column_exists(&conn, "projects", "retainer_monthly"));
        assert!(column_exists(&conn, "project_phases", "gate_state"));

        let (start, end, gate_state, progress): (String, String, String, i32) = conn.query_row(
            "SELECT start_date, end_date, gate_state, progress_percent FROM project_phases WHERE id = 'ph1'",
            [], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        ).unwrap();
        assert_eq!(start, "2026-01-01");
        assert_eq!(end, "2026-01-15");
        assert_eq!(gate_state, "open");
        assert_eq!(progress, 0);

        // Idempotent.
        run(&conn).unwrap();
    }

    #[test]
    fn migration_38_runs_idempotently_on_fresh_db() {
        let conn = in_memory_db();
        run(&conn).unwrap();
        run(&conn).unwrap();
        assert_eq!(get_version(&conn).unwrap(), CURRENT_VERSION);
    }
```

- [ ] **Step 4: Tests ausführen**

Run: `cd src-tauri && cargo test migration_38 -- --nocapture`
Expected: beide neuen Tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/db/migrations.rs
git commit -m "feat(db): migration v38 -- Retainer- und Gate-Spalten fuer Projekte/Phasen"
```

---

## Task 2: Supabase-Migration 0027 — Cloud-Gegenstück

**Files:**
- Create: `supabase/migrations/0027_projects_retainer_gates.sql`

**Interfaces:**
- Produces: dieselben Spalten wie Task 1, auf `public.projects` und `public.project_phases`, für den Shared-Workspace-Cloud-Pfad, den `src/data/projects.gateway.ts` bereits nutzt (`ProjectsGateway` schreibt direkt gegen Supabase, wenn `isActiveWorkspaceShared()`).

- [ ] **Step 1: Migrationsdatei schreiben**

```sql
-- Cloud-Gegenstueck zu SQLite-Migration v38 (src-tauri/src/db/migrations.rs).
-- Muss wie 0001-0026 manuell ueber die Management-API auf das Supabase-Projekt
-- angewendet werden (siehe Kommentar in 0026_projects.sql).

alter table public.projects
  add column if not exists retainer_monthly real not null default 0,
  add column if not exists retainer_hours integer not null default 0,
  add column if not exists retainer_months integer;

alter table public.project_phases
  add column if not exists start_date text not null default '',
  add column if not exists end_date text not null default '',
  add column if not exists gate_name text not null default 'Freigabe',
  add column if not exists gate_state text not null default 'open',
  add column if not exists gate_date text,
  add column if not exists gate_approved_by text,
  add column if not exists progress_percent integer not null default 0;

update public.project_phases
set start_date = (created_at::date)::text,
    end_date = (created_at::date + interval '14 days')::date::text
where start_date = '';
```

- [ ] **Step 2: Kein automatisierter Test möglich**

Diese Migration wird wie 0001–0026 manuell über die Supabase-Management-API auf Projekt `mqbjmquscjtytpjebosw` angewendet (kein lokaler Supabase-Test-Harness in diesem Repo). Nach Anwendung manuell verifizieren:

```sql
select column_name from information_schema.columns
where table_name = 'projects' and column_name like 'retainer_%';
select column_name from information_schema.columns
where table_name = 'project_phases' and column_name in ('start_date','end_date','gate_name','gate_state','gate_date','gate_approved_by','progress_percent');
```
Erwartet: jeweils alle Spaltennamen kommen zurück. Diesen Schritt im PR/Commit-Text als "manuell nachzuziehen" vermerken, analog zum Kommentarkopf von `0026_projects.sql`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0027_projects_retainer_gates.sql
git commit -m "feat(db): Supabase-Migration 0027 -- Cloud-Gegenstueck zu SQLite v38"
```

---

## Task 3: Rust `Project` — Retainer-Felder

**Files:**
- Modify: `src-tauri/src/db/project.rs`

**Interfaces:**
- Consumes: Migration v38 (Task 1) muss vor Testausführung gelaufen sein (passiert automatisch via `migrations::run` in `setup()`).
- Produces: `Project { retainer_monthly: f64, retainer_hours: i32, retainer_months: Option<i32> }`, `UpsertProjectPayload { retainer_monthly: f64, retainer_hours: i32, retainer_months: Option<i32> }` (camelCase im JSON: `retainerMonthly`, `retainerHours`, `retainerMonths`). Task 5 (Commands) reicht das unverändert durch. Task 6 (TS-Typen) spiegelt exakt diese Feldnamen.

- [ ] **Step 1: Struct + Payload erweitern**

In `src-tauri/src/db/project.rs:8-29` ersetzen:

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub workspace_id: String,
    pub account_id: String,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub current_phase_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
    pub retainer_monthly: f64,
    pub retainer_hours: i32,
    pub retainer_months: Option<i32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertProjectPayload {
    pub id: Option<String>,
    pub workspace_id: String,
    pub account_id: String,
    pub title: String,
    pub description: Option<String>,
    pub retainer_monthly: f64,
    pub retainer_hours: i32,
    pub retainer_months: Option<i32>,
}
```

- [ ] **Step 2: `map_row` und `SELECT_COLUMNS` erweitern**

In `src-tauri/src/db/project.rs:31-47` ersetzen:

```rust
fn map_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<Project> {
    Ok(Project {
        id: r.get(0)?,
        workspace_id: r.get(1)?,
        account_id: r.get(2)?,
        title: r.get(3)?,
        description: r.get(4)?,
        status: r.get(5)?,
        current_phase_id: r.get(6)?,
        created_at: r.get(7)?,
        updated_at: r.get(8)?,
        completed_at: r.get(9)?,
        retainer_monthly: r.get(10)?,
        retainer_hours: r.get(11)?,
        retainer_months: r.get(12)?,
    })
}

const SELECT_COLUMNS: &str =
    "id, workspace_id, account_id, title, description, status, current_phase_id, created_at, updated_at, completed_at, retainer_monthly, retainer_hours, retainer_months";
```

- [ ] **Step 3: `upsert` erweitern**

In `src-tauri/src/db/project.rs:61-72` ersetzen:

```rust
pub fn upsert(conn: &Connection, payload: UpsertProjectPayload) -> Result<Project, AppError> {
    let id = payload.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO projects
           (id, workspace_id, account_id, title, description, status, created_at, updated_at,
            retainer_monthly, retainer_hours, retainer_months)
         VALUES (?1, ?2, ?3, ?4, ?5, 'active', ?6, ?6, ?7, ?8, ?9)
         ON CONFLICT(id) DO UPDATE SET
           title=excluded.title, description=excluded.description, updated_at=excluded.updated_at,
           retainer_monthly=excluded.retainer_monthly, retainer_hours=excluded.retainer_hours,
           retainer_months=excluded.retainer_months",
        rusqlite::params![
            id, payload.workspace_id, payload.account_id, payload.title, payload.description, now,
            payload.retainer_monthly, payload.retainer_hours, payload.retainer_months,
        ],
    )?;
    get_by_id(conn, &id)
}
```

- [ ] **Step 4: Bestehende Test-Payloads reparieren + neuen Test hinzufügen**

Der komplette `#[cfg(test)] mod tests { ... }`-Block in `src-tauri/src/db/project.rs:137-271` wird ersetzt (jede `UpsertProjectPayload {...}`-Literal bekommt die drei neuen Pflichtfelder; ein neuer Test für die Retainer-Werte kommt dazu):

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{schema, migrations};

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        schema::create_tables(&conn).unwrap();
        migrations::run(&conn).unwrap();
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, created_at, updated_at)
             VALUES ('a1','ws-1','u-1','Test','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')",
            [],
        ).unwrap();
        conn
    }

    fn payload(title: &str) -> UpsertProjectPayload {
        UpsertProjectPayload {
            id: None, workspace_id: "ws-1".into(), account_id: "a1".into(),
            title: title.into(), description: None,
            retainer_monthly: 0.0, retainer_hours: 0, retainer_months: None,
        }
    }

    #[test]
    fn upsert_creates_new_project_with_active_status() {
        let conn = setup();
        let p = upsert(&conn, payload("Website-Relaunch")).unwrap();
        assert_eq!(p.title, "Website-Relaunch");
        assert_eq!(p.status, "active");
        assert_eq!(p.current_phase_id, None);
    }

    #[test]
    fn upsert_stores_retainer_fields() {
        let conn = setup();
        let p = upsert(&conn, UpsertProjectPayload {
            retainer_monthly: 8500.0, retainer_hours: 60, retainer_months: Some(12),
            ..payload("Brand Refresh")
        }).unwrap();
        assert_eq!(p.retainer_monthly, 8500.0);
        assert_eq!(p.retainer_hours, 60);
        assert_eq!(p.retainer_months, Some(12));
    }

    #[test]
    fn upsert_updates_existing_project_title_and_retainer() {
        let conn = setup();
        let created = upsert(&conn, payload("Alt")).unwrap();
        let updated = upsert(&conn, UpsertProjectPayload {
            id: Some(created.id.clone()), description: Some("Beschreibung".into()),
            retainer_monthly: 4000.0, retainer_hours: 20, retainer_months: None,
            ..payload("Neu")
        }).unwrap();
        assert_eq!(updated.id, created.id);
        assert_eq!(updated.title, "Neu");
        assert_eq!(updated.description, Some("Beschreibung".to_string()));
        assert_eq!(updated.retainer_monthly, 4000.0);
    }

    #[test]
    fn advance_phase_moves_to_next_phase() {
        let conn = setup();
        let p = upsert(&conn, payload("Test")).unwrap();
        let phase1 = project_phase::create(&conn, project_phase::CreateProjectPhasePayload {
            project_id: p.id.clone(), name: "Konzept".into(),
            start_date: "2026-04-27".into(), end_date: "2026-05-11".into(), gate_name: "Freigabe".into(),
        }).unwrap();
        let phase2 = project_phase::create(&conn, project_phase::CreateProjectPhasePayload {
            project_id: p.id.clone(), name: "Umsetzung".into(),
            start_date: "2026-05-11".into(), end_date: "2026-06-01".into(), gate_name: "Freigabe".into(),
        }).unwrap();
        let advanced = advance_phase(&conn, &p.id).unwrap();
        assert_eq!(advanced.current_phase_id, Some(phase2.id));
        assert_eq!(advanced.status, "active");
        let _ = phase1;
    }

    #[test]
    fn advance_phase_completes_project_after_last_phase() {
        let conn = setup();
        let p = upsert(&conn, payload("Test")).unwrap();
        project_phase::create(&conn, project_phase::CreateProjectPhasePayload {
            project_id: p.id.clone(), name: "Nur Phase".into(),
            start_date: "2026-04-27".into(), end_date: "2026-05-11".into(), gate_name: "Freigabe".into(),
        }).unwrap();
        let completed = advance_phase(&conn, &p.id).unwrap();
        assert_eq!(completed.status, "completed");
        assert!(completed.completed_at.is_some());
    }

    #[test]
    fn advance_phase_rejects_already_completed_project() {
        let conn = setup();
        let p = upsert(&conn, payload("Test")).unwrap();
        project_phase::create(&conn, project_phase::CreateProjectPhasePayload {
            project_id: p.id.clone(), name: "Nur Phase".into(),
            start_date: "2026-04-27".into(), end_date: "2026-05-11".into(), gate_name: "Freigabe".into(),
        }).unwrap();
        advance_phase(&conn, &p.id).unwrap();
        let result = advance_phase(&conn, &p.id);
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn set_status_toggles_active_and_paused() {
        let conn = setup();
        let p = upsert(&conn, payload("Test")).unwrap();
        let paused = set_status(&conn, &p.id, "paused").unwrap();
        assert_eq!(paused.status, "paused");
        let reactivated = set_status(&conn, &p.id, "active").unwrap();
        assert_eq!(reactivated.status, "active");
    }

    #[test]
    fn set_status_rejects_completed_project() {
        let conn = setup();
        let p = upsert(&conn, payload("Test")).unwrap();
        project_phase::create(&conn, project_phase::CreateProjectPhasePayload {
            project_id: p.id.clone(), name: "Nur Phase".into(),
            start_date: "2026-04-27".into(), end_date: "2026-05-11".into(), gate_name: "Freigabe".into(),
        }).unwrap();
        advance_phase(&conn, &p.id).unwrap();
        let result = set_status(&conn, &p.id, "paused");
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn delete_removes_project() {
        let conn = setup();
        let p = upsert(&conn, payload("Test")).unwrap();
        delete(&conn, &p.id, "ws-1").unwrap();
        let all = get_all_for_workspace(&conn, "ws-1").unwrap();
        assert!(all.is_empty());
    }
}
```

- [ ] **Step 5: Tests ausführen**

Run: `cd src-tauri && cargo test db::project:: -- --nocapture`
Expected: alle Tests PASS (inkl. neuem `upsert_stores_retainer_fields`).

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/db/project.rs
git commit -m "feat(db): Project-Struct um Retainer-Felder erweitert"
```

---

## Task 4: Rust `ProjectPhase` — Zeitraum, Gate, Fortschritt

**Files:**
- Modify: `src-tauri/src/db/project_phase.rs`

**Interfaces:**
- Consumes: Migration v38 (Task 1).
- Produces: `ProjectPhase { start_date, end_date, gate_name, gate_state, gate_date, gate_approved_by, progress_percent }` (camelCase: `startDate`, `endDate`, `gateName`, `gateState`, `gateDate`, `gateApprovedBy`, `progressPercent`); `CreateProjectPhasePayload { project_id, name, start_date, end_date, gate_name }`; neue Funktion `update_progress(conn, id, project_id, progress_percent) -> Result<ProjectPhase, AppError>`. Task 5 exponiert `update_progress` als neuen Command `cmd_update_project_phase_progress`.

- [ ] **Step 1: Struct + Payload erweitern**

In `src-tauri/src/db/project_phase.rs:5-20` ersetzen:

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPhase {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub order_index: i32,
    pub created_at: String,
    pub start_date: String,
    pub end_date: String,
    pub gate_name: String,
    pub gate_state: String,
    pub gate_date: Option<String>,
    pub gate_approved_by: Option<String>,
    pub progress_percent: i32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectPhasePayload {
    pub project_id: String,
    pub name: String,
    pub start_date: String,
    pub end_date: String,
    pub gate_name: String,
}
```

- [ ] **Step 2: `map_row` + `SELECT_COLUMNS`-Konstante einführen**

In `src-tauri/src/db/project_phase.rs:22-30` ersetzen:

```rust
const SELECT_COLUMNS: &str =
    "id, project_id, name, order_index, created_at, start_date, end_date, gate_name, gate_state, gate_date, gate_approved_by, progress_percent";

fn map_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<ProjectPhase> {
    Ok(ProjectPhase {
        id: r.get(0)?,
        project_id: r.get(1)?,
        name: r.get(2)?,
        order_index: r.get(3)?,
        created_at: r.get(4)?,
        start_date: r.get(5)?,
        end_date: r.get(6)?,
        gate_name: r.get(7)?,
        gate_state: r.get(8)?,
        gate_date: r.get(9)?,
        gate_approved_by: r.get(10)?,
        progress_percent: r.get(11)?,
    })
}
```

- [ ] **Step 3: `get_all_for_project` auf `SELECT_COLUMNS` umstellen**

In `src-tauri/src/db/project_phase.rs:32-39` ersetzen:

```rust
pub fn get_all_for_project(conn: &Connection, project_id: &str) -> Result<Vec<ProjectPhase>, AppError> {
    let sql = format!("SELECT {SELECT_COLUMNS} FROM project_phases WHERE project_id = ?1 ORDER BY order_index ASC");
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([project_id], map_row)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}
```

- [ ] **Step 4: `create` erweitern**

In `src-tauri/src/db/project_phase.rs:41-65` ersetzen:

```rust
/// Haengt eine neue Phase ans Ende an (order_index = aktuelles Maximum + 1).
/// gate_state startet immer 'open', progress_percent immer 0 -- der volle
/// Freigabe-Workflow (Gate manuell auf 'pending'/'approved' setzen) kommt erst
/// mit dem Phasen-Tab (Etappe 3). Ist es die erste Phase des Projekts, wird sie
/// automatisch zur aktuellen Phase des Projekts (projects.current_phase_id).
pub fn create(conn: &Connection, payload: CreateProjectPhasePayload) -> Result<ProjectPhase, AppError> {
    let existing = get_all_for_project(conn, &payload.project_id)?;
    let order_index = existing.iter().map(|p| p.order_index).max().map(|m| m + 1).unwrap_or(0);
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO project_phases
           (id, project_id, name, order_index, created_at, start_date, end_date, gate_name, gate_state, progress_percent)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'open', 0)",
        rusqlite::params![
            id, payload.project_id, payload.name, order_index, now,
            payload.start_date, payload.end_date, payload.gate_name,
        ],
    )?;
    if existing.is_empty() {
        conn.execute(
            "UPDATE projects SET current_phase_id = ?1 WHERE id = ?2 AND current_phase_id IS NULL",
            rusqlite::params![id, payload.project_id],
        )?;
    }
    let sql = format!("SELECT {SELECT_COLUMNS} FROM project_phases WHERE id = ?1");
    conn.query_row(&sql, [&id], map_row).map_err(AppError::from)
}
```

- [ ] **Step 5: `update_progress` hinzufügen**

Direkt nach der `create`-Funktion (vor `delete`) in `src-tauri/src/db/project_phase.rs` einfügen:

```rust
/// Manuelles Fortschritts-Prozent fuer die Timeline-Uebersicht (Etappe 1).
/// Kein Deliverables-basiertes Auto-Tracking -- das kommt mit Etappe 3.
pub fn update_progress(conn: &Connection, id: &str, project_id: &str, progress_percent: i32) -> Result<ProjectPhase, AppError> {
    if !(0..=100).contains(&progress_percent) {
        return Err(AppError::Validation("progress_percent muss zwischen 0 und 100 liegen".to_string()));
    }
    let exists: i64 = conn.query_row(
        "SELECT COUNT(*) FROM project_phases WHERE id = ?1 AND project_id = ?2",
        rusqlite::params![id, project_id],
        |r| r.get(0),
    )?;
    if exists == 0 {
        return Err(AppError::NotFound(format!("Phase {id} not found")));
    }
    conn.execute(
        "UPDATE project_phases SET progress_percent = ?1 WHERE id = ?2 AND project_id = ?3",
        rusqlite::params![progress_percent, id, project_id],
    )?;
    let sql = format!("SELECT {SELECT_COLUMNS} FROM project_phases WHERE id = ?1");
    conn.query_row(&sql, [id], map_row).map_err(AppError::from)
}
```

- [ ] **Step 6: Bestehende Tests reparieren + neue Tests für `update_progress`**

Der komplette `#[cfg(test)] mod tests { ... }`-Block in `src-tauri/src/db/project_phase.rs:110-194` wird ersetzt:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{schema, migrations};

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        schema::create_tables(&conn).unwrap();
        migrations::run(&conn).unwrap();
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, created_at, updated_at)
             VALUES ('a1','ws-1','u-1','Test','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO projects (id, workspace_id, account_id, title, status, created_at, updated_at)
             VALUES ('p1','ws-1','a1','Test-Projekt','active','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')",
            [],
        ).unwrap();
        conn
    }

    fn phase_payload(project_id: &str, name: &str) -> CreateProjectPhasePayload {
        CreateProjectPhasePayload {
            project_id: project_id.into(), name: name.into(),
            start_date: "2026-04-27".into(), end_date: "2026-05-11".into(), gate_name: "Freigabe".into(),
        }
    }

    #[test]
    fn create_first_phase_becomes_current_phase_of_project() {
        let conn = setup();
        let phase = create(&conn, phase_payload("p1", "Konzept")).unwrap();
        assert_eq!(phase.order_index, 0);
        assert_eq!(phase.gate_state, "open");
        assert_eq!(phase.progress_percent, 0);
        assert_eq!(phase.start_date, "2026-04-27");
        let current: Option<String> = conn.query_row(
            "SELECT current_phase_id FROM projects WHERE id = 'p1'", [], |r| r.get(0),
        ).unwrap();
        assert_eq!(current, Some(phase.id));
    }

    #[test]
    fn create_second_phase_does_not_change_current_phase() {
        let conn = setup();
        let first = create(&conn, phase_payload("p1", "Konzept")).unwrap();
        let _second = create(&conn, phase_payload("p1", "Umsetzung")).unwrap();
        let current: Option<String> = conn.query_row(
            "SELECT current_phase_id FROM projects WHERE id = 'p1'", [], |r| r.get(0),
        ).unwrap();
        assert_eq!(current, Some(first.id));
    }

    #[test]
    fn get_all_for_project_orders_by_order_index() {
        let conn = setup();
        create(&conn, phase_payload("p1", "Konzept")).unwrap();
        create(&conn, phase_payload("p1", "Umsetzung")).unwrap();
        let phases = get_all_for_project(&conn, "p1").unwrap();
        assert_eq!(phases.len(), 2);
        assert_eq!(phases[0].name, "Konzept");
        assert_eq!(phases[1].name, "Umsetzung");
    }

    #[test]
    fn delete_blocks_current_phase() {
        let conn = setup();
        let phase = create(&conn, phase_payload("p1", "Konzept")).unwrap();
        let result = delete(&conn, &phase.id, "p1");
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn delete_removes_non_current_phase() {
        let conn = setup();
        create(&conn, phase_payload("p1", "Konzept")).unwrap();
        let second = create(&conn, phase_payload("p1", "Umsetzung")).unwrap();
        delete(&conn, &second.id, "p1").unwrap();
        let phases = get_all_for_project(&conn, "p1").unwrap();
        assert_eq!(phases.len(), 1);
    }

    #[test]
    fn reorder_updates_order_index() {
        let conn = setup();
        let a = create(&conn, phase_payload("p1", "A")).unwrap();
        let b = create(&conn, phase_payload("p1", "B")).unwrap();
        reorder(&conn, "p1", &[b.id.clone(), a.id.clone()]).unwrap();
        let phases = get_all_for_project(&conn, "p1").unwrap();
        assert_eq!(phases[0].id, b.id);
        assert_eq!(phases[1].id, a.id);
    }

    #[test]
    fn update_progress_sets_value_within_range() {
        let conn = setup();
        let phase = create(&conn, phase_payload("p1", "Konzept")).unwrap();
        let updated = update_progress(&conn, &phase.id, "p1", 78).unwrap();
        assert_eq!(updated.progress_percent, 78);
    }

    #[test]
    fn update_progress_rejects_out_of_range_value() {
        let conn = setup();
        let phase = create(&conn, phase_payload("p1", "Konzept")).unwrap();
        let result = update_progress(&conn, &phase.id, "p1", 101);
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn update_progress_rejects_unknown_phase() {
        let conn = setup();
        let result = update_progress(&conn, "missing", "p1", 50);
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }
}
```

- [ ] **Step 7: Tests ausführen**

Run: `cd src-tauri && cargo test db::project_phase:: -- --nocapture`
Expected: alle Tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/db/project_phase.rs
git commit -m "feat(db): ProjectPhase um Zeitraum, Gate und Fortschritt erweitert"
```

---

## Task 5: Tauri-Command für Fortschritt + Registrierung

**Files:**
- Modify: `src-tauri/src/commands/project_phase.rs`
- Modify: `src-tauri/src/main.rs:291-294`

**Interfaces:**
- Consumes: `db::project_phase::update_progress` (Task 4).
- Produces: Tauri-Command `cmd_update_project_phase_progress(id, project_id, progress_percent) -> ProjectPhase`. Task 9 (TS-Service) ruft ihn per `invoke('cmd_update_project_phase_progress', { id, projectId, progressPercent })` auf.

- [ ] **Step 1: Command hinzufügen**

An das Ende von `src-tauri/src/commands/project_phase.rs` (nach `cmd_reorder_project_phases`) anfügen:

```rust
#[tauri::command]
pub fn cmd_update_project_phase_progress(
    db: State<'_, DbPool>, id: String, project_id: String, progress_percent: i32,
) -> Result<ProjectPhase, AppError> {
    db::project_phase::update_progress(&db.conn(), &id, &project_id, progress_percent)
}
```

- [ ] **Step 2: In `main.rs` registrieren**

In `src-tauri/src/main.rs:294` (nach `commands::project_phase::cmd_reorder_project_phases,`) einfügen:

```rust
            commands::project_phase::cmd_update_project_phase_progress,
```

- [ ] **Step 3: Build prüfen**

Run: `cd src-tauri && cargo build 2>&1 | tail -40`
Expected: Build erfolgreich, keine Fehler zu `cmd_update_project_phase_progress` oder den in Task 3/4 geänderten Signaturen.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/project_phase.rs src-tauri/src/main.rs
git commit -m "feat(commands): cmd_update_project_phase_progress registriert"
```

---

## Task 6: TypeScript-Typen spiegeln

**Files:**
- Modify: `src/types/project.types.ts`

**Interfaces:**
- Consumes: Rust-Feldnamen aus Task 3/4 (camelCase via `serde(rename_all = "camelCase")`).
- Produces: `Project`, `UpsertProjectPayload`, `ProjectPhase`, `CreateProjectPhasePayload`, `GateState`. Alle folgenden TS-Tasks (Mapper, Gateway, Service, Store, Components) importieren aus dieser Datei.

- [ ] **Step 1: Datei komplett ersetzen**

```typescript
export type ProjectStatus = 'active' | 'paused' | 'completed'
export type GateState = 'open' | 'pending' | 'approved'

export interface Project {
  id: string
  workspaceId: string
  accountId: string
  title: string
  description: string | null
  status: ProjectStatus
  currentPhaseId: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
  retainerMonthly: number
  retainerHours: number
  retainerMonths: number | null
}

export interface UpsertProjectPayload {
  id?: string
  workspaceId: string
  accountId: string
  title: string
  description?: string
  retainerMonthly: number
  retainerHours: number
  retainerMonths: number | null
}

export interface ProjectPhase {
  id: string
  projectId: string
  name: string
  orderIndex: number
  createdAt: string
  startDate: string
  endDate: string
  gateName: string
  gateState: GateState
  gateDate: string | null
  gateApprovedBy: string | null
  progressPercent: number
}

export interface CreateProjectPhasePayload {
  projectId: string
  name: string
  startDate: string
  endDate: string
  gateName: string
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck 2>&1 | grep -i project`
Expected: Fehler in `projects.mapper.ts`, `projects.gateway.ts`, `NewProjectModal.tsx` (fehlende Felder) — das ist erwartet, wird in den folgenden Tasks behoben. Kein Fehler *innerhalb* von `project.types.ts` selbst.

- [ ] **Step 3: Commit**

```bash
git add src/types/project.types.ts
git commit -m "feat(types): Project/ProjectPhase um Retainer- und Gate-Felder erweitert"
```

---

## Task 7: Mapper — Row ↔ camelCase

**Files:**
- Modify: `src/data/projects.mapper.ts`

**Interfaces:**
- Consumes: `Project`, `ProjectPhase`, `UpsertProjectPayload` (Task 6).
- Produces: `projectRowToProject`, `projectToRow`, `projectPhaseRowToPhase` — unverändertes Aufruf-Interface, erweiterter Feldsatz. Task 8 (Gateway) nutzt alle drei unverändert weiter.
- Test: `src/data/projects.mapper.test.ts` (neu — es existierte bisher keine Testdatei für diesen Mapper)

- [ ] **Step 1: Fehlschlagenden Test zuerst schreiben**

Neue Datei `src/data/projects.mapper.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { projectRowToProject, projectToRow, projectPhaseRowToPhase } from './projects.mapper'

describe('projectRowToProject', () => {
  it('mappt Retainer-Spalten aus snake_case', () => {
    const row = {
      id: 'p1', workspace_id: 'ws-1', account_id: 'a1', title: 'Test', description: null,
      status: 'active', current_phase_id: null, created_at: '2026-01-01', updated_at: '2026-01-01',
      completed_at: null, retainer_monthly: 8500, retainer_hours: 60, retainer_months: 12,
    }
    const p = projectRowToProject(row)
    expect(p.retainerMonthly).toBe(8500)
    expect(p.retainerHours).toBe(60)
    expect(p.retainerMonths).toBe(12)
  })

  it('defaultet retainer_months auf null wenn nicht gesetzt', () => {
    const row = {
      id: 'p1', workspace_id: 'ws-1', account_id: 'a1', title: 'Test', description: null,
      status: 'active', current_phase_id: null, created_at: '2026-01-01', updated_at: '2026-01-01',
      completed_at: null, retainer_monthly: 0, retainer_hours: 0, retainer_months: null,
    }
    expect(projectRowToProject(row).retainerMonths).toBeNull()
  })
})

describe('projectToRow', () => {
  it('nimmt Retainer-Felder in die Row auf, auch bei Update', () => {
    const row = projectToRow(
      { workspaceId: 'ws-1', accountId: 'a1', title: 'Test', retainerMonthly: 4000, retainerHours: 20, retainerMonths: null },
      { id: 'p1', now: '2026-01-01', isNew: false },
    )
    expect(row.retainer_monthly).toBe(4000)
    expect(row.retainer_hours).toBe(20)
    expect(row.retainer_months).toBeNull()
  })
})

describe('projectPhaseRowToPhase', () => {
  it('mappt Zeitraum- und Gate-Spalten', () => {
    const row = {
      id: 'ph1', project_id: 'p1', name: 'Konzept', order_index: 0, created_at: '2026-01-01',
      start_date: '2026-04-27', end_date: '2026-05-11', gate_name: 'Freigabe',
      gate_state: 'pending', gate_date: '2026-05-11', gate_approved_by: null, progress_percent: 42,
    }
    const phase = projectPhaseRowToPhase(row)
    expect(phase.startDate).toBe('2026-04-27')
    expect(phase.gateState).toBe('pending')
    expect(phase.progressPercent).toBe(42)
  })
})
```

- [ ] **Step 2: Test ausführen, Fehlschlag verifizieren**

Run: `npx vitest run src/data/projects.mapper.test.ts`
Expected: FAIL — `retainerMonthly` etc. sind `undefined` (Mapper kennt die Felder noch nicht).

- [ ] **Step 3: Mapper erweitern**

`src/data/projects.mapper.ts` komplett ersetzen:

```typescript
import type { Project, ProjectPhase } from '@/types/project.types'

export function projectRowToProject(r: any): Project {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    accountId: r.account_id,
    title: r.title,
    description: r.description ?? null,
    status: r.status ?? 'active',
    currentPhaseId: r.current_phase_id ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    completedAt: r.completed_at ?? null,
    retainerMonthly: r.retainer_monthly ?? 0,
    retainerHours: r.retainer_hours ?? 0,
    retainerMonths: r.retainer_months ?? null,
  }
}

export function projectToRow(
  p: {
    workspaceId: string; accountId: string; title: string; description?: string
    retainerMonthly: number; retainerHours: number; retainerMonths: number | null
  },
  ctx: { id: string; now: string; isNew: boolean },
): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: ctx.id,
    workspace_id: p.workspaceId,
    account_id: p.accountId,
    title: p.title,
    description: p.description ?? null,
    updated_at: ctx.now,
    retainer_monthly: p.retainerMonthly,
    retainer_hours: p.retainerHours,
    retainer_months: p.retainerMonths,
  }
  if (ctx.isNew) {
    row.created_at = ctx.now
    row.status = 'active'
  }
  return row
}

export function projectPhaseRowToPhase(r: any): ProjectPhase {
  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    orderIndex: r.order_index ?? 0,
    createdAt: r.created_at,
    startDate: r.start_date,
    endDate: r.end_date,
    gateName: r.gate_name,
    gateState: r.gate_state ?? 'open',
    gateDate: r.gate_date ?? null,
    gateApprovedBy: r.gate_approved_by ?? null,
    progressPercent: r.progress_percent ?? 0,
  }
}
```

- [ ] **Step 4: Test ausführen, Erfolg verifizieren**

Run: `npx vitest run src/data/projects.mapper.test.ts`
Expected: PASS (5 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/data/projects.mapper.ts src/data/projects.mapper.test.ts
git commit -m "feat(data): Projects-Mapper um Retainer- und Gate-Felder erweitert"
```

---

## Task 8: Gateway — lokaler + Cloud-Pfad

**Files:**
- Modify: `src/data/projects.gateway.ts`

**Interfaces:**
- Consumes: `projectPhaseRowToPhase`, `projectToRow` (Task 7); `CreateProjectPhasePayload`, `ProjectPhase` (Task 6); `ProjectsService` (wird in Task 9 um `updatePhaseProgress` erweitert — dieser Task ruft sie bereits mit dem finalen Namen auf).
- Produces: `ProjectsGateway.updatePhaseProgress(id, projectId, progressPercent): Promise<ProjectPhase>`; `ProjectsGateway.createPhase` schreibt jetzt auch `start_date`/`end_date`/`gate_name`/`gate_state`/`progress_percent` in den Cloud-Pfad. Task 10 (Store) ruft `ProjectsGateway.updatePhaseProgress` auf.

- [ ] **Step 1: `createPhase` (Cloud-Pfad) erweitern**

In `src/data/projects.gateway.ts:92-110` den `insert`-Aufruf ersetzen:

```typescript
  async createPhase(payload: CreateProjectPhasePayload): Promise<ProjectPhase> {
    if (!shared()) return ProjectsService.createPhase(payload)
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const { data: existing, error: eErr } = await supabase.from('project_phases')
      .select('order_index').eq('project_id', payload.projectId)
      .order('order_index', { ascending: false }).limit(1)
    if (eErr) fail(eErr)
    const orderIndex = existing && existing.length > 0 ? existing[0].order_index + 1 : 0
    const { data, error } = await supabase.from('project_phases')
      .insert({
        id, project_id: payload.projectId, name: payload.name, order_index: orderIndex, created_at: now,
        start_date: payload.startDate, end_date: payload.endDate, gate_name: payload.gateName,
        gate_state: 'open', progress_percent: 0,
      })
      .select('*').single()
    if (error) fail(error)
    if (orderIndex === 0) {
      await supabase.from('projects').update({ current_phase_id: id })
        .eq('id', payload.projectId).is('current_phase_id', null)
    }
    return projectPhaseRowToPhase(data)
  },
```

- [ ] **Step 2: `updatePhaseProgress` hinzufügen**

Nach `reorderPhases` (am Ende des `ProjectsGateway`-Objekts, vor der schließenden `}`) in `src/data/projects.gateway.ts` einfügen:

```typescript
  async updatePhaseProgress(id: string, projectId: string, progressPercent: number): Promise<ProjectPhase> {
    if (!shared()) return ProjectsService.updatePhaseProgress(id, projectId, progressPercent)
    const { data, error } = await supabase.from('project_phases')
      .update({ progress_percent: progressPercent }).eq('id', id).eq('project_id', projectId)
      .select('*').single()
    if (error) fail(error)
    return projectPhaseRowToPhase(data)
  },
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck 2>&1 | grep -i project`
Expected: Fehler nur noch in `projects.service.ts` (fehlende `updatePhaseProgress`-Methode) und `NewProjectModal.tsx` — beide werden in Task 9/16 behoben.

- [ ] **Step 4: Commit**

```bash
git add src/data/projects.gateway.ts
git commit -m "feat(data): ProjectsGateway -- createPhase mit Zeitraum/Gate, neues updatePhaseProgress"
```

---

## Task 9: Service — Tauri-Invoke-Wrapper

**Files:**
- Modify: `src/services/projects.service.ts`

**Interfaces:**
- Consumes: `cmd_update_project_phase_progress` (Task 5).
- Produces: `ProjectsService.updatePhaseProgress(id, projectId, progressPercent): Promise<ProjectPhase>`.

- [ ] **Step 1: Methode hinzufügen**

In `src/services/projects.service.ts` nach `reorderPhases` (vor der schließenden `}` des `ProjectsService`-Objekts) einfügen:

```typescript
  updatePhaseProgress(id: string, projectId: string, progressPercent: number): Promise<ProjectPhase> {
    return invoke('cmd_update_project_phase_progress', { id, projectId, progressPercent })
  },
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck 2>&1 | grep -i project`
Expected: Fehler nur noch in `NewProjectModal.tsx` (Task 16).

- [ ] **Step 3: Commit**

```bash
git add src/services/projects.service.ts
git commit -m "feat(services): ProjectsService.updatePhaseProgress"
```

---

## Task 10: Store — Action + erste Store-Tests

**Files:**
- Modify: `src/store/projects.store.ts`
- Create: `src/store/projects.store.test.ts`

**Interfaces:**
- Consumes: `ProjectsGateway.updatePhaseProgress` (Task 8).
- Produces: `useProjectsStore().updatePhaseProgress(id, projectId, progressPercent): Promise<void>`. Task 17 (`ProjectDetailRoute`) ruft diese Action auf.

- [ ] **Step 1: Fehlschlagenden Test zuerst schreiben**

Neue Datei `src/store/projects.store.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useProjectsStore } from './projects.store'
import { ProjectsGateway } from '@/data/projects.gateway'

vi.mock('@/data/projects.gateway', () => ({
  ProjectsGateway: {
    updatePhaseProgress: vi.fn(),
  },
}))

describe('useProjectsStore.updatePhaseProgress', () => {
  beforeEach(() => {
    useProjectsStore.setState({
      projects: [], phasesByProject: {
        'p1': [
          { id: 'ph1', projectId: 'p1', name: 'Konzept', orderIndex: 0, createdAt: '2026-01-01',
            startDate: '2026-04-27', endDate: '2026-05-11', gateName: 'Freigabe', gateState: 'open',
            gateDate: null, gateApprovedBy: null, progressPercent: 10 },
        ],
      }, isLoading: false, error: null,
    })
    vi.mocked(ProjectsGateway.updatePhaseProgress).mockReset()
  })

  it('aktualisiert progressPercent der betroffenen Phase im Store', async () => {
    vi.mocked(ProjectsGateway.updatePhaseProgress).mockResolvedValue({
      id: 'ph1', projectId: 'p1', name: 'Konzept', orderIndex: 0, createdAt: '2026-01-01',
      startDate: '2026-04-27', endDate: '2026-05-11', gateName: 'Freigabe', gateState: 'open',
      gateDate: null, gateApprovedBy: null, progressPercent: 78,
    })
    await useProjectsStore.getState().updatePhaseProgress('ph1', 'p1', 78)
    expect(useProjectsStore.getState().phasesByProject['p1'][0].progressPercent).toBe(78)
  })

  it('setzt error im Store, wenn das Gateway wirft', async () => {
    vi.mocked(ProjectsGateway.updatePhaseProgress).mockRejectedValue(new Error('boom'))
    await expect(useProjectsStore.getState().updatePhaseProgress('ph1', 'p1', 78)).rejects.toThrow('boom')
    expect(useProjectsStore.getState().error).not.toBeNull()
  })
})
```

- [ ] **Step 2: Test ausführen, Fehlschlag verifizieren**

Run: `npx vitest run src/store/projects.store.test.ts`
Expected: FAIL — `updatePhaseProgress` ist keine Funktion auf dem Store.

- [ ] **Step 3: Action implementieren**

In `src/store/projects.store.ts` das Interface `ProjectsState` erweitern (nach `reorderPhases: ...` in der Interface-Definition, `src/store/projects.store.ts:21`):

```typescript
  updatePhaseProgress: (id: string, projectId: string, progressPercent: number) => Promise<void>
```

Und im Store-Objekt selbst, nach der `reorderPhases`-Implementierung (vor der schließenden `}))` am Dateiende) einfügen:

```typescript
  updatePhaseProgress: async (id, projectId, progressPercent) => {
    set({ error: null })
    try {
      const phase = await ProjectsGateway.updatePhaseProgress(id, projectId, progressPercent)
      set(s => ({
        phasesByProject: {
          ...s.phasesByProject,
          [projectId]: (s.phasesByProject[projectId] ?? []).map(p => p.id === id ? phase : p),
        },
      }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error })
      log.error('Failed to update project phase progress', { error, id, projectId })
      throw err
    }
  },
```

- [ ] **Step 4: Test ausführen, Erfolg verifizieren**

Run: `npx vitest run src/store/projects.store.test.ts`
Expected: PASS (2 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/store/projects.store.ts src/store/projects.store.test.ts
git commit -m "feat(store): updatePhaseProgress-Action + erste Projects-Store-Tests"
```

---

## Task 11: Rollierendes Wochenfenster (`timeline-weeks.ts`)

**Files:**
- Create: `src/lib/projects/timeline-weeks.ts`
- Test: `src/lib/projects/timeline-weeks.test.ts`

**Interfaces:**
- Produces: `TimelineWeek { start: Date; kw: number; monthLabel: string | null }`, `rollingWeeks(today, weeksBack?, weeksForward?): TimelineWeek[]`, `dateToTimelineOffset(dateIso, weeks): number | null`, `kwOf(date): number`. Task 14 (`ProjectsTimeline`) nutzt alle drei; Task 15 (`ProjectsOverviewRoute`) ruft `rollingWeeks(new Date())` auf.

- [ ] **Step 1: Fehlschlagende Tests zuerst schreiben**

Neue Datei `src/lib/projects/timeline-weeks.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { rollingWeeks, dateToTimelineOffset, kwOf } from './timeline-weeks'

describe('kwOf', () => {
  it('berechnet KW 18 für den 27.04.2026 (bekannter Referenzwert)', () => {
    expect(kwOf(new Date(2026, 3, 27))).toBe(18)
  })
  it('berechnet KW 1 für den 1.1.2026', () => {
    expect(kwOf(new Date(2026, 0, 1))).toBe(1)
  })
})

describe('rollingWeeks', () => {
  const today = new Date(2026, 4, 18) // Mo, 18.05.2026 -> KW 21

  it('liefert weeksBack + weeksForward Einträge', () => {
    expect(rollingWeeks(today, 4, 10)).toHaveLength(14)
  })

  it('erste Woche beginnt weeksBack Wochen vor dem Montag von heute', () => {
    const weeks = rollingWeeks(today, 4, 10)
    expect(weeks[0].kw).toBe(18)
  })

  it('setzt monthLabel nur bei der ersten Woche und bei Monatswechseln', () => {
    const weeks = rollingWeeks(today, 4, 10)
    expect(weeks[0].monthLabel).toBe('Apr')
    const juneStartIdx = weeks.findIndex(w => w.start.getMonth() === 5)
    expect(weeks[juneStartIdx].monthLabel).toBe('Jun')
    expect(weeks[juneStartIdx - 1].monthLabel).toBeNull()
  })
})

describe('dateToTimelineOffset', () => {
  const weeks = rollingWeeks(new Date(2026, 4, 18), 4, 10)

  it('gibt 0 für den Start der ersten Woche zurück', () => {
    const iso = weeks[0].start.toISOString().slice(0, 10)
    expect(dateToTimelineOffset(iso, weeks)).toBe(0)
  })

  it('gibt null für ein Datum vor dem Fenster zurück', () => {
    expect(dateToTimelineOffset('2020-01-01', weeks)).toBeNull()
  })

  it('gibt null für ein Datum weit nach dem Fenster zurück', () => {
    expect(dateToTimelineOffset('2030-01-01', weeks)).toBeNull()
  })
})
```

- [ ] **Step 2: Test ausführen, Fehlschlag verifizieren**

Run: `npx vitest run src/lib/projects/timeline-weeks.test.ts`
Expected: FAIL — Modul `./timeline-weeks` existiert nicht.

- [ ] **Step 3: Implementieren**

Neue Datei `src/lib/projects/timeline-weeks.ts`:

```typescript
const MONTH_LABELS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

export interface TimelineWeek {
  start: Date
  kw: number
  monthLabel: string | null
}

function mondayOf(d: Date): Date {
  const c = new Date(d)
  const dow = (c.getDay() + 6) % 7
  c.setDate(c.getDate() - dow)
  c.setHours(0, 0, 0, 0)
  return c
}

/** ISO-8601-Wochennummer (KW), gleiche Formel wie CalendarRoute.tsx#kwOf. */
export function kwOf(d: Date): number {
  const tmp = new Date(d)
  tmp.setHours(0, 0, 0, 0)
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7))
  const jan4 = new Date(tmp.getFullYear(), 0, 4)
  return 1 + Math.round(((tmp.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7)
}

/** Rollierendes Fenster um `today`: weeksBack Wochen zurück, weeksForward voraus. */
export function rollingWeeks(today: Date, weeksBack = 4, weeksForward = 10): TimelineWeek[] {
  const firstMonday = mondayOf(today)
  firstMonday.setDate(firstMonday.getDate() - weeksBack * 7)
  const totalWeeks = weeksBack + weeksForward
  const weeks: TimelineWeek[] = []
  let prevMonth = -1
  for (let i = 0; i < totalWeeks; i++) {
    const start = new Date(firstMonday)
    start.setDate(start.getDate() + i * 7)
    const month = start.getMonth()
    weeks.push({ start, kw: kwOf(start), monthLabel: month !== prevMonth ? MONTH_LABELS[month] : null })
    prevMonth = month
  }
  return weeks
}

/** Fraktionaler Wochen-Index (0 = Start der ersten Woche) für ein YYYY-MM-DD-Datum,
 * oder null wenn außerhalb des sichtbaren Fensters. */
export function dateToTimelineOffset(dateIso: string, weeks: TimelineWeek[]): number | null {
  if (!weeks.length) return null
  const d = new Date(`${dateIso}T00:00:00`)
  const diffWeeks = (d.getTime() - weeks[0].start.getTime()) / (7 * 86400000)
  if (diffWeeks < 0 || diffWeeks > weeks.length) return null
  return diffWeeks
}
```

- [ ] **Step 4: Test ausführen, Erfolg verifizieren**

Run: `npx vitest run src/lib/projects/timeline-weeks.test.ts`
Expected: PASS (9 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/timeline-weeks.ts src/lib/projects/timeline-weeks.test.ts
git commit -m "feat(lib): rollierendes Wochenfenster fuer die Projekt-Timeline"
```

---

## Task 12: Signale & Ampel (`signals.ts`)

**Files:**
- Create: `src/lib/projects/signals.ts`
- Test: `src/lib/projects/signals.test.ts`

**Interfaces:**
- Consumes: `ProjectPhase` (Task 6).
- Produces: `HealthLevel = 'ok' | 'warn' | 'bad'`, `ProjectSignal { kind: 'gate_pending'; tone: 'warn' | 'bad'; label: string; detail: string; phaseId: string }`, `projectHealthZeit(phases, today): HealthLevel`, `projectHealthBudget(): HealthLevel`, `projectHealthStimmung(): HealthLevel`, `projectSignals(phases, today): ProjectSignal[]`. Task 14/15 nutzen alle vier für Health-Dots, Filter "Brauchen dich"/"Gate offen" und die "Diese Woche wird entschieden"-Liste.

- [ ] **Step 1: Fehlschlagende Tests zuerst schreiben**

Neue Datei `src/lib/projects/signals.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { projectHealthZeit, projectHealthBudget, projectHealthStimmung, projectSignals } from './signals'
import type { ProjectPhase } from '@/types/project.types'

const today = new Date(2026, 4, 18) // Mo, 18.05.2026

function phase(overrides: Partial<ProjectPhase> = {}): ProjectPhase {
  return {
    id: 'ph1', projectId: 'p1', name: 'Konzept', orderIndex: 0, createdAt: '2026-01-01',
    startDate: '2026-04-27', endDate: '2026-05-11', gateName: 'Konzeptfreigabe',
    gateState: 'open', gateDate: null, gateApprovedBy: null, progressPercent: 50,
    ...overrides,
  }
}

describe('projectHealthZeit', () => {
  it('ist ok ohne pending Gates', () => {
    expect(projectHealthZeit([phase({ gateState: 'open' })], today)).toBe('ok')
  })
  it('ist ok, wenn das pending Gate erst in 6 Tagen fällig ist', () => {
    expect(projectHealthZeit([phase({ gateState: 'pending', gateDate: '2026-05-24' })], today)).toBe('ok')
  })
  it('ist warn, wenn das pending Gate in genau 5 Tagen fällig ist', () => {
    expect(projectHealthZeit([phase({ gateState: 'pending', gateDate: '2026-05-23' })], today)).toBe('warn')
  })
  it('ist warn, wenn das pending Gate heute fällig ist', () => {
    expect(projectHealthZeit([phase({ gateState: 'pending', gateDate: '2026-05-18' })], today)).toBe('warn')
  })
  it('ist bad, wenn das pending Gate bereits überfällig ist', () => {
    expect(projectHealthZeit([phase({ gateState: 'pending', gateDate: '2026-05-12' })], today)).toBe('bad')
  })
  it('ignoriert pending Gates ohne Termin', () => {
    expect(projectHealthZeit([phase({ gateState: 'pending', gateDate: null })], today)).toBe('ok')
  })
})

describe('projectHealthBudget / projectHealthStimmung', () => {
  it('sind in dieser Etappe fix ok', () => {
    expect(projectHealthBudget()).toBe('ok')
    expect(projectHealthStimmung()).toBe('ok')
  })
})

describe('projectSignals', () => {
  it('liefert nur pending Gates', () => {
    const signals = projectSignals([phase({ gateState: 'open' }), phase({ id: 'ph2', gateState: 'pending', gateDate: '2026-05-22' })], today)
    expect(signals).toHaveLength(1)
    expect(signals[0].phaseId).toBe('ph2')
  })
  it('markiert überfällige Gates als bad, sonst warn', () => {
    const overdue = projectSignals([phase({ gateState: 'pending', gateDate: '2026-05-01' })], today)
    expect(overdue[0].tone).toBe('bad')
    const upcoming = projectSignals([phase({ gateState: 'pending', gateDate: '2026-05-22' })], today)
    expect(upcoming[0].tone).toBe('warn')
  })
  it('formatiert das Datum als TT.MM.JJJJ im detail-Text', () => {
    const signals = projectSignals([phase({ gateState: 'pending', gateDate: '2026-05-22' })], today)
    expect(signals[0].detail).toContain('22.05.2026')
  })
})
```

- [ ] **Step 2: Test ausführen, Fehlschlag verifizieren**

Run: `npx vitest run src/lib/projects/signals.test.ts`
Expected: FAIL — Modul `./signals` existiert nicht.

- [ ] **Step 3: Implementieren**

Neue Datei `src/lib/projects/signals.ts`:

```typescript
import type { ProjectPhase } from '@/types/project.types'

export type HealthLevel = 'ok' | 'warn' | 'bad'

export interface ProjectSignal {
  kind: 'gate_pending'
  tone: 'warn' | 'bad'
  label: string
  detail: string
  phaseId: string
}

const GATE_WARN_DAYS = 5

function daysUntil(dateIso: string, today: Date): number {
  const d = new Date(`${dateIso}T00:00:00`)
  const t = new Date(today)
  t.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - t.getTime()) / 86400000)
}

function formatDateDe(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

/** Zeit-Ampel: aus überfälligen/bald fälligen pending-Gates abgeleitet.
 * Budget/Stimmung sind in dieser Etappe fix 'ok' (siehe Spec Etappe 1). */
export function projectHealthZeit(phases: ProjectPhase[], today: Date): HealthLevel {
  const pendingWithDate = phases.filter(p => p.gateState === 'pending' && p.gateDate)
  if (pendingWithDate.some(p => daysUntil(p.gateDate as string, today) < 0)) return 'bad'
  if (pendingWithDate.some(p => daysUntil(p.gateDate as string, today) <= GATE_WARN_DAYS)) return 'warn'
  return 'ok'
}

export function projectHealthBudget(): HealthLevel {
  return 'ok'
}

export function projectHealthStimmung(): HealthLevel {
  return 'ok'
}

/** Aktuell nur "Gate wartet"-Signale. Erweiterbar (Etappe 6: Rechnungssignale),
 * ohne dass Aufrufer (Filter, "Diese Woche wird entschieden"-Liste) sich ändern. */
export function projectSignals(phases: ProjectPhase[], today: Date): ProjectSignal[] {
  return phases
    .filter(p => p.gateState === 'pending')
    .map(p => {
      const overdue = p.gateDate ? daysUntil(p.gateDate, today) < 0 : false
      return {
        kind: 'gate_pending' as const,
        tone: overdue ? ('bad' as const) : ('warn' as const),
        label: `${p.gateName} wartet`,
        detail: p.gateDate ? `fällig ${formatDateDe(p.gateDate)}` : 'kein Termin gesetzt',
        phaseId: p.id,
      }
    })
}
```

- [ ] **Step 4: Test ausführen, Erfolg verifizieren**

Run: `npx vitest run src/lib/projects/signals.test.ts`
Expected: PASS (11 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects/signals.ts src/lib/projects/signals.test.ts
git commit -m "feat(lib): Zeit-Ampel und Gate-Signale fuer Projekte"
```

---

## Task 13: `ProjectsArchiveList` — bestehende Bucket-Ansicht extrahieren

**Files:**
- Create: `src/components/projects/ProjectsArchiveList.tsx`
- Test: `src/components/projects/ProjectsArchiveList.test.tsx`
- Modify: `src/routes/ProjectsOverviewRoute.tsx` (in Task 15 final verdrahtet — dieser Task extrahiert nur die Komponente)

**Interfaces:**
- Consumes: `Project` (Task 6).
- Produces: `ProjectsArchiveList({ projects, customerNameFor, onOpen }): JSX.Element` — rendert die bestehenden "Pausiert"/"Abgeschlossen"-Buckets (unverändertes Aussehen, nur ausgelagert). Task 15 rendert diese Komponente, wenn der Archiv-Umschalter aktiv ist.

- [ ] **Step 0: Fehlschlagenden Test zuerst schreiben**

`@testing-library/react` und `@testing-library/jest-dom` sind bereits Projekt-Abhängigkeiten (siehe `src/components/onboarding/WelcomeIntro.test.tsx` als Referenzmuster). Neue Datei `src/components/projects/ProjectsArchiveList.test.tsx`:

```typescript
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ProjectsArchiveList } from './ProjectsArchiveList'
import type { Project } from '@/types/project.types'

afterEach(cleanup)

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1', workspaceId: 'ws-1', accountId: 'a1', title: 'Test-Projekt', description: null,
    status: 'paused', currentPhaseId: null, createdAt: '2026-01-01', updatedAt: '2026-01-01', completedAt: null,
    retainerMonthly: 0, retainerHours: 0, retainerMonths: null,
    ...overrides,
  }
}

describe('ProjectsArchiveList', () => {
  it('zeigt eine Leer-Meldung, wenn kein Projekt pausiert oder abgeschlossen ist', () => {
    render(<ProjectsArchiveList projects={[]} customerNameFor={() => 'Kunde'} onOpen={() => {}} />)
    expect(screen.getByText(/Kein pausiertes oder abgeschlossenes Projekt/)).toBeTruthy()
  })

  it('gruppiert Projekte nach pausiert und abgeschlossen', () => {
    render(
      <ProjectsArchiveList
        projects={[project({ id: 'p1', title: 'Pausiert-Projekt', status: 'paused' }), project({ id: 'p2', title: 'Fertig-Projekt', status: 'completed' })]}
        customerNameFor={() => 'Kunde'} onOpen={() => {}}
      />,
    )
    expect(screen.getByText('Pausiert-Projekt')).toBeTruthy()
    expect(screen.getByText('Fertig-Projekt')).toBeTruthy()
    expect(screen.getByText('Pausiert')).toBeTruthy()
    expect(screen.getByText('Abgeschlossen')).toBeTruthy()
  })

  it('ruft onOpen mit der Projekt-Id auf, wenn eine Zeile geklickt wird', () => {
    const opened: string[] = []
    render(
      <ProjectsArchiveList
        projects={[project({ id: 'p1', title: 'Pausiert-Projekt' })]}
        customerNameFor={() => 'Kunde'} onOpen={id => opened.push(id)}
      />,
    )
    fireEvent.click(screen.getByText('Pausiert-Projekt'))
    expect(opened).toEqual(['p1'])
  })
})
```

Run: `npx vitest run src/components/projects/ProjectsArchiveList.test.tsx`
Expected: FAIL — Modul `./ProjectsArchiveList` existiert nicht.

- [ ] **Step 1: Komponente aus dem bestehenden Code extrahieren**

Neue Datei `src/components/projects/ProjectsArchiveList.tsx` (Inhalt 1:1 aus `ProjectRow`/`Bucket` in `src/routes/ProjectsOverviewRoute.tsx:10-78`, unverändert übernommen, nur als eigenständige Datei mit einer neuen Export-Komponente `ProjectsArchiveList`):

```typescript
import type { Project } from '@/types/project.types'

function ProjectRow({ project, customerName, onOpen }: {
  project: Project
  customerName: string
  onOpen: () => void
}) {
  const statusChip = project.status === 'paused'
    ? { label: '⏸ pausiert', style: { background: 'var(--surface-3)', color: 'var(--fg-muted)' } }
    : { label: '✓ abgeschlossen', style: { background: 'var(--ok-soft)', color: 'var(--ok)' } }

  return (
    <div
      onClick={onOpen}
      style={{
        position: 'relative', background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, padding: '16px 20px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <div style={{ fontSize: 11.5, color: 'var(--fg-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {customerName}
        </div>
        <div style={{ fontSize: 15.5, fontWeight: 650, color: 'var(--fg)' }}>{project.title}</div>
      </div>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 650,
        padding: '5px 10px', borderRadius: 20, whiteSpace: 'nowrap', ...statusChip.style,
      }}>
        {statusChip.label}
      </span>
    </div>
  )
}

function Bucket({ title, projects, customerNameFor, onOpen }: {
  title: string
  projects: Project[]
  customerNameFor: (accountId: string) => string
  onOpen: (id: string) => void
}) {
  if (projects.length === 0) return null
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, fontWeight: 700,
        letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--fg-dim)', marginBottom: 10,
      }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          minWidth: 18, height: 18, padding: '0 5px', borderRadius: 20,
          background: 'var(--surface-3)', color: 'var(--fg-muted)', fontSize: 10.5, fontWeight: 700,
        }}>
          {projects.length}
        </span>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {projects.map(p => (
          <ProjectRow key={p.id} project={p} customerName={customerNameFor(p.accountId)} onOpen={() => onOpen(p.id)} />
        ))}
      </div>
    </div>
  )
}

export function ProjectsArchiveList({ projects, customerNameFor, onOpen }: {
  projects: Project[]
  customerNameFor: (accountId: string) => string
  onOpen: (id: string) => void
}) {
  const paused = projects.filter(p => p.status === 'paused')
  const completed = projects.filter(p => p.status === 'completed')

  if (paused.length === 0 && completed.length === 0) {
    return (
      <div style={{ padding: '32px 20px', color: 'var(--fg-dim)', textAlign: 'center', fontSize: 13 }}>
        Kein pausiertes oder abgeschlossenes Projekt.
      </div>
    )
  }

  return (
    <>
      <Bucket title="Pausiert" projects={paused} customerNameFor={customerNameFor} onOpen={onOpen} />
      <Bucket title="Abgeschlossen" projects={completed} customerNameFor={customerNameFor} onOpen={onOpen} />
    </>
  )
}
```

- [ ] **Step 2: Test ausführen, Erfolg verifizieren**

Run: `npx vitest run src/components/projects/ProjectsArchiveList.test.tsx`
Expected: PASS (3 Tests).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck 2>&1 | grep ProjectsArchiveList`
Expected: keine Fehler (Datei wird noch nirgends importiert — folgt in Task 15).

- [ ] **Step 4: Commit**

```bash
git add src/components/projects/ProjectsArchiveList.tsx src/components/projects/ProjectsArchiveList.test.tsx
git commit -m "refactor(projects): Bucket-Ansicht als ProjectsArchiveList extrahiert, mit Tests"
```

---

## Task 14: `ProjectsTimeline` — Wochen-Grid mit Phasen-Balken und Gates

**Files:**
- Create: `src/components/projects/ProjectsTimeline.tsx`
- Test: `src/components/projects/ProjectsTimeline.test.tsx`

**Interfaces:**
- Consumes: `Project`, `ProjectPhase` (Task 6); `TimelineWeek`, `dateToTimelineOffset`, `rollingWeeks` (Task 11); `HealthLevel`, `projectHealthZeit`, `projectHealthBudget`, `projectHealthStimmung` (Task 12).
- Produces: `ProjectsTimeline({ projects, phasesByProject, customerNameFor, weeks, today, onOpen }): JSX.Element`. Task 15 rendert diese Komponente mit den gefilterten aktiven Projekten.

- [ ] **Step 0: Fehlschlagenden Test zuerst schreiben**

Neue Datei `src/components/projects/ProjectsTimeline.test.tsx`:

```typescript
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ProjectsTimeline } from './ProjectsTimeline'
import { rollingWeeks } from '@/lib/projects/timeline-weeks'
import type { Project, ProjectPhase } from '@/types/project.types'

afterEach(cleanup)

const today = new Date(2026, 4, 18) // Mo, 18.05.2026 -> KW 21
const weeks = rollingWeeks(today, 4, 10)

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1', workspaceId: 'ws-1', accountId: 'a1', title: 'Brand Refresh', description: null,
    status: 'active', currentPhaseId: null, createdAt: '2026-01-01', updatedAt: '2026-01-01', completedAt: null,
    retainerMonthly: 8500, retainerHours: 60, retainerMonths: 12,
    ...overrides,
  }
}

function phase(overrides: Partial<ProjectPhase> = {}): ProjectPhase {
  return {
    id: 'ph1', projectId: 'p1', name: 'Konzeptfreigabe', orderIndex: 0, createdAt: '2026-01-01',
    startDate: '2026-04-27', endDate: '2026-05-11', gateName: 'Konzeptfreigabe',
    gateState: 'pending', gateDate: '2026-05-11', gateApprovedBy: null, progressPercent: 78,
    ...overrides,
  }
}

describe('ProjectsTimeline', () => {
  it('zeigt eine Leer-Meldung, wenn kein Projekt im Filter ist', () => {
    render(<ProjectsTimeline projects={[]} phasesByProject={{}} customerNameFor={() => 'Kunde'} weeks={weeks} today={today} onOpen={() => {}} />)
    expect(screen.getByText('Kein Projekt in diesem Filter.')).toBeTruthy()
  })

  it('rendert die KW-Nummer der ersten Woche im Kopf', () => {
    render(<ProjectsTimeline projects={[]} phasesByProject={{}} customerNameFor={() => 'Kunde'} weeks={weeks} today={today} onOpen={() => {}} />)
    expect(screen.getByText(String(weeks[0].kw))).toBeTruthy()
  })

  it('rendert Projekttitel und Phasenbalken-Titel mit Fortschritt', () => {
    render(
      <ProjectsTimeline
        projects={[project()]} phasesByProject={{ p1: [phase()] }}
        customerNameFor={() => 'TechCorp'} weeks={weeks} today={today} onOpen={() => {}}
      />,
    )
    expect(screen.getByText('Brand Refresh')).toBeTruthy()
    expect(screen.getByTitle('Konzeptfreigabe · 78 %')).toBeTruthy()
  })

  it('ruft onOpen mit der Projekt-Id auf, wenn eine Zeile geklickt wird', () => {
    const opened: string[] = []
    render(
      <ProjectsTimeline
        projects={[project()]} phasesByProject={{ p1: [phase()] }}
        customerNameFor={() => 'TechCorp'} weeks={weeks} today={today} onOpen={id => opened.push(id)}
      />,
    )
    fireEvent.click(screen.getByText('Brand Refresh'))
    expect(opened).toEqual(['p1'])
  })
})
```

Run: `npx vitest run src/components/projects/ProjectsTimeline.test.tsx`
Expected: FAIL — Modul `./ProjectsTimeline` existiert nicht.

- [ ] **Step 1: Komponente schreiben**

Neue Datei `src/components/projects/ProjectsTimeline.tsx`:

```typescript
import type { Project, ProjectPhase } from '@/types/project.types'
import type { TimelineWeek } from '@/lib/projects/timeline-weeks'
import { dateToTimelineOffset } from '@/lib/projects/timeline-weeks'
import { projectHealthZeit, projectHealthBudget, projectHealthStimmung, type HealthLevel } from '@/lib/projects/signals'

const HEALTH_COLOR: Record<HealthLevel, string> = {
  ok: 'var(--ok)', warn: 'var(--warn)', bad: 'var(--danger)',
}

const GATE_COLOR: Record<ProjectPhase['gateState'], string> = {
  approved: 'var(--ok)', pending: 'var(--warn)', open: 'var(--border-strong)',
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function pct(offset: number, totalWeeks: number): string {
  return `${(offset / totalWeeks) * 100}%`
}

function ProjectLane({ project, phases, customerName, weeks, onOpen }: {
  project: Project
  phases: ProjectPhase[]
  customerName: string
  weeks: TimelineWeek[]
  onOpen: () => void
}) {
  const totalWeeks = weeks.length

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', borderTop: '1px solid var(--border)' }}>
      <button
        onClick={onOpen}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
          borderRight: '1px solid var(--border)', textAlign: 'left', background: 'none', border: 'none',
          borderRightWidth: 1, borderRightStyle: 'solid', borderRightColor: 'var(--border)', cursor: 'pointer', width: '100%',
        }}
      >
        <span style={{
          width: 30, height: 30, flex: 'none', borderRadius: 9, border: '1px solid var(--border-strong)',
          display: 'grid', placeItems: 'center', fontSize: 10.5, fontWeight: 600, color: 'var(--fg-muted)', background: 'var(--surface-3)',
        }}>
          {initials(customerName)}
        </span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <strong style={{ display: 'block', fontSize: 13.5, fontWeight: 560, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {project.title}
          </strong>
          <span style={{ display: 'block', fontSize: 11, color: 'var(--fg-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {customerName}
          </span>
        </span>
        <span style={{ display: 'flex', gap: 3, flex: 'none' }} title="Zeit · Budget · Stimmung">
          {([projectHealthZeit(phases, new Date()), projectHealthBudget(), projectHealthStimmung()] as HealthLevel[]).map((h, i) => (
            <i key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: HEALTH_COLOR[h], display: 'block' }} />
          ))}
        </span>
      </button>

      <div style={{ position: 'relative', height: 62, cursor: 'pointer' }} onClick={onOpen}>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: `repeat(${totalWeeks},1fr)`, pointerEvents: 'none' }}>
          {weeks.map((w, i) => <i key={i} style={{ borderLeft: i === 0 ? 'none' : '1px solid var(--border)', opacity: 0.5 }} />)}
        </div>

        {phases.map(phase => {
          const from = dateToTimelineOffset(phase.startDate, weeks)
          const to = dateToTimelineOffset(phase.endDate, weeks)
          if (from == null && to == null) return null
          const left = Math.max(0, from ?? 0)
          const right = Math.min(totalWeeks, to ?? totalWeeks)
          if (right <= left) return null
          return (
            <div
              key={phase.id}
              title={`${phase.name} · ${phase.progressPercent} %`}
              style={{
                position: 'absolute', top: 12, height: 22, borderRadius: 6,
                left: pct(left, totalWeeks), width: `calc(${pct(right - left, totalWeeks)} - 4px)`,
                display: 'flex', alignItems: 'center', padding: '0 9px', fontSize: 11, fontWeight: 500,
                color: 'var(--fg-2)', whiteSpace: 'nowrap', overflow: 'hidden',
                background: phase.progressPercent >= 100 ? 'var(--surface-3)' : 'var(--accent-soft)',
                border: `1px solid ${phase.progressPercent >= 100 ? 'var(--border-strong)' : 'var(--accent)'}`,
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{phase.name}</span>
            </div>
          )
        })}

        {phases.map(phase => {
          const at = dateToTimelineOffset(phase.endDate, weeks)
          if (at == null) return null
          return (
            <div
              key={`${phase.id}-gate`}
              title={`${phase.gateName} · ${phase.gateDate ?? 'kein Termin'}`}
              style={{
                position: 'absolute', top: 9, left: pct(at, totalWeeks), width: 9, height: 9,
                transform: 'translateX(-50%) rotate(45deg)', borderRadius: 2, background: GATE_COLOR[phase.gateState],
              }}
            />
          )
        })}
      </div>
    </div>
  )
}

export function ProjectsTimeline({ projects, phasesByProject, customerNameFor, weeks, today, onOpen }: {
  projects: Project[]
  phasesByProject: Record<string, ProjectPhase[]>
  customerNameFor: (accountId: string) => string
  weeks: TimelineWeek[]
  today: Date
  onOpen: (id: string) => void
}) {
  const totalWeeks = weeks.length
  const todayOffset = dateToTimelineOffset(today.toISOString().slice(0, 10), weeks)

  if (projects.length === 0) {
    return (
      <div style={{ padding: '32px 20px', color: 'var(--fg-dim)', textAlign: 'center', fontSize: 13, border: '1px solid var(--border)', borderRadius: 16 }}>
        Kein Projekt in diesem Filter.
      </div>
    )
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 16, background: 'var(--surface)', overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
        <div style={{ padding: '10px 14px', fontSize: 10, fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-dim)', borderRight: '1px solid var(--border)' }}>
          Projekt · Kunde
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${totalWeeks},1fr)` }}>
          {weeks.map((w, i) => (
            <div key={i} style={{ padding: '8px 0 7px', textAlign: 'center', fontSize: 10, color: 'var(--fg-dim)', borderLeft: i === 0 ? 'none' : '1px solid var(--border)' }}>
              <b style={{ display: 'block', fontWeight: 500, color: 'var(--fg-muted)', fontSize: 10.5 }}>{w.kw}</b>
              {w.monthLabel ?? ''}
            </div>
          ))}
        </div>
      </div>

      <div style={{ position: 'relative' }}>
        {todayOffset != null && (
          <div style={{ position: 'absolute', top: 0, bottom: 0, width: 1, background: 'var(--accent)', zIndex: 1, left: `calc(260px + (100% - 260px) * ${todayOffset / totalWeeks})` }} />
        )}
        {projects.map(project => (
          <ProjectLane
            key={project.id}
            project={project}
            phases={phasesByProject[project.id] ?? []}
            customerName={customerNameFor(project.accountId)}
            weeks={weeks}
            onOpen={() => onOpen(project.id)}
          />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Test ausführen, Erfolg verifizieren**

Run: `npx vitest run src/components/projects/ProjectsTimeline.test.tsx`
Expected: PASS (4 Tests).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck 2>&1 | grep ProjectsTimeline`
Expected: keine Fehler (noch nicht importiert — folgt in Task 15).

- [ ] **Step 4: Commit**

```bash
git add src/components/projects/ProjectsTimeline.tsx src/components/projects/ProjectsTimeline.test.tsx
git commit -m "feat(projects): ProjectsTimeline -- Wochen-Grid mit Phasen-Balken und Gates, mit Tests"
```

---

## Task 15: `ProjectsOverviewRoute` neu verdrahten

**Files:**
- Modify: `src/routes/ProjectsOverviewRoute.tsx`

**Interfaces:**
- Consumes: `ProjectsTimeline` (Task 14), `ProjectsArchiveList` (Task 13), `rollingWeeks` (Task 11), `projectSignals` (Task 12), `useProjectsStore` (Task 10, insb. `loadPhases`).
- Produces: kompletter Übersichts-Screen — Kopfzeile, Filter-Chips, Timeline/Archiv-Umschalter, "Diese Woche wird entschieden"-Liste.

- [ ] **Step 1: Datei komplett ersetzen**

```typescript
import { useEffect, useMemo, useState } from 'react'
import { useProjectsStore } from '@/store/projects.store'
import { useCustomersStore } from '@/store/customers.store'
import { useUiStore } from '@/store/ui.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { FolderKanban, ChevronRight } from 'lucide-react'
import { NewProjectModal } from '@/components/projects/NewProjectModal'
import { ProjectsTimeline } from '@/components/projects/ProjectsTimeline'
import { ProjectsArchiveList } from '@/components/projects/ProjectsArchiveList'
import { rollingWeeks } from '@/lib/projects/timeline-weeks'
import { projectSignals } from '@/lib/projects/signals'

type Filter = 'alle' | 'brauchen' | 'gate'

export function ProjectsOverviewRoute() {
  const projects = useProjectsStore(s => s.projects)
  const loadProjects = useProjectsStore(s => s.load)
  const phasesByProject = useProjectsStore(s => s.phasesByProject)
  const loadPhases = useProjectsStore(s => s.loadPhases)
  const customers = useCustomersStore(s => s.customers)
  const setSelectedProjectId = useUiStore(s => s.setSelectedProjectId)
  const setAppView = useUiStore(s => s.setAppView)
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''

  const [showNewProjectModal, setShowNewProjectModal] = useState(false)
  const [filter, setFilter] = useState<Filter>('alle')
  const [showArchive, setShowArchive] = useState(false)

  const today = useMemo(() => new Date(), [])
  const weeks = useMemo(() => rollingWeeks(today), [today])

  useEffect(() => { if (workspaceId) loadProjects(workspaceId) }, [workspaceId, loadProjects])

  const active = useMemo(() => projects.filter(p => p.status === 'active'), [projects])

  // Die Timeline braucht Phasen ALLER aktiven Projekte gleichzeitig (Balken,
  // Gates, Signale) -- anders als ProjectDetailRoute, das nur die Phasen des
  // gerade geöffneten Projekts lädt.
  useEffect(() => {
    active.forEach(p => { if (!phasesByProject[p.id]) loadPhases(p.id) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.map(p => p.id).join(',')])

  const customerNameFor = (accountId: string) =>
    customers.find(c => c.id === accountId)?.name ?? 'Unbekannter Kunde'

  function openProject(id: string) {
    setSelectedProjectId(id)
    setAppView('project_detail')
  }

  const decisions = useMemo(
    () => active.flatMap(p => projectSignals(phasesByProject[p.id] ?? [], today).map(sig => ({ project: p, sig }))),
    [active, phasesByProject, today],
  )

  const filteredProjects = useMemo(() => {
    if (filter === 'alle') return active
    if (filter === 'brauchen') return active.filter(p => decisions.some(d => d.project.id === p.id))
    return active.filter(p => (phasesByProject[p.id] ?? []).some(ph => ph.gateState === 'pending'))
  }, [active, filter, decisions, phasesByProject])

  const mrr = active.reduce((s, p) => s + p.retainerMonthly, 0)
  const needs = active.filter(p => decisions.some(d => d.project.id === p.id)).length

  return (
    <div className="main-inner" style={{ padding: '24px 28px 40px', overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <span style={{ display: 'block', fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--fg-dim)', marginBottom: 8 }}>
            Portfolio
          </span>
          <h1 style={{ fontSize: 24, fontWeight: 650, margin: 0, letterSpacing: '-0.01em' }}>Projekte</h1>
        </div>
        <div style={{ display: 'flex', gap: 18, alignItems: 'center', fontSize: 11, color: 'var(--fg-muted)' }}>
          <span><b style={{ color: 'var(--fg)' }}>{active.length}</b> laufend</span>
          <span><b style={{ color: 'var(--fg)' }}>{mrr.toLocaleString('de-DE')} €</b> Retainer / Monat</span>
          {needs > 0 && <span style={{ color: 'var(--warn)' }}><b style={{ color: 'var(--warn)' }}>{needs}</b> brauchen dich</span>}
          <button className="btn-primary" onClick={() => setShowNewProjectModal(true)}>+ Neues Projekt</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', paddingBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 2, padding: 3, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 999 }}>
          {([['alle', 'Alle'], ['brauchen', 'Brauchen dich'], ['gate', 'Gate offen']] as [Filter, string][]).map(([id, label]) => (
            <button
              key={id} onClick={() => { setFilter(id); setShowArchive(false) }}
              style={{
                padding: '6px 13px', borderRadius: 999, fontSize: 12.5, fontWeight: 500, border: 'none', cursor: 'pointer',
                background: !showArchive && filter === id ? 'var(--surface)' : 'transparent',
                color: !showArchive && filter === id ? 'var(--fg)' : 'var(--fg-muted)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowArchive(a => !a)}
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--fg-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          {showArchive ? 'Zur Timeline' : 'Archiv (pausiert / abgeschlossen)'} <ChevronRight size={13} />
        </button>
      </div>

      {projects.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '48px 20px', color: 'var(--fg-dim)', textAlign: 'center' }}>
          <FolderKanban size={32} />
          <div>Noch keine Projekte angelegt.</div>
          <button className="btn-primary" style={{ marginTop: 8 }} onClick={() => setShowNewProjectModal(true)}>+ Neues Projekt</button>
        </div>
      ) : showArchive ? (
        <ProjectsArchiveList projects={projects} customerNameFor={customerNameFor} onOpen={openProject} />
      ) : (
        <>
          <ProjectsTimeline
            projects={filteredProjects} phasesByProject={phasesByProject}
            customerNameFor={customerNameFor} weeks={weeks} today={today} onOpen={openProject}
          />

          <div style={{ marginTop: 26 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Diese Woche wird entschieden</h3>
              <span style={{ fontSize: 10, color: 'var(--fg-dim)' }}>{decisions.length} Punkte</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {decisions.map(({ project, sig }) => (
                <button
                  key={sig.phaseId} onClick={() => openProject(project.id)}
                  style={{
                    display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 2px',
                    borderTop: '1px solid var(--border)', textAlign: 'left', width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: '50%', marginTop: 5, flex: 'none', background: sig.tone === 'bad' ? 'var(--danger)' : 'var(--warn)' }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ display: 'block', fontSize: 12.5, fontWeight: 550 }}>{sig.label} — {project.title}</strong>
                    <span style={{ display: 'block', fontSize: 11.5, color: 'var(--fg-muted)', marginTop: 2 }}>{sig.detail}</span>
                  </span>
                </button>
              ))}
              {decisions.length === 0 && (
                <div style={{ padding: '14px 2px', fontSize: 12.5, color: 'var(--fg-dim)' }}>Nichts brennt diese Woche.</div>
              )}
            </div>
          </div>
        </>
      )}

      {showNewProjectModal && <NewProjectModal onClose={() => setShowNewProjectModal(false)} />}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck 2>&1 | grep -iE "ProjectsOverviewRoute|projects"`
Expected: Fehler nur noch in `NewProjectModal.tsx` (Task 16, `upsert`-Aufruf fehlt Retainer-Felder).

- [ ] **Step 3: Commit**

```bash
git add src/routes/ProjectsOverviewRoute.tsx
git commit -m "feat(projects): Uebersicht auf Timeline umgebaut, Archiv als Umschalter"
```

---

## Task 16: `NewProjectModal` — Retainer-Felder

**Files:**
- Modify: `src/components/projects/NewProjectModal.tsx`

**Interfaces:**
- Consumes: `useProjectsStore().upsert` (Task 6 erweitertes `UpsertProjectPayload`), `useProjectsStore().createPhase` (Task 6 erweitertes `CreateProjectPhasePayload`).
- Produces: funktionierendes Anlegen-Formular mit Retainer-Feldern; die optionale "Erste Phase" berechnet Start-/Enddatum/Gate-Namen selbst (keine UI-Änderung an diesem Feld nötig).

- [ ] **Step 1: State um Retainer-Felder erweitern**

In `src/components/projects/NewProjectModal.tsx:21-27` ersetzen:

```typescript
  const [customerId, setCustomerId] = useState(presetCustomerId ?? '')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [firstPhaseName, setFirstPhaseName] = useState('')
  const [retainerMonthly, setRetainerMonthly] = useState('')
  const [retainerHours, setRetainerHours] = useState('')
  const [retainerMonths, setRetainerMonths] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null)
```

- [ ] **Step 2: `handleSave` um Retainer-Payload und Phasen-Defaultwerte erweitern**

In `src/components/projects/NewProjectModal.tsx:32-59` ersetzen:

```typescript
  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    setSaveError(null)
    try {
      let projectId = createdProjectId
      if (!projectId) {
        const project = await upsert({
          workspaceId,
          accountId: customerId,
          title: title.trim(),
          description: description.trim() || undefined,
          retainerMonthly: Number(retainerMonthly) || 0,
          retainerHours: Number(retainerHours) || 0,
          retainerMonths: retainerMonths.trim() ? Number(retainerMonths) : null,
        })
        projectId = project.id
        setCreatedProjectId(projectId)
      }
      if (firstPhaseName.trim()) {
        const start = new Date()
        const end = new Date(start)
        end.setDate(end.getDate() + 14)
        const toIsoDate = (d: Date) => d.toISOString().slice(0, 10)
        await createPhase({
          projectId, name: firstPhaseName.trim(),
          startDate: toIsoDate(start), endDate: toIsoDate(end), gateName: 'Freigabe',
        })
      }
      setSelectedProjectId(projectId)
      setAppView('project_detail')
      onClose()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }
```

- [ ] **Step 3: Formularfelder einfügen**

In `src/components/projects/NewProjectModal.tsx:120-126` (nach dem "Erste Phase"-Feld-Block, vor dem schließenden `</div>` der Feldliste) einfügen:

```typescript
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 5 }}>Retainer € / Monat</label>
              <input
                className="mock-input" type="number" min={0} value={retainerMonthly}
                onChange={e => setRetainerMonthly(e.target.value)} placeholder="z.B. 4500"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 5 }}>Inkl. Std. / Monat</label>
              <input
                className="mock-input" type="number" min={0} value={retainerHours}
                onChange={e => setRetainerHours(e.target.value)} placeholder="z.B. 30"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 5 }}>Laufzeit (Monate)</label>
              <input
                className="mock-input" type="number" min={0} value={retainerMonths}
                onChange={e => setRetainerMonths(e.target.value)} placeholder="leer = unbefristet"
              />
            </div>
          </div>
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck 2>&1 | grep -i project`
Expected: keine Fehler mehr zu `NewProjectModal.tsx`. Verbleibende Fehler nur noch in `ProjectDetailRoute.tsx` (Task 17).

- [ ] **Step 5: Manuell im Dev-Build prüfen**

Run: `npm run dev` (falls noch nicht laufend), dann im App-Fenster: "+ Neues Projekt" → Kunde wählen, Titel + Retainer-Betrag/Std./Laufzeit eingeben, optional "Erste Phase" ausfüllen → Speichern.
Expected: Projekt wird angelegt, `ProjectDetailRoute` öffnet sich; bei ausgefüllter "Erste Phase" erscheint diese im Stepper.

- [ ] **Step 6: Commit**

```bash
git add src/components/projects/NewProjectModal.tsx
git commit -m "feat(projects): NewProjectModal -- Retainer-Felder beim Anlegen"
```

---

## Task 17: `ProjectDetailRoute` — Phase mit Zeitraum/Gate anlegen + Fortschritt pflegen

**Files:**
- Modify: `src/routes/ProjectDetailRoute.tsx`

**Interfaces:**
- Consumes: `useProjectsStore().createPhase` (erweitertes `CreateProjectPhasePayload`, Task 6), `useProjectsStore().updatePhaseProgress` (Task 10).
- Produces: `NewPhaseForm` verlangt jetzt Start-/Enddatum und Gate-Namen (Pflichtfelder); die aktive Phase im `Stepper` bekommt ein Fortschritts-Eingabefeld, das `updatePhaseProgress` aufruft. Kein neues Deliverables-/Freigabe-UI (bleibt Etappe 3).

- [ ] **Step 1: `NewPhaseForm` um Pflichtfelder erweitern**

In `src/routes/ProjectDetailRoute.tsx:105-123` (die komplette `NewPhaseForm`-Funktion) ersetzen:

```typescript
function NewPhaseForm({ onCreate }: {
  onCreate: (name: string, startDate: string, endDate: string, gateName: string) => void
}) {
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [gateName, setGateName] = useState('Freigabe')

  const canCreate = name.trim() !== '' && startDate !== '' && endDate !== '' && gateName.trim() !== ''

  const submit = () => {
    if (!canCreate) return
    onCreate(name.trim(), startDate, endDate, gateName.trim())
    setName(''); setStartDate(''); setEndDate(''); setGateName('Freigabe')
  }

  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <div>
        <label style={{ fontSize: 10.5, color: 'var(--fg-dim)', display: 'block', marginBottom: 3 }}>Name</label>
        <input
          className="mock-input" value={name} onChange={e => setName(e.target.value)}
          placeholder="z.B. Review" style={{ fontSize: 13, width: 180 }}
        />
      </div>
      <div>
        <label style={{ fontSize: 10.5, color: 'var(--fg-dim)', display: 'block', marginBottom: 3 }}>Start</label>
        <input
          className="mock-input" type="date" value={startDate}
          onChange={e => setStartDate(e.target.value)} style={{ fontSize: 13 }}
        />
      </div>
      <div>
        <label style={{ fontSize: 10.5, color: 'var(--fg-dim)', display: 'block', marginBottom: 3 }}>Ende</label>
        <input
          className="mock-input" type="date" value={endDate}
          onChange={e => setEndDate(e.target.value)} style={{ fontSize: 13 }}
        />
      </div>
      <div>
        <label style={{ fontSize: 10.5, color: 'var(--fg-dim)', display: 'block', marginBottom: 3 }}>Gate-Name</label>
        <input
          className="mock-input" value={gateName} onChange={e => setGateName(e.target.value)}
          placeholder="Freigabe" style={{ fontSize: 13, width: 140 }}
        />
      </div>
      <button className="btn-primary" style={{ fontSize: 12, padding: '6px 12px' }} disabled={!canCreate} onClick={submit}>
        + Phase
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Aufrufer von `NewPhaseForm` anpassen**

In `src/routes/ProjectDetailRoute.tsx:374-381` ersetzen:

```typescript
      {phases.length === 0 ? (
        <NewPhaseForm onCreate={(name, startDate, endDate, gateName) =>
          createPhase({ projectId: project.id, name, startDate, endDate, gateName })} />
      ) : (
        <>
          <Stepper phases={phases} currentPhaseId={project.currentPhaseId} onDeletePhase={handleDeletePhase} />
          <NewPhaseForm onCreate={(name, startDate, endDate, gateName) =>
            createPhase({ projectId: project.id, name, startDate, endDate, gateName })} />
        </>
      )}
```

- [ ] **Step 3: Fortschritts-Eingabefeld an der aktiven Phase im `Stepper` ergänzen**

`Stepper` bekommt eine neue Prop `onUpdateProgress`. In `src/routes/ProjectDetailRoute.tsx:23-27` (Funktionssignatur) ersetzen:

```typescript
function Stepper({ phases, currentPhaseId, onDeletePhase, onUpdateProgress }: {
  phases: { id: string; name: string; orderIndex: number; progressPercent: number }[]
  currentPhaseId: string | null
  onDeletePhase: (phaseId: string) => Promise<void>
  onUpdateProgress: (phaseId: string, progressPercent: number) => void
}) {
```

Direkt nach dem Namen-`<div>` der aktiven Phase (`src/routes/ProjectDetailRoute.tsx:67-69`, der Block `<div style={{ fontSize: 14, ... }}>{phase.name}</div>`) einfügen — nur für `state === 'now'` sichtbar:

```typescript
              <div style={{ fontSize: 14, fontWeight: 650, color: state === 'now' ? 'var(--accent-text)' : 'var(--fg)' }}>
                {phase.name}
              </div>
              {state === 'now' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="range" min={0} max={100} value={phase.progressPercent}
                    onChange={e => onUpdateProgress(phase.id, Number(e.target.value))}
                    style={{ width: 90 }}
                  />
                  <span style={{ fontSize: 10.5, color: 'var(--fg-dim)', fontVariantNumeric: 'tabular-nums' }}>
                    {phase.progressPercent}%
                  </span>
                </div>
              )}
```

- [ ] **Step 4: `ProjectDetailRoute` verdrahtet `updatePhaseProgress` und übergibt es an `Stepper`**

In `src/routes/ProjectDetailRoute.tsx:242` (nach `const deletePhase = useProjectsStore(s => s.deletePhase)`) einfügen:

```typescript
  const updatePhaseProgress = useProjectsStore(s => s.updatePhaseProgress)
```

Und den `<Stepper .../>`-Aufruf (`src/routes/ProjectDetailRoute.tsx:378`) erweitern:

```typescript
          <Stepper
            phases={phases} currentPhaseId={project.currentPhaseId} onDeletePhase={handleDeletePhase}
            onUpdateProgress={(phaseId, progressPercent) => updatePhaseProgress(phaseId, project.id, progressPercent)}
          />
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck 2>&1 | grep -i project`
Expected: keine Fehler mehr zu Projekt-Dateien.

- [ ] **Step 6: Manuell im Dev-Build prüfen**

Im laufenden `npm run dev`: bestehendes Projekt öffnen → "+ Phase" mit Name/Start/Ende/Gate-Name anlegen → Phase erscheint im Stepper. Bei der aktiven Phase den Fortschritts-Regler bewegen → Wert bleibt nach Seiten-Wechsel (Übersicht → Detail) erhalten. Zurück zur Übersicht: Phasen-Balken der aktiven Phase füllt sich entsprechend, Gate-Raute erscheint an `end_date`.

- [ ] **Step 7: Commit**

```bash
git add src/routes/ProjectDetailRoute.tsx
git commit -m "feat(projects): Phase-Anlage mit Zeitraum/Gate, Fortschritts-Regler an aktiver Phase"
```

---

## Self-Review

**Spec-Abdeckung** (gegen `docs/superpowers/specs/2026-07-26-projekt-portfolio-timeline-design.md` geprüft):
- Datenmodell `projects`/`project_phases` → Task 1–4, 6–7. ✓
- Supabase-Gegenstück → Task 2, 8. ✓
- `projectHealthZeit`/Budget/Stimmung fix ok/derived → Task 12. ✓
- `projectSignals` erweiterbar für Etappe 6 → Task 12 (Kommentar im Code dokumentiert das explizit). ✓
- Rollierendes Wochenfenster statt hartkodierter KW-Range → Task 11. ✓
- Timeline-Übersicht mit Filtern, Balken, Gates, nur `status=active` → Task 14–15. ✓
- Archiv für pausiert/abgeschlossen → Task 13, 15. ✓
- "Diese Woche wird entschieden"-Liste (nur Gate-Signale) → Task 15. ✓
- `NewProjectModal` Retainer-Felder → Task 16. ✓
- "+Phase"-Flow mit Pflicht-Datum/Gate-Name → Task 17. ✓
- Fortschritts-Eingabe an aktiver Phase → Task 17. ✓
- Design-Tokens (Live-Aurora/Sunset, nicht Kobalt/Navy) → alle UI-Tasks nutzen ausschließlich bestehende `var(--...)`-Tokens, keine neuen Farbwerte. ✓
- Testing-Abschnitt der Spec (Rust-Unit-Tests, Frontend-Grenzfälle, Komponenten-Test) → Rust: Task 1/3/4. Frontend-Grenzfälle: Task 11/12. Komponenten-Test der Timeline: Task 14 (`ProjectsTimeline.test.tsx`); Komponenten-Test des Archivs: Task 13 (`ProjectsArchiveList.test.tsx`). Beide zusätzlich mit manuellen Prüfschritten in Task 15/17 abgesichert.

**Korrektur während der Plan-Erstellung:** Der erste Entwurf dieses Plans hatte die Timeline-Komponente nur mit manuellen Prüfschritten versehen, mit der Begründung, `@testing-library/react` sei keine Repo-Abhängigkeit. Beim Prüfen der Baseline im Worktree (`npm install` + `npx vitest run`) stellte sich heraus, dass `@testing-library/react`/`@testing-library/jest-dom` bereits Abhängigkeiten sind und an mehreren Stellen genutzt werden (z.B. `src/components/onboarding/WelcomeIntro.test.tsx`) — der ursprüngliche Scan (`Glob src/routes/*.test.tsx` → 0 Treffer) hatte nur Routes geprüft, nicht Components. Task 13 und Task 14 wurden daraufhin vor Ausführung um `.test.tsx`-Dateien nach demselben Muster ergänzt.

**Platzhalter-Scan:** keine TBD/TODO, keine "add error handling"-Anweisungen ohne Code gefunden.

**Typ-Konsistenz geprüft:**
- `CreateProjectPhasePayload.startDate/endDate/gateName` (Task 6) ↔ Rust `start_date/end_date/gate_name` (Task 4) ↔ Aufrufer in `NewProjectModal.tsx` (Task 16) und `ProjectDetailRoute.tsx` (Task 17) — konsistent.
- `updatePhaseProgress(id, projectId, progressPercent)`-Signatur identisch in Rust-Command (Task 5), Service (Task 9), Gateway (Task 8), Store (Task 10), Aufrufer in `ProjectDetailRoute.tsx` (Task 17).
- `ProjectPhase.gateState: GateState` (Task 6) ↔ `GATE_COLOR`-Record-Keys in `ProjectsTimeline.tsx` (Task 14) — beide decken exakt `'open' | 'pending' | 'approved'` ab.
- `HealthLevel` (Task 12) ↔ `HEALTH_COLOR`-Record in `ProjectsTimeline.tsx` (Task 14) — konsistent.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-26-projekt-portfolio-timeline.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
