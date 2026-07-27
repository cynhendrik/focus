# Projekt-Modul-Ausbau — Etappe 5: Moodboard

## Kontext

Etappe 1-4 (Datenmodell + Timeline-Übersicht, Detail-Kopf + Tabs + Cockpit, Phasen-Tab mit Gates + Deliverables, Team-Zuweisung) sind gemergt bzw. per PR eingereicht (PR #5, #6, #7, #8). `ProjectDetailRoute.tsx` hat aktuell zwei Tabs (`'cockpit' | 'phasen'`) -- ein Moodboard-Tab existiert noch nicht (der `ui.store.ts`-Kommentar aus Etappe 2 sagt es bereits voraus: "Moodboard/Team/Rechnungen kommen erst als Tab dazu, wenn ihre jeweilige Etappe tatsächlich gebaut wird").

Der externe Design-Prototyp (`project-moodboard.jsx`) zeigt ein freies Canvas mit Bild-/Farb-/Typo-/Notiz-Kacheln, dazu Kunden-Freigabe-Link, Reaktionen, Kommentare und eine KORA-Feedback-Zusammenfassung. Diese Etappe (5 von 6) baut ausschließlich das freie Canvas -- die kundenseitigen Bausteine bleiben eine eigene, spätere Initiative (das war bereits im ursprünglichen 6-Etappen-Plan so vermerkt: "Moodboard (freies Canvas; Kunden-Freigabe-Link separat/später)").

Ein zusätzlich bereits gebrainstormtes Feature, "Snip-to-Board" (globaler Tastatur-Shortcut → Screenshot-Overlay → Bild landet direkt im Board, siehe `docs/superpowers/specs/2026-07-26-moodboard-snip-to-board-design.md`), ist ebenfalls nicht Teil dieser Etappe -- es baut auf dem Canvas als Ziel auf und kommt als eigener Zusatzbaustein danach.

## Ziel dieser Etappe

- Neuer Tab "Moodboard" im Projekt-Detail, ein Board pro Projekt.
- Freies Canvas: Kacheln vom Typ Bild, Farbe, Typo, Notiz, frei positionierbar (Drag), feste Default-Größe pro Typ.
- Echte Bilder (kein Platzhalter-Text) -- inklusive echtem Cloud-Sync für geteilte Workspaces über einen neuen Supabase-Storage-Bucket.

**Explizit nicht Teil dieser Etappe:**
- Kunden-Freigabe-Link, externe (unauthentifizierte) Ansicht, Reaktionen (👍/👎), Kommentare, KORA-Feedback-Zusammenfassung -- eigene, spätere Initiative.
- Snip-to-Board (globaler Screenshot-Shortcut) -- eigene, spätere Runde, sobald das Canvas als Ziel existiert.
- "Link"-Kachel-Typ -- im Prototyp nur passiv gerendert (vorbefüllte Beispieldaten), nicht über die "Hinzufügen"-Leiste erzeugbar. Nur Bild/Farbe/Typo/Notiz sind aktiv hinzufügbar.
- Kachel-Rotation und -Resize -- der Prototyp implementiert nur Drag-Verschieben (feste Default-Größe pro Typ beim Hinzufügen), kein Resize-Griff.
- Mehrere Boards pro Projekt -- ein Board pro Projekt, wie im Prototyp-Code (`p.mood` ist ein einzelnes Objekt, kein Array).
- Cockpit-/Timeline-Sichtbarkeit des Moodboards (z.B. Stimmungs-Ampel aus Reaktionen) -- bleibt an die spätere Kunden-Feedback-Initiative gekoppelt, da ohne echte Reaktionen keine echte Datengrundlage bestünde.

## Design-Entscheidungen

**`moodboard_items` als JSON-Array-Feld, nicht eigene Tabelle.** Folgt dem `deliverables`/`assignee_ids`-Muster aus Etappe 3/4: `projects.moodboard_items TEXT NOT NULL DEFAULT '[]'`, Rust reicht den String roh durch (nur JSON-Boundary-Validierung). Die Komponente hält die Position während des Ziehens lokal im State und persistiert die komplette Liste erst beim Loslassen (ein Netzwerk-Call pro Drag-Vorgang, nicht pro Pixel) -- entspricht dem tatsächlichen Interaktionsmuster im Prototyp (`onGrab`/`pointermove`/`pointerup`).

**Bild-Bytes leben außerhalb der JSON-Spalte.** Eine Bild-Kachel speichert nur `{ storageKey: string }` (Format `{projectId}/{itemId}.{ext}`) im JSON-Item, keine Bytes. Die tatsächlichen Bilddaten liegen je nach Workspace-Typ an unterschiedlichem Ort, werden aber über denselben Frontend-Render-Pfad angezeigt (Byte-Quelle → `Blob` → `URL.createObjectURL`), wie es das bestehende Muster in `DateienPane.tsx` bereits vormacht:
- **Lokal (nicht geteilter Workspace):** `app_data_dir/cynera/moodboard/{workspaceId}/{storageKey}` auf der Festplatte, Lese-Zugriff über einen neuen Tauri-Command (analog `cmd_read_file`).
- **Cloud (geteilter Workspace):** neuer privater Supabase-Storage-Bucket `moodboard-images`. RLS-Policy auf `storage.objects` prüft Workspace-Mitgliedschaft (Pfad-Präfix `{workspaceId}/...` gegen `workspace_members` abgeglichen, analog zu den bestehenden Postgres-RLS-Policies). Zugriff über `supabase.storage.from('moodboard-images').download(storageKey)`.

Das ist ein echter, funktionierender Cloud-Bild-Sync (keine Value-Lüge: ein von Person A hochgeladenes Bild ist für Person B in einem geteilten Workspace tatsächlich sichtbar), im Gegensatz zum aktuellen Platzhalter-Zustand ("Bild-Upload folgt in einer späteren Runde").

**Datei-Auswahl über das bestehende Muster.** Verstecktes `<input type="file" accept="image/*">` + Ref, programmatisch getriggert -- wie bereits in `DateienPane.tsx`, `ComposeModal.tsx`, `CreateCampaignModal.tsx` etabliert. Kein neues Dialog-Plugin nötig.

**Keine Vortäuschung von Kunden-Feedback.** Da Reaktionen/Kommentare/Freigabe-Link nicht Teil dieser Etappe sind, zeigt das Board ausschließlich die eigenen Kacheln -- keine erfundenen "Kunde hat reagiert"-Zähler, keine leeren Kommentar-Bereiche, die nach unvollständiger Funktion aussehen.

## Datenmodell

### `projects` — additive Migration (SQLite v41 / Supabase 0030)

| Spalte | Typ | Default | Bedeutung |
|---|---|---|---|
| `moodboard_items` | TEXT | `'[]'` | JSON-Array von Kacheln, Struktur siehe unten |

### TypeScript

```typescript
export type MoodboardItemKind = 'image' | 'color' | 'type' | 'note'

export interface MoodboardItemBase {
  id: string
  kind: MoodboardItemKind
  x: number  // Prozent, 0-100
  y: number  // Prozent, 0-100
  w: number  // Prozent
  h: number  // Prozent
  cap: string  // Kachel-Beschriftung ("Neues Bild", "Palette", ...)
}

export interface MoodboardImageItem extends MoodboardItemBase {
  kind: 'image'
  storageKey: string | null  // null = Kachel angelegt, aber noch kein Bild hochgeladen
}

export interface MoodboardColorItem extends MoodboardItemBase {
  kind: 'color'
  colors: string[]  // Hex/oklch-Strings
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

`Project.moodboardItems: MoodboardItem[]` (bereits geparst -- Mapper macht `JSON.parse(row.moodboard_items ?? '[]')` beim Lesen, analog zu `parseDeliverables`/`parseAssigneeIds`).

### Rust (`src-tauri/src/db/project.rs`)

- `Project.moodboard_items: String` (roh, unverändert durchgereicht).
- `update_moodboard_items(conn, id, moodboard_items_json: String) -> Result<Project, AppError>`: validiert nur, dass es sich um gültiges JSON handelt, sonst `AppError::Validation`. Speichert den String roh -- identisches Muster zu `update_deliverables`.

### Bild-Speicherung

- Neuer Tauri-Command `cmd_read_moodboard_image(workspace_id, storage_key) -> Vec<u8>`: liest die Datei unter `app_data_dir/cynera/moodboard/{workspace_id}/{storage_key}`, mit Pfad-Guard gegen Verzeichnis-Traversal (analog `cmd_read_file`'s Pfad-Guard-Konvention).
- Neuer Tauri-Command `cmd_save_moodboard_image(workspace_id, storage_key, bytes: Vec<u8>) -> ()`: schreibt die Datei an denselben Pfad, legt Verzeichnisse bei Bedarf an.
- Supabase-Storage-Bucket `moodboard-images` (privat) + RLS-Policy auf `storage.objects`, die den Zugriff auf Pfade `{workspace_id}/...` auf Mitglieder dieses Workspace beschränkt (Bucket-Erstellung + Policy als SQL-Migration, analog zu bestehenden RLS-Migrationen).

## UI

### Neuer Tab "Moodboard"

`ProjectTab`-Typ erweitert um `'moodboard'`. Tab erscheint in der bestehenden `TabBar` neben Cockpit/Phasen.

### Canvas

- Freies Canvas (prozentuale Positionierung, wie im Prototyp), Kacheln per Griff (oben, mit Beschriftung) verschiebbar.
- Seitenleiste "Hinzufügen": vier Buttons (Bild/Farbe/Typo/Notiz), fügen eine neue Kachel mit Default-Werten an fester Startposition hinzu.
- Bild-Kachel ohne hochgeladenes Bild: zeigt einen Platzhalter mit "Bild auswählen"-Button (öffnet `<input type="file">`), NICHT einen für immer leeren Platzhalter-Text -- der Button führt zu einer echten Funktion.
- Entfernen-Icon pro Kachel (kein Zwei-Klick-Bestätigen nötig, da unkritischer als Phasen-Löschen -- Kachel jederzeit neu hinzufügbar).
- Farb-Kachel: zeigt die hinterlegten Farbfelder als kleine Farbmuster nebeneinander.
- Typo-Kachel: zeigt eine Schriftprobe + Notiz-Text.
- Notiz-Kachel: einfaches Textfeld, inline editierbar.

## Testing

- Rust-Unit-Tests (`db/project.rs`): `update_moodboard_items` (Erfolg mit gültigem JSON, Ablehnung bei ungültigem JSON), Migrations-Backfill-Test, neue Bild-Commands (`cmd_read_moodboard_image`/`cmd_save_moodboard_image`: Erfolg, Pfad-Traversal-Ablehnung, Datei-nicht-gefunden).
- Frontend-Unit-Tests: Mapper-Parsing/Serialisierung von `moodboardItems` (alle vier Kachel-Typen), neue Store-Action (`updateMoodboardItems`, `uploadMoodboardImage`).
- Komponenten-Tests: Kachel hinzufügen (alle vier Typen), Kachel verschieben (Drag-Simulation), Kachel entfernen, Bild-Kachel ohne Bild zeigt Auswahl-Button, Bild-Kachel mit Bild zeigt das Bild.

## Offene Punkte für spätere Etappen

- Kunden-Freigabe-Link, Reaktionen, Kommentare, KORA-Feedback-Zusammenfassung -- eigene Initiative.
- Snip-to-Board -- eigene Runde, siehe `docs/superpowers/specs/2026-07-26-moodboard-snip-to-board-design.md`.
- Stimmungs-Ampel im Cockpit aus echten Kunden-Reaktionen -- erst möglich, wenn die Kunden-Feedback-Initiative existiert.
