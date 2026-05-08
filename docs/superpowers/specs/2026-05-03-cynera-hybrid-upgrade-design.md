# Cynera Hybrid Upgrade — Design Spec
**Date:** 2026-05-03  
**Status:** Approved

## Vision

Cynera wird von einem reinen CRM zu einem **hybriden CRM + persönlichen Workspace** ausgebaut. Ziel: Notion/Obsidian für Freelancer und Agenturen outperformen — durch tiefere Kundenintegration, die keine der beiden Tools bietet.

Umsetzung in 4 Phasen, jeweils in sich abgeschlossen.

---

## Phase 1 — Store-Refactor + Tauri Filesystem

### Problem
Dateien werden als Base64 im Zustand-Blob gespeichert (localStorage, Key `cynera-os-v3`). Das localStorage-Limit (~5–10 MB) führt bei wenigen PDFs zum stillen Datenverlust. Jeder State-Update serialisiert den gesamten Blob inkl. aller Binärdaten.

### Lösung: Zwei-Schichten-Speicher

**Zustand (bleibt):** `customers`, `todos`, `notes`, `kpis`, `folders`, `uploadedFiles` (nur Metadaten)

**Tauri Filesystem (neu):**
```
AppData/cynera/
  files/
    {customerId}/{fileId}.{ext}
  workspace-files/
    {fileId}.{ext}
```

**`uploadedFiles`-Schema-Änderung:**
- Entfernt: `data` (Base64)
- Neu: `tauriPath: string` (relativer Pfad in AppData)

**Migration:** Beim ersten App-Start werden vorhandene Base64-Dateien einmalig auf Disk geschrieben und das `data`-Feld aus dem Store entfernt.

### Store-Refactoring

Der monolithische Store (`src/store/index.js`) wird in drei Slices aufgeteilt:

- **`dataSlice`** — customers, todos, notes, kpis, folders, uploadedFiles
- **`uiSlice`** — selectedId, activeTab, selectedNoteId, customerView, theme
- **`filesSlice`** — Tauri-FS-Operationen (readFile, writeFile, deleteFile)

Gefilterte Listen (z.B. `getTodos(customerId)`) werden mit `useMemo` in den Komponenten abgesichert statt bei jedem Render neu berechnet.

---

## Phase 2 — Dashboard

### Dashboard (ersetzt Skeleton)

Vier KPI-Karten (aggregiert aus Store, keine neue Logik):
1. Offene Todos (alle Kunden)
2. Aktive Kunden (updatedAt < 30 Tage)
3. Fällig heute (todos mit due = today)
4. Notizen gesamt

Zwei Panels:
- **Letzte Aktivitäten** — kombinierter Feed aus `updatedAt`-Timestamps aller Entitäten, absteigend sortiert
- **High Priority Todos** — prio=high + overdue, quer über alle Kunden

**Hinweis:** Der Editor-Upgrade (Custom-Regex → Tiptap) findet direkt in Phase 4 statt. Ein Zwischenschritt mit react-markdown würde in Phase 4 direkt wieder rausgeworfen — unnötiger Rework.

---

## Phase 3 — Persönlicher Workspace

### Navigation

Sidebar bekommt eine horizontale Trennlinie. Unterhalb: feste Workspace-Sektion mit zwei Einträgen.

```
── KUNDEN ──────────────────
  Müller GmbH          [3]
  Tech AG
  Weber KG
  + Neuer Kunde

────────────────────────────

── WORKSPACE ───────────────
  📓 Meine Notizen     [4]
  ✓  Meine Todos       [2]
```

### Datenmodell

Kein Schema-Umbau nötig. `todos.customerId = null` und `notes.customerId = null` kennzeichnen persönliche Einträge. Bestehende Filter in Store-Selektoren werden um `null`-Case erweitert.

### Views

- **Meine Notizen** — identischer `NotesPane`, aber gefiltert auf `customerId = null`. TopBar zeigt "Persönlicher Workspace" statt Kundenname.
- **Meine Todos** — identischer `TodoPane`, gefiltert auf `customerId = null`. Erscheinen nicht im Kunden-PrioritySideboard.

### ⌘K-Palette-Erweiterung

Neue Sektion "Workspace":
- Neue persönliche Notiz
- Neues persönliches Todo
- Zu Meine Notizen navigieren
- Zu Meine Todos navigieren

---

## Phase 4 — Rich-Editor (Slash-Commands + Backlinks + Suche)

### Editor-Engine

Ersatz des Custom-Regex-Parsers in `NotesPane.jsx` direkt durch **Tiptap** (ProseMirror-basiert) — kein Zwischenschritt über react-markdown:
- `@tiptap/react` + `@tiptap/starter-kit`
- `@tiptap/extension-slash-commands` — `/`-Menü im Editor
- `@tiptap/extension-mention` — für `[[Backlinks]]`

### Slash-Commands (`/`)

Verfügbare Befehle im Editor:
| Befehl | Ergebnis |
|---|---|
| `/h1`, `/h2`, `/h3` | Überschriften |
| `/bullet`, `/numbered` | Listen |
| `/code` | Code-Block |
| `/table` | Tabelle (2×2) |
| `/quote` | Blockquote |
| `/divider` | Trennlinie |
| `/todo` | Checkbox-Zeile |

### Backlinks (`[[...]]`)

Mention-Extension konfiguriert für `[[`-Trigger. Dropdown zeigt:
- Alle Notizen des aktuellen Kunden
- Alle persönlichen Notizen (Workspace)
- Alle Kundennamen (verlinkt auf Kundenansicht)

Gespeichert als strukturiertes JSON-Objekt im Tiptap-Dokument. `content`-Feld im Store bleibt `string`, speichert `JSON.stringify(editor.getJSON())`. Bestehende Notizen (Markdown-Text) werden beim ersten Öffnen via Tiptap's `@tiptap/extension-markdown` importiert und einmalig als JSON resaved.

### Volltextsuche

`⌘K`-Palette bekommt eine neue "Notizen"-Sektion (existiert bereits rudimentär), ausgebaut auf:
- Suche in `note.title` + `note.content` (inkl. Workspace-Notizen)
- Ergebnis zeigt: Titel, Kunde/Workspace, Vorschau-Snippet mit Highlight
- Tastaturnavigation mit `↑↓ Enter`

### Tags

Bestehende Tags (`meeting`, `telefon`, `email`, etc.) bleiben. Neu:
- Tag-Filter-Leiste über der Notizliste (horizontale Chips)
- Multi-Select möglich
- Persönlicher Workspace und CRM-Notizen haben separate Tag-Ansichten

---

## Architektur-Entscheidungen

| Thema | Entscheidung | Grund |
|---|---|---|
| Datei-Storage | Tauri `fs` API | Kein localStorage-Limit, native Performance |
| Editor | Tiptap (direkt, kein react-markdown-Zwischenschritt) | Kein Rework; Slash-Commands + Mentions out-of-the-box; Markdown-Import für Bestandsnotizen |
| State | Zustand Slices | Minimal-Änderung am bestehenden Pattern, keine neue Bibliothek |
| Workspace-Daten | `customerId = null` | Kein Schema-Umbau, sofort kompatibel |
| Backlink-Format | Tiptap JSON | Strukturiert, erweiterbar, kein Regex-Parsing |

---

## Was nicht in Scope ist

- Cloud-Sync / Backend-API (bleibt lokal)
- Mobile / responsive Design
- Graph-View (Obsidian-Stil) — zu komplex für diese Phase
- TypeScript-Migration — separates Vorhaben
- i18n — UI bleibt Deutsch
