# Notizen-Modul — Design Spec
**Datum:** 2026-06-05
**Status:** Approved

---

## Was wir bauen

Ein workspace-fähiges Notizen-System das customer-centric ist: jeder Kunde hat eine Timeline aus datierten Notizen sowie pinbare Dokumente (Proposals, Checklisten). Zwei Einstiegspunkte, eine Datenquelle.

---

## Einstiegspunkte

| Einstieg | Wo | Verhalten |
|---|---|---|
| Global | Sidebar → "Notizen" | Kundenliste links, Notizen rechts |
| Kontextuell | CustomerRoute → Tab "Notizen" | Direkt die Notizen des Kunden, keine Kundenliste |

Beide Einstiegspunkte teilen exakt dieselbe `CustomerNotesPane`-Komponente. Die globale Ansicht rendert sie mit einer Kundenliste davor.

---

## UI-Struktur (Option C: Hybrid)

```
Globale Notizen-Route
├── CustomerNotesPanel        ← Kundenliste mit Suchfeld + Notiz-Count
└── CustomerNotesPane         ← Haupt-Ansicht (auch in CustomerRoute genutzt)
    ├── NotesHeader            ← Kundenname, Avatar, "+ Notiz" / "Dokument" Buttons
    ├── PinnedDocsRow          ← Chips für angeheftete Dokumente, "+ Dok." Button
    ├── NotesTimeline          ← Chronologisch nach Tag gruppiert
    │   ├── DayGroup           ← "Heute · 5. Juni", "3. Juni", …
    │   │   └── NoteCard       ← Aufklappbar, Inline-TipTap-Editor
    │   └── NewNoteForm        ← Inline-Formular (+ Notiz Button öffnet es)
    └── NoteDocModal           ← Vollbild-Modal für pinbare Dokumente
```

---

## Datenmodell

### Tabelle: `notes` (Timeline-Notizen)
```
id            TEXT PRIMARY KEY
workspace_id  TEXT NOT NULL
account_id    TEXT NOT NULL (FK → accounts)
title         TEXT          (optional)
content       TEXT          (TipTap HTML)
tags          TEXT          (JSON array, z.B. ["Follow-up", "Erstgespräch"])
created_by    TEXT NOT NULL
updated_by    TEXT
created_at    TEXT NOT NULL
updated_at    TEXT NOT NULL
pending_sync  INTEGER NOT NULL DEFAULT 0
```

### Tabelle: `note_docs` (Pinbare Dokumente)
```
id            TEXT PRIMARY KEY
workspace_id  TEXT NOT NULL
account_id    TEXT NOT NULL (FK → accounts)
title         TEXT NOT NULL
content       TEXT          (TipTap HTML)
created_by    TEXT NOT NULL
updated_by    TEXT
created_at    TEXT NOT NULL
updated_at    TEXT NOT NULL
pending_sync  INTEGER NOT NULL DEFAULT 0
```

Bewusst zwei Tabellen: Notizen sind timestamped Events, Dokumente sind benannte Artefakte. Unterschiedliche Query-Pattern und UI-Behandlung.

---

## Store

`useNotesModuleStore` ersetzt `notebook.store` (localStorage) vollständig:

```ts
// notes für eine account_id laden
loadForAccount(accountId: string): Promise<void>

// Timeline-Notizen
notes: Note[]
createNote(payload): Promise<void>
updateNote(id, patch): Promise<void>
deleteNote(id): Promise<void>

// Dokumente
docs: NoteDoc[]
createDoc(payload): Promise<void>
updateDoc(id, patch): Promise<void>
deleteDoc(id): Promise<void>
```

Kein `persist` — alles läuft über Tauri-Commands → SQLite → Sync-Queue → Supabase.

---

## Rust-Layer

### `src-tauri/src/db/notes.rs`
CRUD-Funktionen für beide Tabellen, schreibt bei INSERT/UPDATE in sync_queue.

### `src-tauri/src/commands/notes.rs`
```rust
get_notes_for_account(account_id, workspace_id) -> Vec<Note>
get_note_docs_for_account(account_id, workspace_id) -> Vec<NoteDoc>
create_note(payload) -> Note
update_note(id, patch) -> Note
delete_note(id) -> ()
create_note_doc(payload) -> NoteDoc
update_note_doc(id, patch) -> NoteDoc
delete_note_doc(id) -> ()
```

---

## Supabase-Tabellen

Identische Schema wie SQLite-Tabellen, mit RLS:
- `notes`: `workspace_id = auth.jwt() ->> 'workspace_id'`
- `note_docs`: gleiche Policy

---

## Komponenten

| Datei | Beschreibung |
|---|---|
| `src/routes/NotesRoute.tsx` | Globale Ansicht: CustomerNotesPanel + CustomerNotesPane |
| `src/components/notes/CustomerNotesPanel.tsx` | Kundenliste mit Suchfeld |
| `src/components/notes/CustomerNotesPane.tsx` | Hauptkomponente, auch in CustomerRoute |
| `src/components/notes/NoteCard.tsx` | Aufklappbare Notiz-Karte mit inline TipTap |
| `src/components/notes/NoteDocModal.tsx` | Vollbild-Dokument-Editor |
| `src/components/notes/PinnedDocsRow.tsx` | Angeheftete Dokument-Chips |
| `src/components/notes/NewNoteForm.tsx` | Inline-Erstellungsformular |
| `src/store/notes-module.store.ts` | Ersetzt notebook.store |

---

## Migration

`notebook.store` (localStorage `notebook-v1`) wird durch `notes-module.store` ersetzt.
`NotizPane.tsx` wird durch `CustomerNotesPane.tsx` ersetzt.
Alte Daten: localStorage-Daten gehen verloren (noch keine Nutzerdaten da, da neues Feature).

---

## Was nicht geändert wird

- `notes.store` + `NoteService` (Activity-basierte Gesprächsnotizen) — bleibt für Timeline/CockpitPane
- `private-notes.store` + `PrivateNotesRoute` — bleibt unverändert
- Alle anderen Stores und Routen
