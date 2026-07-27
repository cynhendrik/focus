# Projekt-Modul-Ausbau — Etappe 5: Moodboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Neuer "Moodboard"-Tab im Projekt-Detail: freies Canvas mit Bild-/Farb-/Typo-/Notiz-Kacheln, frei positionierbar, ein Board pro Projekt. Echte Bilder (kein Platzhalter), mit echtem Cloud-Sync für geteilte Workspaces.

**Architecture:** `projects.moodboard_items` als JSON-Array-Spalte (gleiches Muster wie `deliverables`/`assignee_ids`). Bild-Bytes leben außerhalb der JSON-Spalte, referenziert über einen opaken `storageKey`-String pro Bild-Kachel. Lokal wird das bereits bestehende `workspace_ablage`-Subsystem wiederverwendet (`cmd_import_ws_file`/`cmd_read_ws_file`/`cmd_delete_ws_file` -- keine neuen Rust-Commands für lokale Bildablage nötig). Cloud (geteilter Workspace) bekommt einen neuen privaten Supabase-Storage-Bucket `moodboard-images` mit RLS-Policy nach Workspace-Zugehörigkeit.

**Tech Stack:** Rust/rusqlite (SQLite), Supabase/Postgres + Supabase Storage, React/TypeScript, Zustand.

## Global Constraints

- `moodboard_items TEXT NOT NULL DEFAULT '[]'` auf `projects` -- identisches Muster zu `deliverables`/`assignee_ids`: additive Migration, Rust validiert nur JSON-Gültigkeit, keine Struktur-Prüfung.
- Vier Kachel-Typen: `image`, `color`, `type`, `note`. Kein `link`-Typ (im Prototyp nicht über die "Hinzufügen"-Leiste erzeugbar).
- Kacheln werden nur verschoben (Drag), nicht rotiert oder resized -- feste Default-Größe pro Typ beim Hinzufügen.
- Komplettes Ersetzen der Liste bei jeder Änderung (`update_moodboard_items` bekommt die volle neue Liste), wie bei `update_deliverables`/`update_assignees`.
- Bild-Kacheln speichern nur `{ storageKey: string | null }` -- niemals Bild-Bytes im JSON.
- Lokaler Bild-Pfad nutzt das bestehende `workspace_ablage`-Subsystem (`cmd_import_ws_file`/`cmd_read_ws_file`/`cmd_delete_ws_file`) wieder -- **keine neuen Rust-Commands** für lokale Bildablage.
- Cloud-Bild-Pfad nutzt einen neuen privaten Supabase-Storage-Bucket `moodboard-images`, Pfad-Konvention `{workspaceId}/{projectId}/{itemId}.{ext}`, RLS über `workspace_members`-Mitgliedschaft (Muster: `(storage.foldername(name))[1]` = erstes Pfadsegment = `workspaceId`).
- Byte-Konvertierung folgt dem etablierten Muster aus `DateienPane.tsx`: Upload `Array.from(new Uint8Array(await file.arrayBuffer()))`, Anzeige `new Blob([new Uint8Array(bytes)], { type }) → URL.createObjectURL(blob)`.
- Explizit NICHT Teil dieser Etappe: Kunden-Freigabe-Link, Reaktionen, Kommentare, KORA-Zusammenfassung, Snip-to-Board, Kachel-Rotation/-Resize, mehrere Boards pro Projekt.

---

### Task 1: SQLite-Migration v41 -- `moodboard_items`-Spalte

**Files:**
- Modify: `src-tauri/src/db/migrations.rs`

**Interfaces:**
- Produces: Spalte `projects.moodboard_items TEXT NOT NULL DEFAULT '[]'`. Task 4 (Rust-Struct) konsumiert sie.

- [ ] **Step 1: `CURRENT_VERSION` erhöhen**

In `src-tauri/src/db/migrations.rs`, Zeile 4, `CURRENT_VERSION: u32 = 40;` zu `41` ändern.

- [ ] **Step 2: Migrations-Arm hinzufügen**

Nach dem `40 => { ... }`-Block (fügt `assignee_ids` zu `project_phases` hinzu), vor `_ => Ok(()),` einfügen:

```rust
        41 => {
            // Etappe 5 des Projekt-Ausbaus: Moodboard-Kacheln (moodboard_items)
            // pro Projekt als JSON-Liste, gleiches Muster wie deliverables/
            // assignee_ids -- Rust parst den Inhalt nicht, nur TypeScript.
            if !column_exists(conn, "projects", "moodboard_items") {
                conn.execute_batch(
                    "ALTER TABLE projects ADD COLUMN moodboard_items TEXT NOT NULL DEFAULT '[]';"
                )?;
            }
            Ok(())
        }
```

- [ ] **Step 3: Test schreiben**

Im `#[cfg(test)] mod tests`-Block, nach dem letzten bestehenden Migrations-Test (finde ihn per Suche nach `fn migration_40_` -- füge direkt danach ein, vor der schließenden `}` des Moduls):

```rust
    #[test]
    fn migration_41_adds_moodboard_items_column_with_default() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        schema::create_tables(&conn).unwrap();

        for v in 1..=40u32 {
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

        run(&conn).unwrap();

        assert!(column_exists(&conn, "projects", "moodboard_items"));
        let items: String = conn.query_row(
            "SELECT moodboard_items FROM projects WHERE id = 'p1'", [], |r| r.get(0),
        ).unwrap();
        assert_eq!(items, "[]");

        run(&conn).unwrap(); // idempotent
    }
```

- [ ] **Step 4: Tests ausführen**

Run: `cd src-tauri && cargo test migration_41 -- --nocapture`
Expected: PASS.

Run: `cd src-tauri && cargo build 2>&1 | tail -20`
Expected: Build erfolgreich.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/db/migrations.rs
git commit -m "feat(db): migration v41 -- moodboard_items-Spalte fuer Projekte"
```

---

### Task 2: Supabase-Migration 0030 -- `moodboard_items`-Spalte

**Files:**
- Create: `supabase/migrations/0030_projects_moodboard_items.sql`

**Interfaces:**
- Produces: Spalte `projects.moodboard_items jsonb not null default '[]'::jsonb` im Cloud-Schema.

- [ ] **Step 1: Migrations-Datei anlegen**

```sql
-- Cloud-Gegenstueck zu SQLite-Migration v41 (src-tauri/src/db/migrations.rs).
-- Muss wie 0001-0029 manuell ueber die Management-API auf das Supabase-Projekt
-- angewendet werden (siehe Kommentar in 0026_projects.sql).
--
-- Bewusst jsonb (nicht text): der Supabase-JS-Client (de)serialisiert jsonb-Spalten
-- automatisch zu/von nativen JS-Arrays -- anders als der lokale SQLite-Pfad, wo
-- Rust den Inhalt als rohen String durchreicht. src/data/projects.mapper.ts's
-- parseMoodboardItems() behandelt beide Formen (String ODER bereits geparstes Array).

alter table public.projects
  add column if not exists moodboard_items jsonb not null default '[]'::jsonb;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0030_projects_moodboard_items.sql
git commit -m "feat(db): Supabase-Migration 0030 -- moodboard_items-Spalte (jsonb)"
```

(Hinweis für später: muss noch manuell über die Management-API auf das Supabase-Projekt angewendet werden, wie alle vorherigen Migrationen -- kein Teil dieses Tasks.)

---

### Task 3: Supabase-Storage-Bucket `moodboard-images` + RLS-Policies

**Files:**
- Create: `supabase/migrations/0031_moodboard_images_storage.sql`

**Interfaces:**
- Produces: privater Storage-Bucket `moodboard-images` mit vier RLS-Policies (select/insert/update/delete), die Zugriff auf Pfade `{workspaceId}/...` auf Mitglieder dieses Workspace beschränken. Task 9 (Gateway) nutzt diesen Bucket direkt über den Supabase-JS-Client.

- [ ] **Step 1: Migrations-Datei anlegen**

```sql
-- Neuer privater Storage-Bucket fuer Moodboard-Bilder (Etappe 5 des Projekt-Ausbaus).
-- Muss wie 0001-0030 manuell ueber die Management-API auf das Supabase-Projekt
-- angewendet werden (siehe Kommentar in 0026_projects.sql).
--
-- Pfad-Konvention der Objekte: {workspaceId}/{projectId}/{itemId}.{ext}
-- storage.foldername(name) liefert die Pfad-Segmente vor dem Dateinamen als Array;
-- Segment [1] ist damit die workspaceId. Die Policy prueft Mitgliedschaft in
-- public.workspace_members -- identisches Prinzip zu den bestehenden RLS-Policies
-- auf den Postgres-Tabellen dieses Projekts.

insert into storage.buckets (id, name, public)
values ('moodboard-images', 'moodboard-images', false)
on conflict (id) do nothing;

create policy "moodboard_images_select_workspace_members"
on storage.objects for select
to authenticated
using (
  bucket_id = 'moodboard-images'
  and exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = (storage.foldername(name))[1]
      and wm.user_id = auth.uid()
  )
);

create policy "moodboard_images_insert_workspace_members"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'moodboard-images'
  and exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = (storage.foldername(name))[1]
      and wm.user_id = auth.uid()
  )
);

create policy "moodboard_images_update_workspace_members"
on storage.objects for update
to authenticated
using (
  bucket_id = 'moodboard-images'
  and exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = (storage.foldername(name))[1]
      and wm.user_id = auth.uid()
  )
);

create policy "moodboard_images_delete_workspace_members"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'moodboard-images'
  and exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = (storage.foldername(name))[1]
      and wm.user_id = auth.uid()
  )
);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0031_moodboard_images_storage.sql
git commit -m "feat(storage): moodboard-images-Bucket + RLS-Policies"
```

(Hinweis für später: muss manuell über die Management-API angewendet werden. Da dies die erste Storage-Migration dieses Projekts ist -- anders als bisherige reine Tabellen-Migrationen --, nach dem Einspielen live verifizieren: Bucket existiert, ist privat, alle vier Policies aktiv. Kein Teil dieses Tasks, aber als Nachfolge-Punkt festhalten.)

---

### Task 4: `Project.moodboard_items`-Feld + `update_moodboard_items`

**Files:**
- Modify: `src-tauri/src/db/project.rs`

**Interfaces:**
- Consumes: `moodboard_items`-Spalte (Task 1).
- Produces: `Project.moodboard_items: String`. `update_moodboard_items(conn, id, moodboard_items_json: String) -> Result<Project, AppError>`. Task 5 (Tauri-Command) ruft sie auf.

- [ ] **Step 1: Feld zum Struct hinzufügen**

Im `Project`-Struct (aktuell Zeilen 6-22), nach `pub retainer_months: Option<i32>,` einfügen:

```rust
    pub moodboard_items: String,
```

- [ ] **Step 2: `SELECT_COLUMNS` + `map_row` erweitern**

`SELECT_COLUMNS`-Konstante (aktuell Zeile 55-56) erweitern:

```rust
const SELECT_COLUMNS: &str =
    "id, workspace_id, account_id, title, description, status, current_phase_id, created_at, updated_at, completed_at, retainer_monthly, retainer_hours, retainer_months, moodboard_items";
```

`map_row` (aktuell Zeilen 37-53), nach `retainer_months: r.get(12)?,` einfügen:

```rust
        moodboard_items: r.get(13)?,
```

- [ ] **Step 3: `update_moodboard_items`-Funktion hinzufügen**

Nach `set_status` (aktuell endet Zeile 151), vor dem `#[cfg(test)]`-Block einfügen:

```rust
/// Ersetzt die Moodboard-Kacheln-Liste. Rust prueft nur, dass es sich um
/// gueltiges JSON handelt (Boundary-Validierung) -- analog zu
/// update_deliverables/update_assignees auf project_phases. Bild-Kacheln
/// enthalten nur einen storageKey-Verweis, keine Bytes -- die liegen ausserhalb
/// dieser Spalte (lokal via workspace_ablage, cloud via Supabase Storage).
pub fn update_moodboard_items(conn: &Connection, id: &str, moodboard_items_json: String) -> Result<Project, AppError> {
    if serde_json::from_str::<serde_json::Value>(&moodboard_items_json).is_err() {
        return Err(AppError::Validation("moodboard_items muss gueltiges JSON sein".to_string()));
    }
    get_by_id(conn, id)?;
    conn.execute(
        "UPDATE projects SET moodboard_items = ?1 WHERE id = ?2",
        rusqlite::params![moodboard_items_json, id],
    )?;
    get_by_id(conn, id)
}
```

Am Dateikopf (Zeile 2) muss `serde::{Deserialize, Serialize}` bereits importiert sein (ist es) -- `serde_json` wird als vollqualifizierter Pfad `serde_json::from_str`/`serde_json::Value` genutzt (kein zusätzlicher Import nötig, wird bereits im Cargo.toml-Dependency-Baum als `serde_json` genutzt, siehe `project_phase.rs`'s identisches Muster).

- [ ] **Step 4: Bestehende Tests um `moodboard_items`-Assertion erweitern**

In `upsert_creates_new_project_with_active_status` (aktuell Zeilen 180-186), nach `assert_eq!(p.current_phase_id, None);` einfügen:

```rust
        assert_eq!(p.moodboard_items, "[]");
```

- [ ] **Step 5: Neue Tests schreiben**

Nach `delete_removes_project` (aktuell Zeilen 283-289), vor der schließenden `}` des Test-Moduls einfügen:

```rust
    #[test]
    fn update_moodboard_items_stores_valid_json() {
        let conn = setup();
        let p = upsert(&conn, payload("Test")).unwrap();
        let json = r#"[{"id":"m1","kind":"note","x":10,"y":10,"w":20,"h":15,"cap":"Notiz","text":"Hallo"}]"#.to_string();
        let updated = update_moodboard_items(&conn, &p.id, json.clone()).unwrap();
        assert_eq!(updated.moodboard_items, json);
    }

    #[test]
    fn update_moodboard_items_rejects_invalid_json() {
        let conn = setup();
        let p = upsert(&conn, payload("Test")).unwrap();
        let result = update_moodboard_items(&conn, &p.id, "not json".to_string());
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn update_moodboard_items_rejects_unknown_project() {
        let conn = setup();
        let result = update_moodboard_items(&conn, "missing", "[]".to_string());
        assert!(result.is_err());
    }
```

- [ ] **Step 6: Tests ausführen**

Run: `cd src-tauri && cargo test db::project:: -- --nocapture`
Expected: PASS (bestehende Tests + 3 neue `update_moodboard_items_*`-Tests).

Run: `cd src-tauri && cargo test 2>&1 | tail -10`
Expected: volle Suite grün (Baseline 305 + 1 [Migration Task 1] + 3 = 309).

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/db/project.rs
git commit -m "feat(db): Project -- moodboard_items-Feld + update_moodboard_items"
```

---

### Task 5: Tauri-Command für `update_moodboard_items`

**Files:**
- Modify: `src-tauri/src/commands/project.rs`
- Modify: `src-tauri/src/main.rs`

**Interfaces:**
- Consumes: `db::project::update_moodboard_items` (Task 4).
- Produces: Tauri-Command `cmd_update_project_moodboard_items`. Task 10 (TS-Service) ruft sie per `invoke(...)` auf.

- [ ] **Step 1: Command hinzufügen**

An das Ende von `src-tauri/src/commands/project.rs` anfügen:

```rust
#[tauri::command]
pub fn cmd_update_project_moodboard_items(
    db: State<'_, DbPool>, id: String, moodboard_items_json: String,
) -> Result<Project, AppError> {
    db::project::update_moodboard_items(&db.conn(), &id, moodboard_items_json)
}
```

- [ ] **Step 2: In `main.rs` registrieren**

In `src-tauri/src/main.rs`, nach `commands::project::cmd_set_project_status,` (aktuell Zeile 290) einfügen:

```rust
            commands::project::cmd_update_project_moodboard_items,
```

- [ ] **Step 3: Build prüfen**

Run: `cd src-tauri && cargo build 2>&1 | tail -40`
Expected: Build erfolgreich.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/project.rs src-tauri/src/main.rs
git commit -m "feat(commands): update_moodboard_items-Command registriert"
```

---

### Task 6: TypeScript-Typen -- `MoodboardItem`-Union + `Project.moodboardItems`

**Files:**
- Modify: `src/types/project.types.ts`

**Interfaces:**
- Produces: `MoodboardItemKind`, `MoodboardImageItem`, `MoodboardColorItem`, `MoodboardTypeItem`, `MoodboardNoteItem`, `MoodboardItem` (Union), `Project.moodboardItems: MoodboardItem[]`. Task 7 (Mapper) parst/serialisiert dieses Feld.

- [ ] **Step 1: Typen ergänzen**

In `src/types/project.types.ts`, nach `export interface Deliverable { ... }` (aktuell Zeilen 6-10), vor `export interface Project { ... }` einfügen:

```typescript
export type MoodboardItemKind = 'image' | 'color' | 'type' | 'note'

export interface MoodboardItemBase {
  id: string
  kind: MoodboardItemKind
  x: number
  y: number
  w: number
  h: number
  cap: string
}

export interface MoodboardImageItem extends MoodboardItemBase {
  kind: 'image'
  storageKey: string | null
}

export interface MoodboardColorItem extends MoodboardItemBase {
  kind: 'color'
  colors: string[]
}

export interface MoodboardTypeItem extends MoodboardItemBase {
  kind: 'type'
  font: string
  sample: string
  note: string
}

export interface MoodboardNoteItem extends MoodboardItemBase {
  kind: 'note'
  text: string
}

export type MoodboardItem = MoodboardImageItem | MoodboardColorItem | MoodboardTypeItem | MoodboardNoteItem
```

- [ ] **Step 2: Feld auf `Project` ergänzen**

In `export interface Project { ... }` (aktuell Zeilen 12-26), nach `retainerMonths: number | null` ergänzen:

```typescript
  moodboardItems: MoodboardItem[]
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck 2>&1 | grep -i project`
Expected: Fehler in `projects.mapper.ts` (fehlendes `moodboardItems`-Feld beim Rückgabeobjekt von `projectRowToProject`) -- erwartet, wird in Task 7 behoben.

- [ ] **Step 4: Commit**

```bash
git add src/types/project.types.ts
git commit -m "feat(types): MoodboardItem-Union + Project.moodboardItems"
```

---

### Task 7: Mapper -- `moodboardItems` parsen/serialisieren

**Files:**
- Modify: `src/data/projects.mapper.ts`
- Modify: `src/data/projects.mapper.test.ts`

**Interfaces:**
- Consumes: `MoodboardItem`, `Project.moodboardItems` (Task 6).
- Produces: `parseMoodboardItems(raw: unknown): MoodboardItem[]` (analog zu `parseDeliverables`); `projectRowToProject` liefert jetzt `moodboardItems: MoodboardItem[]`.

- [ ] **Step 1: Fehlschlagende Tests zuerst schreiben**

In `src/data/projects.mapper.test.ts`, im `describe('projectRowToProject', ...)`-Block:

**a)** Den bestehenden Test `'maps a full row'` (aktuell Zeilen 5-18) anpassen -- das erwartete Rückgabeobjekt muss um `moodboardItems: []` ergänzt werden (nach `retainerMonths: 12,`), sonst schlägt der exakte `toEqual`-Vergleich fehl.

**b)** Nach dem bestehenden Test `'defaults nullable fields when absent'` (aktuell Zeilen 20-33), vor der schließenden `})` des `describe`-Blocks ergänzen:

```typescript
  it('parst moodboardItems aus einem JSON-String (lokaler SQLite-Pfad)', () => {
    const row = {
      id: 'p1', workspace_id: 'ws1', account_id: 'a1', title: 'Relaunch',
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      moodboard_items: '[{"id":"m1","kind":"note","x":10,"y":10,"w":20,"h":15,"cap":"Notiz","text":"Hallo"}]',
    }
    const project = projectRowToProject(row)
    expect(project.moodboardItems).toEqual([
      { id: 'm1', kind: 'note', x: 10, y: 10, w: 20, h: 15, cap: 'Notiz', text: 'Hallo' },
    ])
  })

  it('akzeptiert moodboardItems als bereits geparstes Array (Supabase-jsonb-Pfad)', () => {
    const row = {
      id: 'p1', workspace_id: 'ws1', account_id: 'a1', title: 'Relaunch',
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      moodboard_items: [{ id: 'm1', kind: 'color', x: 5, y: 5, w: 24, h: 12, cap: 'Palette', colors: ['#fff'] }],
    }
    const project = projectRowToProject(row)
    expect(project.moodboardItems).toEqual([
      { id: 'm1', kind: 'color', x: 5, y: 5, w: 24, h: 12, cap: 'Palette', colors: ['#fff'] },
    ])
  })

  it('faellt auf leeres Array zurueck bei fehlendem/ungueltigem moodboard_items', () => {
    const base = {
      id: 'p1', workspace_id: 'ws1', account_id: 'a1', title: 'Relaunch',
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    }
    expect(projectRowToProject({ ...base }).moodboardItems).toEqual([])
    expect(projectRowToProject({ ...base, moodboard_items: 'not json' }).moodboardItems).toEqual([])
    expect(projectRowToProject({ ...base, moodboard_items: '{"not":"an array"}' }).moodboardItems).toEqual([])
  })
```

Run: `npx vitest run src/data/projects.mapper.test.ts`
Expected: FAIL -- `moodboardItems` fehlt am Rückgabeobjekt bzw. die angepasste `toEqual`-Erwartung passt noch nicht.

- [ ] **Step 2: Mapper erweitern**

In `src/data/projects.mapper.ts`, Import-Zeile (aktuell Zeile 1) um `MoodboardItem` ergänzen:

```typescript
import type { Project, ProjectPhase, Deliverable, MoodboardItem } from '@/types/project.types'
```

Nach der bestehenden `parseAssigneeIds`-Funktion (aktuell endet Zeile 25) einfügen:

```typescript
function parseMoodboardItems(raw: unknown): MoodboardItem[] {
  if (Array.isArray(raw)) return raw as MoodboardItem[]
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

`projectRowToProject` (aktuell Zeilen 16-32), nach `retainerMonths: r.retainer_months ?? null,` ergänzen:

```typescript
    moodboardItems: parseMoodboardItems(r.moodboard_items),
```

- [ ] **Step 3: Test ausführen, Erfolg verifizieren**

Run: `npx vitest run src/data/projects.mapper.test.ts`
Expected: PASS (alle bisherigen Tests + 3 neue).

- [ ] **Step 4: Commit**

```bash
git add src/data/projects.mapper.ts src/data/projects.mapper.test.ts
git commit -m "feat(data): Mapper -- moodboardItems parsen (String- und Array-Form)"
```

---

### Task 8: Gateway -- `updateMoodboardItems` lokal + Cloud

**Files:**
- Modify: `src/data/projects.gateway.ts`

**Interfaces:**
- Consumes: `ProjectsService.updateMoodboardItems` (Task 10, wird gleich mit dem finalen Namen aufgerufen, existiert dort noch nicht -- analog zum bekannten Muster aus Etappe 3/4).
- Produces: `ProjectsGateway.updateMoodboardItems(id: string, moodboardItems: MoodboardItem[]): Promise<Project>`.

- [ ] **Step 1: Import erweitern**

In `src/data/projects.gateway.ts:5-7` `MoodboardItem` ergänzen:

```typescript
import type {
  Project, UpsertProjectPayload, ProjectPhase, CreateProjectPhasePayload, Deliverable, MoodboardItem,
} from '@/types/project.types'
```

- [ ] **Step 2: Methode hinzufügen**

Nach `setStatus` (aktuell endet Zeile 82, vor `getPhases`) einfügen:

```typescript
  async updateMoodboardItems(id: string, moodboardItems: MoodboardItem[]): Promise<Project> {
    if (!shared()) return ProjectsService.updateMoodboardItems(id, JSON.stringify(moodboardItems))
    const { data, error } = await supabase.from('projects')
      .update({ moodboard_items: moodboardItems }).eq('id', id).select('*').single()
    if (error) fail(error)
    return projectRowToProject(data)
  },
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck 2>&1 | grep -i project`
Expected: Fehler nur noch in `projects.service.ts` (fehlende `updateMoodboardItems`-Methode) -- behoben in Task 10.

- [ ] **Step 4: Commit**

```bash
git add src/data/projects.gateway.ts
git commit -m "feat(data): ProjectsGateway -- updateMoodboardItems"
```

---

### Task 9: Gateway -- Bild-Speicherung (lokal via Ablage, Cloud via Supabase Storage)

**Files:**
- Modify: `src/data/projects.gateway.ts`

**Interfaces:**
- Consumes: `ProjectsService.importMoodboardImage`/`readMoodboardImage`/`deleteMoodboardImage` (Task 10, lokaler Pfad, existiert dort noch nicht -- analoges Cross-Task-Muster).
- Produces: `ProjectsGateway.uploadMoodboardImage(workspaceId, projectId, itemId, file: File): Promise<string>` (gibt den `storageKey` zurück), `ProjectsGateway.readMoodboardImage(workspaceId, storageKey: string): Promise<Blob>`, `ProjectsGateway.deleteMoodboardImage(workspaceId, storageKey: string): Promise<void>`.

**Wichtig -- lies das genau, bevor du anfängst:** Der lokale Pfad nutzt das bestehende `workspace_ablage`-Subsystem wieder (`cmd_import_ws_file`/`cmd_read_ws_file`/`cmd_delete_ws_file`, bereits als Tauri-Commands registriert -- siehe `src-tauri/src/commands/workspace_ablage.rs`). Für den lokalen Pfad IST der `storageKey` die von `cmd_import_ws_file` zurückgegebene `WorkspaceFile.id` (ein `workspace_files`-Datenbank-Eintrag, keine Pfad-Konvention). Für den Cloud-Pfad ist der `storageKey` ein selbst konstruierter Pfad-String `{workspaceId}/{projectId}/{itemId}.{ext}` (Supabase-Storage-Objekt-Pfad). Diese Asymmetrie ist beabsichtigt -- beide sind aus Sicht der aufrufenden Komponente einfach ein opaker String.

- [ ] **Step 1: Drei Methoden hinzufügen**

Nach `updateMoodboardItems` (Task 8, jetzt letztes Element in `ProjectsGateway`), vor der schließenden `}` einfügen:

```typescript
  async uploadMoodboardImage(workspaceId: string, projectId: string, itemId: string, file: File): Promise<string> {
    const data = Array.from(new Uint8Array(await file.arrayBuffer()))
    if (!shared()) {
      const wsFile = await ProjectsService.importMoodboardImage(workspaceId, file.name, data, file.type || null)
      return wsFile.id
    }
    const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin'
    const storageKey = `${workspaceId}/${projectId}/${itemId}.${ext}`
    const { error } = await supabase.storage.from('moodboard-images')
      .upload(storageKey, file, { upsert: true, contentType: file.type || undefined })
    if (error) fail(error)
    return storageKey
  },

  async readMoodboardImage(workspaceId: string, storageKey: string): Promise<Blob> {
    if (!shared()) {
      const bytes = await ProjectsService.readMoodboardImage(storageKey)
      return new Blob([new Uint8Array(bytes)])
    }
    const { data, error } = await supabase.storage.from('moodboard-images').download(storageKey)
    if (error) fail(error)
    return data
  },

  async deleteMoodboardImage(workspaceId: string, storageKey: string): Promise<void> {
    if (!shared()) return ProjectsService.deleteMoodboardImage(storageKey)
    const { error } = await supabase.storage.from('moodboard-images').remove([storageKey])
    if (error) fail(error)
  },
```

`workspaceId` wird im lokalen Zweig von `uploadMoodboardImage` nur für den Aufruf, nicht direkt für `cmd_import_ws_file` selbst gebraucht -- `ProjectsService.importMoodboardImage` reicht sie durch (siehe Task 10). `workspaceId`-Parameter bei `readMoodboardImage`/`deleteMoodboardImage` wird im lokalen Zweig nicht gebraucht (die `workspace_files`-Zeile trägt die ID bereits), bleibt aber Teil der Signatur für Konsistenz mit dem Cloud-Zweig und weil der Aufrufer (Store) ihn ohnehin zur Hand hat.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck 2>&1 | grep -i project`
Expected: Fehler nur noch in `projects.service.ts` (fehlende `importMoodboardImage`/`readMoodboardImage`/`deleteMoodboardImage`-Methoden) -- behoben in Task 10.

- [ ] **Step 3: Commit**

```bash
git add src/data/projects.gateway.ts
git commit -m "feat(data): ProjectsGateway -- Moodboard-Bild-Speicherung (lokal Ablage, Cloud Storage)"
```

---

### Task 10: Service -- Invoke-Wrapper

**Files:**
- Modify: `src/services/projects.service.ts`

**Interfaces:**
- Consumes: `cmd_update_project_moodboard_items` (Task 5), `cmd_import_ws_file`/`cmd_read_ws_file`/`cmd_delete_ws_file` (bestehend, `src-tauri/src/commands/workspace_ablage.rs`).
- Produces: `ProjectsService.updateMoodboardItems(id, moodboardItemsJson): Promise<Project>`, `ProjectsService.importMoodboardImage(workspaceId, name, data, mimeType): Promise<{ id: string; path: string }>`, `ProjectsService.readMoodboardImage(id): Promise<number[]>`, `ProjectsService.deleteMoodboardImage(id): Promise<void>`.

- [ ] **Step 1: Methoden hinzufügen**

In `src/services/projects.service.ts`, nach `updateAssignees` (aktuell letztes Element, endet Zeile 48), vor der schließenden `}` einfügen:

```typescript
  updateMoodboardItems(id: string, moodboardItemsJson: string): Promise<Project> {
    return invoke('cmd_update_project_moodboard_items', { id, moodboardItemsJson })
  },
  importMoodboardImage(workspaceId: string, name: string, data: number[], mimeType: string | null): Promise<{ id: string; path: string }> {
    return invoke('cmd_import_ws_file', { workspaceId, folderId: null, name, data, mimeType })
  },
  readMoodboardImage(id: string): Promise<number[]> {
    return invoke('cmd_read_ws_file', { id })
  },
  deleteMoodboardImage(id: string): Promise<void> {
    return invoke('cmd_delete_ws_file', { id })
  },
```

`importMoodboardImage`s Rückgabetyp ist bewusst minimal (`{ id, path }`) -- der Rust-Command gibt das volle `WorkspaceFile`-Objekt zurück, aber nur `id` wird als `storageKey` gebraucht (siehe Task 9). TypeScript lässt überschüssige Felder bei einem strukturell kompatiblen Rückgabewert zu, daher reicht diese schlanke Typannotation.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck 2>&1 | grep -i project`
Expected: keine Fehler mehr in `projects.service.ts`/`projects.gateway.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/services/projects.service.ts
git commit -m "feat(services): ProjectsService -- Moodboard-Items + Bild-Speicherung"
```

---

### Task 11: Store -- `updateMoodboardItems` + `uploadMoodboardImage`-Actions

**Files:**
- Modify: `src/store/projects.store.ts`
- Modify: `src/store/projects.store.test.ts`

**Interfaces:**
- Consumes: `ProjectsGateway.updateMoodboardItems`/`uploadMoodboardImage`/`deleteMoodboardImage` (Task 8, 9).
- Produces: `useProjectsStore().updateMoodboardItems(id, moodboardItems): Promise<void>`, `.uploadMoodboardImage(workspaceId, projectId, itemId, file): Promise<void>` (lädt hoch, ersetzt den `storageKey` des passenden Items in der aktuellen Liste, persistiert die komplette Liste). Task 13/14 (Komponente) ruft beide auf.

- [ ] **Step 1: Fehlschlagende Tests zuerst schreiben**

In `src/store/projects.store.test.ts`:

**a)** `vi.mock('@/data/projects.gateway', ...)`-Block um zwei Methoden erweitern:

```typescript
vi.mock('@/data/projects.gateway', () => ({
  ProjectsGateway: {
    updatePhaseProgress: vi.fn(),
    requestGate: vi.fn(),
    approveGate: vi.fn(),
    updateDeliverables: vi.fn(),
    updateAssignees: vi.fn(),
    updateMoodboardItems: vi.fn(),
    uploadMoodboardImage: vi.fn(),
  },
}))
```

**b)** Neuen `describe`-Block am Ende der Datei ergänzen (nach dem bestehenden `describe('useProjectsStore gate/deliverables actions', ...)`):

```typescript
describe('useProjectsStore moodboard actions', () => {
  const baseProject = {
    id: 'p1', workspaceId: 'ws1', accountId: 'a1', title: 'Relaunch', description: null,
    status: 'active' as const, currentPhaseId: null, createdAt: '2026-01-01', updatedAt: '2026-01-01',
    completedAt: null, retainerMonthly: 0, retainerHours: 0, retainerMonths: null, moodboardItems: [],
  }

  beforeEach(() => {
    useProjectsStore.setState({ projects: [baseProject], phasesByProject: {}, isLoading: false, error: null })
    vi.mocked(ProjectsGateway.updateMoodboardItems).mockReset()
    vi.mocked(ProjectsGateway.uploadMoodboardImage).mockReset()
  })

  it('updateMoodboardItems aktualisiert das Projekt im Store', async () => {
    const items = [{ id: 'm1', kind: 'note' as const, x: 10, y: 10, w: 20, h: 15, cap: 'Notiz', text: 'Hallo' }]
    vi.mocked(ProjectsGateway.updateMoodboardItems).mockResolvedValue({ ...baseProject, moodboardItems: items })
    await useProjectsStore.getState().updateMoodboardItems('p1', items)
    expect(useProjectsStore.getState().projects[0].moodboardItems).toEqual(items)
  })

  it('uploadMoodboardImage setzt den storageKey des passenden Items und persistiert die Liste', async () => {
    const items = [{ id: 'm1', kind: 'image' as const, x: 10, y: 10, w: 24, h: 26, cap: 'Bild', storageKey: null }]
    useProjectsStore.setState({ projects: [{ ...baseProject, moodboardItems: items }], phasesByProject: {}, isLoading: false, error: null })
    vi.mocked(ProjectsGateway.uploadMoodboardImage).mockResolvedValue('storage-key-1')
    vi.mocked(ProjectsGateway.updateMoodboardItems).mockResolvedValue({
      ...baseProject, moodboardItems: [{ ...items[0], storageKey: 'storage-key-1' }],
    })
    const file = new File(['x'], 'bild.png', { type: 'image/png' })
    await useProjectsStore.getState().uploadMoodboardImage('ws1', 'p1', 'm1', file)
    expect(ProjectsGateway.uploadMoodboardImage).toHaveBeenCalledWith('ws1', 'p1', 'm1', file)
    expect(ProjectsGateway.updateMoodboardItems).toHaveBeenCalledWith('p1', [{ ...items[0], storageKey: 'storage-key-1' }])
    expect(useProjectsStore.getState().projects[0].moodboardItems[0].storageKey).toBe('storage-key-1')
  })

  it('setzt error im Store, wenn updateMoodboardItems wirft', async () => {
    vi.mocked(ProjectsGateway.updateMoodboardItems).mockRejectedValue(new Error('boom'))
    await expect(useProjectsStore.getState().updateMoodboardItems('p1', [])).rejects.toThrow('boom')
    expect(useProjectsStore.getState().error).not.toBeNull()
  })
})
```

Run: `npx vitest run src/store/projects.store.test.ts`
Expected: FAIL -- die beiden Actions existieren noch nicht auf dem Store.

- [ ] **Step 2: Actions implementieren**

`ProjectsState`-Interface, nach `updateAssignees: (id: string, projectId: string, assigneeIds: string[]) => Promise<void>` ergänzen:

```typescript
  updateMoodboardItems: (id: string, moodboardItems: MoodboardItem[]) => Promise<void>
  uploadMoodboardImage: (workspaceId: string, projectId: string, itemId: string, file: File) => Promise<void>
```

Import-Zeile (aktuell `import type { Project, ProjectPhase, UpsertProjectPayload, CreateProjectPhasePayload, Deliverable } from '@/types/project.types'`) um `MoodboardItem` ergänzen.

Im Store-Objekt, nach `updateAssignees` (jetzt letztes Element), vor der schließenden `}))` einfügen:

```typescript

  updateMoodboardItems: async (id, moodboardItems) => {
    set({ error: null })
    try {
      const project = await ProjectsGateway.updateMoodboardItems(id, moodboardItems)
      set(s => ({ projects: s.projects.map(p => p.id === id ? project : p) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error })
      log.error('Failed to update moodboard items', { error, id })
      throw err
    }
  },

  uploadMoodboardImage: async (workspaceId, projectId, itemId, file) => {
    set({ error: null })
    try {
      const storageKey = await ProjectsGateway.uploadMoodboardImage(workspaceId, projectId, itemId, file)
      const current = get().projects.find(p => p.id === projectId)
      const nextItems = (current?.moodboardItems ?? []).map(item =>
        item.id === itemId && item.kind === 'image' ? { ...item, storageKey } : item,
      )
      const project = await ProjectsGateway.updateMoodboardItems(projectId, nextItems)
      set(s => ({ projects: s.projects.map(p => p.id === projectId ? project : p) }))
    } catch (err) {
      const error = isAppError(err) ? err : { kind: 'Db' as const, message: formatError(err) }
      set({ error })
      log.error('Failed to upload moodboard image', { error, workspaceId, projectId, itemId })
      throw err
    }
  },
```

- [ ] **Step 3: Test ausführen, Erfolg verifizieren**

Run: `npx vitest run src/store/projects.store.test.ts`
Expected: PASS (bestehende Tests + 3 neue).

- [ ] **Step 4: Commit**

```bash
git add src/store/projects.store.ts src/store/projects.store.test.ts
git commit -m "feat(store): updateMoodboardItems + uploadMoodboardImage-Actions"
```

---

### Task 12: `ui.store.ts` -- `ProjectTab` um `'moodboard'` erweitern

**Files:**
- Modify: `src/store/ui.store.ts`

**Interfaces:**
- Produces: `ProjectTab = 'cockpit' | 'phasen' | 'moodboard'`. Task 15 (`ProjectDetailRoute`) nutzt den neuen Tab-Wert.

- [ ] **Step 1: Typ erweitern**

`export type ProjectTab = 'cockpit' | 'phasen'` (aktuell Zeile 79) ändern zu:

```typescript
export type ProjectTab = 'cockpit' | 'phasen' | 'moodboard'
```

Den Kommentar direkt darüber (aktuell Zeilen 76-78: "Moodboard/Team/Rechnungen kommen erst als Tab dazu, wenn ihre jeweilige Etappe (5/4/6) tatsaechlich gebaut wird.") anpassen -- Moodboard ist jetzt gebaut, Team ist ebenfalls schon gebaut (Etappe 4, informativ im Phasen-Tab, kein eigener Tab):

```typescript
/** Tabs im Projekt-Detail. Rechnungen kommt erst als Tab dazu, wenn
 * Etappe 6 tatsaechlich gebaut wird. */
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck 2>&1 | grep -i project`
Expected: keine neuen Fehler (der Typ ist nur um einen Wert erweitert, `ProjectDetailRoute.tsx` castet aktuell noch explizit auf `'cockpit' | 'phasen'` -- das wird in Task 15 behoben, hier noch kein Fehler, da der engere Cast weiterhin ein gültiger Teilbereich des erweiterten Union-Typs ist).

- [ ] **Step 3: Commit**

```bash
git add src/store/ui.store.ts
git commit -m "feat(ui): ProjectTab -- Moodboard-Tab ergaenzt"
```

---

### Task 13: `ProjectMoodboard` -- Canvas-Grundgerüst (Farbe/Typo/Notiz-Kacheln)

**Files:**
- Create: `src/components/projects/ProjectMoodboard.tsx`
- Test: `src/components/projects/ProjectMoodboard.test.tsx`

**Interfaces:**
- Consumes: `MoodboardItem`, `MoodboardColorItem`, `MoodboardTypeItem`, `MoodboardNoteItem` (Task 6).
- Produces: `ProjectMoodboard({ items, onChange, onUploadImage, onRemoveImage }): JSX.Element` -- diese Task implementiert das Grundgerüst (Canvas, Drag, Farbe/Typo/Notiz-Kacheln, Hinzufügen/Entfernen). Bild-Kacheln (`onUploadImage`/`onRemoveImage`-Verdrahtung, Datei-Auswahl, Bild-Anzeige) folgen in Task 14 als Erweiterung derselben Datei.

- [ ] **Step 1: Fehlschlagende Tests zuerst schreiben**

Neue Datei `src/components/projects/ProjectMoodboard.test.tsx`:

```typescript
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ProjectMoodboard } from './ProjectMoodboard'
import type { MoodboardItem } from '@/types/project.types'

afterEach(cleanup)

function renderBoard(items: MoodboardItem[] = [], overrides: Partial<Parameters<typeof ProjectMoodboard>[0]> = {}) {
  return render(
    <ProjectMoodboard
      items={items}
      onChange={vi.fn()}
      onUploadImage={vi.fn()}
      onRemoveImage={vi.fn()}
      {...overrides}
    />,
  )
}

describe('ProjectMoodboard', () => {
  it('zeigt einen leeren Hinweis, wenn keine Kacheln vorhanden sind', () => {
    renderBoard([])
    expect(screen.getByText('Noch keine Kacheln auf diesem Board.')).toBeTruthy()
  })

  it('fuegt eine Notiz-Kachel mit Default-Werten hinzu', () => {
    const onChange = vi.fn()
    renderBoard([], { onChange })
    fireEvent.click(screen.getByText('Notiz'))
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ kind: 'note', cap: 'Notiz', text: 'Neue Notiz — hier tippen.' }),
    ])
  })

  it('fuegt eine Farb-Kachel mit drei Default-Farben hinzu', () => {
    const onChange = vi.fn()
    renderBoard([], { onChange })
    fireEvent.click(screen.getByText('Farbe'))
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ kind: 'color', colors: expect.arrayContaining([expect.any(String)]) }),
    ])
  })

  it('fuegt eine Typo-Kachel hinzu', () => {
    const onChange = vi.fn()
    renderBoard([], { onChange })
    fireEvent.click(screen.getByText('Typo'))
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ kind: 'type', cap: 'Typo', sample: 'Aa' }),
    ])
  })

  it('rendert eine bestehende Notiz-Kachel mit ihrem Text', () => {
    renderBoard([{ id: 'm1', kind: 'note', x: 10, y: 10, w: 24, h: 16, cap: 'Notiz', text: 'Hallo Board' }])
    expect(screen.getByText('Hallo Board')).toBeTruthy()
  })

  it('rendert eine Farb-Kachel mit ihren Farbfeldern', () => {
    renderBoard([{ id: 'm1', kind: 'color', x: 10, y: 10, w: 24, h: 12, cap: 'Palette', colors: ['#111', '#222', '#333'] }])
    expect(screen.getAllByTitle(/#111|#222|#333/)).toHaveLength(3)
  })

  it('rendert eine Typo-Kachel mit Schriftprobe und Notiz', () => {
    renderBoard([{ id: 'm1', kind: 'type', x: 10, y: 10, w: 24, h: 22, cap: 'Typo', font: 'serif', sample: 'Aa', note: 'Schrift waehlen' }])
    expect(screen.getByText('Aa')).toBeTruthy()
    expect(screen.getByText('Schrift waehlen')).toBeTruthy()
  })

  it('entfernt eine Kachel', () => {
    const onChange = vi.fn()
    renderBoard(
      [{ id: 'm1', kind: 'note', x: 10, y: 10, w: 24, h: 16, cap: 'Notiz', text: 'Hallo' }],
      { onChange },
    )
    fireEvent.click(screen.getByLabelText('Kachel entfernen'))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('editiert den Text einer Notiz-Kachel inline', () => {
    const onChange = vi.fn()
    renderBoard(
      [{ id: 'm1', kind: 'note', x: 10, y: 10, w: 24, h: 16, cap: 'Notiz', text: 'Alt' }],
      { onChange },
    )
    fireEvent.change(screen.getByDisplayValue('Alt'), { target: { value: 'Neu' } })
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'm1', text: 'Neu' }),
    ])
  })
})
```

Run: `npx vitest run src/components/projects/ProjectMoodboard.test.tsx`
Expected: FAIL -- Modul existiert nicht.

- [ ] **Step 2: Komponente schreiben (Grundgerüst)**

Neue Datei `src/components/projects/ProjectMoodboard.tsx`:

```typescript
import { useState, useRef } from 'react'
import { X } from 'lucide-react'
import type { MoodboardItem, MoodboardColorItem, MoodboardTypeItem, MoodboardNoteItem } from '@/types/project.types'

const DEFAULT_COLORS = ['oklch(80% 0.06 60)', 'oklch(60% 0.08 250)', 'oklch(92% 0.01 90)']

function newItem(kind: MoodboardItem['kind']): MoodboardItem {
  const id = crypto.randomUUID()
  const base = { id, x: 40, y: 40, w: 24, h: 20 }
  if (kind === 'image') return { ...base, kind: 'image', w: 24, h: 26, cap: 'Neues Bild — hier ablegen', storageKey: null }
  if (kind === 'color') return { ...base, kind: 'color', h: 12, cap: 'Palette', colors: [...DEFAULT_COLORS] }
  if (kind === 'type') return { ...base, kind: 'type', h: 22, cap: 'Typo', font: 'var(--font-display)', sample: 'Aa', note: 'Schrift wählen' }
  return { ...base, kind: 'note', h: 16, cap: 'Notiz', text: 'Neue Notiz — hier tippen.' }
}

function ColorTile({ item }: { item: MoodboardColorItem }) {
  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {item.colors.map((c, i) => <i key={i} style={{ flex: 1, background: c, display: 'block' }} title={c} />)}
    </div>
  )
}

function TypeTile({ item, onEdit }: { item: MoodboardTypeItem; onEdit: (patch: Partial<MoodboardTypeItem>) => void }) {
  return (
    <div style={{ padding: 8 }}>
      <span style={{ display: 'block', fontSize: 22, fontFamily: item.font }}>{item.sample}</span>
      <input
        className="mock-input" value={item.note} onChange={e => onEdit({ note: e.target.value })}
        style={{ fontSize: 11.5, marginTop: 4, width: '100%' }}
      />
    </div>
  )
}

function NoteTile({ item, onEdit }: { item: MoodboardNoteItem; onEdit: (patch: Partial<MoodboardNoteItem>) => void }) {
  return (
    <textarea
      className="mock-input" value={item.text} onChange={e => onEdit({ text: e.target.value })}
      style={{ width: '100%', height: '100%', resize: 'none', fontSize: 12.5, border: 'none', background: 'transparent' }}
    />
  )
}

export function ProjectMoodboard({ items, onChange, onUploadImage, onRemoveImage }: {
  items: MoodboardItem[]
  onChange: (next: MoodboardItem[]) => void
  onUploadImage: (itemId: string, file: File) => void
  onRemoveImage: (itemId: string) => void
}) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: string; ox: number; oy: number; x: number; y: number; bw: number; bh: number } | null>(null)
  const [, forceRerender] = useState(0)

  const add = (kind: MoodboardItem['kind']) => onChange([...items, newItem(kind)])
  const remove = (id: string, kind: MoodboardItem['kind']) => {
    if (kind === 'image') onRemoveImage(id)
    onChange(items.filter(it => it.id !== id))
  }
  const edit = (id: string, patch: Partial<MoodboardItem>) =>
    onChange(items.map(it => it.id === id ? { ...it, ...patch } as MoodboardItem : it))

  const onGrab = (e: React.PointerEvent, it: MoodboardItem) => {
    e.preventDefault()
    const box = canvasRef.current?.getBoundingClientRect()
    if (!box) return
    drag.current = { id: it.id, ox: e.clientX, oy: e.clientY, x: it.x, y: it.y, bw: box.width, bh: box.height }
    const move = (ev: PointerEvent) => {
      const d = drag.current
      if (!d) return
      const nx = Math.max(0, Math.min(100 - it.w, d.x + (ev.clientX - d.ox) / d.bw * 100))
      const ny = Math.max(0, Math.min(100 - it.h, d.y + (ev.clientY - d.oy) / d.bh * 100))
      const idx = items.findIndex(x => x.id === it.id)
      if (idx >= 0) { items[idx] = { ...items[idx], x: nx, y: ny }; forceRerender(n => n + 1) }
    }
    const up = () => {
      drag.current = null
      onChange(items)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 20 }}>
      <div
        ref={canvasRef}
        style={{ position: 'relative', minHeight: 480, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)' }}
      >
        {items.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--fg-dim)', fontSize: 13 }}>
            Noch keine Kacheln auf diesem Board.
          </div>
        )}
        {items.map(it => (
          <div
            key={it.id}
            style={{ position: 'absolute', left: `${it.x}%`, top: `${it.y}%`, width: `${it.w}%`, height: `${it.h}%`, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)', overflow: 'hidden' }}
          >
            <div
              onPointerDown={e => onGrab(e, it)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 6px', fontSize: 10, color: 'var(--fg-dim)', cursor: 'grab', background: 'var(--surface)' }}
            >
              <span>{it.cap}</span>
              <button
                onClick={() => remove(it.id, it.kind)} aria-label="Kachel entfernen"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-dim)', display: 'flex', padding: 0 }}
              >
                <X size={11} />
              </button>
            </div>
            <div style={{ height: 'calc(100% - 22px)' }}>
              {it.kind === 'color' && <ColorTile item={it} />}
              {it.kind === 'type' && <TypeTile item={it} onEdit={patch => edit(it.id, patch)} />}
              {it.kind === 'note' && <NoteTile item={it} onEdit={patch => edit(it.id, patch)} />}
              {it.kind === 'image' && (
                <div style={{ display: 'grid', placeItems: 'center', height: '100%', fontSize: 11, color: 'var(--fg-dim)', textAlign: 'center', padding: 6 }}>
                  Bild-Anzeige folgt (Task 14)
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="pcard">
        <div className="pcard-h"><h3>Hinzufügen</h3></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button className="btn-ghost" onClick={() => add('image')}>Bild</button>
          <button className="btn-ghost" onClick={() => add('color')}>Farbe</button>
          <button className="btn-ghost" onClick={() => add('type')}>Typo</button>
          <button className="btn-ghost" onClick={() => add('note')}>Notiz</button>
        </div>
      </div>
    </div>
  )
}
```

**Wichtiger Hinweis zum Drag-Mechanismus:** Der Prototyp (`project-moodboard.jsx`) hält die Position während des Ziehens in lokalem React-State (`setItems`), nicht durch direkte Mutation der Props. Da `items` hier aber eine Prop ist (kein lokaler State -- die Quelle der Wahrheit ist der Store), mutiert `onGrab`s `move`-Handler das `items`-Array direkt und erzwingt ein Rerender über `forceRerender`, um während des Ziehens flüssig zu bleiben, OHNE bei jedem Pixel `onChange` (und damit einen Persistenz-Call) auszulösen -- erst `up()` ruft `onChange(items)` einmalig auf. Das ist ein bewusster Kompromiss (direkte Prop-Mutation ist grundsätzlich ein React-Antipattern), hier vertretbar, weil `items` zwischen `onGrab`s Start und `up()` von keiner anderen Quelle verändert wird und `forceRerender` das Re-Rendering korrekt anstößt. Falls der Implementierer beim Bauen einen saubereren Ansatz sieht (z.B. lokaler Spiegel-State, der bei Props-Änderung synchronisiert wird), der dieselben Tests besteht, ist das eine akzeptable, zu dokumentierende Abweichung -- aber nicht ohne Grund vom hier beschriebenen Verhalten (lokal ziehen, einmalig persistieren) abweichen.

- [ ] **Step 3: Test ausführen, Erfolg verifizieren**

Run: `npx vitest run src/components/projects/ProjectMoodboard.test.tsx`
Expected: PASS (9 Tests).

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck 2>&1 | grep -i project`
Expected: keine neuen Fehler (Datei wird noch nirgends importiert -- folgt in Task 15).

- [ ] **Step 5: Commit**

```bash
git add src/components/projects/ProjectMoodboard.tsx src/components/projects/ProjectMoodboard.test.tsx
git commit -m "feat(projects): ProjectMoodboard -- Canvas-Grundgeruest (Farbe/Typo/Notiz)"
```

---

### Task 14: `ProjectMoodboard` -- Bild-Kachel (Datei-Auswahl, Upload, Anzeige)

**Files:**
- Modify: `src/components/projects/ProjectMoodboard.tsx`
- Modify: `src/components/projects/ProjectMoodboard.test.tsx`

**Interfaces:**
- Consumes: `onUploadImage`/`onRemoveImage`-Props (bereits Teil der Signatur seit Task 13, bisher ungenutzt).
- Produces: funktionsfähige Bild-Kachel -- Datei-Auswahl-Button ohne Bild, echtes Bild sobald `storageKey` gesetzt ist (Byte-Fetch via eine neue `readImage`-Prop-Funktion, die die Komponente aufruft und selbst in ein `Blob`/`ObjectURL` verwandelt).

- [ ] **Step 1: Fehlschlagende Tests zuerst schreiben**

In `src/components/projects/ProjectMoodboard.test.tsx`:

**a)** `renderBoard`-Helper um eine neue Prop `readImage` ergänzen:

```typescript
function renderBoard(items: MoodboardItem[] = [], overrides: Partial<Parameters<typeof ProjectMoodboard>[0]> = {}) {
  return render(
    <ProjectMoodboard
      items={items}
      onChange={vi.fn()}
      onUploadImage={vi.fn()}
      onRemoveImage={vi.fn()}
      readImage={vi.fn().mockResolvedValue(new Blob(['x'], { type: 'image/png' }))}
      {...overrides}
    />,
  )
}
```

**b)** Am Ende der Datei, vor der schließenden `})` des `describe`-Blocks ergänzen:

```typescript
  it('zeigt einen Auswahl-Button bei einer Bild-Kachel ohne storageKey', () => {
    renderBoard([{ id: 'm1', kind: 'image', x: 10, y: 10, w: 24, h: 26, cap: 'Neues Bild', storageKey: null }])
    expect(screen.getByText('Bild auswählen')).toBeTruthy()
  })

  it('ruft onUploadImage mit der ausgewaehlten Datei auf', () => {
    const onUploadImage = vi.fn()
    renderBoard(
      [{ id: 'm1', kind: 'image', x: 10, y: 10, w: 24, h: 26, cap: 'Neues Bild', storageKey: null }],
      { onUploadImage },
    )
    const file = new File(['x'], 'bild.png', { type: 'image/png' })
    const input = screen.getByLabelText('Bild auswählen') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })
    expect(onUploadImage).toHaveBeenCalledWith('m1', file)
  })

  it('ruft readImage auf und zeigt das Bild bei gesetztem storageKey', async () => {
    const readImage = vi.fn().mockResolvedValue(new Blob(['x'], { type: 'image/png' }))
    renderBoard(
      [{ id: 'm1', kind: 'image', x: 10, y: 10, w: 24, h: 26, cap: 'Bild', storageKey: 'key-1' }],
      { readImage },
    )
    await vi.waitFor(() => expect(readImage).toHaveBeenCalledWith('m1', 'key-1'))
    await vi.waitFor(() => expect(screen.getByRole('img')).toBeTruthy())
  })
```

Run: `npx vitest run src/components/projects/ProjectMoodboard.test.tsx`
Expected: FAIL -- `readImage`-Prop fehlt in der Signatur, Bild-Kachel zeigt noch den Platzhaltertext aus Task 13.

- [ ] **Step 2: Komponente erweitern**

`ProjectMoodboard`s Props-Typ um eine neue Funktion `readImage: (itemId: string, storageKey: string) => Promise<Blob>` ergänzen (Signatur-Zeile, aktuell aus Task 13):

```typescript
export function ProjectMoodboard({ items, onChange, onUploadImage, onRemoveImage, readImage }: {
  items: MoodboardItem[]
  onChange: (next: MoodboardItem[]) => void
  onUploadImage: (itemId: string, file: File) => void
  onRemoveImage: (itemId: string) => void
  readImage: (itemId: string, storageKey: string) => Promise<Blob>
}) {
```

Neue Sub-Komponente `ImageTile` hinzufügen (nach `NoteTile`, vor `ProjectMoodboard`):

```typescript
function ImageTile({ item, onUpload, readImage }: {
  item: MoodboardImageItem
  onUpload: (file: File) => void
  readImage: (storageKey: string) => Promise<Blob>
}) {
  const [url, setUrl] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!item.storageKey) { setUrl(null); return }
    let cancelled = false
    let objectUrl: string | null = null
    readImage(item.storageKey).then(blob => {
      if (cancelled) return
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [item.storageKey, readImage])

  if (!item.storageKey) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
        <label style={{ fontSize: 11.5, cursor: 'pointer', color: 'var(--accent)' }}>
          Bild auswählen
          <input
            ref={inputRef} type="file" accept="image/*" aria-label="Bild auswählen"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f) }}
          />
        </label>
      </div>
    )
  }

  return url ? (
    <img src={url} alt={item.cap} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
  ) : (
    <div style={{ display: 'grid', placeItems: 'center', height: '100%', fontSize: 11, color: 'var(--fg-dim)' }}>Lädt…</div>
  )
}
```

Import-Zeile um `useEffect` ergänzen: `import { useState, useRef, useEffect } from 'react'` und den Typ-Import um `MoodboardImageItem` ergänzen.

Im Render-Bereich von `ProjectMoodboard`, den Platzhalter-Block für `it.kind === 'image'` (aktuell aus Task 13: `<div>Bild-Anzeige folgt (Task 14)</div>`) ersetzen durch:

```typescript
              {it.kind === 'image' && (
                <ImageTile item={it} onUpload={file => onUploadImage(it.id, file)} readImage={key => readImage(it.id, key)} />
              )}
```

- [ ] **Step 3: Test ausführen, Erfolg verifizieren**

Run: `npx vitest run src/components/projects/ProjectMoodboard.test.tsx`
Expected: PASS (bestehende 9 Tests + 3 neue = 12).

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck 2>&1 | grep -i project`
Expected: keine neuen Fehler.

- [ ] **Step 5: Commit**

```bash
git add src/components/projects/ProjectMoodboard.tsx src/components/projects/ProjectMoodboard.test.tsx
git commit -m "feat(projects): ProjectMoodboard -- Bild-Kachel (Auswahl, Upload, Anzeige)"
```

---

### Task 15: `ProjectDetailRoute.tsx` -- Moodboard-Tab verdrahten

**Files:**
- Modify: `src/routes/ProjectDetailRoute.tsx`

**Interfaces:**
- Consumes: `ProjectMoodboard` (Task 13/14); `useProjectsStore().updateMoodboardItems/uploadMoodboardImage` (Task 11); `ProjectsGateway.readMoodboardImage/deleteMoodboardImage` (Task 9, direkt genutzt für den Bild-Lese-/Lösch-Pfad, da diese beiden reine Byte-Operationen ohne Store-State sind).
- Produces: kompletter, funktionsfähiger Moodboard-Tab.

- [ ] **Step 1: Imports ergänzen**

Nach `import { ProjectPhasesList } from '@/components/projects/ProjectPhasesList'` (aktuell Zeile 25) einfügen:

```typescript
import { ProjectMoodboard } from '@/components/projects/ProjectMoodboard'
import { ProjectsGateway } from '@/data/projects.gateway'
import { Image as ImageIcon } from 'lucide-react'
```

`Target, Milestone` (aktuell Zeile 21) um `ImageIcon` erweitern -- ACHTUNG: `Image` kollidiert im Namespace nicht mit dem globalen DOM-`Image`-Konstruktor NUR wenn es umbenannt importiert wird (`Image as ImageIcon`, wie oben), da `lucide-react`'s `Image`-Export sonst den globalen `Image`-Namen im Modul-Scope verdeckt.

- [ ] **Step 2: Neue Store-Actions selektieren**

Nach `const updateAssignees = useProjectsStore(s => s.updateAssignees)` (aktuell Zeile 206) einfügen:

```typescript
  const updateMoodboardItems = useProjectsStore(s => s.updateMoodboardItems)
  const uploadMoodboardImage = useProjectsStore(s => s.uploadMoodboardImage)
```

- [ ] **Step 3: Tabs-Array erweitern**

`const tabs = [...]` (aktuell Zeilen 299-302) erweitern:

```typescript
  const tabs = [
    { id: 'cockpit', label: 'Cockpit', icon: Target },
    { id: 'phasen', label: 'Phasen', icon: Milestone, count: pendingGateCount > 0 ? pendingGateCount : undefined },
    { id: 'moodboard', label: 'Moodboard', icon: ImageIcon },
  ]
```

Die `onChange`-Signatur der `<TabBar>` (aktuell Zeile 342) um den neuen Wert erweitern:

```typescript
      <TabBar tabs={tabs} activeId={activeTab} onChange={id => setActiveTab(id as 'cockpit' | 'phasen' | 'moodboard')} />
```

- [ ] **Step 4: Render-Block hinzufügen**

Nach dem `{activeTab === 'phasen' && (...)}`-Block (endet dort, wo Etappe 3/4 ihn zuletzt erweitert haben -- suche das schließende `)}` dieses Blocks), vor dem schließenden `</div>` des äußeren `paddingTop: 24`-Wrappers einfügen:

```typescript
        {activeTab === 'moodboard' && (
          <ProjectMoodboard
            items={project.moodboardItems}
            onChange={items => updateMoodboardItems(project.id, items)}
            onUploadImage={(itemId, file) => uploadMoodboardImage(workspaceId, project.id, itemId, file)}
            onRemoveImage={itemId => {
              const item = project.moodboardItems.find(i => i.id === itemId)
              if (item?.kind === 'image' && item.storageKey) {
                void ProjectsGateway.deleteMoodboardImage(workspaceId, item.storageKey)
              }
            }}
            readImage={(_itemId, storageKey) => ProjectsGateway.readMoodboardImage(workspaceId, storageKey)}
          />
        )}
```

`workspaceId` ist in dieser Datei bereits als `const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''` selektiert (Zeile 216) -- keine neue Selektion nötig.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck 2>&1 | grep -i project`
Expected: keine Fehler.

- [ ] **Step 6: Volle Test-Suite**

Run: `cd src-tauri && cargo test 2>&1 | tail -10`
Expected: Baseline 305 + 1 (Migration Task 1) + 3 (Task 4) = 309 bestanden, 0 fehlgeschlagen.

Run: `npx vitest run 2>&1 | tail -15`
Expected: Baseline 976 + 3 (Mapper) + 3 (Store) + 9 (Moodboard-Grundgerüst) + 3 (Bild-Kachel) = 994 bestanden, 0 fehlgeschlagen -- exakte Zahl im Report festhalten.

- [ ] **Step 7: Manuell im Dev-Build prüfen**

Im laufenden `npm run tauri dev`: ein Projekt öffnen, Moodboard-Tab. Prüfen:
- Leeres Board zeigt Hinweistext, "Hinzufügen"-Leiste mit vier Buttons sichtbar.
- Farbe/Typo/Notiz hinzufügen, jede Kachel per Griff verschiebbar, Position bleibt nach Loslassen erhalten (Reload testen).
- Notiz-/Typo-Text inline editierbar.
- Bild hinzufügen → "Bild auswählen" → echte Datei wählen → Bild erscheint auf der Kachel, bleibt nach Reload erhalten.
- Kachel entfernen funktioniert für alle vier Typen.
- Falls ein geteilter Workspace zur Verfügung steht: Bild-Upload dort prüfen (landet im Supabase-Storage-Bucket, sichtbar nach Neuladen -- setzt voraus, dass Migration 0031 bereits manuell eingespielt wurde).

- [ ] **Step 8: Commit**

```bash
git add src/routes/ProjectDetailRoute.tsx
git commit -m "feat(projects): ProjectDetailRoute -- Moodboard-Tab verdrahtet"
```

---

## Self-Review

**Spec-Abdeckung** (gegen `docs/superpowers/specs/2026-07-27-projekt-moodboard-design.md` geprüft):
- `moodboard_items` als JSON-Spalte, Rust reicht roh durch → Task 1, 2, 4. ✓
- Vier Kachel-Typen (image/color/type/note), kein `link` → Task 6, 13, 14. ✓
- Nur Drag-Verschieben, keine Rotation/Resize → Task 13 (fester `w`/`h` pro Typ, kein Resize-Handle). ✓
- Komplettes Ersetzen der Liste → Task 4/8/11 (`update_moodboard_items`/`updateMoodboardItems` nehmen immer die volle Liste). ✓
- Bild-Bytes ausserhalb der JSON-Spalte, nur `storageKey` → Task 6 (`MoodboardImageItem.storageKey`), Task 9 (Speicherung). ✓
- Lokal via bestehendem `workspace_ablage` → Task 9/10 (Wiederverwendung von `cmd_import_ws_file`/`cmd_read_ws_file`/`cmd_delete_ws_file`, keine neuen Rust-Commands). ✓
- Cloud via neuem Supabase-Storage-Bucket + RLS → Task 3 (Bucket + Policies), Task 9 (Gateway-Cloud-Zweig). ✓
- Echter, funktionierender Bild-Upload (kein Platzhalter) → Task 14 (Datei-Auswahl-Button ruft echten Upload-Flow auf). ✓
- Kein Kunden-Feedback/Reaktionen/Freigabe-Link/KORA-Zusammenfassung/Snip-to-Board → in keinem Task enthalten. ✓
- Testing-Abschnitt der Spec (Rust-Unit-Tests, Mapper-Tests, Store-Tests, Komponenten-Tests) → Task 1, 4, 7, 11, 13, 14. ✓

**Platzhalter-Scan:** keine TBD/TODO, keine "Fehlerbehandlung hinzufügen"-Anweisungen ohne Code gefunden.

**Typ-Konsistenz geprüft:**
- `MoodboardItem`-Union (Task 6) ↔ `parseMoodboardItems`-Rückgabetyp (Task 7) ↔ `ProjectMoodboard`s Item-Rendering (Task 13/14) -- alle vier Kinds konsistent abgedeckt.
- `updateMoodboardItems(id, moodboardItems)`-Signatur identisch in Rust-Command (Task 5, als `moodboard_items_json: String`), Service (Task 10), Gateway (Task 8), Store (Task 11), Aufrufer in `ProjectDetailRoute.tsx` (Task 15).
- `storageKey`-Asymmetrie (lokal = `workspace_files.id`, cloud = Pfad-String) ist in Task 9 explizit dokumentiert und wird konsistent als opaker `string`-Typ durch Store/Komponente gereicht, ohne dass eine der beiden Seiten die Bedeutung des anderen Zweigs kennen muss.
- `ProjectTab`-Erweiterung (Task 12) ↔ `tabs`-Array + `onChange`-Cast (Task 15) -- konsistent um `'moodboard'` erweitert.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-27-projekt-moodboard.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
