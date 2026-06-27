# ① Fundament — Teil A: Workspace-Modell, Identität & Import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den Workspace-Modus **strukturell** machen (lokal vs. Cloud statt aus Mitgliederzahl), einen echten **lokalen Workspace** mit Login-Pflicht einführen, die vorhandenen `'dev'`-Daten **adoptieren**, und den **Backup-Import** auf den aktiven Workspace re-scopen — ohne die große „Teilen"-Migration (die ist Teil B).

**Architecture:** Reine Modell-/Identitäts-Schicht. `workspace.store` führt ein lokales Register (`localWorkspaces`) und merged es mit den Supabase-Workspaces; Cloud-Workspaces sind per Definition `isShared:true`, lokale `false`. Zwei neue Rust-Commands re-scopen lokale SQLite-Daten in-place (Adoption + Vorbereitung). Der Backup-Import bekommt die aktive Workspace-/User-ID und schreibt sie auf alle Tabellen mit `workspace_id`-Spalte um.

**Tech Stack:** TypeScript (strict), React, Zustand (+ `persist`), Vitest; Rust (rusqlite) für die lokalen DB-Commands; Supabase nur lesend (`loadWorkspaces`). Tests kolokiert; TS-Lauf `npx vitest run`, Typecheck `npx tsc --noEmit -p tsconfig.json`, Rust `cargo test` in `src-tauri/`.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-06-27-local-default-workspace-cloud-sharing-design.md` (Teilprojekt ①, §1/§2/§4/§5/§6). Diese Constraints sind verbindlich.
- **Modus strukturell:** `isActiveWorkspaceShared()` = „aktiver Workspace ist ein Cloud-Workspace". `deriveShared` (Mitgliederzählung) **wird gelöscht**; Cloud-Workspaces aus Supabase bekommen `isShared:true` fix, lokale `isShared:false`.
- **Lokale Workspace-Objekte** bekommen Default-Felder, damit Cloud-Consumer nicht crashen: `role:'owner'`, `capabilities:[]`, `join_code:null`, `isShared:false`.
- **Persistenz:** `localWorkspaces` in `partialize`; persist-key `'focus-workspace-v1'` → `'focus-workspace-v2'` mit `migrate`-Funktion.
- **Login Pflicht:** „Überspringen"/`DEV_BYPASS` vollständig entfernen.
- **Adoption ist in-place SQLite** (kein Backup-Import-Pfad). Re-scope-Commands sind schema-introspektiv + `defer_foreign_keys` (wie `reset_workspace_local`).
- **Backup-Import re-scope:** nur Tabellen **mit** `workspace_id`-Spalte (via `PRAGMA table_info`); andere unverändert.
- **`tsc` sauber + bestehende Tests grün.** UI-Texte deutsch. **Supabase-Client:** `import { supabase } from '@/lib/supabase'`. **Auth-uid:** `useAuthStore.getState().user?.id`.
- **NICHT in A (kommt in B):** der „Teilen"-Flow, der Migrations-Runner, das Entfernen der lazy-Migrationen, `createCloudWorkspaceRecord`. Hier wird **nichts** nach Supabase geschrieben außer Workspace-Beitritt/Lesen (Bestand).

## File Structure

- `src/store/workspace.store.ts` — lokales Register, merge, strukturelles `isShared`, persist-bump, `createLocalWorkspace`, Adoptions-Aufruf. (Modify)
- `src/store/workspace.store.test.ts` — `deriveShared`-Tests raus, neue Tests für Register/merge/createLocalWorkspace. (Modify)
- `src/data/workspace-local.ts` — kleine Helfer für die Adoption (Tauri-Calls + Default-Workspace-Objekt). (Create)
- `src-tauri/src/commands/export.rs` — `cmd_has_local_orphan_data`, `cmd_rescope_workspace`, Import-Re-scope. (Modify)
- `src-tauri/src/commands/mod.rs` + `src-tauri/src/main.rs` — neue Commands registrieren. (Modify)
- `src/core/auth/LoginScreen.tsx` — `handleDevSkip` + Skip-UI raus. (Modify)
- `src/App.tsx` — `DEV_BYPASS` (Konstante, Effekt, Guards) raus. (Modify)
- `src/core/workspace/WorkspacePicker.tsx` — `createLocalWorkspace`, Badge lokal/Cloud. (Modify)
- `src/components/settings/GefahrenzoneSettings.tsx` — Import-Caller übergibt workspaceId+userId. (Modify)
- `src/routes/TeamChatRoute.tsx`, `src/components/team/ChatDrawer.tsx` — Leerzustand-CTA für lokale Workspaces. (Modify)

---

## Task 1: Rust — `cmd_rescope_workspace` (+ Test)

**Files:**
- Modify: `src-tauri/src/commands/export.rs`
- Modify: `src-tauri/src/commands/mod.rs`, `src-tauri/src/main.rs` (Command registrieren)

**Interfaces:**
- Consumes: `DbPool`, vorhandene Pattern aus `reset_workspace_local`.
- Produces: `pub fn rescope_workspace(conn, from, to, user_id) -> Result<u64,String>` + `#[tauri::command] cmd_rescope_workspace`.

- [ ] **Step 1: Failing test** — ans `mod tests` in `export.rs` anhängen:
```rust
    #[test]
    fn rescope_rewrites_workspace_id_and_created_by() {
        let mut conn = sample_conn();
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, created_at, updated_at) \
             VALUES ('a1','dev','old','Muster GmbH','2026-01-01','2026-01-01')", []).unwrap();
        conn.execute(
            "INSERT INTO invoices (id, workspace_id, created_by, account_id, date, due_date, total, created_at, updated_at) \
             VALUES ('i1','dev','old','a1','2026-01-01','2026-01-15',119.0,'2026-01-01','2026-01-01')", []).unwrap();
        conn.execute(
            "INSERT INTO invoice_items (id, invoice_id, title, quantity, unit_price, tax_rate, total, sort_order) \
             VALUES ('it1','i1','Pos',1,100.0,19,119.0,0)", []).unwrap();

        let n = rescope_workspace(&mut conn, "dev", "ws-new", "me").unwrap();
        assert!(n >= 2, "accounts + invoices umgeschrieben");

        let (ws, by): (String, String) = conn
            .query_row("SELECT workspace_id, created_by FROM accounts WHERE id='a1'", [], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
        assert_eq!(ws, "ws-new");
        assert_eq!(by, "me");
        // Tabelle ohne workspace_id-Spalte bleibt unangetastet, kein Fehler:
        let inv_items: i64 = conn.query_row("SELECT count(*) FROM invoice_items WHERE id='it1'", [], |r| r.get(0)).unwrap();
        assert_eq!(inv_items, 1);
    }
```

- [ ] **Step 2: Run → FAIL** — `cd src-tauri && cargo test rescope_rewrites` → „cannot find function `rescope_workspace`".

- [ ] **Step 3: Implementierung** — in `export.rs` (neben `reset_workspace_local`) einfügen:
```rust
/// Schreibt workspace_id (und created_by, falls Spalte existiert) aller
/// workspace-scoped Tabellen von `from` auf `to`/`user_id` um. Schema-introspektiv,
/// FK-deferred. Gibt die Zahl der geänderten Zeilen zurück.
pub fn rescope_workspace(conn: &mut rusqlite::Connection, from: &str, to: &str, user_id: &str) -> Result<u64, String> {
    let tables: Vec<String> = {
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' \
                      AND name NOT LIKE 'sqlite_%' AND name != 'sync_queue' ORDER BY name")
            .map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?;
        rows.filter_map(Result::ok).collect()
    };
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute_batch("PRAGMA defer_foreign_keys=ON;").map_err(|e| e.to_string())?;
    let mut total: u64 = 0;
    for t in &tables {
        let cols: std::collections::HashSet<String> = {
            let mut stmt = match tx.prepare(&format!("PRAGMA table_info(\"{t}\")")) {
                Ok(s) => s, Err(_) => continue,
            };
            let c = stmt.query_map([], |r| r.get::<_, String>(1)).map_err(|e| e.to_string())?;
            c.filter_map(Result::ok).collect()
        };
        if !cols.contains("workspace_id") { continue; }
        let has_created_by = cols.contains("created_by");
        let sql = if has_created_by {
            format!("UPDATE \"{t}\" SET workspace_id=?1, created_by=?2 WHERE workspace_id=?3")
        } else {
            format!("UPDATE \"{t}\" SET workspace_id=?1 WHERE workspace_id=?3")
        };
        let changed = if has_created_by {
            tx.execute(&sql, rusqlite::params![to, user_id, from]).map_err(|e| format!("{t}: {e}"))?
        } else {
            tx.execute(&sql, rusqlite::params![to, from]).map_err(|e| format!("{t}: {e}"))?
        };
        total += changed as u64;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(total)
}

#[tauri::command]
pub fn cmd_rescope_workspace(db: State<'_, DbPool>, from: String, to: String, user_id: String) -> Result<u64, String> {
    let mut conn = db.conn();
    rescope_workspace(&mut conn, &from, &to, &user_id)
}
```
(Hinweis: das `UPDATE … SET created_by=?2 … WHERE workspace_id=?3` nutzt benannte Positions-Params; `?1=to, ?2=user_id, ?3=from`.)

- [ ] **Step 4: Run → PASS** — `cargo test rescope_rewrites`.

- [ ] **Step 5: Command registrieren** — in `src-tauri/src/commands/mod.rs` den Re-Export ergänzen (neben den anderen `export`-Commands), und in `src-tauri/src/main.rs` in der `tauri::generate_handler![…]`-Liste `commands::cmd_rescope_workspace` hinzufügen. (Folge dem vorhandenen Muster von `cmd_reset_workspace`.)

- [ ] **Step 6: Commit**
```bash
git add src-tauri/src/commands/export.rs src-tauri/src/commands/mod.rs src-tauri/src/main.rs
git commit -m "feat(workspace): cmd_rescope_workspace (in-place SQLite re-scope) + test"
```

---

## Task 2: Rust — `cmd_has_local_orphan_data` (+ Test)

**Files:**
- Modify: `src-tauri/src/commands/export.rs`, `mod.rs`, `main.rs`

**Interfaces:**
- Produces: `pub fn has_workspace_data(conn, ws_id) -> Result<bool,String>` + `#[tauri::command] cmd_has_local_orphan_data`.

- [ ] **Step 1: Failing test** — anhängen:
```rust
    #[test]
    fn has_workspace_data_detects_rows() {
        let conn = sample_conn();
        assert_eq!(has_workspace_data(&conn, "dev").unwrap(), false);
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, created_at, updated_at) \
             VALUES ('a1','dev','u','X','2026-01-01','2026-01-01')", []).unwrap();
        assert_eq!(has_workspace_data(&conn, "dev").unwrap(), true);
        assert_eq!(has_workspace_data(&conn, "other").unwrap(), false);
    }
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implementierung**:
```rust
/// True, wenn irgendeine workspace-scoped Tabelle Zeilen mit dieser workspace_id hat.
pub fn has_workspace_data(conn: &rusqlite::Connection, ws_id: &str) -> Result<bool, String> {
    let tables: Vec<String> = {
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' \
                      AND name NOT LIKE 'sqlite_%' AND name != 'sync_queue' ORDER BY name")
            .map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?;
        rows.filter_map(Result::ok).collect()
    };
    for t in &tables {
        let has_ws = {
            let mut stmt = match conn.prepare(&format!("PRAGMA table_info(\"{t}\")")) {
                Ok(s) => s, Err(_) => continue,
            };
            let c = stmt.query_map([], |r| r.get::<_, String>(1)).map_err(|e| e.to_string())?;
            c.filter_map(Result::ok).any(|name| name == "workspace_id")
        };
        if !has_ws { continue; }
        let n: i64 = conn
            .query_row(&format!("SELECT count(*) FROM \"{t}\" WHERE workspace_id=?1"), [ws_id], |r| r.get(0))
            .map_err(|e| format!("{t}: {e}"))?;
        if n > 0 { return Ok(true); }
    }
    Ok(false)
}

#[tauri::command]
pub fn cmd_has_local_orphan_data(db: State<'_, DbPool>) -> Result<bool, String> {
    let conn = db.conn();
    has_workspace_data(&conn, "dev")
}
```

- [ ] **Step 4: Run → PASS** (`cargo test has_workspace_data`).

- [ ] **Step 5: Registrieren** (`mod.rs` + `main.rs`, wie Task 1 Step 5: `commands::cmd_has_local_orphan_data`).

- [ ] **Step 6: Commit**
```bash
git add src-tauri/src/commands/export.rs src-tauri/src/commands/mod.rs src-tauri/src/main.rs
git commit -m "feat(workspace): cmd_has_local_orphan_data + test"
```

---

## Task 3: Rust — Backup-Import re-scopen (+ Test)

**Files:**
- Modify: `src-tauri/src/commands/export.rs`

**Interfaces:**
- Consumes: vorhandenes `import_into`.
- Produces: `import_into(conn, json, active_ws: Option<&str>, user_id: Option<&str>)` (Signatur erweitert) + angepasstes `#[tauri::command] cmd_import_backup`.

- [ ] **Step 1: Failing test** — anhängen:
```rust
    #[test]
    fn import_rescopes_workspace_id_to_active() {
        let conn = sample_conn();
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, created_at, updated_at) \
             VALUES ('a1','OLD-WS','old-user','Muster GmbH','2026-01-01','2026-01-01')", []).unwrap();
        let json = String::from_utf8(build_backup_json(&conn).unwrap()).unwrap();

        let mut conn2 = sample_conn();
        import_into(&mut conn2, &json, Some("ACTIVE-WS"), Some("me")).unwrap();

        let (ws, by): (String, String) = conn2
            .query_row("SELECT workspace_id, created_by FROM accounts WHERE id='a1'", [], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
        assert_eq!(ws, "ACTIVE-WS");
        assert_eq!(by, "me");
    }
```

- [ ] **Step 2: Run → FAIL** (Signatur passt nicht / Argumentanzahl).

- [ ] **Step 3: `import_into` anpassen** — Signatur + Re-scope-Logik. In `import_into` die Signatur ändern zu:
```rust
pub fn import_into(conn: &mut rusqlite::Connection, json: &str, active_ws: Option<&str>, user_id: Option<&str>) -> Result<ImportSummary, String> {
```
und **innerhalb der Spalten-Schleife**, dort wo aktuell `cols.push`/`vals.push(json_to_sql(v))` passiert, die Werte für `workspace_id`/`created_by` überschreiben, **wenn** ein Re-scope-Ziel übergeben wurde und die Tabelle die Spalte hat. Konkret den `for (k, v) in obj`-Block ersetzen durch:
```rust
            for (k, v) in obj {
                if !existing.contains(k) { summary.skipped_unknown_columns += 1; continue; }
                cols.push(format!("\"{k}\""));
                if k == "workspace_id" { if let Some(ws) = active_ws { vals.push(rusqlite::types::Value::Text(ws.to_string())); continue; } }
                if k == "created_by"   { if let Some(u)  = user_id   { vals.push(rusqlite::types::Value::Text(u.to_string()));  continue; } }
                vals.push(json_to_sql(v));
            }
```
(Tabellen ohne `workspace_id`-Spalte enthalten den Schlüssel nicht in `existing` bzw. `obj` → werden unverändert importiert. `active_ws=None` ⇒ Alt-Verhalten.)

- [ ] **Step 4: `cmd_import_backup` anpassen**:
```rust
#[tauri::command]
pub fn cmd_import_backup(db: State<'_, DbPool>, json: String, active_workspace_id: Option<String>, user_id: Option<String>) -> Result<ImportSummary, String> {
    let mut conn = db.conn();
    import_into(&mut conn, &json, active_workspace_id.as_deref(), user_id.as_deref())
}
```
Den **bestehenden** Test `export_import_roundtrip_restores_all_rows` + `import_is_idempotent_on_replace` auf die neue Signatur anpassen: `import_into(&mut conn2, &json_str, None, None)`.

- [ ] **Step 5: Run → PASS** — `cargo test export::tests` (alle, inkl. der angepassten Bestandstests).

- [ ] **Step 6: Commit**
```bash
git add src-tauri/src/commands/export.rs
git commit -m "feat(backup): re-scope imported rows to active workspace + user"
```

---

## Task 4: `workspace-local.ts` — Tauri-Helfer + Default-Workspace (+ Test)

**Files:**
- Create: `src/data/workspace-local.ts`
- Test: `src/data/workspace-local.test.ts`

**Interfaces:**
- Consumes: `@tauri-apps/api/core` `invoke`, `Workspace` (aus `workspace.store`).
- Produces:
  - `hasLocalOrphanData(): Promise<boolean>` — `invoke('cmd_has_local_orphan_data')`
  - `rescopeWorkspace(from, to, userId): Promise<number>` — `invoke('cmd_rescope_workspace', { from, to, userId })`
  - `makeLocalWorkspace(id, name): Workspace` — Default-Objekt (`role:'owner', capabilities:[], join_code:null, isShared:false, logo_url:null`).

- [ ] **Step 1: Failing test `src/data/workspace-local.test.ts`**
```ts
import { describe, it, expect } from 'vitest'
import { makeLocalWorkspace } from './workspace-local'

describe('makeLocalWorkspace', () => {
  it('builds a local workspace with safe defaults', () => {
    const ws = makeLocalWorkspace('l1', 'Mein Workspace')
    expect(ws).toMatchObject({
      id: 'l1', name: 'Mein Workspace', role: 'owner',
      capabilities: [], join_code: null, isShared: false, logo_url: null,
    })
  })
})
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run src/data/workspace-local.test.ts`).

- [ ] **Step 3: `src/data/workspace-local.ts`**
```ts
import { invoke } from '@tauri-apps/api/core'
import type { Workspace } from '@/store/workspace.store'

/** Lokaler Workspace mit Cloud-kompatiblen Default-Feldern (verhindert Crashes in Consumern). */
export function makeLocalWorkspace(id: string, name: string): Workspace {
  return { id, name, logo_url: null, role: 'owner', capabilities: [], isShared: false, join_code: null }
}

export async function hasLocalOrphanData(): Promise<boolean> {
  try { return await invoke<boolean>('cmd_has_local_orphan_data') } catch { return false }
}

export async function rescopeWorkspace(from: string, to: string, userId: string): Promise<number> {
  return invoke<number>('cmd_rescope_workspace', { from, to, userId })
}
```

- [ ] **Step 4: Run → PASS. Step 5: tsc sauber.**

- [ ] **Step 6: Commit**
```bash
git add src/data/workspace-local.ts src/data/workspace-local.test.ts
git commit -m "feat(workspace): local-workspace helpers (defaults + rescope/has-data invokes)"
```

---

## Task 5: `workspace.store` — lokales Register, strukturelles `isShared`, persist-bump, `createLocalWorkspace`

**Files:**
- Modify: `src/store/workspace.store.ts`
- Modify: `src/store/workspace.store.test.ts`

**Interfaces:**
- Consumes: `makeLocalWorkspace` (Task 4).
- Produces: State `localWorkspaces: Workspace[]`; Aktion `createLocalWorkspace(name): string` (gibt neue ID zurück, setzt aktiv); geänderte `loadWorkspaces` (merge + `isShared:true` für Cloud, kein `deriveShared`); `deriveShared` **entfernt**.

- [ ] **Step 1: Tests anpassen** — in `src/store/workspace.store.test.ts` den kompletten `describe('deriveShared', …)`-Block **löschen** (Funktion existiert nicht mehr) und folgenden Test ergänzen:
```ts
import { makeLocalWorkspace } from '@/data/workspace-local'

describe('local workspaces', () => {
  it('createLocalWorkspace adds a local ws and sets it active', () => {
    useWorkspaceStore.setState({ workspaces: [], localWorkspaces: [], activeWorkspaceId: null })
    const id = useWorkspaceStore.getState().createLocalWorkspace('Mein Workspace')
    const s = useWorkspaceStore.getState()
    expect(s.localWorkspaces.map(w => w.name)).toContain('Mein Workspace')
    expect(s.activeWorkspaceId).toBe(id)
    expect(s.localWorkspaces.find(w => w.id === id)?.isShared).toBe(false)
  })

  it('isActiveWorkspaceShared is false for a local ws, true for a cloud ws', () => {
    useWorkspaceStore.setState({
      workspaces: [{ ...makeLocalWorkspace('c1', 'Cloud'), isShared: true }],
      localWorkspaces: [makeLocalWorkspace('l1', 'Lokal')],
      activeWorkspaceId: 'l1',
    })
    expect(useWorkspaceStore.getState().isActiveWorkspaceShared()).toBe(false)
    useWorkspaceStore.setState({ activeWorkspaceId: 'c1' })
    expect(useWorkspaceStore.getState().isActiveWorkspaceShared()).toBe(true)
  })
})
```
Außerdem in bestehenden Tests, die `isShared` auf Supabase-Workspaces mocken, sicherstellen, dass `localWorkspaces` im `setState` mitgesetzt wird (sonst `undefined`). Wo Tests `deriveShared` importierten: Import entfernen.

- [ ] **Step 2: Run → FAIL** (`npx vitest run src/store/workspace.store.test.ts`) — `createLocalWorkspace`/`localWorkspaces` fehlen.

- [ ] **Step 3: Store anpassen** — in `src/store/workspace.store.ts`:

(a) `deriveShared`-Funktion (oben im File) **löschen**.

(b) Import ergänzen:
```ts
import { makeLocalWorkspace, hasLocalOrphanData, rescopeWorkspace } from '@/data/workspace-local'
```

(c) `WorkspaceState`-Interface ergänzen:
```ts
  localWorkspaces: Workspace[]
  createLocalWorkspace: (name: string) => string
```

(d) Initialwerte: `localWorkspaces: []` neben `workspaces: []`.

(e) `loadWorkspaces` umbauen — die `deriveShared`/Member-Count-Query entfernen; Cloud-Workspaces fix `isShared:true`; lokale dazumergen; `validActive` gegen beide prüfen; **Adoption** anstoßen. Den Body ab `const base = …` ersetzen durch:
```ts
        const cloud: Workspace[] = (data ?? []).map((m: any) => ({
          id: m.workspaces.id,
          name: m.workspaces.name,
          logo_url: m.workspaces.logo_url,
          role: (m.role ?? 'member') as Role,
          capabilities: (m.capabilities ?? []) as Capability[],
          join_code: m.workspaces.join_code ?? null,
          isShared: true,
        }))

        // Adoption: vorhandene 'dev'-Daten als lokalen Workspace übernehmen (einmalig).
        let local = get().localWorkspaces
        if (local.length === 0 && await hasLocalOrphanData()) {
          const id = crypto.randomUUID()
          await rescopeWorkspace('dev', id, uid)
          local = [makeLocalWorkspace(id, 'Mein Workspace')]
          set({ localWorkspaces: local, activeWorkspaceId: id })
        }

        set({ workspaces: cloud })

        const all = [...cloud, ...local]
        const { activeWorkspaceId } = get()
        const validActive = all.some((w) => w.id === activeWorkspaceId)
        if (!validActive) {
          set({ activeWorkspaceId: all.length === 1 ? all[0].id : null })
        }
```
(Die frühere `const { data: members } …`/`deriveShared`-Passage entfällt komplett. `uid` ist die schon oben in `loadWorkspaces` ermittelte User-ID.)

(f) `createLocalWorkspace` implementieren (bei den Aktionen):
```ts
      createLocalWorkspace: (name) => {
        const id = crypto.randomUUID()
        set((s) => ({ localWorkspaces: [...s.localWorkspaces, makeLocalWorkspace(id, name)], activeWorkspaceId: id }))
        return id
      },
```

(g) `isActiveWorkspaceShared` auf beide Listen beziehen:
```ts
      isActiveWorkspaceShared: () => {
        const { workspaces, localWorkspaces, activeWorkspaceId } = get()
        return [...workspaces, ...localWorkspaces].find((w) => w.id === activeWorkspaceId)?.isShared ?? false
      },
```

(h) Persist: key bumpen + `partialize` + `migrate`:
```ts
    {
      name: 'focus-workspace-v2',
      migrate: (persisted) => {
        const s = (persisted ?? {}) as Record<string, unknown>
        if (!Array.isArray(s.localWorkspaces)) s.localWorkspaces = []
        return s as unknown as WorkspaceState
      },
      partialize: (s) => ({ activeWorkspaceId: s.activeWorkspaceId, localWorkspaces: s.localWorkspaces }),
    }
```

- [ ] **Step 4: Run → PASS** (`npx vitest run src/store/workspace.store.test.ts`).

- [ ] **Step 5: tsc sauber + volle Suite grün** (`npx tsc --noEmit -p tsconfig.json` && `npx vitest run`). Falls andere Tests `deriveShared` importierten → dort Import entfernen.

- [ ] **Step 6: Commit**
```bash
git add src/store/workspace.store.ts src/store/workspace.store.test.ts
git commit -m "feat(workspace): structural shared + local registry + createLocalWorkspace + dev-data adoption"
```

---

## Task 6: `DEV_BYPASS`/„Überspringen" entfernen

**Files:**
- Modify: `src/core/auth/LoginScreen.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: nichts Neues.

- [ ] **Step 1: `LoginScreen.tsx`** — `handleDevSkip` (die Funktion) **löschen** sowie den gesamten Skip-UI-Block am Ende (der `<div>` mit „Dein Name"-Input + „überspringen"-Button, ca. `:360-393`) und das `devName`-State + `TESTER_NAME_STORE`. Den `useWorkspaceStore`-Import entfernen, falls dann ungenutzt.

- [ ] **Step 2: `App.tsx`** — entfernen:
  - die Konstante `const DEV_BYPASS = import.meta.env.VITE_LOCAL_MODE === 'true'` (`:23`),
  - den Effekt `useEffect(() => { if (DEV_BYPASS && !activeWorkspaceId) { useWorkspaceStore.getState().setActiveWorkspace('dev') } }, [])` (`:162-166`),
  - in den drei Guards (`authLoading`, `!user`, `!activeWorkspaceId`, `:226/228/230`) jeweils das `&& !DEV_BYPASS` streichen (Guards werden unbedingt).

- [ ] **Step 3: tsc sauber + Suite grün.**

- [ ] **Step 4: Commit**
```bash
git add src/core/auth/LoginScreen.tsx src/App.tsx
git commit -m "feat(workspace): remove dev-skip / DEV_BYPASS — login is required"
```

---

## Task 7: WorkspacePicker — lokal anlegen + Badge

**Files:**
- Modify: `src/core/workspace/WorkspacePicker.tsx`

**Interfaces:**
- Consumes: `createLocalWorkspace`, `localWorkspaces` (Task 5).

- [ ] **Step 1: Selektoren + Liste** — in `WorkspacePicker.tsx`:
  - statt `createWorkspace` die lokale Aktion holen: `const createLocalWorkspace = useWorkspaceStore(s => s.createLocalWorkspace)` und `const localWorkspaces = useWorkspaceStore(s => s.localWorkspaces)`.
  - `handleCreate` ruft synchron `createLocalWorkspace(newName.trim())` (kein await/try nötig; lokal, kein Fehlerpfad):
```tsx
  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    createLocalWorkspace(newName.trim())
  }
```
  - Die gerenderte Liste über **beide** Quellen mappen und ein Badge zeigen. Die `workspaces.length > 0`-Sektion ersetzen durch:
```tsx
        {[...workspaces, ...localWorkspaces].length > 0 && (
          <div className="flex flex-col gap-2 mb-6">
            {[...workspaces, ...localWorkspaces].map(ws => (
              <button key={ws.id} onClick={() => setActiveWorkspace(ws.id)}
                className="w-full flex items-center gap-3 p-4 rounded-xl bg-[var(--bg1)] border border-[var(--border)] hover:border-primary/40 transition-colors text-left">
                <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0 text-sm font-bold text-primary">
                  {ws.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--text)]">{ws.name}</p>
                  <p className="text-xs text-[var(--text2)]">{ws.isShared ? '☁ Geteilt' : '🔒 Lokal'}</p>
                </div>
                <span className="ml-auto text-[var(--text2)] text-sm">→</span>
              </button>
            ))}
          </div>
        )}
```
  - Die Überschrift-Texte sinngemäß lassen; „Neuer Workspace"-Label ggf. zu „Neuer lokaler Workspace" präzisieren (optional). Den jetzt ungenutzten `WorkspaceCard`-Helper + `createWorkspace`-Import/`creating`/`error`-State entfernen, falls dadurch tot.

- [ ] **Step 2: tsc sauber + Suite grün.**

- [ ] **Step 3: Commit**
```bash
git add src/core/workspace/WorkspacePicker.tsx
git commit -m "feat(workspace): picker creates local workspaces + local/cloud badge"
```

---

## Task 8: Backup-Import-Caller übergibt Workspace + User

**Files:**
- Modify: `src/components/settings/GefahrenzoneSettings.tsx`

**Interfaces:**
- Consumes: angepasstes `cmd_import_backup` (Task 3); `useWorkspaceStore`, `useAuthStore`.

- [ ] **Step 1: Import-Aufruf anpassen** — in `handleImportFile` den `invoke`-Call (`:76`) ersetzen:
```ts
      const activeWorkspaceId = useWorkspaceStore.getState().activeWorkspaceId
      const userId = useAuthStore.getState().user?.id ?? null
      if (!activeWorkspaceId) {
        toast({ message: 'Kein aktiver Workspace — Import abgebrochen.', variant: 'error' })
        setBusy(null); return
      }
      const s = await invoke<ImportSummary>('cmd_import_backup', { json, activeWorkspaceId, userId })
```
Import von `useAuthStore` oben ergänzen (`import { useAuthStore } from '@/store/auth.store'`). `useWorkspaceStore` ist bereits importiert.

- [ ] **Step 2: tsc sauber + Suite grün.**

- [ ] **Step 3: Commit**
```bash
git add src/components/settings/GefahrenzoneSettings.tsx
git commit -m "feat(backup): import passes active workspace + user for re-scope"
```

---

## Task 9: Chat-Leerzustand-Text für lokale Workspaces

**Files:**
- Modify: `src/routes/TeamChatRoute.tsx`
- Modify: `src/components/team/ChatDrawer.tsx`

**Interfaces:**
- Consumes: `useUiStore.setAppView` (für CTA zu Einstellungen), bestehende `isShared`-Gates.

- [ ] **Step 1: `TeamChatRoute.tsx`** — im `!isShared`-Leerzustand den Text/CTA ändern (lokaler Workspace kann nie ein 2. Mitglied bekommen — er muss erst geteilt werden). Den Beschreibungstext ersetzen durch:
```tsx
        <div style={{ fontSize: 12.5, maxWidth: 360, textAlign: 'center' }}>
          Team-Chat ist verfügbar, sobald dieser Workspace geteilt ist. Teile ihn in den
          Einstellungen, um mit deinem Team zu schreiben.
        </div>
```
(Die „Teilen"-Aktion selbst kommt in Teil ①b; hier nur korrekter Text statt der irreführenden „2. Mitglied"-Formulierung.)

- [ ] **Step 2: `ChatDrawer.tsx`** — den analogen `!isShared`-Text (`:41-43`) ersetzen durch:
```tsx
          Team-Chat erscheint, sobald dieser Workspace geteilt ist (Einstellungen → Workspace teilen).
```

- [ ] **Step 3: tsc sauber + Suite grün.**

- [ ] **Step 4: Commit**
```bash
git add src/routes/TeamChatRoute.tsx src/components/team/ChatDrawer.tsx
git commit -m "fix(chat): correct empty-state copy for local workspaces"
```

---

## Abschluss-Verifikation Teil A

- [ ] `cargo test` in `src-tauri/` → neue Tests grün (`rescope_*`, `has_workspace_data`, `import_rescopes_*`), Bestandstests angepasst grün. (Hinweis: die 2 vorbestehenden, datumsabhängigen `get_finance_kpis_*`-Failures sind **nicht** Teil dieses Plans.)
- [ ] `npx tsc --noEmit -p tsconfig.json` → sauber.
- [ ] `npx vitest run` → grün (inkl. neuer Store-/Helper-Tests; `deriveShared`-Tests entfernt).
- [ ] **Manuell:** App starten → Login Pflicht (kein „überspringen" mehr). Nach Login werden vorhandene `'dev'`-Daten als lokaler Workspace „Mein Workspace" sichtbar (Adoption). Picker zeigt 🔒-Badge. Backup importieren → Daten erscheinen im aktiven Workspace.

## Self-Review (gegen Spec geprüft)

- §1 strukturelles `isShared` + `localWorkspaces` + Persistenz-Bump + Defaults → Task 4/5 ✅.
- §2 Login-Pflicht/Skip raus + `createLocalWorkspace` + Adoption (Rust-Commands + Call-Site in `loadWorkspaces`) → Task 1/2/5/6/7 ✅.
- §4 Backup-Re-scope (nur workspace_id-Spalten) + Caller → Task 3/8 ✅.
- §5 Adoption deckt die Tester-Lage (`'dev'`); Solo-Cloud-Erkennung + `createCloudWorkspaceRecord` gehören zu Teil ①b (Migration) — hier bewusst nicht.
- §6 Chat-Leertext → Task 9 ✅. `WorkspaceSwitcher`/`MembersSettings`-Semantik ändert sich automatisch korrekt mit strukturellem `isShared` (keine Code-Änderung nötig; Default-Felder verhindern Crash).
- **Nicht in A (Teil B):** Teilen-Flow, Migrations-Runner, Entfernen der lazy-Migrationen, `createCloudWorkspaceRecord`. `deriveShared` ist entfernt; die in Teil B zu löschenden lazy-Migrationen sind noch vorhanden (kein Konflikt, da in A kein Cloud-Schreiben/Teilen passiert).

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-27-workspace-foundation-a-model-identity-import.md`. Zwei Optionen:**

**1. Subagent-Driven (empfohlen)** — frischer Subagent pro Task, Review dazwischen.
**2. Inline-Ausführung** — Tasks in dieser Session mit Checkpoints.

**Welcher Ansatz?**
