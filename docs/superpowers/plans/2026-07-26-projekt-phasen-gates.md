# Projekt-Phasen: Gates + Deliverables (Etappe 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `deliverables`-Feld (JSON-Liste) pro Phase, drei neue Backend-Funktionen für den Gate-Freigabe-Workflow (Freigabe anfragen, Freigabe eintragen, Deliverables aktualisieren), und ersetze den bisherigen Kreis-Stepper im Phasen-Tab durch eine aufklappbare Phasen-Liste mit Deliverables-Checkliste und Gate-Aktionen.

**Architecture:** Additive SQLite-Migration (v39) + passendes Supabase-Cloud-Gegenstück (0028), erweitertes Rust-Struct/-Modul, erweiterte TS-Typen/Mapper/Gateway/Service/Store, eine neue, in sich geschlossene UI-Komponente (`ProjectPhasesList`) mit mehreren internen Unterkomponenten, die den bisherigen `Stepper` in `ProjectDetailRoute.tsx` ersetzt.

**Tech Stack:** Rust + rusqlite + serde_json (SQLite), Supabase Postgres (jsonb-Spalte für den Cloud-Pfad), React + TypeScript, Zustand, Vitest, `@testing-library/react`.

## Global Constraints

- Geld wird als `f64`/`number` in Euro gespeichert (nicht relevant für diese Etappe, aber weiterhin gültig für den Rest der Codebase).
- Datumsfelder (`gate_date`) sind `YYYY-MM-DD`-Strings.
- **`request_gate` setzt `gate_date` NIEMALS automatisch auf "heute"** — das Datumsfeld ist optional und wird 1:1 vom Aufrufer übernommen (auch `null`). Ein automatisches "heute" würde eine Dringlichkeit vortäuschen (sofortiges "warn" in `projectHealthZeit`/`nextMove`), die so nicht gemeint ist.
- `approve_gate` verlangt ein nicht-leeres (getrimmtes) `approved_by` — sowohl Rust- als auch UI-seitig geprüft (Boundary-Validierung, UI-Validierung ersetzt Backend-Validierung nicht).
- `deliverables` wird in Rust **nicht** geparst/typisiert (`String`, roh durchgereicht) — nur als gültiges JSON validiert. Parsen/Serialisieren passiert ausschließlich in TypeScript (Mapper), analog zum bestehenden `todos.checklist`-Muster.
- "Freigabe anfragen" ist auf jeder Phase möglich, unabhängig von ihrer Reihenfolge/Aktivität — keine künstliche Beschränkung auf die aktuell aktive Phase.
- "Erinnern" bleibt ein Platzhalter-Toast (kein echter Mail-Versand) — ehrliche Formulierung, die keinen tatsächlich verschickten Mail-Versand behauptet.
- Kein "Protokoll"-Button bei `approved` — die zwei vorhandenen Felder (`gateDate`, `gateApprovedBy`) werden bereits inline angezeigt, ein Button ohne echten Inhalt dahinter wäre ein toter/fake Button.

---

## Task 1: SQLite-Migration v39 — `deliverables`-Spalte

**Files:**
- Modify: `src-tauri/src/db/migrations.rs`

**Interfaces:**
- Produces: Spalte `project_phases.deliverables TEXT NOT NULL DEFAULT '[]'`. Task 3 (Rust-Struct) liest/schreibt diese Spalte.

- [ ] **Step 1: `CURRENT_VERSION` auf 39 anheben**

In `src-tauri/src/db/migrations.rs:4`:

```rust
const CURRENT_VERSION: u32 = 39;
```

- [ ] **Step 2: Migrations-Arm 39 einfügen**

Direkt vor der `_ => Ok(())`-Zeile (nach dem bestehenden `38 => { ... Ok(()) }`-Block, `src-tauri/src/db/migrations.rs:901`) einfügen:

```rust
        39 => {
            // Etappe 3 des Projekt-Ausbaus: Deliverables (Ergebnisse) pro Phase
            // als JSON-Liste, analog zum todos.checklist-Muster -- Rust parst
            // den Inhalt nicht, nur TypeScript.
            if !column_exists(conn, "project_phases", "deliverables") {
                conn.execute_batch(
                    "ALTER TABLE project_phases ADD COLUMN deliverables TEXT NOT NULL DEFAULT '[]';"
                )?;
            }
            Ok(())
        }
```

- [ ] **Step 3: Migrationstest schreiben**

An das Ende des bestehenden `mod tests`-Blocks in `src-tauri/src/db/migrations.rs` einfügen:

```rust
    #[test]
    fn migration_39_adds_deliverables_column_with_default() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        schema::create_tables(&conn).unwrap();

        for v in 1..=38u32 {
            apply(&conn, v).unwrap();
            set_version(&conn, v).unwrap();
        }
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, created_at, updated_at)
             VALUES ('a1','ws-1','u-1','Test','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO projects (id, workspace_id, account_id, title, status, created_at, updated_at,
             retainer_monthly, retainer_hours, retainer_months)
             VALUES ('p1','ws-1','a1','Test-Projekt','active','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z',0,0,NULL)",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO project_phases (id, project_id, name, order_index, created_at, start_date, end_date, gate_name, gate_state, progress_percent)
             VALUES ('ph1','p1','Konzept',0,'2026-01-01T00:00:00Z','2026-01-01','2026-01-15','Freigabe','open',0)",
            [],
        ).unwrap();

        run(&conn).unwrap();

        assert!(column_exists(&conn, "project_phases", "deliverables"));
        let deliverables: String = conn.query_row(
            "SELECT deliverables FROM project_phases WHERE id = 'ph1'", [], |r| r.get(0),
        ).unwrap();
        assert_eq!(deliverables, "[]");

        run(&conn).unwrap(); // idempotent
    }
```

- [ ] **Step 4: Tests ausführen**

Run: `cd src-tauri && cargo test migration_39 -- --nocapture`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/db/migrations.rs
git commit -m "feat(db): migration v39 -- deliverables-Spalte fuer Phasen"
```

---

## Task 2: Supabase-Migration 0028 — Cloud-Gegenstück

**Files:**
- Create: `supabase/migrations/0028_project_phases_deliverables.sql`

**Interfaces:**
- Produces: `project_phases.deliverables jsonb NOT NULL DEFAULT '[]'::jsonb` im Cloud-Pfad. Task 7 (Gateway) nutzt diese Spalte über den Supabase-Client (native JS-Arrays werden automatisch als jsonb serialisiert/deserialisiert — anders als der SQLite-Pfad, der einen rohen String erwartet).

- [ ] **Step 1: Migrationsdatei schreiben**

```sql
-- Cloud-Gegenstueck zu SQLite-Migration v39 (src-tauri/src/db/migrations.rs).
-- Muss wie 0001-0027 manuell ueber die Management-API auf das Supabase-Projekt
-- angewendet werden (siehe Kommentar in 0026_projects.sql).
--
-- Bewusst jsonb (nicht text): der Supabase-JS-Client (de)serialisiert jsonb-Spalten
-- automatisch zu/von nativen JS-Arrays -- anders als der lokale SQLite-Pfad, wo
-- Rust den Inhalt als rohen String durchreicht. src/data/projects.mapper.ts's
-- parseDeliverables() behandelt beide Formen (String ODER bereits geparstes Array).

alter table public.project_phases
  add column if not exists deliverables jsonb not null default '[]'::jsonb;
```

- [ ] **Step 2: Kein automatisierter Test möglich**

Wie bei früheren Supabase-Migrationen (0001-0027): manuell über die Management-API auf Projekt `mqbjmquscjtytpjebosw` anzuwenden. Nach Anwendung manuell verifizieren:

```sql
select column_name, data_type from information_schema.columns
where table_name = 'project_phases' and column_name = 'deliverables';
```
Erwartet: `deliverables | jsonb`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0028_project_phases_deliverables.sql
git commit -m "feat(db): Supabase-Migration 0028 -- deliverables-Spalte (jsonb)"
```

---

## Task 3: Rust `ProjectPhase` — Deliverables + Gate-Workflow-Funktionen

**Files:**
- Modify: `src-tauri/src/db/project_phase.rs`

**Interfaces:**
- Consumes: Migration v39 (Task 1).
- Produces: `ProjectPhase.deliverables: String`; neue Funktionen `get_by_id(conn, id, project_id) -> Result<ProjectPhase, AppError>`, `request_gate(conn, id, project_id, gate_date: Option<String>) -> Result<ProjectPhase, AppError>`, `approve_gate(conn, id, project_id, approved_by: String) -> Result<ProjectPhase, AppError>`, `update_deliverables(conn, id, project_id, deliverables_json: String) -> Result<ProjectPhase, AppError>`. Task 4 (Commands) exponiert alle drei neuen Funktionen.

- [ ] **Step 1: Struct + `SELECT_COLUMNS`/`map_row` erweitern**

In `src-tauri/src/db/project_phase.rs:7-20` (Struct) das Feld `deliverables: String` nach `progress_percent: i32` ergänzen:

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
    pub deliverables: String,
}
```

`src-tauri/src/db/project_phase.rs:32-50` (`SELECT_COLUMNS` + `map_row`) ersetzen:

```rust
const SELECT_COLUMNS: &str =
    "id, project_id, name, order_index, created_at, start_date, end_date, gate_name, gate_state, gate_date, gate_approved_by, progress_percent, deliverables";

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
        deliverables: r.get(12)?,
    })
}
```

- [ ] **Step 2: `get_by_id`-Helper einführen**

Direkt nach `get_all_for_project` (`src-tauri/src/db/project_phase.rs:52-57`) einfügen:

```rust
/// Einzelne Phase per id+project_id, mit korrekter NotFound-Konvertierung.
/// Von request_gate/approve_gate/update_deliverables genutzt, um Existenz-Check
/// und aktuellen Zustand in einer Abfrage zu bekommen (statt separatem COUNT(*)).
fn get_by_id(conn: &Connection, id: &str, project_id: &str) -> Result<ProjectPhase, AppError> {
    let sql = format!("SELECT {SELECT_COLUMNS} FROM project_phases WHERE id = ?1 AND project_id = ?2");
    conn.query_row(&sql, rusqlite::params![id, project_id], map_row)
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(format!("Phase {id} not found")),
            other => AppError::from(other),
        })
}
```

- [ ] **Step 3: `request_gate`, `approve_gate`, `update_deliverables` hinzufügen**

Direkt nach `update_progress` (`src-tauri/src/db/project_phase.rs:90-108` im aktuellen Stand) einfügen:

```rust
/// Fragt die Freigabe fuer ein Gate an (open -> pending). gate_date ist
/// optional und wird 1:1 uebernommen -- NIE automatisch "heute", das eine
/// Dringlichkeit vortaeuschen wuerde, die so nicht gemeint ist.
pub fn request_gate(conn: &Connection, id: &str, project_id: &str, gate_date: Option<String>) -> Result<ProjectPhase, AppError> {
    let phase = get_by_id(conn, id, project_id)?;
    if phase.gate_state != "open" {
        return Err(AppError::Validation("Freigabe kann nur aus dem Zustand 'open' angefragt werden".to_string()));
    }
    conn.execute(
        "UPDATE project_phases SET gate_state = 'pending', gate_date = ?1 WHERE id = ?2 AND project_id = ?3",
        rusqlite::params![gate_date, id, project_id],
    )?;
    get_by_id(conn, id, project_id)
}

/// Traegt die Freigabe ein (pending -> approved). approved_by ist Pflicht
/// (Freitext, meist der Name der Person beim Kunden, die freigegeben hat --
/// nicht automatisch der eigene Name, da die Freigabe meist vom Kunden kommt).
pub fn approve_gate(conn: &Connection, id: &str, project_id: &str, approved_by: String) -> Result<ProjectPhase, AppError> {
    let trimmed = approved_by.trim();
    if trimmed.is_empty() {
        return Err(AppError::Validation("approved_by darf nicht leer sein".to_string()));
    }
    let phase = get_by_id(conn, id, project_id)?;
    if phase.gate_state != "pending" {
        return Err(AppError::Validation("Freigabe kann nur aus dem Zustand 'pending' eingetragen werden".to_string()));
    }
    let today = chrono::Utc::now().date_naive().to_string();
    conn.execute(
        "UPDATE project_phases SET gate_state = 'approved', gate_date = ?1, gate_approved_by = ?2 WHERE id = ?3 AND project_id = ?4",
        rusqlite::params![today, trimmed, id, project_id],
    )?;
    get_by_id(conn, id, project_id)
}

/// Ersetzt die Deliverables-Liste. Rust prueft nur, dass es sich um gueltiges
/// JSON handelt (Boundary-Validierung) -- die Struktur (Feldnamen etc.) wird
/// nur auf TypeScript-Seite verstanden, analog zum todos.checklist-Muster.
pub fn update_deliverables(conn: &Connection, id: &str, project_id: &str, deliverables_json: String) -> Result<ProjectPhase, AppError> {
    if serde_json::from_str::<serde_json::Value>(&deliverables_json).is_err() {
        return Err(AppError::Validation("deliverables muss gueltiges JSON sein".to_string()));
    }
    get_by_id(conn, id, project_id)?;
    conn.execute(
        "UPDATE project_phases SET deliverables = ?1 WHERE id = ?2 AND project_id = ?3",
        rusqlite::params![deliverables_json, id, project_id],
    )?;
    get_by_id(conn, id, project_id)
}
```

- [ ] **Step 4: `create()`'s Rueckgabe verifizieren (keine Aenderung noetig, nur pruefen)**

`create()` (`src-tauri/src/db/project_phase.rs:64-86` im aktuellen Stand) muss NICHT geaendert werden — die `INSERT`-Anweisung listet `deliverables` nicht explizit auf, die Spalte bekommt automatisch ihren DB-Default `'[]'` (siehe Migration v39). Der abschliessende `SELECT {SELECT_COLUMNS} FROM project_phases WHERE id = ?1` liest die neue Spalte durch die aktualisierte `SELECT_COLUMNS`-Konstante bereits korrekt mit.

- [ ] **Step 5: Bestehende Tests reparieren + neue Tests fuer die drei neuen Funktionen**

Der komplette `#[cfg(test)] mod tests { ... }`-Block in `src-tauri/src/db/project_phase.rs` wird ersetzt (bestehende Tests brauchen keine Aenderung an ihren Assertions, da `deliverables` per Default `'[]'` ist und nicht explizit geprüft wird -- aber neue Tests kommen dazu):

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
        assert_eq!(phase.deliverables, "[]");
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

    #[test]
    fn request_gate_moves_open_to_pending_with_given_date() {
        let conn = setup();
        let phase = create(&conn, phase_payload("p1", "Konzept")).unwrap();
        let updated = request_gate(&conn, &phase.id, "p1", Some("2026-06-01".to_string())).unwrap();
        assert_eq!(updated.gate_state, "pending");
        assert_eq!(updated.gate_date, Some("2026-06-01".to_string()));
    }

    #[test]
    fn request_gate_allows_no_date() {
        let conn = setup();
        let phase = create(&conn, phase_payload("p1", "Konzept")).unwrap();
        let updated = request_gate(&conn, &phase.id, "p1", None).unwrap();
        assert_eq!(updated.gate_state, "pending");
        assert_eq!(updated.gate_date, None);
    }

    #[test]
    fn request_gate_rejects_non_open_phase() {
        let conn = setup();
        let phase = create(&conn, phase_payload("p1", "Konzept")).unwrap();
        request_gate(&conn, &phase.id, "p1", None).unwrap();
        let result = request_gate(&conn, &phase.id, "p1", None);
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn approve_gate_moves_pending_to_approved_with_approver_and_todays_date() {
        let conn = setup();
        let phase = create(&conn, phase_payload("p1", "Konzept")).unwrap();
        request_gate(&conn, &phase.id, "p1", None).unwrap();
        let updated = approve_gate(&conn, &phase.id, "p1", "M. Weber, TechCorp".to_string()).unwrap();
        assert_eq!(updated.gate_state, "approved");
        assert_eq!(updated.gate_approved_by, Some("M. Weber, TechCorp".to_string()));
        assert!(updated.gate_date.is_some());
    }

    #[test]
    fn approve_gate_rejects_empty_approved_by() {
        let conn = setup();
        let phase = create(&conn, phase_payload("p1", "Konzept")).unwrap();
        request_gate(&conn, &phase.id, "p1", None).unwrap();
        let result = approve_gate(&conn, &phase.id, "p1", "   ".to_string());
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn approve_gate_rejects_non_pending_phase() {
        let conn = setup();
        let phase = create(&conn, phase_payload("p1", "Konzept")).unwrap();
        let result = approve_gate(&conn, &phase.id, "p1", "M. Weber".to_string());
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn update_deliverables_stores_valid_json() {
        let conn = setup();
        let phase = create(&conn, phase_payload("p1", "Konzept")).unwrap();
        let json = r#"[{"id":"d1","name":"Moodboard","status":"open"}]"#.to_string();
        let updated = update_deliverables(&conn, &phase.id, "p1", json.clone()).unwrap();
        assert_eq!(updated.deliverables, json);
    }

    #[test]
    fn update_deliverables_rejects_invalid_json() {
        let conn = setup();
        let phase = create(&conn, phase_payload("p1", "Konzept")).unwrap();
        let result = update_deliverables(&conn, &phase.id, "p1", "not json".to_string());
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn update_deliverables_rejects_unknown_phase() {
        let conn = setup();
        let result = update_deliverables(&conn, "missing", "p1", "[]".to_string());
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }
}
```

- [ ] **Step 6: Tests ausführen**

Run: `cd src-tauri && cargo test db::project_phase:: -- --nocapture`
Expected: alle Tests PASS (bestehende 9 + 10 neue = 19).

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/db/project_phase.rs
git commit -m "feat(db): ProjectPhase -- deliverables-Feld + Gate-Workflow (request_gate/approve_gate/update_deliverables)"
```

---

## Task 4: Tauri-Commands für Gate-Workflow

**Files:**
- Modify: `src-tauri/src/commands/project_phase.rs`
- Modify: `src-tauri/src/main.rs`

**Interfaces:**
- Consumes: `db::project_phase::request_gate`, `approve_gate`, `update_deliverables` (Task 3).
- Produces: Tauri-Commands `cmd_request_gate`, `cmd_approve_gate`, `cmd_update_project_phase_deliverables`. Task 8 (TS-Service) ruft alle drei per `invoke(...)` auf.

- [ ] **Step 1: Commands hinzufügen**

An das Ende von `src-tauri/src/commands/project_phase.rs` anfügen:

```rust
#[tauri::command]
pub fn cmd_request_gate(
    db: State<'_, DbPool>, id: String, project_id: String, gate_date: Option<String>,
) -> Result<ProjectPhase, AppError> {
    db::project_phase::request_gate(&db.conn(), &id, &project_id, gate_date)
}

#[tauri::command]
pub fn cmd_approve_gate(
    db: State<'_, DbPool>, id: String, project_id: String, approved_by: String,
) -> Result<ProjectPhase, AppError> {
    db::project_phase::approve_gate(&db.conn(), &id, &project_id, approved_by)
}

#[tauri::command]
pub fn cmd_update_project_phase_deliverables(
    db: State<'_, DbPool>, id: String, project_id: String, deliverables_json: String,
) -> Result<ProjectPhase, AppError> {
    db::project_phase::update_deliverables(&db.conn(), &id, &project_id, deliverables_json)
}
```

- [ ] **Step 2: In `main.rs` registrieren**

In `src-tauri/src/main.rs` nach `commands::project_phase::cmd_update_project_phase_progress,` (Zeile 295) einfügen:

```rust
            commands::project_phase::cmd_request_gate,
            commands::project_phase::cmd_approve_gate,
            commands::project_phase::cmd_update_project_phase_deliverables,
```

- [ ] **Step 3: Build prüfen**

Run: `cd src-tauri && cargo build 2>&1 | tail -40`
Expected: Build erfolgreich.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/project_phase.rs src-tauri/src/main.rs
git commit -m "feat(commands): Gate-Workflow-Commands registriert"
```

---

## Task 5: TypeScript-Typen — `Deliverable` + `deliverables`-Feld

**Files:**
- Modify: `src/types/project.types.ts`

**Interfaces:**
- Produces: `DeliverableStatus`, `Deliverable`, `ProjectPhase.deliverables: Deliverable[]`. Task 6 (Mapper) parst/serialisiert dieses Feld.

- [ ] **Step 1: Typen ergänzen**

In `src/types/project.types.ts` nach `export type GateState = 'open' | 'pending' | 'approved'` (Zeile 2) einfügen:

```typescript
export type DeliverableStatus = 'open' | 'review' | 'done'

export interface Deliverable {
  id: string
  name: string
  status: DeliverableStatus
}
```

In `export interface ProjectPhase { ... }` (aktuell Zeilen 31-44) nach `progressPercent: number` ergänzen:

```typescript
  deliverables: Deliverable[]
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck 2>&1 | grep -i project`
Expected: Fehler in `projects.mapper.ts` (fehlendes `deliverables`-Feld beim Rückgabeobjekt von `projectPhaseRowToPhase`) — erwartet, wird in Task 6 behoben.

- [ ] **Step 3: Commit**

```bash
git add src/types/project.types.ts
git commit -m "feat(types): Deliverable-Typ + ProjectPhase.deliverables"
```

---

## Task 6: Mapper — Deliverables parsen/serialisieren

**Files:**
- Modify: `src/data/projects.mapper.ts`
- Modify: `src/data/projects.mapper.test.ts`

**Interfaces:**
- Consumes: `Deliverable`, `ProjectPhase` (Task 5).
- Produces: `parseDeliverables(raw: unknown): Deliverable[]` (exportiert, da Task 7's Gateway sie für den lokalen Schreib-Pfad ggf. mitverwenden könnte — primär aber intern in `projectPhaseRowToPhase` genutzt); `projectPhaseRowToPhase` liefert jetzt `deliverables: Deliverable[]`.

- [ ] **Step 1: Fehlschlagenden Test zuerst schreiben**

In `src/data/projects.mapper.test.ts`, im `describe('projectPhaseRowToPhase', ...)`-Block (nach den bestehenden zwei Tests) ergänzen:

```typescript
  it('parst deliverables aus einem JSON-String (lokaler SQLite-Pfad)', () => {
    const row = {
      id: 'ph1', project_id: 'p1', name: 'Konzept', order_index: 0, created_at: '2026-01-01',
      start_date: '2026-04-27', end_date: '2026-05-11', gate_name: 'Freigabe',
      gate_state: 'open', gate_date: null, gate_approved_by: null, progress_percent: 0,
      deliverables: '[{"id":"d1","name":"Moodboard","status":"open"}]',
    }
    const phase = projectPhaseRowToPhase(row)
    expect(phase.deliverables).toEqual([{ id: 'd1', name: 'Moodboard', status: 'open' }])
  })

  it('akzeptiert deliverables als bereits geparstes Array (Supabase-jsonb-Pfad)', () => {
    const row = {
      id: 'ph1', project_id: 'p1', name: 'Konzept', order_index: 0, created_at: '2026-01-01',
      start_date: '2026-04-27', end_date: '2026-05-11', gate_name: 'Freigabe',
      gate_state: 'open', gate_date: null, gate_approved_by: null, progress_percent: 0,
      deliverables: [{ id: 'd1', name: 'Moodboard', status: 'open' }],
    }
    const phase = projectPhaseRowToPhase(row)
    expect(phase.deliverables).toEqual([{ id: 'd1', name: 'Moodboard', status: 'open' }])
  })

  it('faellt auf leeres Array zurueck bei fehlendem/ungueltigem deliverables', () => {
    const base = {
      id: 'ph1', project_id: 'p1', name: 'Konzept', order_index: 0, created_at: '2026-01-01',
      start_date: '2026-04-27', end_date: '2026-05-11', gate_name: 'Freigabe',
      gate_state: 'open', gate_date: null, gate_approved_by: null, progress_percent: 0,
    }
    expect(projectPhaseRowToPhase({ ...base }).deliverables).toEqual([])
    expect(projectPhaseRowToPhase({ ...base, deliverables: 'not json' }).deliverables).toEqual([])
    expect(projectPhaseRowToPhase({ ...base, deliverables: '{"not":"an array"}' }).deliverables).toEqual([])
  })
```

Run: `npx vitest run src/data/projects.mapper.test.ts`
Expected: FAIL — `deliverables` fehlt am Rückgabeobjekt.

- [ ] **Step 2: Mapper erweitern**

In `src/data/projects.mapper.ts` nach den Imports (Zeile 1) einfügen:

```typescript
import type { Project, ProjectPhase, Deliverable } from '@/types/project.types'

function parseDeliverables(raw: unknown): Deliverable[] {
  if (Array.isArray(raw)) return raw as Deliverable[]
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}
```

(Ersetzt die bestehende erste Import-Zeile `import type { Project, ProjectPhase } from '@/types/project.types'`.)

`projectPhaseRowToPhase` (aktuell `src/data/projects.mapper.ts:46-61`) um das neue Feld ergänzen:

```typescript
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
    deliverables: parseDeliverables(r.deliverables),
  }
}
```

- [ ] **Step 3: Test ausführen, Erfolg verifizieren**

Run: `npx vitest run src/data/projects.mapper.test.ts`
Expected: PASS (alle bisherigen Tests + 3 neue).

- [ ] **Step 4: Commit**

```bash
git add src/data/projects.mapper.ts src/data/projects.mapper.test.ts
git commit -m "feat(data): Mapper -- deliverables parsen (String- und Array-Form)"
```

---

## Task 7: Gateway — Gate-Workflow lokal + Cloud

**Files:**
- Modify: `src/data/projects.gateway.ts`

**Interfaces:**
- Consumes: `Deliverable`, `ProjectPhase` (Task 5); `parseDeliverables`-Verhalten indirekt über `projectPhaseRowToPhase` (Task 6); `ProjectsService.requestGate/approveGate/updateDeliverables` (Task 8, wird gleich mit dem finalen Namen aufgerufen, existiert dort noch nicht -- analog zum bekannten Muster aus Etappe 1).
- Produces: `ProjectsGateway.requestGate(id, projectId, gateDate: string | null): Promise<ProjectPhase>`, `ProjectsGateway.approveGate(id, projectId, approvedBy: string): Promise<ProjectPhase>`, `ProjectsGateway.updateDeliverables(id, projectId, deliverables: Deliverable[]): Promise<ProjectPhase>`.

- [ ] **Step 1: Import erweitern**

In `src/data/projects.gateway.ts:5-7` `Deliverable` ergänzen:

```typescript
import type {
  Project, UpsertProjectPayload, ProjectPhase, CreateProjectPhasePayload, Deliverable,
} from '@/types/project.types'
```

- [ ] **Step 2: Drei neue Methoden hinzufügen**

Nach `updatePhaseProgress` (aktuell das letzte Element in `ProjectsGateway`, `src/data/projects.gateway.ts:136-143`), vor der schließenden `}` einfügen:

```typescript
  async requestGate(id: string, projectId: string, gateDate: string | null): Promise<ProjectPhase> {
    if (!shared()) return ProjectsService.requestGate(id, projectId, gateDate)
    const { data: current, error: cErr } = await supabase.from('project_phases')
      .select('gate_state').eq('id', id).single()
    if (cErr) fail(cErr)
    if (current.gate_state !== 'open') {
      throw new Error("Freigabe kann nur aus dem Zustand 'open' angefragt werden")
    }
    const { data, error } = await supabase.from('project_phases')
      .update({ gate_state: 'pending', gate_date: gateDate }).eq('id', id).eq('project_id', projectId)
      .select('*').single()
    if (error) fail(error)
    return projectPhaseRowToPhase(data)
  },

  async approveGate(id: string, projectId: string, approvedBy: string): Promise<ProjectPhase> {
    const trimmed = approvedBy.trim()
    if (!trimmed) throw new Error('approved_by darf nicht leer sein')
    if (!shared()) return ProjectsService.approveGate(id, projectId, trimmed)
    const { data: current, error: cErr } = await supabase.from('project_phases')
      .select('gate_state').eq('id', id).single()
    if (cErr) fail(cErr)
    if (current.gate_state !== 'pending') {
      throw new Error("Freigabe kann nur aus dem Zustand 'pending' eingetragen werden")
    }
    const today = new Date().toISOString().slice(0, 10)
    const { data, error } = await supabase.from('project_phases')
      .update({ gate_state: 'approved', gate_date: today, gate_approved_by: trimmed })
      .eq('id', id).eq('project_id', projectId).select('*').single()
    if (error) fail(error)
    return projectPhaseRowToPhase(data)
  },

  async updateDeliverables(id: string, projectId: string, deliverables: Deliverable[]): Promise<ProjectPhase> {
    if (!shared()) return ProjectsService.updateDeliverables(id, projectId, JSON.stringify(deliverables))
    const { data, error } = await supabase.from('project_phases')
      .update({ deliverables }).eq('id', id).eq('project_id', projectId)
      .select('*').single()
    if (error) fail(error)
    return projectPhaseRowToPhase(data)
  },
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck 2>&1 | grep -i project`
Expected: Fehler nur noch in `projects.service.ts` (fehlende `requestGate`/`approveGate`/`updateDeliverables`-Methoden) — behoben in Task 8.

- [ ] **Step 4: Commit**

```bash
git add src/data/projects.gateway.ts
git commit -m "feat(data): ProjectsGateway -- requestGate/approveGate/updateDeliverables"
```

---

## Task 8: Service — Invoke-Wrapper

**Files:**
- Modify: `src/services/projects.service.ts`

**Interfaces:**
- Consumes: `cmd_request_gate`, `cmd_approve_gate`, `cmd_update_project_phase_deliverables` (Task 4).
- Produces: `ProjectsService.requestGate(id, projectId, gateDate): Promise<ProjectPhase>`, `ProjectsService.approveGate(id, projectId, approvedBy): Promise<ProjectPhase>`, `ProjectsService.updateDeliverables(id, projectId, deliverablesJson): Promise<ProjectPhase>`.

- [ ] **Step 1: Methoden hinzufügen**

In `src/services/projects.service.ts` nach `updatePhaseProgress` (Zeile 37-39), vor der schließenden `}` einfügen:

```typescript
  requestGate(id: string, projectId: string, gateDate: string | null): Promise<ProjectPhase> {
    return invoke('cmd_request_gate', { id, projectId, gateDate })
  },
  approveGate(id: string, projectId: string, approvedBy: string): Promise<ProjectPhase> {
    return invoke('cmd_approve_gate', { id, projectId, approvedBy })
  },
  updateDeliverables(id: string, projectId: string, deliverablesJson: string): Promise<ProjectPhase> {
    return invoke('cmd_update_project_phase_deliverables', { id, projectId, deliverablesJson })
  },
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck 2>&1 | grep -i project`
Expected: keine Fehler mehr in `projects.service.ts`/`projects.gateway.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/services/projects.service.ts
git commit -m "feat(services): ProjectsService -- requestGate/approveGate/updateDeliverables"
```

---

## Task 9: Store — drei neue Actions

**Files:**
- Modify: `src/store/projects.store.ts`
- Modify: `src/store/projects.store.test.ts`

**Interfaces:**
- Consumes: `ProjectsGateway.requestGate/approveGate/updateDeliverables` (Task 7).
- Produces: `useProjectsStore().requestGate(id, projectId, gateDate): Promise<void>`, `.approveGate(id, projectId, approvedBy): Promise<void>`, `.updateDeliverables(id, projectId, deliverables): Promise<void>`. Task 11 (`ProjectDetailRoute`/`ProjectPhasesList`) ruft alle drei auf.

- [ ] **Step 1: Fehlschlagende Tests zuerst schreiben**

In `src/store/projects.store.test.ts` nach dem bestehenden `describe('useProjectsStore.updatePhaseProgress', ...)`-Block ergänzen:

```typescript
describe('useProjectsStore gate/deliverables actions', () => {
  const basePhase = {
    id: 'ph1', projectId: 'p1', name: 'Konzept', orderIndex: 0, createdAt: '2026-01-01',
    startDate: '2026-04-27', endDate: '2026-05-11', gateName: 'Freigabe', gateState: 'open' as const,
    gateDate: null, gateApprovedBy: null, progressPercent: 0, deliverables: [],
  }

  beforeEach(() => {
    useProjectsStore.setState({ projects: [], phasesByProject: { p1: [basePhase] }, isLoading: false, error: null })
    vi.mocked(ProjectsGateway.requestGate).mockReset()
    vi.mocked(ProjectsGateway.approveGate).mockReset()
    vi.mocked(ProjectsGateway.updateDeliverables).mockReset()
  })

  it('requestGate aktualisiert die Phase im Store', async () => {
    vi.mocked(ProjectsGateway.requestGate).mockResolvedValue({ ...basePhase, gateState: 'pending', gateDate: '2026-06-01' })
    await useProjectsStore.getState().requestGate('ph1', 'p1', '2026-06-01')
    expect(useProjectsStore.getState().phasesByProject['p1'][0].gateState).toBe('pending')
  })

  it('approveGate aktualisiert die Phase im Store', async () => {
    vi.mocked(ProjectsGateway.approveGate).mockResolvedValue({ ...basePhase, gateState: 'approved', gateApprovedBy: 'M. Weber' })
    await useProjectsStore.getState().approveGate('ph1', 'p1', 'M. Weber')
    expect(useProjectsStore.getState().phasesByProject['p1'][0].gateApprovedBy).toBe('M. Weber')
  })

  it('updateDeliverables aktualisiert die Phase im Store', async () => {
    const deliverables = [{ id: 'd1', name: 'Moodboard', status: 'open' as const }]
    vi.mocked(ProjectsGateway.updateDeliverables).mockResolvedValue({ ...basePhase, deliverables })
    await useProjectsStore.getState().updateDeliverables('ph1', 'p1', deliverables)
    expect(useProjectsStore.getState().phasesByProject['p1'][0].deliverables).toEqual(deliverables)
  })

  it('setzt error im Store, wenn approveGate wirft', async () => {
    vi.mocked(ProjectsGateway.approveGate).mockRejectedValue(new Error('boom'))
    await expect(useProjectsStore.getState().approveGate('ph1', 'p1', 'X')).rejects.toThrow('boom')
    expect(useProjectsStore.getState().error).not.toBeNull()
  })
})
```

Der bestehende `vi.mock('@/data/projects.gateway', ...)`-Block am Dateikopf muss um die drei neuen Methoden erweitert werden:

```typescript
vi.mock('@/data/projects.gateway', () => ({
  ProjectsGateway: {
    updatePhaseProgress: vi.fn(),
    requestGate: vi.fn(),
    approveGate: vi.fn(),
    updateDeliverables: vi.fn(),
  },
}))
```

Run: `npx vitest run src/store/projects.store.test.ts`
Expected: FAIL — die drei Actions existieren noch nicht auf dem Store.

- [ ] **Step 2: Actions implementieren**

`ProjectsState`-Interface (`src/store/projects.store.ts:8-23`) um drei Methoden ergänzen:

```typescript
  requestGate: (id: string, projectId: string, gateDate: string | null) => Promise<void>
  approveGate: (id: string, projectId: string, approvedBy: string) => Promise<void>
  updateDeliverables: (id: string, projectId: string, deliverables: Deliverable[]) => Promise<void>
```

(Dafür `Deliverable` zusätzlich importieren: `import type { Project, ProjectPhase, UpsertProjectPayload, CreateProjectPhasePayload, Deliverable } from '@/types/project.types'`.)

Im Store-Objekt nach `updatePhaseProgress` (Zeile 175-191), vor der schließenden `}))` einfügen:

```typescript

  requestGate: async (id, projectId, gateDate) => {
    set({ error: null })
    try {
      const phase = await ProjectsGateway.requestGate(id, projectId, gateDate)
      set(s => ({
        phasesByProject: {
          ...s.phasesByProject,
          [projectId]: (s.phasesByProject[projectId] ?? []).map(p => p.id === id ? phase : p),
        },
      }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error })
      log.error('Failed to request gate', { error, id, projectId })
      throw err
    }
  },

  approveGate: async (id, projectId, approvedBy) => {
    set({ error: null })
    try {
      const phase = await ProjectsGateway.approveGate(id, projectId, approvedBy)
      set(s => ({
        phasesByProject: {
          ...s.phasesByProject,
          [projectId]: (s.phasesByProject[projectId] ?? []).map(p => p.id === id ? phase : p),
        },
      }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error })
      log.error('Failed to approve gate', { error, id, projectId })
      throw err
    }
  },

  updateDeliverables: async (id, projectId, deliverables) => {
    set({ error: null })
    try {
      const phase = await ProjectsGateway.updateDeliverables(id, projectId, deliverables)
      set(s => ({
        phasesByProject: {
          ...s.phasesByProject,
          [projectId]: (s.phasesByProject[projectId] ?? []).map(p => p.id === id ? phase : p),
        },
      }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error })
      log.error('Failed to update deliverables', { error, id, projectId })
      throw err
    }
  },
```

- [ ] **Step 3: Test ausführen, Erfolg verifizieren**

Run: `npx vitest run src/store/projects.store.test.ts`
Expected: PASS (bestehende Tests + 4 neue).

- [ ] **Step 4: Commit**

```bash
git add src/store/projects.store.ts src/store/projects.store.test.ts
git commit -m "feat(store): requestGate/approveGate/updateDeliverables-Actions"
```

---

## Task 10: `ProjectPhasesList` — aufklappbare Phasen-Liste mit Deliverables + Gate-Aktionen

**Files:**
- Create: `src/components/projects/ProjectPhasesList.tsx`
- Test: `src/components/projects/ProjectPhasesList.test.tsx`

**Interfaces:**
- Consumes: `ProjectPhase`, `Deliverable`, `DeliverableStatus` (Task 5); `GATE_COLOR`, `formatDateDe` (bestehend, Etappe 1/2).
- Produces: `ProjectPhasesList({ phases, currentPhaseId, onDeletePhase, onUpdateProgress, onRequestGate, onApproveGate, onUpdateDeliverables, onRemind }): JSX.Element`. Task 11 (`ProjectDetailRoute`) rendert diese Komponente anstelle des bisherigen `Stepper`.

- [ ] **Step 1: Fehlschlagende Tests zuerst schreiben**

Neue Datei `src/components/projects/ProjectPhasesList.test.tsx`:

```typescript
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ProjectPhasesList } from './ProjectPhasesList'
import type { ProjectPhase } from '@/types/project.types'

afterEach(cleanup)

function phase(overrides: Partial<ProjectPhase> = {}): ProjectPhase {
  return {
    id: 'ph1', projectId: 'p1', name: 'Konzept', orderIndex: 0, createdAt: '2026-01-01',
    startDate: '2026-04-27', endDate: '2026-05-11', gateName: 'Konzeptfreigabe',
    gateState: 'open', gateDate: null, gateApprovedBy: null, progressPercent: 40,
    deliverables: [],
    ...overrides,
  }
}

function renderList(overrides: Partial<Parameters<typeof ProjectPhasesList>[0]> = {}) {
  return render(
    <ProjectPhasesList
      phases={[phase()]} currentPhaseId="ph1"
      onDeletePhase={vi.fn().mockResolvedValue(undefined)}
      onUpdateProgress={vi.fn()}
      onRequestGate={vi.fn()}
      onApproveGate={vi.fn()}
      onUpdateDeliverables={vi.fn()}
      onRemind={vi.fn()}
      {...overrides}
    />,
  )
}

describe('ProjectPhasesList', () => {
  it('rendert den Phasennamen und den Gate-Status-Tag', () => {
    renderList()
    expect(screen.getByText('Konzept')).toBeTruthy()
    expect(screen.getByText('geplant')).toBeTruthy()
  })

  it('klappt beim Klick auf die Kopfzeile die Details auf und zeigt den Gate-Bereich', () => {
    renderList()
    fireEvent.click(screen.getByText('Konzept'))
    expect(screen.getByText('Noch keine Freigabe angefragt.')).toBeTruthy()
    expect(screen.getByText('Freigabe anfragen')).toBeTruthy()
  })

  it('ruft onRequestGate mit dem eingegebenen Datum auf', () => {
    const onRequestGate = vi.fn()
    renderList({ onRequestGate })
    fireEvent.click(screen.getByText('Konzept'))
    const dateInput = screen.getByDisplayValue('') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '2026-06-01' } })
    fireEvent.click(screen.getByText('Freigabe anfragen'))
    expect(onRequestGate).toHaveBeenCalledWith('ph1', '2026-06-01')
  })

  it('zeigt bei pending Gate das Freitext-Feld und deaktiviert den Button bis Eingabe erfolgt', () => {
    renderList({ phases: [phase({ gateState: 'pending', gateDate: '2026-06-01' })] })
    fireEvent.click(screen.getByText('Konzept'))
    const button = screen.getByText('Freigabe eintragen') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.change(screen.getByPlaceholderText('Wer hat freigegeben?'), { target: { value: 'M. Weber' } })
    expect(button.disabled).toBe(false)
  })

  it('ruft onApproveGate mit dem eingegebenen Namen auf', () => {
    const onApproveGate = vi.fn()
    renderList({ phases: [phase({ gateState: 'pending', gateDate: '2026-06-01' })], onApproveGate })
    fireEvent.click(screen.getByText('Konzept'))
    fireEvent.change(screen.getByPlaceholderText('Wer hat freigegeben?'), { target: { value: 'M. Weber' } })
    fireEvent.click(screen.getByText('Freigabe eintragen'))
    expect(onApproveGate).toHaveBeenCalledWith('ph1', 'M. Weber')
  })

  it('zeigt bei approved Gate die Freigabe-Info ohne weitere Buttons', () => {
    renderList({ phases: [phase({ gateState: 'approved', gateDate: '2026-06-01', gateApprovedBy: 'M. Weber' })] })
    fireEvent.click(screen.getByText('Konzept'))
    expect(screen.getByText(/Freigegeben am 01.06.2026 — M. Weber/)).toBeTruthy()
    expect(screen.queryByText('Freigabe anfragen')).toBeNull()
    expect(screen.queryByText('Freigabe eintragen')).toBeNull()
  })

  it('fuegt ein Deliverable hinzu und zyklt seinen Status durch Klick', () => {
    const onUpdateDeliverables = vi.fn()
    renderList({ onUpdateDeliverables })
    fireEvent.click(screen.getByText('Konzept'))
    fireEvent.change(screen.getByPlaceholderText('Neues Ergebnis'), { target: { value: 'Moodboard' } })
    fireEvent.click(screen.getByText('+ Deliverable'))
    expect(onUpdateDeliverables).toHaveBeenCalledWith('ph1', [expect.objectContaining({ name: 'Moodboard', status: 'open' })])
  })

  it('zyklt den Status eines bestehenden Deliverables open -> review -> done -> open', () => {
    const onUpdateDeliverables = vi.fn()
    renderList({
      phases: [phase({ deliverables: [{ id: 'd1', name: 'Moodboard', status: 'open' }] })],
      onUpdateDeliverables,
    })
    fireEvent.click(screen.getByText('Konzept'))
    fireEvent.click(screen.getByTitle('offen'))
    expect(onUpdateDeliverables).toHaveBeenCalledWith('ph1', [{ id: 'd1', name: 'Moodboard', status: 'review' }])
  })

  it('entfernt ein Deliverable', () => {
    const onUpdateDeliverables = vi.fn()
    renderList({
      phases: [phase({ deliverables: [{ id: 'd1', name: 'Moodboard', status: 'open' }] })],
      onUpdateDeliverables,
    })
    fireEvent.click(screen.getByText('Konzept'))
    fireEvent.click(screen.getByLabelText('Moodboard entfernen'))
    expect(onUpdateDeliverables).toHaveBeenCalledWith('ph1', [])
  })

  it('zeigt den Fortschritts-Regler nur fuer die aktuelle Phase', () => {
    renderList({
      phases: [phase({ id: 'ph1' }), phase({ id: 'ph2', name: 'Umsetzung' })],
      currentPhaseId: 'ph1',
    })
    expect(screen.getAllByRole('slider')).toHaveLength(1)
  })

  it('zeigt Zwei-Klick-Loeschen nur fuer nicht-aktuelle Phasen', () => {
    renderList({
      phases: [phase({ id: 'ph1' }), phase({ id: 'ph2', name: 'Umsetzung' })],
      currentPhaseId: 'ph1',
    })
    expect(screen.getAllByTitle('Phase löschen')).toHaveLength(1)
  })

  it('ruft onDeletePhase erst nach Bestaetigung auf', async () => {
    const onDeletePhase = vi.fn().mockResolvedValue(undefined)
    renderList({
      phases: [phase({ id: 'ph1' }), phase({ id: 'ph2', name: 'Umsetzung' })],
      currentPhaseId: 'ph1', onDeletePhase,
    })
    fireEvent.click(screen.getByTitle('Phase löschen'))
    expect(onDeletePhase).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Wirklich löschen'))
    expect(onDeletePhase).toHaveBeenCalledWith('ph2')
  })
})
```

Run: `npx vitest run src/components/projects/ProjectPhasesList.test.tsx`
Expected: FAIL — Modul existiert nicht.

- [ ] **Step 2: Komponente schreiben**

Neue Datei `src/components/projects/ProjectPhasesList.tsx`:

```typescript
import { useState } from 'react'
import { Trash2, Plus, X } from 'lucide-react'
import { GATE_COLOR, formatDateDe } from '@/lib/projects/signals'
import type { ProjectPhase, Deliverable, DeliverableStatus } from '@/types/project.types'

const GATE_LABEL: Record<ProjectPhase['gateState'], string> = {
  open: 'geplant', pending: 'Freigabe offen', approved: 'freigegeben',
}

const DELIVERABLE_NEXT: Record<DeliverableStatus, DeliverableStatus> = {
  open: 'review', review: 'done', done: 'open',
}
const DELIVERABLE_LABEL: Record<DeliverableStatus, string> = {
  open: 'offen', review: 'in Review', done: 'fertig',
}

function DeliverablesChecklist({ deliverables, onChange }: {
  deliverables: Deliverable[]
  onChange: (next: Deliverable[]) => void
}) {
  const [name, setName] = useState('')

  const add = () => {
    if (!name.trim()) return
    onChange([...deliverables, { id: crypto.randomUUID(), name: name.trim(), status: 'open' }])
    setName('')
  }
  const cycle = (id: string) => {
    onChange(deliverables.map(d => d.id === id ? { ...d, status: DELIVERABLE_NEXT[d.status] } : d))
  }
  const remove = (id: string, dName: string) => {
    onChange(deliverables.filter(d => d.id !== id))
    void dName
  }

  return (
    <div>
      <span style={{ display: 'block', marginBottom: 8, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-dim)' }}>
        Ergebnisse
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
        {deliverables.map(d => (
          <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
            <button
              onClick={() => cycle(d.id)}
              title={DELIVERABLE_LABEL[d.status]}
              style={{
                width: 15, height: 15, borderRadius: 4, flex: 'none', cursor: 'pointer', padding: 0,
                border: d.status === 'open' ? '1px solid var(--border-strong)' : 'none',
                background: d.status === 'done' ? 'var(--ok)' : d.status === 'review' ? 'var(--warn)' : 'transparent',
              }}
            />
            <span style={{ flex: 1, color: d.status === 'done' ? 'var(--fg-muted)' : 'var(--fg)' }}>{d.name}</span>
            {d.status === 'review' && (
              <span style={{ fontSize: 10.5, padding: '2px 6px', borderRadius: 5, border: '1px solid var(--warn)', color: 'var(--warn)' }}>
                in Review
              </span>
            )}
            <button
              onClick={() => remove(d.id, d.name)} aria-label={`${d.name} entfernen`}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-dim)', display: 'flex', padding: 0 }}
            >
              <X size={12} />
            </button>
          </div>
        ))}
        {deliverables.length === 0 && <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>Noch keine Ergebnisse erfasst.</div>}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          className="mock-input" value={name} onChange={e => setName(e.target.value)}
          placeholder="Neues Ergebnis" style={{ fontSize: 12.5, flex: 1 }}
          onKeyDown={e => { if (e.key === 'Enter') add() }}
        />
        <button className="btn-primary" style={{ fontSize: 11.5, padding: '5px 10px' }} disabled={!name.trim()} onClick={add}>
          <Plus size={12} /> Deliverable
        </button>
      </div>
    </div>
  )
}

function GateSection({ phase, onRequestGate, onApproveGate, onRemind }: {
  phase: ProjectPhase
  onRequestGate: (gateDate: string | null) => void
  onApproveGate: (approvedBy: string) => void
  onRemind: () => void
}) {
  const [gateDate, setGateDate] = useState('')
  const [approvedBy, setApprovedBy] = useState('')

  if (phase.gateState === 'approved') {
    return (
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>{phase.gateName}</div>
        <p style={{ fontSize: 12, color: 'var(--fg-muted)', margin: 0 }}>
          Freigegeben am {phase.gateDate ? formatDateDe(phase.gateDate) : '—'} — {phase.gateApprovedBy}. Die Folgephase ist entsperrt.
        </p>
      </div>
    )
  }

  if (phase.gateState === 'pending') {
    return (
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>{phase.gateName}</div>
        <p style={{ fontSize: 12, color: 'var(--fg-muted)', margin: '0 0 10px' }}>
          {phase.gateDate ? `${formatDateDe(phase.gateDate)} · ` : ''}wartet auf Freigabe. Ohne sie startet die nächste Phase nicht.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="mock-input" value={approvedBy} onChange={e => setApprovedBy(e.target.value)}
            placeholder="Wer hat freigegeben?" style={{ fontSize: 12.5, width: 180 }}
          />
          <button
            className="btn-primary" style={{ fontSize: 12, padding: '6px 12px' }}
            disabled={!approvedBy.trim()} onClick={() => onApproveGate(approvedBy.trim())}
          >
            Freigabe eintragen
          </button>
          <button className="btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={onRemind}>
            Erinnern
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>{phase.gateName}</div>
      <p style={{ fontSize: 12, color: 'var(--fg-muted)', margin: '0 0 10px' }}>Noch keine Freigabe angefragt.</p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="date" className="mock-input" value={gateDate} onChange={e => setGateDate(e.target.value)}
          style={{ fontSize: 12.5 }}
        />
        <button className="btn-primary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => onRequestGate(gateDate || null)}>
          Freigabe anfragen
        </button>
      </div>
    </div>
  )
}

function PhaseCard({ phase, index, isCurrent, isOpen, onToggle, onDeletePhase, onUpdateProgress, onRequestGate, onApproveGate, onUpdateDeliverables, onRemind }: {
  phase: ProjectPhase
  index: number
  isCurrent: boolean
  isOpen: boolean
  onToggle: () => void
  onDeletePhase: (phaseId: string) => Promise<void>
  onUpdateProgress: (phaseId: string, progressPercent: number) => void
  onRequestGate: (phaseId: string, gateDate: string | null) => void
  onApproveGate: (phaseId: string, approvedBy: string) => void
  onUpdateDeliverables: (phaseId: string, deliverables: Deliverable[]) => void
  onRemind: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleConfirmDelete = async () => {
    setDeleting(true)
    try {
      await onDeletePhase(phase.id)
      setConfirmDelete(false)
    } catch {
      // Fehler wird vom Elternteil angezeigt.
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 16, background: 'var(--surface)', overflow: 'hidden' }}>
      <button
        onClick={onToggle}
        style={{
          display: 'grid', gridTemplateColumns: '34px 1fr auto', gap: 14, alignItems: 'center',
          padding: '15px 17px', width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{
          width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center',
          fontSize: 11, fontWeight: 600, border: '1px solid var(--border)',
          background: isCurrent ? 'var(--accent)' : 'var(--surface-2)', color: isCurrent ? 'var(--accent-ink)' : 'var(--fg-dim)',
        }}>
          {String(index + 1).padStart(2, '0')}
        </span>
        <span style={{ minWidth: 0 }}>
          <strong style={{ display: 'block', fontSize: 14, fontWeight: 570 }}>{phase.name}</strong>
          <span style={{ display: 'flex', gap: 8, marginTop: 3, fontSize: 11.5, color: 'var(--fg-muted)', flexWrap: 'wrap', alignItems: 'center' }}>
            <span>{formatDateDe(phase.startDate)} – {formatDateDe(phase.endDate)}</span>
            {isCurrent && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={e => e.stopPropagation()}>
                <input
                  type="range" min={0} max={100} value={phase.progressPercent}
                  onChange={e => onUpdateProgress(phase.id, Number(e.target.value))}
                  style={{ width: 80 }}
                />
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{phase.progressPercent}%</span>
              </span>
            )}
          </span>
        </span>
        <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{
            fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)',
            color: GATE_COLOR[phase.gateState], whiteSpace: 'nowrap',
          }}>
            {GATE_LABEL[phase.gateState]}
          </span>
          {!isCurrent && (
            confirmDelete ? (
              <span style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                <button
                  onClick={handleConfirmDelete} disabled={deleting}
                  style={{ fontSize: 10.5, color: 'oklch(72% 0.18 25)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 650 }}
                >
                  {deleting ? 'Löscht…' : 'Wirklich löschen'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)} disabled={deleting}
                  style={{ fontSize: 10.5, color: 'var(--fg-dim)', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Abbrechen
                </button>
              </span>
            ) : (
              <button
                onClick={e => { e.stopPropagation(); setConfirmDelete(true) }} title="Phase löschen"
                style={{ display: 'flex', color: 'var(--fg-dim)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <Trash2 size={13} />
              </button>
            )
          )}
        </span>
      </button>

      {isOpen && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '16px 17px', display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 22 }}>
          <DeliverablesChecklist deliverables={phase.deliverables} onChange={next => onUpdateDeliverables(phase.id, next)} />
          <GateSection
            phase={phase}
            onRequestGate={gateDate => onRequestGate(phase.id, gateDate)}
            onApproveGate={approvedBy => onApproveGate(phase.id, approvedBy)}
            onRemind={onRemind}
          />
        </div>
      )}
    </div>
  )
}

export function ProjectPhasesList({ phases, currentPhaseId, onDeletePhase, onUpdateProgress, onRequestGate, onApproveGate, onUpdateDeliverables, onRemind }: {
  phases: ProjectPhase[]
  currentPhaseId: string | null
  onDeletePhase: (phaseId: string) => Promise<void>
  onUpdateProgress: (phaseId: string, progressPercent: number) => void
  onRequestGate: (phaseId: string, gateDate: string | null) => void
  onApproveGate: (phaseId: string, approvedBy: string) => void
  onUpdateDeliverables: (phaseId: string, deliverables: Deliverable[]) => void
  onRemind: () => void
}) {
  const [openId, setOpenId] = useState<string | null>(currentPhaseId)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
      {phases.map((phase, i) => (
        <PhaseCard
          key={phase.id}
          phase={phase} index={i} isCurrent={phase.id === currentPhaseId}
          isOpen={openId === phase.id} onToggle={() => setOpenId(openId === phase.id ? null : phase.id)}
          onDeletePhase={onDeletePhase} onUpdateProgress={onUpdateProgress}
          onRequestGate={onRequestGate} onApproveGate={onApproveGate}
          onUpdateDeliverables={onUpdateDeliverables} onRemind={onRemind}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Test ausführen, Erfolg verifizieren**

Run: `npx vitest run src/components/projects/ProjectPhasesList.test.tsx`
Expected: PASS (13 Tests).

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck 2>&1 | grep -i project`
Expected: keine neuen Fehler (Datei wird noch nirgends importiert -- folgt in Task 11).

- [ ] **Step 5: Commit**

```bash
git add src/components/projects/ProjectPhasesList.tsx src/components/projects/ProjectPhasesList.test.tsx
git commit -m "feat(projects): ProjectPhasesList -- aufklappbare Phasen mit Deliverables + Gate-Aktionen"
```

---

## Task 11: `ProjectDetailRoute.tsx` — `Stepper` durch `ProjectPhasesList` ersetzen

**Files:**
- Modify: `src/routes/ProjectDetailRoute.tsx`

**Interfaces:**
- Consumes: `ProjectPhasesList` (Task 10); `useProjectsStore().requestGate/approveGate/updateDeliverables` (Task 9); `useToastStore` (bestehend).
- Produces: kompletter, funktionsfähiger Gate-Workflow im Phasen-Tab.

- [ ] **Step 1: Import ergänzen**

Nach `import { formatDateDe } from '@/lib/projects/signals'` (Zeile 25) einfügen:

```typescript
import { ProjectPhasesList } from '@/components/projects/ProjectPhasesList'
import { useToastStore } from '@/store/toast.store'
```

- [ ] **Step 2: Neue Store-Actions + Toast-Funktion selektieren**

Nach `const updatePhaseProgress = useProjectsStore(s => s.updatePhaseProgress)` (Zeile 296) einfügen:

```typescript
  const requestGate = useProjectsStore(s => s.requestGate)
  const approveGate = useProjectsStore(s => s.approveGate)
  const updateDeliverables = useProjectsStore(s => s.updateDeliverables)
  const showToast = useToastStore(s => s.show)
```

- [ ] **Step 3: `Stepper`-Aufruf durch `ProjectPhasesList` ersetzen**

Den Block ab `{phases.length === 0 ? (` bis zum passenden schließenden `)}` (aktuell `src/routes/ProjectDetailRoute.tsx:449-461`) ersetzen:

```typescript
            {phases.length === 0 ? (
              <NewPhaseForm onCreate={(name, startDate, endDate, gateName) =>
                createPhase({ projectId: project.id, name, startDate, endDate, gateName })} />
            ) : (
              <>
                <ProjectPhasesList
                  phases={phases} currentPhaseId={project.currentPhaseId}
                  onDeletePhase={handleDeletePhase}
                  onUpdateProgress={(phaseId, progressPercent) => updatePhaseProgress(phaseId, project.id, progressPercent)}
                  onRequestGate={(phaseId, gateDate) => requestGate(phaseId, project.id, gateDate)}
                  onApproveGate={(phaseId, approvedBy) => approveGate(phaseId, project.id, approvedBy)}
                  onUpdateDeliverables={(phaseId, deliverables) => updateDeliverables(phaseId, project.id, deliverables)}
                  onRemind={() => showToast({ message: 'Erinnerung vorbereitet (Mail-Versand folgt in einer späteren Runde)' })}
                />
                <NewPhaseForm onCreate={(name, startDate, endDate, gateName) =>
                  createPhase({ projectId: project.id, name, startDate, endDate, gateName })} />
              </>
            )}
```

- [ ] **Step 4: `Stepper`-Funktion entfernen**

Die jetzt ungenutzte `Stepper`-Funktion (`src/routes/ProjectDetailRoute.tsx:27-120` im aktuellen Stand, vor `NewPhaseForm`) komplett löschen. Den jetzt ungenutzten `Trash2`-Import (Zeile 2) NUR entfernen, falls er nach dem Löschen von `Stepper` sonst nirgends mehr in der Datei verwendet wird (kurz mit `grep -n "Trash2" src/routes/ProjectDetailRoute.tsx` prüfen -- `ProjectPhasesList` hat sein eigenes `Trash2`-Import, das zählt nicht für diese Datei).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck 2>&1 | grep -i project`
Expected: keine Fehler.

- [ ] **Step 6: Volle Test-Suite**

Run: `cd src-tauri && cargo test 2>&1 | tail -10` und `npx vitest run 2>&1 | tail -15`
Expected: Rust 291+19=310 bestanden (Baseline vor dieser Etappe: 291 -- Etappe 2 fügte keine Rust-Tests hinzu). Frontend: Baseline 948 + 3 (Mapper) + 4 (Store) + 13 (ProjectPhasesList) = ca. 968 bestanden, 0 fehlgeschlagen -- exakte Zahl im Report festhalten.

- [ ] **Step 7: Manuell im Dev-Build prüfen**

Im laufenden `npm run tauri dev`: ein Projekt mit mindestens zwei Phasen öffnen, Phasen-Tab. Prüfen:
- Phasen erscheinen als aufklappbare Karten statt Kreis-Stepper, aktuelle Phase optisch hervorgehoben, Fortschritts-Regler nur dort sichtbar.
- Karte aufklappen → Deliverable hinzufügen, Status durchklicken (offen→in Review→fertig→offen), entfernen.
- Bei `open`-Gate: "Freigabe anfragen" (mit/ohne Datum) → Status wechselt zu "Freigabe offen".
- Bei `pending`-Gate: Freitext + "Freigabe eintragen" (disabled bis ausgefüllt) → Status wechselt zu "freigegeben", Datum+Name erscheinen inline. "Erinnern" zeigt Toast.
- Bei `approved`-Gate: nur Info-Text, keine Buttons.
- Zwei-Klick-Löschen für Nicht-aktuelle Phasen funktioniert weiterhin wie vorher.
- Cockpit-Tab unverändert, "Zur Phase"-Navigation funktioniert weiterhin.

- [ ] **Step 8: Commit**

```bash
git add src/routes/ProjectDetailRoute.tsx
git commit -m "feat(projects): ProjectDetailRoute -- Stepper durch ProjectPhasesList (Gate-Workflow) ersetzt"
```

---

## Self-Review

**Spec-Abdeckung** (gegen `docs/superpowers/specs/2026-07-26-projekt-phasen-gates-design.md` geprüft):
- `deliverables`-Feld als JSON-Spalte, Rust reicht roh durch → Task 1, 2, 3. ✓
- `request_gate` setzt `gate_date` NIE automatisch, optional übergeben → Task 3 (`Option<String>`, kein `chrono::Utc::now()` in `request_gate`). ✓
- `approve_gate` verlangt nicht-leeres `approved_by`, Rust- UND UI-seitig geprüft → Task 3 (Rust) + Task 10 (Button `disabled`). ✓
- Freigabe auf jeder Phase möglich, keine Reihenfolge-Beschränkung → Task 10 (kein `isCurrent`-Gate auf `GateSection`/`onRequestGate`). ✓
- "Erinnern" bleibt Platzhalter-Toast, ehrliche Formulierung → Task 11 (`showToast`-Text nennt explizit "folgt in einer späteren Runde"). ✓
- Kein "Protokoll"-Button bei `approved` → Task 10 (`GateSection`'s `approved`-Zweig hat keine Buttons). ✓
- Kein Budgetanteil pro Phase, keine Cockpit-Änderungen → in keinem Task enthalten. ✓
- Testing-Abschnitt der Spec (Rust-Unit-Tests, Mapper-Tests, Store-Tests, Komponenten-Tests) → Task 3, 6, 9, 10. ✓

**Platzhalter-Scan:** keine TBD/TODO, keine "Fehlerbehandlung hinzufügen"-Anweisungen ohne Code gefunden.

**Typ-Konsistenz geprüft:**
- `Deliverable`/`DeliverableStatus` (Task 5) ↔ `parseDeliverables`-Rückgabetyp (Task 6) ↔ `ProjectPhasesList`'s `DeliverablesChecklist`/`DELIVERABLE_NEXT`/`DELIVERABLE_LABEL` (Task 10) — alle drei Zustände (`open`/`review`/`done`) konsistent abgedeckt.
- `requestGate(id, projectId, gateDate)`-Signatur identisch in Rust-Command (Task 4), Service (Task 8), Gateway (Task 7), Store (Task 9), Aufrufer in `ProjectDetailRoute.tsx` (Task 11).
- `approveGate`/`updateDeliverables` ebenso über alle Schichten hinweg konsistent (gegengeprüft Rust-Parameter-Reihenfolge ↔ TS-Funktionsargumente).
- `GATE_LABEL`/`GATE_COLOR` (Task 10, importiert aus `signals.ts`) decken exakt `'open' | 'pending' | 'approved'` ab, keine vierte Kategorie nötig (anders als `HealthLevel`, das ist ein separater Typ).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-26-projekt-phasen-gates.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
