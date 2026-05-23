# Mail — Dynamischer IMAP-Ordnerbaum Design Spec
**Datum:** 2026-05-23  
**Status:** Approved  
**Scope:** Sub-Projekt B — Dynamischer IMAP-Ordnerbaum mit On-Demand-Sync

---

## 1. Ziel

Die hardcodierten drei Ordner (`INBOX`, `Sent`, `UNASSIGNED`) durch einen dynamischen, aufklappbaren IMAP-Ordnerbaum ersetzen. Alle Ordner des Mail-Kontos werden angezeigt. Nicht-besuchte Ordner werden beim ersten Klick automatisch on-demand synchronisiert. Die Ordnerliste wird beim App-Start und alle 15 Minuten automatisch aktualisiert.

---

## 2. Datenmodell

### Neue Tabelle `folders` (emails.db, Migration v3)

```sql
CREATE TABLE IF NOT EXISTS folders (
    id           TEXT PRIMARY KEY,
    account_id   TEXT NOT NULL,
    path         TEXT NOT NULL,
    delimiter    TEXT NOT NULL DEFAULT '.',
    display_name TEXT NOT NULL,
    parent_path  TEXT,
    flags        TEXT NOT NULL DEFAULT '[]',
    is_selectable INTEGER NOT NULL DEFAULT 1,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    last_fetched_at TEXT,
    UNIQUE(account_id, path)
);

CREATE INDEX IF NOT EXISTS idx_folders_account ON folders(account_id);
```

**Felder:**
- `path` — vollständiger IMAP-Pfad, z.B. `INBOX.Projekte.Kunde-A`
- `delimiter` — Trennzeichen aus IMAP LIST response (`.` oder `/`)
- `display_name` — letztes Pfad-Segment, z.B. `Kunde-A`
- `parent_path` — `NULL` für Toplevel-Ordner
- `flags` — JSON-Array der IMAP-Attribute, z.B. `["\\HasChildren", "\\Sent"]`
- `is_selectable` — `0` wenn `\Noselect`-Flag gesetzt (Container-Ordner ohne E-Mails)

**`last_synced_uid` pro Ordner** wird nicht in dieser Tabelle gespeichert — wird live abgeleitet:
```sql
SELECT COALESCE(MAX(uid), 0) FROM emails WHERE account_id = ?1 AND folder = ?2
```

### TypeScript-Typ

```typescript
export interface MailFolder {
  id: string
  accountId: string
  path: string           // vollständiger IMAP-Pfad
  delimiter: string
  displayName: string
  parentPath: string | null
  flags: string[]
  isSelectable: boolean
  children?: MailFolder[] // nur im Frontend, nicht in DB
}
```

---

## 3. Backend (Rust / Tauri)

### Neue Datei: `src-tauri/src/email/folders.rs`

Enthält die IMAP-Ordner-Logik, getrennt von `imap.rs`.

```rust
pub struct RawFolder {
    pub path: String,
    pub delimiter: String,
    pub display_name: String,
    pub parent_path: Option<String>,
    pub flags: Vec<String>,
    pub is_selectable: bool,
}

/// Verbindet mit IMAP und holt alle Ordner via LIST "" *
pub async fn fetch_folders(
    email: &str,
    password: &str,
    host: &str,
    port: u16,
) -> Result<Vec<RawFolder>, String>
```

**Implementierungsdetails:**
- `session.list(None, Some("*"))` — listet alle Ordner
- `delimiter` aus IMAP-Antwort lesen (pro Mailbox vorhanden)
- `display_name` = letztes Segment nach Split auf `delimiter`
- `parent_path` = alles vor dem letzten `delimiter`, `None` wenn kein `delimiter` im Pfad
- `\Noselect`-Flag → `is_selectable = false`
- `sort_order` = Reihenfolge aus IMAP LIST (Server-seitig sortiert)

### Neue DB-Funktionen in `db.rs`

```rust
pub fn upsert_folders(conn: &Connection, account_id: &str, folders: &[RawFolder]) -> rusqlite::Result<()>
// INSERT OR REPLACE INTO folders — ersetzt veraltete Einträge komplett

pub fn get_folders(conn: &Connection, account_id: &str) -> rusqlite::Result<Vec<Folder>>
// SELECT * FROM folders WHERE account_id = ?1 ORDER BY sort_order

pub fn get_folder_last_uid(conn: &Connection, account_id: &str, folder: &str) -> rusqlite::Result<u32>
// SELECT COALESCE(MAX(uid), 0) FROM emails WHERE account_id = ?1 AND folder = ?2
```

### Aktualisierter `email_sync` Command

Neuer optionaler Parameter `folder`:

```rust
pub async fn email_sync(
    account_id: String,
    folder: Option<String>,      // NEU — None = INBOX + Sent (bisheriges Verhalten)
    customers_json: String,
    window: Window,
    db: State<'_, EmailDb>,
) -> Result<SyncResult, String>
```

**Logik:**
- `folder = None` → synct INBOX + auto-erkannten Sent-Ordner (rückwärtskompatibel)
- `folder = Some(path)` → synct nur diesen einen Ordner; `last_uid` aus `get_folder_last_uid`

### Neuer Tauri-Command: `email_list_folders`

```rust
pub async fn email_list_folders(
    account_id: String,
    db: State<'_, EmailDb>,
) -> Result<Vec<Folder>, String>
```

1. Account-Daten aus DB holen (IMAP-Host, Port, E-Mail)
2. Passwort aus Keychain
3. `folders::fetch_folders` aufrufen
4. `db::upsert_folders` → alte Einträge für `account_id` ersetzen
5. `db::get_folders` zurückgeben

**Bei IMAP-Fehler:** Cachedaten aus DB zurückgeben (kein Fehler nach oben propagieren — stale ist okay).

### `mod.rs` Ergänzung

```rust
pub mod folders;
```

### `main.rs` Ergänzung

```rust
email::commands::email_list_folders,
```

---

## 4. Frontend

### Neue Datei: `src/components/mail/FolderTree.tsx`

Eigenständige, zustandslose Komponente — rendert den Baum rekursiv.

```typescript
interface FolderTreeProps {
  folders: MailFolder[]        // bereits als Baum aufgebaut (children befüllt)
  selectedPath: string
  expandedPaths: Set<string>
  onSelect: (folder: MailFolder) => void
  onToggle: (path: string) => void
}
```

**Spezial-Icons** für bekannte Ordner-Typen (aus `flags` oder `path`):
- `\Inbox` oder path === 'INBOX' → 📥
- `\Sent` → 📤
- `\Drafts` → 📝
- `\Trash` → 🗑
- `\Junk` / `\Spam` → ⚠️
- Alle anderen → 📁

**Aufklapp-Logik:**
- Ordner mit `children.length > 0` → zeigt `▶`/`▼`-Chevron
- `\Noselect`-Ordner (`isSelectable = false`) → klickbar nur für expand/collapse, nicht für Ordner-Navigation
- Unterordner werden mit `paddingLeft: depth * 12px` eingerückt

### Store-Erweiterungen (`mail.store.ts`)

```typescript
// State
folders: MailFolder[]
expandedFolders: Set<string>    // in localStorage unter 'mail-expanded-folders-v1' persistiert
foldersLastFetched: number      // Unix-Timestamp in ms
isFolderLoading: boolean

// Actions
loadFolders: (accountId: string) => Promise<void>
toggleFolder: (path: string) => void
```

**`loadFolders`:**
1. `email_list_folders(accountId)` aufrufen
2. Flat-Liste → Baum transformieren (via `parent_path`)
3. Bekannte Spezialordner (INBOX, Sent) an den Anfang sortieren
4. `set({ folders, foldersLastFetched: Date.now() })`

**Flat → Tree Transformation:**
```typescript
function buildTree(flat: MailFolder[]): MailFolder[] {
  const byPath = new Map(flat.map(f => [f.path, { ...f, children: [] }]))
  const roots: MailFolder[] = []
  for (const folder of byPath.values()) {
    if (folder.parentPath && byPath.has(folder.parentPath)) {
      byPath.get(folder.parentPath)!.children!.push(folder)
    } else {
      roots.push(folder)
    }
  }
  return roots
}
```

**`selectFolder` (bestehend, erweitert):**
- Prüft `get_folder_last_uid` implizit via: wenn `emails.length === 0` nach `loadEmails`, löst automatisch `sync({ folder: path })` aus
- Setzt `isFolderLoading: true` während on-demand Sync läuft

### Änderungen in `MailRoute.tsx`

**Entfernt:**
```typescript
const FOLDERS = [...]  // komplette Konstante weg
```

**Hinzugefügt:**
- `FolderTree`-Komponente in der linken Sidebar statt der hardcodierten Liste
- `useEffect` mit 15-Min-Timer für `loadFolders`:
```typescript
useEffect(() => {
  if (!selectedAccountId) return
  loadFolders(selectedAccountId)
  const interval = setInterval(() => {
    loadFolders(selectedAccountId)
  }, 15 * 60 * 1000)
  return () => clearInterval(interval)
}, [selectedAccountId])
```
- **"Nicht zugeordnet"-Filter** als fixierter Eintrag oberhalb des Ordnerbaums (bleibt erhalten, path = `'UNASSIGNED'`)
- Timestamp-Anzeige unter dem Sync-Button: `Zuletzt: vor N Min.`

### Neue TypeScript-Funktion in `mail.service.ts`

```typescript
listFolders: (accountId: string): Promise<MailFolder[]> =>
  invoke('email_list_folders', { accountId })
```

---

## 5. Fehlerbehandlung

| Szenario | Verhalten |
|---|---|
| IMAP nicht erreichbar bei `loadFolders` | Gecachte Ordner aus DB anzeigen, kein Fehler-Banner |
| On-demand Sync für neuen Ordner schlägt fehl | `isFolderLoading: false`, kurze Fehlermeldung in Mittelspalte |
| Ordner ist leer (0 E-Mails nach Sync) | Leerer Zustand in Mittelspalte — kein Retry |
| `\Noselect`-Ordner angeklickt | Nur expand/collapse, kein Sync-Trigger |
| Unbekannter Delimiter | Aus `folders.delimiter` gelesen, nie hardcodiert |
| Keine Ordner in DB (erstes Laden) | `loadFolders` zeigt Lade-Spinner, dann Baum |

---

## 6. Out of Scope

- Ordner erstellen / umbenennen / löschen via IMAP
- Unread-Badge-Zähler pro Ordner (erfordert `STATUS`-Command pro Ordner — teuer)
- E-Mails zwischen Ordnern verschieben (IMAP MOVE/COPY)
- IMAP IDLE (Push-Benachrichtigungen für neue E-Mails)
- Sync aller Ordner auf einmal (kein "Alles synchronisieren")

---

## 7. Dateistruktur (neu/geändert)

```
src-tauri/src/email/folders.rs          NEU — fetch_folders via IMAP LIST
src-tauri/src/email/db.rs               +upsert_folders, +get_folders, +get_folder_last_uid
src-tauri/src/email/commands.rs         +email_list_folders, email_sync +folder param
src-tauri/src/email/mod.rs              +pub mod folders
src-tauri/src/main.rs                   +email_list_folders registriert

src/types/mail.types.ts                 +MailFolder
src/services/mail.service.ts            +listFolders
src/store/mail.store.ts                 +folders, expandedFolders, foldersLastFetched,
                                         isFolderLoading, loadFolders, toggleFolder
src/components/mail/FolderTree.tsx      NEU — rekursiver Baum-Renderer (zustandslos)
src/routes/MailRoute.tsx                -FOLDERS Konstante, +FolderTree, +15-Min-Timer,
                                         +"Nicht zugeordnet" als fixierter Filter
```
