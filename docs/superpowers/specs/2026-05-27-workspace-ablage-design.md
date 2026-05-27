# Workspace-Ablage — Design Spec
*Datum: 2026-05-27*

## Zusammenfassung

Eine Workspace-weite Dateiablage mit Ordnerstruktur, automatischer Invoice-Ablage und In-App-PDF-Viewer. Dateien werden lokal auf Disk gespeichert (SQLite-Eintrag + Datei im App-Datenordner). Die bestehende kundenbezogene Ablage (DateienPane/AblagePane) bleibt unverändert.

---

## 1. Datenbank (SQLite, Migration v14)

Zwei neue Tabellen, vollständig isoliert von den bestehenden `folders`/`files` (die weiterhin per `account_id` kundengebunden bleiben).

```sql
CREATE TABLE workspace_folders (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name         TEXT NOT NULL,
    parent_id    TEXT REFERENCES workspace_folders(id) ON DELETE CASCADE,
    created_at   TEXT NOT NULL
);
CREATE INDEX idx_ws_folders_workspace ON workspace_folders(workspace_id, name);

CREATE TABLE workspace_files (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    folder_id    TEXT REFERENCES workspace_folders(id) ON DELETE SET NULL,
    name         TEXT NOT NULL,
    path         TEXT NOT NULL,      -- absoluter lokaler Dateipfad
    size         INTEGER,
    mime_type    TEXT,
    source_type  TEXT NOT NULL DEFAULT 'manual',  -- 'manual' | 'invoice' | 'offer'
    source_id    TEXT,               -- invoice_id / offer_id (nullable)
    created_at   TEXT NOT NULL
);
CREATE INDEX idx_ws_files_workspace ON workspace_files(workspace_id, folder_id);
CREATE INDEX idx_ws_files_source    ON workspace_files(source_type, source_id);
```

Dateien werden gespeichert unter:
`{app_data_dir}/cynera/ws_files/{workspace_id}/{file_id}/{filename}`

---

## 2. Rust Backend

### Neues Modul: `src-tauri/src/db/workspace_ablage.rs`

Structs:
- `WorkspaceFolder { id, workspace_id, name, parent_id, created_at }`
- `WorkspaceFile { id, workspace_id, folder_id, name, path, size, mime_type, source_type, source_id, created_at }`
- `CreateWsFolderPayload { workspace_id, name, parent_id? }`

DB-Funktionen:
- `get_ws_folders(conn, workspace_id) -> Vec<WorkspaceFolder>`
- `create_ws_folder(conn, payload) -> WorkspaceFolder`
- `delete_ws_folder(conn, id) -> ()` — ON DELETE CASCADE löscht Kind-Ordner
- `get_ws_files(conn, workspace_id, folder_id?) -> Vec<WorkspaceFile>`
- `add_ws_file(conn, payload) -> WorkspaceFile`
- `delete_ws_file(conn, id) -> ()`
- `ensure_invoice_folder_path(conn, workspace_id, year, month) -> String` — gibt `folder_id` zurück, legt Ordner an falls nicht vorhanden (`Rechnungen → {Jahr} → {Monat}`)

### Neues Modul: `src-tauri/src/commands/workspace_ablage.rs`

| Command | Eingabe | Ausgabe |
|---------|---------|---------|
| `cmd_get_ws_folders` | `workspace_id: String` | `Vec<WorkspaceFolder>` |
| `cmd_create_ws_folder` | `workspace_id, name, parent_id?` | `WorkspaceFolder` |
| `cmd_delete_ws_folder` | `id: String` | `()` |
| `cmd_get_ws_files` | `workspace_id, folder_id?` | `Vec<WorkspaceFile>` |
| `cmd_import_ws_file` | `workspace_id, folder_id?, name, data: Vec<u8>, mime_type?` | `WorkspaceFile` |
| `cmd_delete_ws_file` | `id: String` | `()` |
| `cmd_read_ws_file` | `id: String` | `Vec<u8>` (Bytes für Viewer) |
| `cmd_save_invoice_to_ablage` | `workspace_id, invoice_id, invoice_number, account_name, invoice_date (ISO), pdf_data: Vec<u8>` | `WorkspaceFile` |

`cmd_save_invoice_to_ablage` macht intern:
1. `ensure_invoice_folder_path(ws_id, year, month)` aus `invoice_date`
2. Dateiname: `{invoice_number}_{account_name}.pdf` (Sonderzeichen bereinigt)
3. Schreibt Bytes auf Disk
4. Fügt `workspace_files`-Eintrag mit `source_type='invoice'`, `source_id=invoice_id` ein

### `src-tauri/src/main.rs`

Alle neuen Commands werden in `tauri::Builder::invoke_handler` registriert.

---

## 3. Frontend-Typen

### `src/types/workspace-ablage.types.ts`

```ts
export interface WorkspaceFolder {
  id: string
  workspaceId: string
  name: string
  parentId: string | null
  createdAt: string
}

export interface WorkspaceFile {
  id: string
  workspaceId: string
  folderId: string | null
  name: string
  path: string
  size: number | null
  mimeType: string | null
  sourceType: 'manual' | 'invoice' | 'offer'
  sourceId: string | null
  createdAt: string
}

export interface CreateWsFolderPayload {
  workspaceId: string
  name: string
  parentId?: string | null
}
```

---

## 4. Frontend-Service

### `src/services/workspace-ablage.service.ts`

Wrappet alle `invoke`-Calls 1:1 auf die Rust-Commands.

---

## 5. Frontend-Store

### `src/store/workspace-ablage.store.ts`

Zustand (Zustand-Pattern wie `files.store.ts`):
- `folders: WorkspaceFolder[]`
- `files: WorkspaceFile[]`
- `activeFolderId: string | null`
- `isLoading: boolean`
- `error: AppError | null`

Actions:
- `load(workspaceId)` — lädt alle Ordner, dann Dateien von activeFolderId
- `selectFolder(id | null)` — setzt activeFolderId, lädt Dateien
- `createFolder(payload)` — erstellt, aktualisiert lokale Liste
- `removeFolder(id)` — löscht, bereinigt State
- `importFile(params)` — importiert Datei (manuelle Uploads)
- `removeFile(id)` — löscht Eintrag
- `readFile(id): Promise<Uint8Array>` — liest Bytes für Viewer

---

## 6. UI-Komponenten

### `src/routes/AblageRoute.tsx`

Top-Level-Route. Layout:

```
┌──────────────────────────────────────────────────────────┐
│ Ablage.                              [+ Datei] [+ Ordner] │
├──────────────────┬───────────────────────────────────────┤
│  ORDNER          │  [Ordner-Breadcrumb]                  │
│  📁 Alle         │                                       │
│  📁 Rechnungen ▶ │  3-spaltige Grid:                     │
│    📁 2026 ▶     │  ┌────────┐ ┌────────┐ ┌────────┐    │
│      📁 Mai      │  │  📄    │ │  📄    │ │  📎    │    │
│  📁 Angebote     │  │ RE-001 │ │ RE-002 │ │ doc.pdf│    │
│  [+ Ordner]      │  │ 45 KB  │ │ 48 KB  │ │ 12 KB  │    │
│                  │  └────────┘ └────────┘ └────────┘    │
└──────────────────┴───────────────────────────────────────┘
```

Sidebar zeigt den Ordner-Baum (rekursiv via `parentId`). Klick auf Ordner setzt `activeFolderId`.

Aktionen:
- `+ Ordner`: Inline-Input im Sidebar, erstellt Unterordner im aktiven Ordner
- `+ Datei`: File-Input, importiert Datei in aktiven Ordner
- Ordner-Hover: Löschen-Button (mit Bestätigung, da CASCADE)
- Datei-Hover: Vorschau-Button + Löschen-Button

### `src/components/ablage/FilePreviewModal.tsx`

Overlay-Modal für Dateivorschau:
- Lädt Bytes via `store.readFile(id)`
- Für PDFs und Bilder: `URL.createObjectURL(new Blob([bytes], { type: mimeType }))` → `<iframe>` (full-height)
- Für andere: Icon + Dateiname + Metadaten
- Fußzeile: `[Herunterladen]` (Blob-URL als `<a download>`) + `[Schließen]`
- Cleanup: `URL.revokeObjectURL(url)` beim Unmount

### Sidebar-Eintrag (NavSidebar.tsx)

Neuer Eintrag unter der Workspace-Sektion:
```tsx
<SidebarNavItem
  icon={FolderOpen}
  label="Ablage"
  active={appView === 'ablage'}
  onClick={() => setAppView('ablage')}
  kbd="A"
/>
```

`AppView`-Typ in `ui.store.ts` bekommt `'ablage'` als neuen Wert.

---

## 7. Automatische Invoice-Ablage

### Auslösepunkt: Rechnung freigeben (`open`-Status)

In `FinanceRoute.tsx` beim `updateInvoiceStatus(inv.id, 'open')`:

```ts
// Nach Status-Update:
const full = await FinanceService.getInvoice(inv.id)
const acc  = accounts.find(a => a.id === inv.accountId)
if (acc && full.number) {
  const pdfBytes = await generateInvoicePdfBytes(full, profile, acc) // neuer Helper
  await WorkspaceAblageService.saveInvoiceToAblage({
    workspaceId,
    invoiceId: inv.id,
    invoiceNumber: full.number,
    accountName: acc.name,
    invoiceDate: full.date,
    pdfData: Array.from(pdfBytes),
  })
}
```

Gleiche Logik beim Konvertieren Angebot → Rechnung (`convertOfferToInvoice`).

### PDF-Bytes-Generierung

Die bestehende `downloadInvoicePDF`-Funktion erzeugt einen Browser-Download. Ein neuer Helper `generateInvoicePdfBytes()` gibt stattdessen die rohen Bytes zurück (gleicher PDF-Aufbau, kein automatischer Download). Die bestehende Download-Funktion nutzt diesen Helper intern.

---

## 8. Fehlerbehandlung

- Ordner-Erstellung fehlgeschlagen: Toast-Fehler, State unverändert
- Datei zu groß (> 50 MB): Fehlermeldung im UI vor dem Import
- Datei-Lesen fehlgeschlagen (Viewer): Fehler-Banner im Modal
- Invoice-Ablage fehlgeschlagen: Silent fallback (Rechnung wird trotzdem freigegeben, kein harter Fehler)

---

## 9. Nicht im Scope

- Synchronisation der Workspace-Ablage über Supabase (lokal-only)
- Verschachtelung > 3 Ebenen tief (keine UI-Einschränkung, aber empfohlen)
- Umbenennen von Ordnern/Dateien (kann später ergänzt werden)
- Volltextsuche in Dateien
- Tagging / Metadaten-Filter

---

## 10. Dateipfade & Migrations-Version

- Disk-Speicherort: `{app_data_dir}/cynera/ws_files/{workspace_id}/{file_id}/{filename}`
- Migration: Version 14 (aktuell: 13)
- Neue `AppView`: `'ablage'`
