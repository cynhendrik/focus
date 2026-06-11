# Sticky Notes in Notizen
**Datum:** 2026-06-11

## Zusammenfassung

Jede `NoteEntry` (Notiz eines Kunden) kann beliebig viele freischwebende Sticky Notes enthalten. Die Zettel liegen als draggbare Overlay-Karten über dem Tiptap-Editor, werden mit der Notiz gespeichert und enthalten Titel, Text, Farbe und eine Checkliste.

---

## Datenmodell

### Neuer Typ `StickyNote`

```ts
// src/types/notes-module.types.ts
export interface StickyCheck {
  id:    string
  label: string
  done:  boolean
}

export interface StickyNote {
  id:     string
  x:      number   // px relativ zum Canvas-Container
  y:      number
  color:  string   // Hex-Farbe aus Preset-Palette
  title:  string
  text:   string
  checks: StickyCheck[]
}
```

### Erweiterung `NoteEntry`

```ts
export interface NoteEntry {
  // ... bestehende Felder ...
  stickies: StickyNote[]   // geparst aus JSON-String (wie tags)
}
```

### Erweiterung Payloads

```ts
export interface UpdateNoteEntryPayload {
  // ... bestehende Felder ...
  stickies?: string   // JSON.stringify(StickyNote[])
}
```

### Rust / SQLite

- Migration: neue Spalte `stickies TEXT NOT NULL DEFAULT '[]'` in `note_entries`
- `get_note_entries`: `stickies`-Feld in SELECT + zurückgeben
- `update_note_entry`: `stickies` im UPDATE durchschleifen
- TypeScript-Store: `parseEntry()` erweitern — `stickies: JSON.parse(raw.stickies ?? '[]')`

---

## Komponenten

### `StickyCanvas` (`src/components/notes/StickyCanvas.tsx`)

Overlay über dem Editor-Inhaltsbereich:

```
position: absolute, inset: 0, pointer-events: none, z-index: 10
```

- Rendert alle `StickyNote[]` der aktuellen Notiz
- Gibt `onUpdate(stickies)` nach oben wenn sich etwas ändert
- Nimmt `onAdd`-Callback entgegen (vom Toolbar-Button ausgelöst)

### `StickyCard` (`src/components/notes/StickyCard.tsx`)

Einzelner Zettel:

```
position: absolute
left: note.x, top: note.y
pointer-events: auto
width: 220px
```

**Aufbau:**
1. **Header** — Drag-Handle (cursor: grab), Farbpalette (6 Presets), Delete-Button
2. **Titel** — `<input>` einzeilig, `font-weight: 600`
3. **Text** — `<textarea>` mehrzeilig, `resize: none`, wächst mit Inhalt
4. **Checkliste** — Liste von `StickyCheck`-Items mit Checkbox + Label-Input, "+ Punkt" am Ende

**Farb-Presets:**
```ts
const STICKY_COLORS = [
  '#FFF176',  // gelb
  '#F48FB1',  // rosa
  '#81D4FA',  // hellblau
  '#A5D6A7',  // grün
  '#CE93D8',  // lila
  '#FFCC80',  // orange
]
```

**Drag:**
- `onMouseDown` auf den Header → `dragging = true`, Offset berechnen
- `onMouseMove` auf `window` → Position aktualisieren
- `onMouseUp` auf `window` → `dragging = false`, `onPositionChange(id, x, y)` aufrufen

### Integration in `NoteEditor` (in `CustomerNotesPane.tsx`)

- Editor-Wrapper bekommt `position: relative`
- `StickyCanvas` als Sibling zu `<EditorContent>`
- Toolbar: neuer "＋ Zettel"-Button ganz rechts
- Neuer Zettel erscheint bei `x: 40 + stickies.length * 20, y: 40 + stickies.length * 20` (gestaffelt)

---

## Datenspeicherung

Auto-Save via bestehendem `onUpdate`-Callback mit gleichem 600ms-Debounce:

```ts
debouncedUpdate({ stickies: JSON.stringify(stickies) })
```

Änderungen die sofort sparen (kein Debounce nötig): Position nach Drop, Löschen eines Zettels.

---

## Was nicht enthalten ist

- Resize-Handle (Zettel haben feste Breite 220px)
- Z-Index-Stacking beim Klick (alle Zettel gleiche Ebene)
- Zettel zwischen Notizen kopieren/verschieben
