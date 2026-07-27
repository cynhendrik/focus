# Projekt-Modul-Ausbau — Etappe 4: Team & Kapazität — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Team-Mitglieder einer Projektphase zuordnen (mehrere pro Phase), sichtbar + bearbeitbar in der aufgeklappten Phasenkarte (Phasen-Tab), rein informativ.

**Architecture:** Neues `assignee_ids`-Feld auf `project_phases` (JSON-Array von `user_id`-Strings), exakt gleiches Muster wie `deliverables` aus Etappe 3: additive Migration, Rust reicht den String roh durch (nur JSON-Boundary-Validierung), TypeScript parst/serialisiert im Mapper. Neue `AssigneesSection`-Komponente in `ProjectPhasesList.tsx`, bekommt `members`/`nameOf` als Props von `ProjectDetailRoute` gereicht (kein eigener Store-Import in der bisher rein props-getriebenen Komponente).

**Tech Stack:** Rust/rusqlite (SQLite), Supabase/Postgres (jsonb), React/TypeScript, Zustand.

## Global Constraints

- `assignee_ids TEXT NOT NULL DEFAULT '[]'` -- identisches Muster zu `deliverables` (Etappe 3): additive Migration, Rust validiert nur JSON-Gültigkeit, keine Struktur-Prüfung.
- Mehrere Mitglieder pro Phase möglich (Array von `user_id`-Strings), jede Phase unabhängig von Reihenfolge/Gate-Status zuweisbar (keine Beschränkung auf die aktuelle Phase).
- Komplettes Ersetzen der Liste bei jeder Änderung (`update_assignees` bekommt die volle neue Liste) -- kein `add_assignee`/`remove_assignee` als separate Backend-Operationen.
- Darstellung ausschließlich als Namens-Chips (`nameOf(userId)`) -- kein neues Avatar-/Farb-Feld auf `MemberProfile`.
- Rein informativ: keine Kapazitäts-/Auslastungs-Berechnung, kein "Meine Phasen"-Filter, keine Mein-Tag-Integration, keine Timeline-/Cockpit-Sichtbarkeit -- ausschließlich im Phasen-Tab.
- `ProjectPhasesList` bleibt eine reine props-getriebene Komponente (kein `useMembersStore`-Import darin) -- `members: MemberProfile[]` und `nameOf: (userId: string) => string` werden von `ProjectDetailRoute` durchgereicht, das beide bereits aus dem Store selektiert.

---

### Task 1: SQLite-Migration v40 -- `assignee_ids`-Spalte

**Files:**
- Modify: `src-tauri/src/db/migrations.rs`

**Interfaces:**
- Produces: Spalte `project_phases.assignee_ids TEXT NOT NULL DEFAULT '[]'`. Task 3 (Rust-Struct) konsumiert sie.

- [ ] **Step 1: `CURRENT_VERSION` erhöhen**

In `src-tauri/src/db/migrations.rs`, Zeile 4, `CURRENT_VERSION: u32 = 39;` zu `40` ändern.

- [ ] **Step 2: Migrations-Arm hinzufügen**

Nach dem `39 => { ... }`-Block (aktuell `src-tauri/src/db/migrations.rs:903-913`, vor `_ => Ok(()),`) einfügen:

```rust
        40 => {
            // Etappe 4 des Projekt-Ausbaus: Team-Zuweisung (assignee_ids) pro
            // Phase als JSON-Liste von user_id-Strings, gleiches Muster wie
            // deliverables (v39) -- Rust parst den Inhalt nicht, nur TypeScript.
            if !column_exists(conn, "project_phases", "assignee_ids") {
                conn.execute_batch(
                    "ALTER TABLE project_phases ADD COLUMN assignee_ids TEXT NOT NULL DEFAULT '[]';"
                )?;
            }
            Ok(())
        }
```

- [ ] **Step 3: Test schreiben (mirrors `migration_39_adds_deliverables_column_with_default`)**

Im `#[cfg(test)] mod tests`-Block (nach `migration_39_adds_deliverables_column_with_default`, vor der schließenden `}` des Moduls) einfügen:

```rust
    #[test]
    fn migration_40_adds_assignee_ids_column_with_default() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        schema::create_tables(&conn).unwrap();

        for v in 1..=39u32 {
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

        assert!(column_exists(&conn, "project_phases", "assignee_ids"));
        let assignee_ids: String = conn.query_row(
            "SELECT assignee_ids FROM project_phases WHERE id = 'ph1'", [], |r| r.get(0),
        ).unwrap();
        assert_eq!(assignee_ids, "[]");

        run(&conn).unwrap(); // idempotent
    }
```

- [ ] **Step 4: Tests ausführen**

Run: `cd src-tauri && cargo test migration_40 -- --nocapture`
Expected: PASS.

Run: `cd src-tauri && cargo build 2>&1 | tail -20`
Expected: Build erfolgreich (andere Module referenzieren `ProjectPhase` noch ohne `assignee_ids`-Feld -- das kommt erst in Task 3, hier gibt's noch keinen Compile-Fehler, da diese Migration nur SQL betrifft).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/db/migrations.rs
git commit -m "feat(db): migration v40 -- assignee_ids-Spalte fuer Phasen"
```

---

### Task 2: Supabase-Migration 0029

**Files:**
- Create: `supabase/migrations/0029_project_phases_assignee_ids.sql`

**Interfaces:**
- Produces: Spalte `project_phases.assignee_ids jsonb not null default '[]'::jsonb` im Cloud-Schema.

- [ ] **Step 1: Migrations-Datei anlegen**

```sql
-- Cloud-Gegenstueck zu SQLite-Migration v40 (src-tauri/src/db/migrations.rs).
-- Muss wie 0001-0028 manuell ueber die Management-API auf das Supabase-Projekt
-- angewendet werden (siehe Kommentar in 0026_projects.sql).
--
-- Bewusst jsonb (nicht text): der Supabase-JS-Client (de)serialisiert jsonb-Spalten
-- automatisch zu/von nativen JS-Arrays -- anders als der lokale SQLite-Pfad, wo
-- Rust den Inhalt als rohen String durchreicht. src/data/projects.mapper.ts's
-- parseAssigneeIds() behandelt beide Formen (String ODER bereits geparstes Array).

alter table public.project_phases
  add column if not exists assignee_ids jsonb not null default '[]'::jsonb;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0029_project_phases_assignee_ids.sql
git commit -m "feat(db): Supabase-Migration 0029 -- assignee_ids-Spalte (jsonb)"
```

(Hinweis für später: muss noch manuell über die Management-API auf das Supabase-Projekt angewendet werden, wie alle vorherigen Migrationen -- kein Teil dieses Tasks.)

---

### Task 3: `ProjectPhase` -- `assignee_ids`-Feld + `update_assignees`

**Files:**
- Modify: `src-tauri/src/db/project_phase.rs`

**Interfaces:**
- Consumes: `assignee_ids`-Spalte (Task 1).
- Produces: `ProjectPhase.assignee_ids: String`. `update_assignees(conn, id, project_id, assignee_ids_json: String) -> Result<ProjectPhase, AppError>`. Task 4 (Tauri-Command) ruft `update_assignees` auf.

- [ ] **Step 1: Feld zum Struct hinzufügen**

In `src-tauri/src/db/project_phase.rs`, im `ProjectPhase`-Struct (aktuell Zeilen 7-21), nach `pub deliverables: String,` einfügen:

```rust
    pub assignee_ids: String,
```

- [ ] **Step 2: `SELECT_COLUMNS` + `map_row` erweitern**

`SELECT_COLUMNS`-Konstante (aktuell Zeile 33-34) erweitern:

```rust
const SELECT_COLUMNS: &str =
    "id, project_id, name, order_index, created_at, start_date, end_date, gate_name, gate_state, gate_date, gate_approved_by, progress_percent, deliverables, assignee_ids";
```

`map_row` (aktuell Zeilen 36-52), nach `deliverables: r.get(12)?,` einfügen:

```rust
        assignee_ids: r.get(13)?,
```

- [ ] **Step 3: `update_assignees`-Funktion hinzufügen**

Nach `update_deliverables` (aktuell Zeilen 159-172), vor der `delete`-Funktion einfügen:

```rust
/// Ersetzt die Liste zugewiesener Mitglieder (user_ids). Rust prueft nur, dass
/// es sich um gueltiges JSON handelt (Boundary-Validierung) -- analog zu
/// update_deliverables. Rein informativ: keine Kapazitaets-/Rollen-Logik.
pub fn update_assignees(conn: &Connection, id: &str, project_id: &str, assignee_ids_json: String) -> Result<ProjectPhase, AppError> {
    if serde_json::from_str::<serde_json::Value>(&assignee_ids_json).is_err() {
        return Err(AppError::Validation("assignee_ids muss gueltiges JSON sein".to_string()));
    }
    get_by_id(conn, id, project_id)?;
    conn.execute(
        "UPDATE project_phases SET assignee_ids = ?1 WHERE id = ?2 AND project_id = ?3",
        rusqlite::params![assignee_ids_json, id, project_id],
    )?;
    get_by_id(conn, id, project_id)
}
```

- [ ] **Step 4: Bestehenden Creation-Test um `assignee_ids`-Assertion erweitern**

In `create_first_phase_becomes_current_phase_of_project` (aktuell Zeilen 247-260), nach `assert_eq!(phase.deliverables, "[]");` einfügen:

```rust
        assert_eq!(phase.assignee_ids, "[]");
```

- [ ] **Step 5: Neue Tests schreiben (mirrors `update_deliverables_*`)**

Nach `update_deliverables_rejects_unknown_phase` (aktuell Zeilen 408-413), vor der schließenden `}` des Test-Moduls einfügen:

```rust
    #[test]
    fn update_assignees_stores_valid_json() {
        let conn = setup();
        let phase = create(&conn, phase_payload("p1", "Konzept")).unwrap();
        let json = r#"["u-1","u-2"]"#.to_string();
        let updated = update_assignees(&conn, &phase.id, "p1", json.clone()).unwrap();
        assert_eq!(updated.assignee_ids, json);
    }

    #[test]
    fn update_assignees_rejects_invalid_json() {
        let conn = setup();
        let phase = create(&conn, phase_payload("p1", "Konzept")).unwrap();
        let result = update_assignees(&conn, &phase.id, "p1", "not json".to_string());
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn update_assignees_rejects_unknown_phase() {
        let conn = setup();
        let result = update_assignees(&conn, "missing", "p1", "[]".to_string());
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }
```

- [ ] **Step 6: Tests ausführen**

Run: `cd src-tauri && cargo test db::project_phase:: -- --nocapture`
Expected: PASS (bestehende Tests + 3 neue `update_assignees_*`-Tests, alle grün; `create_first_phase_becomes_current_phase_of_project` weiterhin grün mit der neuen Assertion).

Run: `cd src-tauri && cargo test 2>&1 | tail -10`
Expected: volle Suite grün (Baseline 301 + 3 neue = 304).

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/db/project_phase.rs
git commit -m "feat(db): ProjectPhase -- assignee_ids-Feld + update_assignees"
```

---

### Task 4: Tauri-Command für `update_assignees`

**Files:**
- Modify: `src-tauri/src/commands/project_phase.rs`
- Modify: `src-tauri/src/main.rs`

**Interfaces:**
- Consumes: `db::project_phase::update_assignees` (Task 3).
- Produces: Tauri-Command `cmd_update_project_phase_assignees`. Task 8 (TS-Service) ruft sie per `invoke(...)` auf.

- [ ] **Step 1: Command hinzufügen**

An das Ende von `src-tauri/src/commands/project_phase.rs` anfügen:

```rust
#[tauri::command]
pub fn cmd_update_project_phase_assignees(
    db: State<'_, DbPool>, id: String, project_id: String, assignee_ids_json: String,
) -> Result<ProjectPhase, AppError> {
    db::project_phase::update_assignees(&db.conn(), &id, &project_id, assignee_ids_json)
}
```

- [ ] **Step 2: In `main.rs` registrieren**

In `src-tauri/src/main.rs`, nach `commands::project_phase::cmd_update_project_phase_deliverables,` (aktuell Zeile 298) einfügen:

```rust
            commands::project_phase::cmd_update_project_phase_assignees,
```

- [ ] **Step 3: Build prüfen**

Run: `cd src-tauri && cargo build 2>&1 | tail -40`
Expected: Build erfolgreich.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/project_phase.rs src-tauri/src/main.rs
git commit -m "feat(commands): update_assignees-Command registriert"
```

---

### Task 5: TypeScript-Typ -- `ProjectPhase.assigneeIds`

**Files:**
- Modify: `src/types/project.types.ts`

**Interfaces:**
- Produces: `ProjectPhase.assigneeIds: string[]`. Task 6 (Mapper) parst/serialisiert dieses Feld.

- [ ] **Step 1: Feld ergänzen**

In `export interface ProjectPhase { ... }` (aktuell Zeilen 39-53), nach `deliverables: Deliverable[]` ergänzen:

```typescript
  assigneeIds: string[]
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck 2>&1 | grep -i project`
Expected: Fehler in `projects.mapper.ts` (fehlendes `assigneeIds`-Feld beim Rückgabeobjekt von `projectPhaseRowToPhase`) -- erwartet, wird in Task 6 behoben.

- [ ] **Step 3: Commit**

```bash
git add src/types/project.types.ts
git commit -m "feat(types): ProjectPhase.assigneeIds"
```

---

### Task 6: Mapper -- `assigneeIds` parsen/serialisieren

**Files:**
- Modify: `src/data/projects.mapper.ts`
- Modify: `src/data/projects.mapper.test.ts`

**Interfaces:**
- Consumes: `ProjectPhase.assigneeIds` (Task 5).
- Produces: `parseAssigneeIds(raw: unknown): string[]` (analog zu `parseDeliverables`); `projectPhaseRowToPhase` liefert jetzt `assigneeIds: string[]`.

- [ ] **Step 1: Fehlschlagende Tests zuerst schreiben**

In `src/data/projects.mapper.test.ts`, im `describe('projectPhaseRowToPhase', ...)`-Block:

**a)** Den bestehenden Test `'maps a phase row'` (aktuell Zeilen 71-80) anpassen -- das erwartete Rückgabeobjekt muss um `assigneeIds: []` ergänzt werden (die Zeile `gateDate: null, gateApprovedBy: null, progressPercent: 0, deliverables: [],` wird zu `gateDate: null, gateApprovedBy: null, progressPercent: 0, deliverables: [], assigneeIds: [],`), sonst schlägt der exakte `toEqual`-Vergleich fehl, sobald `assigneeIds` am Rückgabeobjekt existiert.

**b)** Nach den bestehenden `deliverables`-Parsing-Tests (nach `'faellt auf leeres Array zurueck bei fehlendem/ungueltigem deliverables'`, aktuell endend Zeile 125) ergänzen:

```typescript
  it('parst assigneeIds aus einem JSON-String (lokaler SQLite-Pfad)', () => {
    const row = {
      id: 'ph1', project_id: 'p1', name: 'Konzept', order_index: 0, created_at: '2026-01-01',
      start_date: '2026-04-27', end_date: '2026-05-11', gate_name: 'Freigabe',
      gate_state: 'open', gate_date: null, gate_approved_by: null, progress_percent: 0,
      assignee_ids: '["u-1","u-2"]',
    }
    const phase = projectPhaseRowToPhase(row)
    expect(phase.assigneeIds).toEqual(['u-1', 'u-2'])
  })

  it('akzeptiert assigneeIds als bereits geparstes Array (Supabase-jsonb-Pfad)', () => {
    const row = {
      id: 'ph1', project_id: 'p1', name: 'Konzept', order_index: 0, created_at: '2026-01-01',
      start_date: '2026-04-27', end_date: '2026-05-11', gate_name: 'Freigabe',
      gate_state: 'open', gate_date: null, gate_approved_by: null, progress_percent: 0,
      assignee_ids: ['u-1'],
    }
    const phase = projectPhaseRowToPhase(row)
    expect(phase.assigneeIds).toEqual(['u-1'])
  })

  it('faellt auf leeres Array zurueck bei fehlendem/ungueltigem assignee_ids', () => {
    const base = {
      id: 'ph1', project_id: 'p1', name: 'Konzept', order_index: 0, created_at: '2026-01-01',
      start_date: '2026-04-27', end_date: '2026-05-11', gate_name: 'Freigabe',
      gate_state: 'open', gate_date: null, gate_approved_by: null, progress_percent: 0,
    }
    expect(projectPhaseRowToPhase({ ...base }).assigneeIds).toEqual([])
    expect(projectPhaseRowToPhase({ ...base, assignee_ids: 'not json' }).assigneeIds).toEqual([])
    expect(projectPhaseRowToPhase({ ...base, assignee_ids: '{"not":"an array"}' }).assigneeIds).toEqual([])
  })
```

Run: `npx vitest run src/data/projects.mapper.test.ts`
Expected: FAIL -- `assigneeIds` fehlt am Rückgabeobjekt bzw. die angepasste `toEqual`-Erwartung passt noch nicht.

- [ ] **Step 2: Mapper erweitern**

In `src/data/projects.mapper.ts`, nach der bestehenden `parseDeliverables`-Funktion (aktuell Zeilen 3-14) einfügen:

```typescript
function parseAssigneeIds(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[]
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

`projectPhaseRowToPhase` (aktuell Zeilen 59-75), nach `deliverables: parseDeliverables(r.deliverables),` ergänzen:

```typescript
    assigneeIds: parseAssigneeIds(r.assignee_ids),
```

- [ ] **Step 3: Test ausführen, Erfolg verifizieren**

Run: `npx vitest run src/data/projects.mapper.test.ts`
Expected: PASS (alle bisherigen Tests + 3 neue).

- [ ] **Step 4: Commit**

```bash
git add src/data/projects.mapper.ts src/data/projects.mapper.test.ts
git commit -m "feat(data): Mapper -- assigneeIds parsen (String- und Array-Form)"
```

---

### Task 7: Gateway -- `updateAssignees` lokal + Cloud

**Files:**
- Modify: `src/data/projects.gateway.ts`

**Interfaces:**
- Consumes: `ProjectsService.updateAssignees` (Task 8, wird gleich mit dem finalen Namen aufgerufen, existiert dort noch nicht -- analog zum bekannten Muster aus Etappe 3).
- Produces: `ProjectsGateway.updateAssignees(id, projectId, assigneeIds: string[]): Promise<ProjectPhase>`.

- [ ] **Step 1: Methode hinzufügen**

Nach `updateDeliverables` (aktuell das letzte Element in `ProjectsGateway`, `src/data/projects.gateway.ts:178-185`), vor der schließenden `}` einfügen:

```typescript
  async updateAssignees(id: string, projectId: string, assigneeIds: string[]): Promise<ProjectPhase> {
    if (!shared()) return ProjectsService.updateAssignees(id, projectId, JSON.stringify(assigneeIds))
    const { data, error } = await supabase.from('project_phases')
      .update({ assignee_ids: assigneeIds }).eq('id', id).eq('project_id', projectId)
      .select('*').single()
    if (error) fail(error)
    return projectPhaseRowToPhase(data)
  },
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck 2>&1 | grep -i project`
Expected: Fehler nur noch in `projects.service.ts` (fehlende `updateAssignees`-Methode) -- behoben in Task 8.

- [ ] **Step 3: Commit**

```bash
git add src/data/projects.gateway.ts
git commit -m "feat(data): ProjectsGateway -- updateAssignees"
```

---

### Task 8: Service -- Invoke-Wrapper

**Files:**
- Modify: `src/services/projects.service.ts`

**Interfaces:**
- Consumes: `cmd_update_project_phase_assignees` (Task 4).
- Produces: `ProjectsService.updateAssignees(id, projectId, assigneeIdsJson): Promise<ProjectPhase>`.

- [ ] **Step 1: Methode hinzufügen**

In `src/services/projects.service.ts`, nach `updateDeliverables` (aktuell Zeilen 46-48), vor der schließenden `}` einfügen:

```typescript
  updateAssignees(id: string, projectId: string, assigneeIdsJson: string): Promise<ProjectPhase> {
    return invoke('cmd_update_project_phase_assignees', { id, projectId, assigneeIdsJson })
  },
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck 2>&1 | grep -i project`
Expected: keine Fehler mehr in `projects.service.ts`/`projects.gateway.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/services/projects.service.ts
git commit -m "feat(services): ProjectsService -- updateAssignees"
```

---

### Task 9: Store -- `updateAssignees`-Action

**Files:**
- Modify: `src/store/projects.store.ts`
- Modify: `src/store/projects.store.test.ts`

**Interfaces:**
- Consumes: `ProjectsGateway.updateAssignees` (Task 7).
- Produces: `useProjectsStore().updateAssignees(id, projectId, assigneeIds): Promise<void>`. Task 11 (`ProjectDetailRoute`) ruft sie auf.

- [ ] **Step 1: Fehlschlagende Tests zuerst schreiben**

In `src/store/projects.store.test.ts`:

**a)** Den `vi.mock('@/data/projects.gateway', ...)`-Block am Dateikopf (aktuell Zeilen 5-12) um die neue Methode erweitern:

```typescript
vi.mock('@/data/projects.gateway', () => ({
  ProjectsGateway: {
    updatePhaseProgress: vi.fn(),
    requestGate: vi.fn(),
    approveGate: vi.fn(),
    updateDeliverables: vi.fn(),
    updateAssignees: vi.fn(),
  },
}))
```

**b)** Im `describe('useProjectsStore gate/deliverables actions', ...)`-Block: `basePhase` (aktuell Zeilen 46-50) um `assigneeIds: []` ergänzen (nach `deliverables: [],`):

```typescript
    gateDate: null, gateApprovedBy: null, progressPercent: 0, deliverables: [], assigneeIds: [],
```

Im `beforeEach` (aktuell Zeilen 52-57) ergänzen:

```typescript
    vi.mocked(ProjectsGateway.updateAssignees).mockReset()
```

Nach dem bestehenden `'updateDeliverables aktualisiert die Phase im Store'`-Test (aktuell Zeilen 71-76) ergänzen:

```typescript
  it('updateAssignees aktualisiert die Phase im Store', async () => {
    const assigneeIds = ['u-1']
    vi.mocked(ProjectsGateway.updateAssignees).mockResolvedValue({ ...basePhase, assigneeIds })
    await useProjectsStore.getState().updateAssignees('ph1', 'p1', assigneeIds)
    expect(useProjectsStore.getState().phasesByProject['p1'][0].assigneeIds).toEqual(assigneeIds)
  })
```

Run: `npx vitest run src/store/projects.store.test.ts`
Expected: FAIL -- `updateAssignees` existiert noch nicht auf dem Store.

- [ ] **Step 2: Action implementieren**

`ProjectsState`-Interface (`src/store/projects.store.ts:8-26`) um eine Methode ergänzen, nach `updateDeliverables: (id: string, projectId: string, deliverables: Deliverable[]) => Promise<void>`:

```typescript
  updateAssignees: (id: string, projectId: string, assigneeIds: string[]) => Promise<void>
```

Im Store-Objekt, nach `updateDeliverables` (aktuell Zeilen 232-248), vor der schließenden `}))` einfügen:

```typescript

  updateAssignees: async (id, projectId, assigneeIds) => {
    set({ error: null })
    try {
      const phase = await ProjectsGateway.updateAssignees(id, projectId, assigneeIds)
      set(s => ({
        phasesByProject: {
          ...s.phasesByProject,
          [projectId]: (s.phasesByProject[projectId] ?? []).map(p => p.id === id ? phase : p),
        },
      }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error })
      log.error('Failed to update assignees', { error, id, projectId })
      throw err
    }
  },
```

- [ ] **Step 3: Test ausführen, Erfolg verifizieren**

Run: `npx vitest run src/store/projects.store.test.ts`
Expected: PASS (bestehende Tests + 1 neuer).

- [ ] **Step 4: Commit**

```bash
git add src/store/projects.store.ts src/store/projects.store.test.ts
git commit -m "feat(store): updateAssignees-Action"
```

---

### Task 10: `ProjectPhasesList` -- `AssigneesSection` (Team-Zuweisung)

**Files:**
- Modify: `src/components/projects/ProjectPhasesList.tsx`
- Modify: `src/components/projects/ProjectPhasesList.test.tsx`

**Interfaces:**
- Consumes: `MemberProfile` (`@/types/profile.types`, bestehend).
- Produces: `ProjectPhasesList` bekommt drei neue Pflicht-Props: `members: MemberProfile[]`, `nameOf: (userId: string) => string`, `onUpdateAssignees: (phaseId: string, assigneeIds: string[]) => void`. Task 11 (`ProjectDetailRoute`) reicht alle drei durch.

- [ ] **Step 1: Fehlschlagende Tests zuerst schreiben**

In `src/components/projects/ProjectPhasesList.test.tsx`:

**a)** `phase()`-Helper (aktuell Zeilen 8-16) um `assigneeIds: []` ergänzen:

```typescript
function phase(overrides: Partial<ProjectPhase> = {}): ProjectPhase {
  return {
    id: 'ph1', projectId: 'p1', name: 'Konzept', orderIndex: 0, createdAt: '2026-01-01',
    startDate: '2026-04-27', endDate: '2026-05-11', gateName: 'Konzeptfreigabe',
    gateState: 'open', gateDate: null, gateApprovedBy: null, progressPercent: 40,
    deliverables: [], assigneeIds: [],
    ...overrides,
  }
}
```

**b)** `renderList()` (aktuell Zeilen 18-31) um die drei neuen Props ergänzen:

```typescript
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
      members={[]}
      nameOf={(id: string) => id}
      onUpdateAssignees={vi.fn()}
      {...overrides}
    />,
  )
}
```

**c)** Am Ende von `describe('ProjectPhasesList', ...)` (nach dem letzten bestehenden Test, vor der schließenden `})`) ergänzen:

```typescript
  it('zeigt zugewiesene Mitglieder als Namens-Chips', () => {
    renderList({
      phases: [phase({ assigneeIds: ['u-1', 'u-2'] })],
      members: [
        { id: 'u-1', displayName: 'Hendrik', email: null },
        { id: 'u-2', displayName: 'M. Weber', email: null },
      ],
      nameOf: (id: string) => (id === 'u-1' ? 'Hendrik' : 'M. Weber'),
    })
    expect(screen.getByText('Hendrik')).toBeTruthy()
    expect(screen.getByText('M. Weber')).toBeTruthy()
  })

  it('zeigt Hinweistext, wenn niemand zugewiesen ist', () => {
    renderList()
    expect(screen.getByText('Noch niemand zugewiesen.')).toBeTruthy()
  })

  it('fuegt ein Mitglied ueber das Dropdown hinzu', () => {
    const onUpdateAssignees = vi.fn()
    renderList({
      members: [{ id: 'u-1', displayName: 'Hendrik', email: null }],
      nameOf: () => 'Hendrik',
      onUpdateAssignees,
    })
    fireEvent.click(screen.getByText('+ Person'))
    fireEvent.click(screen.getByText('Hendrik'))
    expect(onUpdateAssignees).toHaveBeenCalledWith('ph1', ['u-1'])
  })

  it('entfernt ein zugewiesenes Mitglied', () => {
    const onUpdateAssignees = vi.fn()
    renderList({
      phases: [phase({ assigneeIds: ['u-1'] })],
      members: [{ id: 'u-1', displayName: 'Hendrik', email: null }],
      nameOf: () => 'Hendrik',
      onUpdateAssignees,
    })
    fireEvent.click(screen.getByLabelText('Hendrik entfernen'))
    expect(onUpdateAssignees).toHaveBeenCalledWith('ph1', [])
  })

  it('zeigt im Dropdown nur noch nicht zugewiesene Mitglieder', () => {
    renderList({
      phases: [phase({ assigneeIds: ['u-1'] })],
      members: [
        { id: 'u-1', displayName: 'Hendrik', email: null },
        { id: 'u-2', displayName: 'M. Weber', email: null },
      ],
      nameOf: (id: string) => (id === 'u-1' ? 'Hendrik' : 'M. Weber'),
    })
    fireEvent.click(screen.getByText('+ Person'))
    expect(screen.queryByText('Hendrik', { selector: 'button' })).toBeNull()
    expect(screen.getByText('M. Weber', { selector: 'button' })).toBeTruthy()
  })
```

Run: `npx vitest run src/components/projects/ProjectPhasesList.test.tsx`
Expected: FAIL -- `AssigneesSection` existiert noch nicht, neue Props fehlen.

- [ ] **Step 2: `AssigneesSection`-Komponente schreiben**

In `src/components/projects/ProjectPhasesList.tsx`, Import-Zeile (aktuell Zeile 4) um `MemberProfile` ergänzen:

```typescript
import type { ProjectPhase, Deliverable, DeliverableStatus } from '@/types/project.types'
import type { MemberProfile } from '@/types/profile.types'
```

Nach der bestehenden `DeliverablesChecklist`-Funktion (aktuell endet Zeile 80), vor `GateSection` einfügen:

```typescript
function AssigneesSection({ assigneeIds, members, nameOf, onChange }: {
  assigneeIds: string[]
  members: MemberProfile[]
  nameOf: (userId: string) => string
  onChange: (next: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const available = members.filter(m => !assigneeIds.includes(m.id))

  const add = (userId: string) => {
    onChange([...assigneeIds, userId])
    setOpen(false)
  }
  const remove = (userId: string) => {
    onChange(assigneeIds.filter(id => id !== userId))
  }

  return (
    <div>
      <span style={{ display: 'block', marginBottom: 8, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-dim)' }}>
        Team
      </span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10, alignItems: 'center' }}>
        {assigneeIds.map(userId => (
          <span
            key={userId}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '4px 8px', borderRadius: 20, background: 'var(--surface-2)', border: '1px solid var(--border)' }}
          >
            {nameOf(userId)}
            <button
              onClick={() => remove(userId)} aria-label={`${nameOf(userId)} entfernen`}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-dim)', display: 'flex', padding: 0 }}
            >
              <X size={11} />
            </button>
          </span>
        ))}
        {assigneeIds.length === 0 && <span style={{ fontSize: 12, color: 'var(--fg-dim)' }}>Noch niemand zugewiesen.</span>}
      </div>
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <button className="btn-ghost" style={{ fontSize: 11.5, padding: '5px 10px' }} onClick={() => setOpen(o => !o)}>
          + Person
        </button>
        {open && (
          <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 10, minWidth: 180, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow-2)', padding: 4 }}>
            {available.length === 0 && (
              <div style={{ padding: '7px 10px', fontSize: 12, color: 'var(--fg-dim)' }}>Alle Mitglieder bereits zugewiesen.</div>
            )}
            {available.map(m => (
              <button
                key={m.id} onClick={() => add(m.id)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', borderRadius: 7, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--fg)', fontSize: 13, fontFamily: 'inherit' }}
              >
                {m.displayName}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: `PhaseCard` erweitern**

`PhaseCard`-Props-Destructuring (aktuell Zeile 148) um drei neue Props ergänzen:

```typescript
function PhaseCard({ phase, index, isCurrent, isOpen, onToggle, onDeletePhase, onUpdateProgress, onRequestGate, onApproveGate, onUpdateDeliverables, onRemind, members, nameOf, onUpdateAssignees }: {
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
  members: MemberProfile[]
  nameOf: (userId: string) => string
  onUpdateAssignees: (phaseId: string, assigneeIds: string[]) => void
}) {
```

Den aufgeklappten Bereich (aktuell Zeilen 243-253) ersetzen durch:

```typescript
      {isOpen && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '16px 17px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 22, marginBottom: 18 }}>
            <DeliverablesChecklist deliverables={phase.deliverables} onChange={next => onUpdateDeliverables(phase.id, next)} />
            <GateSection
              phase={phase}
              onRequestGate={gateDate => onRequestGate(phase.id, gateDate)}
              onApproveGate={approvedBy => onApproveGate(phase.id, approvedBy)}
              onRemind={onRemind}
            />
          </div>
          <AssigneesSection
            assigneeIds={phase.assigneeIds} members={members} nameOf={nameOf}
            onChange={next => onUpdateAssignees(phase.id, next)}
          />
        </div>
      )}
```

- [ ] **Step 4: `ProjectPhasesList` erweitern**

Props-Destructuring + Typ-Annotation (aktuell Zeilen 258-267) ersetzen durch:

```typescript
export function ProjectPhasesList({ phases, currentPhaseId, onDeletePhase, onUpdateProgress, onRequestGate, onApproveGate, onUpdateDeliverables, onRemind, members, nameOf, onUpdateAssignees }: {
  phases: ProjectPhase[]
  currentPhaseId: string | null
  onDeletePhase: (phaseId: string) => Promise<void>
  onUpdateProgress: (phaseId: string, progressPercent: number) => void
  onRequestGate: (phaseId: string, gateDate: string | null) => void
  onApproveGate: (phaseId: string, approvedBy: string) => void
  onUpdateDeliverables: (phaseId: string, deliverables: Deliverable[]) => void
  onRemind: () => void
  members: MemberProfile[]
  nameOf: (userId: string) => string
  onUpdateAssignees: (phaseId: string, assigneeIds: string[]) => void
}) {
```

Den `<PhaseCard ... />`-Aufruf (aktuell Zeilen 273-280) um die drei neuen Props ergänzen:

```typescript
        <PhaseCard
          key={phase.id}
          phase={phase} index={i} isCurrent={phase.id === currentPhaseId}
          isOpen={openId === phase.id} onToggle={() => setOpenId(openId === phase.id ? null : phase.id)}
          onDeletePhase={onDeletePhase} onUpdateProgress={onUpdateProgress}
          onRequestGate={onRequestGate} onApproveGate={onApproveGate}
          onUpdateDeliverables={onUpdateDeliverables} onRemind={onRemind}
          members={members} nameOf={nameOf} onUpdateAssignees={onUpdateAssignees}
        />
```

- [ ] **Step 5: Test ausführen, Erfolg verifizieren**

Run: `npx vitest run src/components/projects/ProjectPhasesList.test.tsx`
Expected: PASS (bestehende 12 Tests + 4 neue = 16).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck 2>&1 | grep -i project`
Expected: Fehler nur noch in `ProjectDetailRoute.tsx` (fehlende neue Props am `<ProjectPhasesList>`-Aufruf) -- behoben in Task 11.

- [ ] **Step 7: Commit**

```bash
git add src/components/projects/ProjectPhasesList.tsx src/components/projects/ProjectPhasesList.test.tsx
git commit -m "feat(projects): ProjectPhasesList -- Team-Zuweisung (AssigneesSection)"
```

---

### Task 11: `ProjectDetailRoute.tsx` -- Team-Props durchreichen

**Files:**
- Modify: `src/routes/ProjectDetailRoute.tsx`

**Interfaces:**
- Consumes: `ProjectPhasesList`s neue Props (Task 10); `useProjectsStore().updateAssignees` (Task 9); `useMembersStore().members()`/`nameOf` (bestehend, bereits in dieser Datei selektiert).
- Produces: kompletter, funktionsfähiger Team-Zuweisungs-Workflow im Phasen-Tab.

- [ ] **Step 1: Neue Store-Action selektieren**

Nach `const updateDeliverables = useProjectsStore(s => s.updateDeliverables)` (aktuell Zeile 205) einfügen:

```typescript
  const updateAssignees = useProjectsStore(s => s.updateAssignees)
```

(`members` und `nameOf` sind in dieser Datei bereits aus `useMembersStore` selektiert -- Zeilen 212/214 -- keine neue Selektion nötig.)

- [ ] **Step 2: `ProjectPhasesList`-Aufruf um drei Props erweitern**

Den bestehenden `<ProjectPhasesList ... />`-Aufruf (aktuell Zeilen 364-372) um drei Props ergänzen:

```typescript
                <ProjectPhasesList
                  phases={phases} currentPhaseId={project.currentPhaseId}
                  onDeletePhase={handleDeletePhase}
                  onUpdateProgress={(phaseId, progressPercent) => updatePhaseProgress(phaseId, project.id, progressPercent)}
                  onRequestGate={(phaseId, gateDate) => requestGate(phaseId, project.id, gateDate)}
                  onApproveGate={(phaseId, approvedBy) => approveGate(phaseId, project.id, approvedBy)}
                  onUpdateDeliverables={(phaseId, deliverables) => updateDeliverables(phaseId, project.id, deliverables)}
                  onRemind={() => showToast({ message: 'Erinnerung vorbereitet (Mail-Versand folgt in einer späteren Runde)' })}
                  members={members} nameOf={nameOf}
                  onUpdateAssignees={(phaseId, assigneeIds) => updateAssignees(phaseId, project.id, assigneeIds)}
                />
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck 2>&1 | grep -i project`
Expected: keine Fehler.

- [ ] **Step 4: Volle Test-Suite**

Run: `cd src-tauri && cargo test 2>&1 | tail -10`
Expected: Baseline 301 + 3 (Task 3) = 304 bestanden, 0 fehlgeschlagen.

Run: `npx vitest run 2>&1 | tail -15`
Expected: Baseline 967 + 3 (Mapper) + 1 (Store) + 4 (ProjectPhasesList) = 975 bestanden, 0 fehlgeschlagen -- exakte Zahl im Report festhalten.

- [ ] **Step 5: Manuell im Dev-Build prüfen**

Im laufenden `npm run tauri dev`: ein Projekt mit mindestens einer Phase öffnen, Phasen-Tab, Karte aufklappen. Prüfen:
- "Team"-Bereich unterhalb von Deliverables/Gate erscheint, initial "Noch niemand zugewiesen."
- "+ Person" öffnet ein Dropdown mit Workspace-Mitgliedern.
- Klick auf ein Mitglied fügt einen Namens-Chip hinzu, schließt das Dropdown, Mitglied verschwindet aus der Dropdown-Liste.
- Klick auf das "×" am Chip entfernt die Zuweisung.
- Funktioniert unabhängig davon, ob die Phase die aktuelle ist oder nicht, unabhängig vom Gate-Status.

- [ ] **Step 6: Commit**

```bash
git add src/routes/ProjectDetailRoute.tsx
git commit -m "feat(projects): ProjectDetailRoute -- Team-Zuweisung verdrahtet"
```

---

## Self-Review

**Spec-Abdeckung** (gegen `docs/superpowers/specs/2026-07-27-projekt-team-kapazitaet-design.md` geprüft):
- `assignee_ids` als JSON-Spalte, Rust reicht roh durch → Task 1, 2, 3. ✓
- Mehrere Mitglieder pro Phase, jede Phase unabhängig von Reihenfolge/Status zuweisbar → Task 10 (kein `isCurrent`-Gate auf `AssigneesSection`). ✓
- Komplettes Ersetzen der Liste, keine `add`/`remove`-Backend-Operationen → Task 3 (`update_assignees` einzige Funktion). ✓
- Namens-Chips, kein neues Avatar-/Farb-Feld → Task 10 (`nameOf`, keine Farb-/Bild-Logik). ✓
- Rein informativ, keine Filter-/Mein-Tag-/Kapazitäts-Logik → in keinem Task enthalten. ✓
- Testing-Abschnitt der Spec (Rust-Unit-Tests, Mapper-Tests, Store-Tests, Komponenten-Tests) → Task 3, 6, 9, 10. ✓

**Platzhalter-Scan:** keine TBD/TODO, keine "Fehlerbehandlung hinzufügen"-Anweisungen ohne Code gefunden.

**Typ-Konsistenz geprüft:**
- `assigneeIds: string[]` (Task 5) ↔ `parseAssigneeIds`-Rückgabetyp (Task 6) ↔ `AssigneesSection`s Props (Task 10) -- konsistent durchgehend `string[]`.
- `updateAssignees(id, projectId, assigneeIds)`-Signatur identisch in Rust-Command (Task 4, als `assignee_ids_json: String`), Service (Task 8, `assigneeIdsJson: string`), Gateway (Task 7, `assigneeIds: string[]` → serialisiert nur im lokalen Zweig), Store (Task 9, `assigneeIds: string[]`), Aufrufer in `ProjectDetailRoute.tsx` (Task 11).
- `MemberProfile`-Typ (bestehend, `@/types/profile.types`) konsistent in `AssigneesSection`-Props (Task 10) und `ProjectDetailRoute`s bereits vorhandener `members`-Selektion (Task 11) verwendet -- kein neues Feld darauf.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-27-projekt-team-kapazitaet.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
