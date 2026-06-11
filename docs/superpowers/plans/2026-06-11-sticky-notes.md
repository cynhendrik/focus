# Sticky Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jede `NoteEntry` kann beliebig viele freischwebende, draggbare Sticky Notes enthalten (Titel, Text, Farbe, Checkliste), die pro Notiz in SQLite gespeichert werden.

**Architecture:** `stickies` wird als JSON-String in einer neuen Spalte in `note_entries` gespeichert — exakt wie `tags`. Rust-Migration v25 fügt die Spalte hinzu. TypeScript parst das JSON im Store zu `StickyNote[]`. Zwei neue React-Komponenten (`StickyCard`, `StickyCanvas`) werden als absolut positioniertes Overlay über den Tiptap-Editor in `CustomerNotesPane.tsx` eingehängt.

**Tech Stack:** Rust/rusqlite (SQLite), Tauri commands, React, TypeScript, Zustand, CSS-in-JS (inline styles, gleich wie restliche Codebase)

---

## Dateiübersicht

| Aktion | Datei |
|--------|-------|
| Modify | `src-tauri/src/db/migrations.rs` — Migration v25 |
| Modify | `src-tauri/src/db/note_entry.rs` — `stickies`-Feld durchschleifen |
| Modify | `src/types/notes-module.types.ts` — neue Typen + erweiterte Payloads |
| Modify | `src/store/notes-module.store.ts` — `parseEntry()` erweitern |
| Create | `src/components/notes/StickyCard.tsx` — einzelner Zettel |
| Create | `src/components/notes/StickyCanvas.tsx` — Overlay-Container |
| Modify | `src/components/notes/CustomerNotesPane.tsx` — Integration |

---

## Task 1: Rust — Migration v25 (stickies-Spalte)

**Files:**
- Modify: `src-tauri/src/db/migrations.rs`

- [ ] **Schritt 1: Test schreiben**

In `src-tauri/src/db/note_entry.rs`, im `#[cfg(test)]`-Block am Ende der Datei, direkt unter dem letzten Test (`delete_returns_not_found`) einfügen:

```rust
#[test]
fn stickies_defaults_to_empty_array() {
    let conn = setup();
    seed_account(&conn, "a1");
    let e = insert(&conn, make_payload("a1")).unwrap();
    assert_eq!(e.stickies, "[]");
}

#[test]
fn update_stickies_persists() {
    let conn = setup();
    seed_account(&conn, "a1");
    let e = insert(&conn, make_payload("a1")).unwrap();
    let stickies_json = r#"[{"id":"s1","x":10,"y":20,"color":"#FFF176","title":"Test","text":"","checks":[]}]"#;
    let updated = update(&conn, &e.id, UpdateNoteEntryPayload {
        folder_id: None, title: None, content: None, tags: None,
        stickies: Some(stickies_json.to_string()),
        updated_by: None,
    }).unwrap();
    assert_eq!(updated.stickies, stickies_json);
}
```

- [ ] **Schritt 2: Test laufen lassen — muss FEHLSCHLAGEN**

```
cd src-tauri && cargo test note_entry::tests::stickies_defaults_to_empty_array -- --nocapture
```

Erwartet: `error[E0609]: no field 'stickies' on type 'NoteEntry'`

- [ ] **Schritt 3: Migration eintragen**

In `src-tauri/src/db/migrations.rs` Zeile 4 ändern:
```rust
const CURRENT_VERSION: u32 = 25;
```

Im `match version`-Block am Ende (nach dem letzten `_ => ...` Arm, aber davor), neuen Arm einfügen:

```rust
25 => {
    if column_exists(conn, "note_entries", "stickies") { return Ok(()); }
    conn.execute_batch(
        "ALTER TABLE note_entries ADD COLUMN stickies TEXT NOT NULL DEFAULT '[]';"
    )?;
    Ok(())
}
```

- [ ] **Schritt 4: Commit (Migration only)**

```
git add src-tauri/src/db/migrations.rs
git commit -m "feat(db): migration v25 — stickies column on note_entries"
```

---

## Task 2: Rust — note_entry.rs um stickies erweitern

**Files:**
- Modify: `src-tauri/src/db/note_entry.rs`

- [ ] **Schritt 1: `NoteEntry`-Struct erweitern**

In `src-tauri/src/db/note_entry.rs` das `NoteEntry`-Struct (ab Zeile 7) ändern — `stickies`-Feld nach `tags` hinzufügen:

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NoteEntry {
    pub id:           String,
    pub workspace_id: String,
    pub account_id:   String,
    pub folder_id:    Option<String>,
    pub title:        Option<String>,
    pub content:      String,
    pub tags:         String,  // JSON array string
    pub stickies:     String,  // JSON array string
    pub created_by:   String,
    pub updated_by:   Option<String>,
    pub created_at:   String,
    pub updated_at:   String,
}
```

- [ ] **Schritt 2: `UpdateNoteEntryPayload` erweitern**

Das `UpdateNoteEntryPayload`-Struct (ab Zeile 33) anpassen:

```rust
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateNoteEntryPayload {
    pub folder_id:  Option<Option<String>>,
    pub title:      Option<String>,
    pub content:    Option<String>,
    pub tags:       Option<String>,
    pub stickies:   Option<String>,
    pub updated_by: Option<String>,
}
```

- [ ] **Schritt 3: `SELECT_COLS` und `map_row` erweitern**

`SELECT_COLS`-Konstante (Zeile 59) auf `stickies` erweitern:

```rust
const SELECT_COLS: &str =
    "id, workspace_id, account_id, folder_id, title, content, tags, stickies,
     created_by, updated_by, created_at, updated_at";
```

`map_row`-Funktion (Zeile 43) auf neue Spaltenindizes anpassen (stickies ist Index 7, danach verschiebt sich alles um 1):

```rust
fn map_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<NoteEntry> {
    Ok(NoteEntry {
        id:           r.get(0)?,
        workspace_id: r.get(1)?,
        account_id:   r.get(2)?,
        folder_id:    r.get(3)?,
        title:        r.get(4)?,
        content:      r.get::<_, Option<String>>(5)?.unwrap_or_default(),
        tags:         r.get::<_, Option<String>>(6)?.unwrap_or_else(|| "[]".into()),
        stickies:     r.get::<_, Option<String>>(7)?.unwrap_or_else(|| "[]".into()),
        created_by:   r.get(8)?,
        updated_by:   r.get(9)?,
        created_at:   r.get(10)?,
        updated_at:   r.get(11)?,
    })
}
```

- [ ] **Schritt 4: `insert`-Funktion erweitern**

Im `INSERT INTO note_entries`-Statement `stickies` hinzufügen:

```rust
pub fn insert(conn: &Connection, payload: CreateNoteEntryPayload) -> Result<NoteEntry, AppError> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO note_entries
         (id, workspace_id, account_id, folder_id, title, content, tags, stickies, created_by, pending_sync, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,'[]',?8,1,?9,?9)",
        rusqlite::params![
            id,
            payload.workspace_id,
            payload.account_id,
            payload.folder_id,
            payload.title,
            payload.content.unwrap_or_default(),
            payload.tags.unwrap_or_else(|| "[]".into()),
            payload.created_by,
            now,
        ],
    )?;
    conn.query_row(
        &format!("SELECT {SELECT_COLS} FROM note_entries WHERE id=?1"),
        [&id], map_row,
    ).map_err(AppError::from)
}
```

- [ ] **Schritt 5: `update`-Funktion erweitern**

Im `UPDATE note_entries`-Statement `stickies` mit COALESCE durchschleifen:

```rust
pub fn update(conn: &Connection, id: &str, payload: UpdateNoteEntryPayload) -> Result<NoteEntry, AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    let n = conn.execute(
        "UPDATE note_entries SET
           folder_id  = CASE WHEN ?1 IS NOT NULL THEN ?2 ELSE folder_id END,
           title      = COALESCE(?3, title),
           content    = COALESCE(?4, content),
           tags       = COALESCE(?5, tags),
           stickies   = COALESCE(?6, stickies),
           updated_by = ?7,
           pending_sync = 1,
           updated_at = ?8
         WHERE id = ?9",
        rusqlite::params![
            payload.folder_id.is_some(),
            payload.folder_id.unwrap_or(None),
            payload.title, payload.content, payload.tags,
            payload.stickies,
            payload.updated_by, now, id,
        ],
    )?;
    if n == 0 { return Err(AppError::NotFound(format!("NoteEntry {id} not found"))); }
    conn.query_row(
        &format!("SELECT {SELECT_COLS} FROM note_entries WHERE id=?1"),
        [id], map_row,
    ).map_err(AppError::from)
}
```

- [ ] **Schritt 6: Tests laufen lassen — müssen BESTEHEN**

```
cd src-tauri && cargo test note_entry::tests -- --nocapture
```

Erwartet: alle Tests grün, inkl. `stickies_defaults_to_empty_array` und `update_stickies_persists`

- [ ] **Schritt 7: Commit**

```
git add src-tauri/src/db/note_entry.rs
git commit -m "feat(db): stickies field in NoteEntry — persist + update"
```

---

## Task 3: TypeScript — Typen erweitern

**Files:**
- Modify: `src/types/notes-module.types.ts`
- Create: `src/types/notes-module.types.test.ts`

- [ ] **Schritt 1: Test schreiben**

Neue Datei `src/types/notes-module.types.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import type { StickyNote, StickyCheck } from './notes-module.types'

describe('StickyNote type', () => {
  it('accepts a full sticky note object', () => {
    const check: StickyCheck = { id: 'c1', label: 'Erledigen', done: false }
    const note: StickyNote = {
      id: 's1', x: 100, y: 200, color: '#FFF176',
      title: 'Mein Zettel', text: 'Inhalt', checks: [check],
    }
    expect(note.id).toBe('s1')
    expect(note.checks[0].done).toBe(false)
  })
})
```

- [ ] **Schritt 2: Test laufen lassen — muss FEHLSCHLAGEN**

```
npx vitest run src/types/notes-module.types.test.ts
```

Erwartet: `Cannot find name 'StickyNote'`

- [ ] **Schritt 3: Typen in `notes-module.types.ts` hinzufügen**

Am Ende der Datei `src/types/notes-module.types.ts` anhängen (nach dem letzten Interface):

```typescript
export interface StickyCheck {
  id:    string
  label: string
  done:  boolean
}

export interface StickyNote {
  id:     string
  x:      number
  y:      number
  color:  string
  title:  string
  text:   string
  checks: StickyCheck[]
}
```

`NoteEntry` um `stickies` erweitern:

```typescript
export interface NoteEntry {
  id:          string
  workspaceId: string
  accountId:   string
  folderId:    string | null
  title:       string | null
  content:     string
  tags:        string[]
  stickies:    StickyNote[]   // parsed from JSON string
  createdBy:   string
  updatedBy:   string | null
  createdAt:   string
  updatedAt:   string
}
```

`UpdateNoteEntryPayload` erweitern:

```typescript
export interface UpdateNoteEntryPayload {
  folderId?:  string | null | undefined
  title?:     string | null
  content?:   string
  tags?:      string
  stickies?:  string   // JSON.stringify(StickyNote[])
  updatedBy?: string
}
```

- [ ] **Schritt 4: Tests laufen lassen — müssen BESTEHEN**

```
npx vitest run src/types/notes-module.types.test.ts
```

Erwartet: PASS

- [ ] **Schritt 5: Commit**

```
git add src/types/notes-module.types.ts src/types/notes-module.types.test.ts
git commit -m "feat(types): StickyNote + StickyCheck types, extend NoteEntry + UpdateNoteEntryPayload"
```

---

## Task 4: TypeScript — Store erweitern

**Files:**
- Modify: `src/store/notes-module.store.ts`

- [ ] **Schritt 1: `parseEntry` in `notes-module.store.ts` erweitern**

Die `parseEntry`-Funktion (Zeile 12) anpassen um `stickies` zu parsen:

```typescript
function parseEntry(raw: Omit<NoteEntry, 'tags' | 'stickies'> & { tags: string; stickies: string }): NoteEntry {
  let tags: string[] = []
  let stickies: StickyNote[] = []
  try { tags = JSON.parse(raw.tags) } catch {}
  try { stickies = JSON.parse(raw.stickies) } catch {}
  return { ...raw, tags, stickies }
}
```

Den Import oben in der Datei um `StickyNote` erweitern:

```typescript
import type {
  NoteEntry, NoteDoc, NoteFolder,
  StickyNote,
  CreateNoteEntryPayload, UpdateNoteEntryPayload,
  CreateNoteDocPayload, UpdateNoteDocPayload,
  CreateNoteFolderPayload, UpdateNoteFolderPayload,
} from '@/types/notes-module.types'
```

- [ ] **Schritt 2: TypeScript-Check**

```
npx tsc --noEmit
```

Erwartet: keine Fehler

- [ ] **Schritt 3: Commit**

```
git add src/store/notes-module.store.ts
git commit -m "feat(store): parseEntry parst stickies JSON zu StickyNote[]"
```

---

## Task 5: StickyCard-Komponente

**Files:**
- Create: `src/components/notes/StickyCard.tsx`

- [ ] **Schritt 1: Datei erstellen**

`src/components/notes/StickyCard.tsx`:

```tsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Plus, GripHorizontal } from 'lucide-react'
import type { StickyNote, StickyCheck } from '@/types/notes-module.types'

export const STICKY_COLORS = [
  '#FFF176', '#F48FB1', '#81D4FA', '#A5D6A7', '#CE93D8', '#FFCC80',
] as const

interface Props {
  note: StickyNote
  onChange: (updated: StickyNote) => void
  onDelete: () => void
}

export function StickyCard({ note, onChange, onDelete }: Props) {
  const [dragging, setDragging] = useState(false)
  const offsetRef = useRef({ x: 0, y: 0 })

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    offsetRef.current = { x: e.clientX - note.x, y: e.clientY - note.y }
    setDragging(true)
  }, [note.x, note.y])

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent) => {
      onChange({ ...note, x: e.clientX - offsetRef.current.x, y: e.clientY - offsetRef.current.y })
    }
    const onUp = () => setDragging(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragging, note, onChange])

  const setField = <K extends keyof StickyNote>(key: K, value: StickyNote[K]) =>
    onChange({ ...note, [key]: value })

  const setCheck = (id: string, patch: Partial<StickyCheck>) =>
    onChange({
      ...note,
      checks: note.checks.map(c => c.id === id ? { ...c, ...patch } : c),
    })

  const addCheck = () =>
    onChange({
      ...note,
      checks: [...note.checks, { id: crypto.randomUUID(), label: '', done: false }],
    })

  const removeCheck = (id: string) =>
    onChange({ ...note, checks: note.checks.filter(c => c.id !== id) })

  return (
    <div
      style={{
        position: 'absolute',
        left: note.x,
        top: note.y,
        width: 220,
        background: note.color,
        borderRadius: 10,
        boxShadow: dragging
          ? '0 16px 40px -8px oklch(0% 0 0 / 0.35)'
          : '0 4px 16px -4px oklch(0% 0 0 / 0.18)',
        zIndex: dragging ? 100 : 10,
        display: 'flex',
        flexDirection: 'column',
        cursor: dragging ? 'grabbing' : 'default',
        transition: 'box-shadow 120ms',
        userSelect: dragging ? 'none' : 'auto',
      }}
    >
      {/* Header: drag handle + Farbpalette + löschen */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '6px 8px 4px',
          cursor: dragging ? 'grabbing' : 'grab',
          borderRadius: '10px 10px 0 0',
          background: 'oklch(0% 0 0 / 0.06)',
        }}
      >
        <GripHorizontal size={13} style={{ color: 'oklch(0% 0 0 / 0.4)', flexShrink: 0 }} />
        <div style={{ display: 'flex', gap: 3, flex: 1 }}>
          {STICKY_COLORS.map(c => (
            <button
              key={c}
              onMouseDown={e => { e.stopPropagation(); setField('color', c) }}
              style={{
                width: 13, height: 13, borderRadius: '50%', border: 'none',
                background: c, cursor: 'pointer', flexShrink: 0,
                outline: note.color === c ? '2px solid oklch(0% 0 0 / 0.5)' : 'none',
                outlineOffset: 1,
              }}
            />
          ))}
        </div>
        <button
          onMouseDown={e => { e.stopPropagation(); onDelete() }}
          style={{
            width: 18, height: 18, borderRadius: 5, border: 'none',
            background: 'oklch(0% 0 0 / 0.1)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <X size={10} style={{ color: 'oklch(0% 0 0 / 0.5)' }} />
        </button>
      </div>

      {/* Titel */}
      <input
        value={note.title}
        onChange={e => setField('title', e.target.value)}
        placeholder="Titel…"
        style={{
          border: 'none', background: 'transparent', outline: 'none',
          padding: '6px 10px 2px', fontSize: 12.5, fontWeight: 700,
          color: 'oklch(10% 0 0)', fontFamily: 'inherit',
          letterSpacing: '-0.01em',
        }}
      />

      {/* Text */}
      <textarea
        value={note.text}
        onChange={e => setField('text', e.target.value)}
        placeholder="Notiz…"
        rows={3}
        style={{
          border: 'none', background: 'transparent', outline: 'none',
          padding: '4px 10px', fontSize: 12, color: 'oklch(15% 0 0)',
          fontFamily: 'inherit', resize: 'none', lineHeight: 1.5,
        }}
      />

      {/* Checkliste */}
      {(note.checks.length > 0) && (
        <div style={{ padding: '2px 8px 0', borderTop: '1px solid oklch(0% 0 0 / 0.08)' }}>
          {note.checks.map(c => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
              <input
                type="checkbox"
                checked={c.done}
                onChange={e => setCheck(c.id, { done: e.target.checked })}
                style={{ flexShrink: 0, accentColor: 'oklch(35% 0 0)', cursor: 'pointer' }}
              />
              <input
                value={c.label}
                onChange={e => setCheck(c.id, { label: e.target.value })}
                placeholder="Punkt…"
                style={{
                  flex: 1, border: 'none', background: 'transparent', outline: 'none',
                  fontSize: 11.5, color: 'oklch(15% 0 0)', fontFamily: 'inherit',
                  textDecoration: c.done ? 'line-through' : 'none',
                  opacity: c.done ? 0.5 : 1,
                }}
              />
              <button
                onClick={() => removeCheck(c.id)}
                style={{
                  border: 'none', background: 'none', cursor: 'pointer',
                  color: 'oklch(0% 0 0 / 0.3)', padding: 0, display: 'flex',
                }}
              >
                <X size={9} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Footer: + Punkt */}
      <button
        onClick={addCheck}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '5px 10px 8px',
          border: 'none', background: 'transparent', cursor: 'pointer',
          fontSize: 11, color: 'oklch(0% 0 0 / 0.4)', fontFamily: 'inherit',
        }}
      >
        <Plus size={10} /> Punkt hinzufügen
      </button>
    </div>
  )
}
```

- [ ] **Schritt 2: TypeScript-Check**

```
npx tsc --noEmit
```

Erwartet: keine Fehler

- [ ] **Schritt 3: Commit**

```
git add src/components/notes/StickyCard.tsx
git commit -m "feat(notes): StickyCard — draggbare Zettel-Komponente"
```

---

## Task 6: StickyCanvas-Komponente

**Files:**
- Create: `src/components/notes/StickyCanvas.tsx`

- [ ] **Schritt 1: Datei erstellen**

`src/components/notes/StickyCanvas.tsx`:

```tsx
import { useCallback } from 'react'
import type { StickyNote } from '@/types/notes-module.types'
import { StickyCard, STICKY_COLORS } from './StickyCard'

interface Props {
  stickies:  StickyNote[]
  onChange:  (stickies: StickyNote[]) => void
}

export function StickyCanvas({ stickies, onChange }: Props) {
  const handleChange = useCallback((updated: StickyNote) => {
    onChange(stickies.map(s => s.id === updated.id ? updated : s))
  }, [stickies, onChange])

  const handleDelete = useCallback((id: string) => {
    onChange(stickies.filter(s => s.id !== id))
  }, [stickies, onChange])

  return (
    <div style={{
      position: 'absolute', inset: 0,
      pointerEvents: 'none', zIndex: 10,
    }}>
      {stickies.map(s => (
        <StickyCard
          key={s.id}
          note={s}
          onChange={handleChange}
          onDelete={() => handleDelete(s.id)}
        />
      ))}
    </div>
  )
}

export function createSticky(existingCount: number): StickyNote {
  return {
    id:     crypto.randomUUID(),
    x:      40 + existingCount * 20,
    y:      40 + existingCount * 20,
    color:  STICKY_COLORS[existingCount % STICKY_COLORS.length],
    title:  '',
    text:   '',
    checks: [],
  }
}
```

- [ ] **Schritt 2: TypeScript-Check**

```
npx tsc --noEmit
```

Erwartet: keine Fehler

- [ ] **Schritt 3: Commit**

```
git add src/components/notes/StickyCanvas.tsx
git commit -m "feat(notes): StickyCanvas — Overlay-Container + createSticky-Helfer"
```

---

## Task 7: Integration in NoteEditor

**Files:**
- Modify: `src/components/notes/CustomerNotesPane.tsx`

- [ ] **Schritt 1: Imports ergänzen**

Am Anfang von `CustomerNotesPane.tsx` die bestehende Import-Zeile von `lucide-react` um `StickyNote as StickyIcon` ergänzen (der Name `StickyNote` ist bereits ein Typ-Name):

```tsx
import { Plus, Trash2, Search, X, Bold, Italic, List, CheckSquare, Heading2, PenLine, StickyNote as StickyIcon } from 'lucide-react'
```

Neue Imports für Komponenten und Helfer unterhalb der bestehenden Komponentenimports hinzufügen:

```tsx
import { StickyCanvas, createSticky } from './StickyCanvas'
import type { StickyNote } from '@/types/notes-module.types'
```

- [ ] **Schritt 2: `NoteEditor`-Props um `stickies` + `onStickiesChange` erweitern**

Die Interface-Definition der `NoteEditor`-Funktion (Zeile ~105) anpassen:

```tsx
function NoteEditor({
  note, folders, onUpdate,
}: {
  note: NoteEntry
  folders: NoteFolder[]
  onUpdate: (patch: { title?: string | null; content?: string; stickies?: string }) => Promise<void>
})
```

- [ ] **Schritt 3: Stickies-State + Save-Logik in `NoteEditor` einbauen**

Innerhalb von `NoteEditor`, direkt nach den `useRef`-Zeilen (nach `statusTimer`), neuen State und Debounce-Ref hinzufügen:

```tsx
const [stickies, setStickies] = useState<StickyNote[]>(note.stickies ?? [])
const stickiesTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

// stickies-State bei Notizwechsel zurücksetzen
useEffect(() => { setStickies(note.stickies ?? []) }, [note.id])
```

Im bestehenden `useEffect`-Cleanup (Zeile ~157) `stickiesTimer` eintragen:

```tsx
useEffect(() => () => {
  if (titleTimer.current)    clearTimeout(titleTimer.current)
  if (contentTimer.current)  clearTimeout(contentTimer.current)
  if (statusTimer.current)   clearTimeout(statusTimer.current)
  if (stickiesTimer.current) clearTimeout(stickiesTimer.current)
}, [])
```

Handler für Stickies-Änderungen hinzufügen (direkt nach `handleTitleKey`):

```tsx
const handleStickiesChange = useCallback((updated: StickyNote[]) => {
  setStickies(updated)
  if (stickiesTimer.current) clearTimeout(stickiesTimer.current)
  stickiesTimer.current = setTimeout(() => {
    onUpdate({ stickies: JSON.stringify(updated) })
  }, 600)
}, [onUpdate])

const handleAddSticky = useCallback(() => {
  const updated = [...stickies, createSticky(stickies.length)]
  setStickies(updated)
  onUpdate({ stickies: JSON.stringify(updated) })
}, [stickies, onUpdate])
```

- [ ] **Schritt 4: Toolbar um "+ Zettel"-Button erweitern**

In der `Toolbar`-Komponente (Zeile ~66) einen `onAddSticky`-Prop ergänzen:

```tsx
function Toolbar({
  editor,
  onAddSticky,
}: {
  editor: ReturnType<typeof useEditor>
  onAddSticky: () => void
}) {
  if (!editor) return null

  // btn-Helfer bleibt identisch zur bestehenden Implementierung (Zeilen 69-86 der Originaldatei)
  const btn = (
    active: boolean,
    icon: React.ReactNode,
    action: () => void,
    title: string,
  ) => (
    <button
      onMouseDown={e => { e.preventDefault(); action() }}
      title={title}
      style={{
        width: 28, height: 28, borderRadius: 6, border: 'none',
        background: active ? 'var(--surface-3)' : 'transparent',
        color: active ? 'var(--fg)' : 'var(--fg-dim)',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 100ms, color 100ms',
      }}
    >{icon}</button>
  )

  return (
    <div style={{
      display: 'flex', gap: 2, padding: '6px 0', marginBottom: 4,
      borderBottom: '1px solid var(--border)',
      alignItems: 'center',
    }}>
      {/* Die vier bestehenden btn()-Aufrufe (Bold, Italic, Heading2, Divider, BulletList, TaskList)
          bleiben unverändert — nur alignItems: 'center' im Wrapper und flex:1 spacer + Zettel-Button sind neu */}
      {btn(editor.isActive('bold'),         <Bold size={13} />,          () => editor.chain().focus().toggleBold().run(),             'Fett')}
      {btn(editor.isActive('italic'),       <Italic size={13} />,        () => editor.chain().focus().toggleItalic().run(),           'Kursiv')}
      {btn(editor.isActive('heading',{level:2}), <Heading2 size={13} />, () => editor.chain().focus().toggleHeading({level:2}).run(), 'Überschrift')}
      <div style={{ width: 1, background: 'var(--border)', margin: '2px 4px' }} />
      {btn(editor.isActive('bulletList'),   <List size={13} />,          () => editor.chain().focus().toggleBulletList().run(),       'Liste')}
      {btn(editor.isActive('taskList'),     <CheckSquare size={13} />,   () => editor.chain().focus().toggleTaskList().run(),         'Checkliste')}
      <div style={{ flex: 1 }} />
      <button
        onClick={onAddSticky}
        title="Zettel hinzufügen"
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '3px 8px', borderRadius: 6,
          border: '1px solid var(--border)',
          background: 'transparent', cursor: 'pointer',
          fontSize: 11.5, color: 'var(--fg-muted)',
          transition: 'color 120ms, border-color 120ms',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.color = 'var(--fg)'
          e.currentTarget.style.borderColor = 'var(--accent)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.color = 'var(--fg-muted)'
          e.currentTarget.style.borderColor = 'var(--border)'
        }}
      >
        <StickyIcon size={12} /> Zettel
      </button>
    </div>
  )
}
```

- [ ] **Schritt 5: `Toolbar`-Aufruf + `StickyCanvas` im Return von `NoteEditor` einbauen**

Den `Toolbar`-Aufruf (Zeile ~231) `onAddSticky` übergeben:

```tsx
<Toolbar editor={editor} onAddSticky={handleAddSticky} />
```

Den Editor-Scroll-Bereich (das `<div>` mit `flex: 1, overflowY: auto`) mit `position: relative` versehen und `StickyCanvas` als Sibling zu `EditorContent` einbauen:

```tsx
{/* Editor scroll area */}
<div
  style={{ flex: 1, overflowY: 'auto', padding: '20px 56px 80px', position: 'relative' }}
  onClick={() => editor?.commands.focus()}
>
  <StickyCanvas stickies={stickies} onChange={handleStickiesChange} />
  <div style={{ maxWidth: 720 }}>
    <EditorContent editor={editor} />
  </div>
</div>
```

- [ ] **Schritt 6: `handleUpdate` in `CustomerNotesPane` für `stickies` öffnen**

Die `handleUpdate`-Callback-Funktion (Zeile ~423) akzeptiert bereits `patch: { title?: string | null; content?: string }` — das Typ muss um `stickies` erweitert werden:

```tsx
const handleUpdate = useCallback(async (
  id: string,
  patch: { title?: string | null; content?: string; stickies?: string },
) => {
  await updateEntry(id, { ...patch, updatedBy: userId })
}, [updateEntry, userId])
```

Und der `NoteEditor`-Aufruf weiter unten im Return bleibt unverändert:

```tsx
<NoteEditor
  key={selectedNote.id}
  note={selectedNote}
  folders={folders}
  onUpdate={patch => handleUpdate(selectedNote.id, patch)}
/>
```

- [ ] **Schritt 7: TypeScript-Check**

```
npx tsc --noEmit
```

Erwartet: keine Fehler

- [ ] **Schritt 8: Alle Frontend-Tests laufen lassen**

```
npx vitest run
```

Erwartet: alle Tests grün

- [ ] **Schritt 9: Commit**

```
git add src/components/notes/CustomerNotesPane.tsx
git commit -m "feat(notes): Sticky Notes in NoteEditor integriert — Canvas + Toolbar-Button"
```

---

## Task 8: Rust kompilieren + Rust-Tests

- [ ] **Schritt 1: Rust bauen**

```
cd src-tauri && cargo build 2>&1 | tail -20
```

Erwartet: `Finished` ohne Fehler

- [ ] **Schritt 2: Alle Rust-Tests laufen lassen**

```
cd src-tauri && cargo test -- --nocapture 2>&1 | tail -30
```

Erwartet: alle Tests grün

- [ ] **Schritt 3: Abschluss-Commit**

```
git add -A
git commit -m "feat(notes): Sticky Notes komplett — Rust + TypeScript + UI"
```
