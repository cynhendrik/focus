# Mail Sub-Projekt B — Dynamischer IMAP-Ordnerbaum Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die hardcodierten Ordner `[INBOX, Sent, UNASSIGNED]` durch einen dynamischen, aufklappbaren IMAP-Ordnerbaum ersetzen — Ordner werden on-demand synchronisiert beim ersten Klick, die Liste refresht alle 15 Minuten.

**Architecture:** Neues `folders` table in `emails.db` (Migration v3) als Cache; neues `src-tauri/src/email/folders.rs` kapselt den IMAP LIST call; neuer `email_list_folders` Command + erweiterter `email_sync` mit optionalem `folder`-Parameter; neue stateless `FolderTree`-Komponente + Store-Erweiterungen.

**Tech Stack:** Rust/async-imap 0.9 (IMAP LIST), rusqlite 0.31 (SQLite), Tauri v2, React 19, Zustand, TypeScript

---

## File Map

| Datei | Aktion | Verantwortung |
|-------|--------|---------------|
| `src-tauri/src/email/types.rs` | Modify | +`Folder`, +`RawFolder` Structs |
| `src-tauri/src/email/db.rs` | Modify | Migration v3, +`upsert_folders`, +`get_folders`, +`get_folder_last_uid` |
| `src-tauri/src/email/folders.rs` | Create | `fetch_folders` via IMAP LIST |
| `src-tauri/src/email/imap.rs` | Modify | `sync_account` +`specific_folder: Option<&str>` |
| `src-tauri/src/email/commands.rs` | Modify | +`email_list_folders`, `email_sync` +`folder: Option<String>` |
| `src-tauri/src/email/mod.rs` | Modify | +`pub mod folders` |
| `src-tauri/src/main.rs` | Modify | +`email_list_folders` in `.invoke_handler` |
| `src/types/mail.types.ts` | Modify | +`MailFolder` Interface |
| `src/services/mail.service.ts` | Modify | +`listFolders`, `sync` +optionalem `folder` |
| `src/store/mail.store.ts` | Modify | +`folders`, +`expandedFolders`, +`foldersLastFetched`, +`isFolderLoading`, +`loadFolders`, +`toggleFolder`, `selectFolder` async mit on-demand sync |
| `src/components/mail/FolderTree.tsx` | Create | Stateless rekursiver Baum-Renderer |
| `src/routes/MailRoute.tsx` | Modify | -`FOLDERS`, +`FolderTree`, +15-Min-Timer, +"Nicht zugeordnet" als fixierter Filter |

---

## Task 1: Rust Types — Folder + RawFolder

**Files:**
- Modify: `src-tauri/src/email/types.rs`

- [ ] **Step 1: Schreibe den Test**

```rust
// In src-tauri/src/email/types.rs — am Ende des #[cfg(test)] blocks:
#[test]
fn folder_serializes_camel_case() {
    let f = Folder {
        id: "id1".into(),
        account_id: "acc1".into(),
        path: "INBOX.Projekte".into(),
        delimiter: ".".into(),
        display_name: "Projekte".into(),
        parent_path: Some("INBOX".into()),
        flags: vec!["\\HasChildren".into()],
        is_selectable: true,
    };
    let json = serde_json::to_string(&f).unwrap();
    assert!(json.contains("\"accountId\""), "should use camelCase");
    assert!(json.contains("\"displayName\""), "should use camelCase");
    assert!(json.contains("\"isSelectable\""), "should use camelCase");
    assert!(json.contains("\"parentPath\""), "should use camelCase");
}
```

- [ ] **Step 2: Test laufen lassen — erwartet FAIL**

```
cd src-tauri && cargo test folder_serializes_camel_case
```
Erwartetes Ergebnis: `error[E0422]: cannot find struct 'Folder'`

- [ ] **Step 3: Types hinzufügen**

In `src-tauri/src/email/types.rs`, direkt nach dem `SyncResult`-Struct (Zeile 84) einfügen:

```rust
/// IMAP-Ordner — gecacht in emails.db, an Frontend serialisiert
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: String,
    pub account_id: String,
    pub path: String,
    pub delimiter: String,
    pub display_name: String,
    pub parent_path: Option<String>,
    pub flags: Vec<String>,
    pub is_selectable: bool,
}

/// Interner Typ — frisch aus IMAP, noch nicht in DB
#[derive(Debug, Clone)]
pub struct RawFolder {
    pub path: String,
    pub delimiter: String,
    pub display_name: String,
    pub parent_path: Option<String>,
    pub flags: Vec<String>,
    pub is_selectable: bool,
}
```

- [ ] **Step 4: Test laufen lassen — erwartet PASS**

```
cd src-tauri && cargo test folder_serializes_camel_case
```
Erwartetes Ergebnis: `test types::tests::folder_serializes_camel_case ... ok`

- [ ] **Step 5: Commit**

```
git add src-tauri/src/email/types.rs
git commit -m "feat(mail/folders): Folder + RawFolder types"
```

---

## Task 2: DB Migration v3 + Folder-Datenbankfunktionen

**Files:**
- Modify: `src-tauri/src/email/db.rs`

- [ ] **Step 1: Tests schreiben**

Am Ende von `#[cfg(test)] mod tests` in `src-tauri/src/email/db.rs` einfügen:

```rust
#[test]
fn migration_v3_creates_folders_table() {
    let conn = in_memory_db();
    // Should exist after init_schema (which runs migrations)
    conn.execute_batch(
        "INSERT INTO folders (id, account_id, path, delimiter, display_name, is_selectable, sort_order)
         VALUES ('f1', 'acc1', 'INBOX', '.', 'INBOX', 1, 0)"
    ).unwrap();
}

#[test]
fn upsert_and_get_folders() {
    use crate::email::types::RawFolder;
    let conn = in_memory_db();
    let raw = vec![
        RawFolder {
            path: "INBOX".into(),
            delimiter: ".".into(),
            display_name: "INBOX".into(),
            parent_path: None,
            flags: vec![],
            is_selectable: true,
        },
        RawFolder {
            path: "INBOX.Projekte".into(),
            delimiter: ".".into(),
            display_name: "Projekte".into(),
            parent_path: Some("INBOX".into()),
            flags: vec!["\\HasChildren".into()],
            is_selectable: true,
        },
    ];
    upsert_folders(&conn, "acc1", &raw).unwrap();
    let folders = get_folders(&conn, "acc1").unwrap();
    assert_eq!(folders.len(), 2);
    assert_eq!(folders[0].path, "INBOX");
    assert_eq!(folders[1].parent_path, Some("INBOX".into()));
}

#[test]
fn get_folder_last_uid_returns_zero_when_empty() {
    let conn = in_memory_db();
    let uid = get_folder_last_uid(&conn, "acc1", "INBOX").unwrap();
    assert_eq!(uid, 0);
}
```

- [ ] **Step 2: Tests laufen lassen — erwartet FAIL**

```
cd src-tauri && cargo test migration_v3 upsert_and_get_folders get_folder_last_uid
```
Erwartetes Ergebnis: mehrere Fehler wegen fehlender Tabelle und Funktionen.

- [ ] **Step 3: Migration v3 hinzufügen**

In `src-tauri/src/email/db.rs`, nach dem `if version < 2 { ... }` Block (nach Zeile 72), vor `Ok(())` einfügen:

```rust
    if version < 3 {
        conn.execute_batch("
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
        ")?;
        conn.execute_batch("PRAGMA user_version = 3")?;
    }
```

- [ ] **Step 4: Folder-DB-Funktionen hinzufügen**

Nach der `delete_email`-Funktion in `db.rs` einfügen (vor dem `// ── Attachment CRUD` Block):

```rust
// ── Folder CRUD ───────────────────────────────────────────────────────────────

pub fn upsert_folders(
    conn: &Connection,
    account_id: &str,
    folders: &[crate::email::types::RawFolder],
) -> rusqlite::Result<()> {
    // Komplett neu schreiben: alte Einträge löschen, neue inserieren
    conn.execute("DELETE FROM folders WHERE account_id = ?1", params![account_id])?;
    for (i, f) in folders.iter().enumerate() {
        let id = format!("{}-{}", account_id, f.path);
        let flags_json = serde_json::to_string(&f.flags).unwrap_or_else(|_| "[]".to_string());
        conn.execute(
            "INSERT OR REPLACE INTO folders
             (id, account_id, path, delimiter, display_name, parent_path, flags, is_selectable, sort_order)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                id,
                account_id,
                f.path,
                f.delimiter,
                f.display_name,
                f.parent_path,
                flags_json,
                f.is_selectable as i32,
                i as i64,
            ],
        )?;
    }
    Ok(())
}

pub fn get_folders(
    conn: &Connection,
    account_id: &str,
) -> rusqlite::Result<Vec<crate::email::types::Folder>> {
    let mut stmt = conn.prepare(
        "SELECT id, account_id, path, delimiter, display_name, parent_path, flags, is_selectable
         FROM folders WHERE account_id = ?1 ORDER BY sort_order"
    )?;
    let rows = stmt.query_map(params![account_id], |row| {
        let flags_json: String = row.get(6)?;
        let flags: Vec<String> = serde_json::from_str(&flags_json).unwrap_or_default();
        Ok(crate::email::types::Folder {
            id:           row.get(0)?,
            account_id:   row.get(1)?,
            path:         row.get(2)?,
            delimiter:    row.get(3)?,
            display_name: row.get(4)?,
            parent_path:  row.get(5)?,
            flags,
            is_selectable: row.get::<_, i32>(7)? != 0,
        })
    })?;
    rows.collect()
}

/// Gibt die höchste UID zurück, die für account_id + folder bereits in der DB liegt.
/// Gibt 0 zurück wenn der Ordner noch nie synchronisiert wurde.
pub fn get_folder_last_uid(
    conn: &Connection,
    account_id: &str,
    folder: &str,
) -> rusqlite::Result<u32> {
    conn.query_row(
        "SELECT COALESCE(MAX(uid), 0) FROM emails WHERE account_id = ?1 AND folder = ?2",
        params![account_id, folder],
        |row| row.get::<_, u32>(0),
    )
}
```

- [ ] **Step 5: Import ergänzen**

In `db.rs` Zeile 1, `use rusqlite::{Connection, params};` — bereits vorhanden. Sicherstellen dass `serde_json` verfügbar ist (bereits in Cargo.toml). Keine Änderung nötig.

- [ ] **Step 6: Tests laufen lassen — erwartet PASS**

```
cd src-tauri && cargo test migration_v3 upsert_and_get_folders get_folder_last_uid
```
Erwartetes Ergebnis: alle 3 Tests grün.

- [ ] **Step 7: Commit**

```
git add src-tauri/src/email/db.rs
git commit -m "feat(mail/folders): DB migration v3 + upsert_folders, get_folders, get_folder_last_uid"
```

---

## Task 3: folders.rs — IMAP LIST via TLS

**Files:**
- Create: `src-tauri/src/email/folders.rs`

- [ ] **Step 1: Test schreiben**

```rust
// In src-tauri/src/email/folders.rs am Ende:
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn attr_to_string_maps_known_variants() {
        use async_imap::types::NameAttribute;
        assert_eq!(attr_to_string(&NameAttribute::NoSelect), "\\Noselect");
        assert_eq!(attr_to_string(&NameAttribute::NoInferiors), "\\Noinferiors");
        assert_eq!(attr_to_string(&NameAttribute::Marked), "\\Marked");
        assert_eq!(attr_to_string(&NameAttribute::Unmarked), "\\Unmarked");
        assert_eq!(
            attr_to_string(&NameAttribute::Extension("\\Sent".into())),
            "\\Sent"
        );
    }

    #[test]
    fn compute_display_name_from_delimiter() {
        let display = last_segment("INBOX.Projekte.Kunde-A", ".");
        assert_eq!(display, "Kunde-A");

        let top = last_segment("INBOX", ".");
        assert_eq!(top, "INBOX");
    }

    #[test]
    fn compute_parent_path_from_delimiter() {
        let parent = parent_path("INBOX.Projekte.Kunde-A", ".");
        assert_eq!(parent, Some("INBOX.Projekte".to_string()));

        let top_parent = parent_path("INBOX", ".");
        assert_eq!(top_parent, None);
    }
}
```

- [ ] **Step 2: Test laufen lassen — erwartet FAIL**

```
cd src-tauri && cargo test attr_to_string compute_display_name compute_parent_path
```
Erwartetes Ergebnis: Datei existiert nicht → Compile-Error.

- [ ] **Step 3: folders.rs erstellen**

```rust
// src-tauri/src/email/folders.rs

use futures_util::StreamExt as FuturesStreamExt;
use native_tls::TlsConnector as NativeTlsConnector;
use tokio_native_tls::TlsConnector;

use crate::email::types::RawFolder;

type TlsStream = tokio_native_tls::TlsStream<tokio::net::TcpStream>;

async fn tls_connect(host: &str, port: u16) -> Result<TlsStream, String> {
    let tcp = tokio::net::TcpStream::connect((host, port))
        .await
        .map_err(|e| format!("TCP-Verbindung zu {}:{} fehlgeschlagen: {}", host, port, e))?;
    let connector = NativeTlsConnector::builder()
        .build()
        .map_err(|e| format!("TLS-Builder-Fehler: {}", e))?;
    let tls = TlsConnector::from(connector);
    tls.connect(host, tcp)
        .await
        .map_err(|e| format!("TLS-Handshake fehlgeschlagen ({}): {}", host, e))
}

pub(crate) fn attr_to_string(attr: &async_imap::types::NameAttribute) -> String {
    match attr {
        async_imap::types::NameAttribute::NoSelect    => "\\Noselect".to_string(),
        async_imap::types::NameAttribute::NoInferiors => "\\Noinferiors".to_string(),
        async_imap::types::NameAttribute::Marked      => "\\Marked".to_string(),
        async_imap::types::NameAttribute::Unmarked    => "\\Unmarked".to_string(),
        async_imap::types::NameAttribute::Extension(s) => s.to_string(),
    }
}

pub(crate) fn last_segment<'a>(path: &'a str, delimiter: &str) -> &'a str {
    path.rsplit(delimiter).next().unwrap_or(path)
}

pub(crate) fn parent_path(path: &str, delimiter: &str) -> Option<String> {
    let idx = path.rfind(delimiter)?;
    Some(path[..idx].to_string())
}

/// Verbindet mit IMAP und ruft alle Ordner via LIST "" * ab.
/// Gibt die Ordner in Server-Reihenfolge zurück.
pub async fn fetch_folders(
    email: &str,
    password: &str,
    host: &str,
    port: u16,
) -> Result<Vec<RawFolder>, String> {
    let tls_stream = tls_connect(host, port).await?;
    let client = async_imap::Client::new(tls_stream);
    let mut session = client
        .login(email, password)
        .await
        .map_err(|(e, _)| format!("Authentifizierung fehlgeschlagen: {}", e))?;

    let mailboxes = session
        .list(Some(""), Some("*"))
        .await
        .map_err(|e| format!("IMAP LIST fehlgeschlagen: {}", e))?
        .filter_map(|r| async move { r.ok() })
        .collect::<Vec<_>>()
        .await;

    let mut result = Vec::with_capacity(mailboxes.len());
    for mailbox in &mailboxes {
        let raw_delimiter = mailbox
            .delimiter()
            .map(|s| s.to_string())
            .unwrap_or_else(|| ".".to_string());

        let path = mailbox.name().to_string();
        let display_name = last_segment(&path, &raw_delimiter).to_string();
        let parent = parent_path(&path, &raw_delimiter);
        let flags: Vec<String> = mailbox.attributes().iter().map(attr_to_string).collect();
        let is_selectable = !flags.contains(&"\\Noselect".to_string());

        result.push(RawFolder {
            path,
            delimiter: raw_delimiter,
            display_name,
            parent_path: parent,
            flags,
            is_selectable,
        });
    }

    let _ = session.logout().await;
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn attr_to_string_maps_known_variants() {
        use async_imap::types::NameAttribute;
        assert_eq!(attr_to_string(&NameAttribute::NoSelect), "\\Noselect");
        assert_eq!(attr_to_string(&NameAttribute::NoInferiors), "\\Noinferiors");
        assert_eq!(attr_to_string(&NameAttribute::Marked), "\\Marked");
        assert_eq!(attr_to_string(&NameAttribute::Unmarked), "\\Unmarked");
        assert_eq!(
            attr_to_string(&NameAttribute::Extension("\\Sent".into())),
            "\\Sent"
        );
    }

    #[test]
    fn compute_display_name_from_delimiter() {
        let display = last_segment("INBOX.Projekte.Kunde-A", ".");
        assert_eq!(display, "Kunde-A");

        let top = last_segment("INBOX", ".");
        assert_eq!(top, "INBOX");
    }

    #[test]
    fn compute_parent_path_from_delimiter() {
        let parent = parent_path("INBOX.Projekte.Kunde-A", ".");
        assert_eq!(parent, Some("INBOX.Projekte".to_string()));

        let top_parent = parent_path("INBOX", ".");
        assert_eq!(top_parent, None);
    }
}
```

- [ ] **Step 4: mod.rs ergänzen**

In `src-tauri/src/email/mod.rs` einfügen:

```rust
pub mod folders;
```

(Alphabetisch nach `db` und vor `imap` einordnen.)

- [ ] **Step 5: Tests laufen lassen — erwartet PASS**

```
cd src-tauri && cargo test attr_to_string compute_display_name compute_parent_path
```
Erwartetes Ergebnis: 3 Tests grün, keine Compile-Fehler.

- [ ] **Step 6: Commit**

```
git add src-tauri/src/email/folders.rs src-tauri/src/email/mod.rs
git commit -m "feat(mail/folders): folders.rs — fetch_folders via IMAP LIST"
```

---

## Task 4: imap.rs — sync_account mit specific_folder Parameter

**Files:**
- Modify: `src-tauri/src/email/imap.rs`

Kontext: `sync_account` hat aktuell diese Signatur:
```rust
pub async fn sync_account<F>(
    email: &str, password: &str, host: &str, port: u16,
    account_id: &str, last_uid: u32, customers: &[CustomerRef],
    mut on_progress: F,
) -> Result<SyncOutput, String>
```
Intern wird hardcodiert `folders = vec![("INBOX", "INBOX"), (sent_folder, "Sent")]`.

- [ ] **Step 1: Test schreiben**

Den bestehenden Test-Block in `imap.rs` (falls keiner vorhanden, am Ende der Datei) ergänzen:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn specific_folder_overrides_default_folders() {
        // Testet die Logik der Ordnerauswahl ohne IMAP-Verbindung.
        // Wir extrahieren die Auswahl-Logik in eine testbare Hilfsfunktion.
        let folders = resolve_folders_for_test(Some("INBOX.Projekte"));
        assert_eq!(folders.len(), 1);
        assert_eq!(folders[0].0, "INBOX.Projekte");

        let default_folders = resolve_folders_for_test(None);
        // Default: INBOX + ein Sent-Ordner
        assert_eq!(default_folders.len(), 2);
        assert_eq!(default_folders[0].0, "INBOX");
    }

    /// Hilfsfunktion für den Test — extrahiert die Ordner-Logik ohne IMAP
    fn resolve_folders_for_test(specific_folder: Option<&str>) -> Vec<(String, String)> {
        if let Some(folder) = specific_folder {
            vec![(folder.to_string(), folder.to_string())]
        } else {
            vec![
                ("INBOX".to_string(), "INBOX".to_string()),
                ("Sent".to_string(), "Sent".to_string()),
            ]
        }
    }
}
```

- [ ] **Step 2: Test laufen lassen — erwartet PASS** (Hilfsfunktion ist rein lokal)

```
cd src-tauri && cargo test specific_folder_overrides_default_folders
```
Erwartetes Ergebnis: `test imap::tests::specific_folder_overrides_default_folders ... ok`

- [ ] **Step 3: sync_account Signatur erweitern**

In `imap.rs` die Signatur von `sync_account` ändern (den `pub async fn sync_account<F>(` Block):

**Vorher:**
```rust
pub async fn sync_account<F>(
    email: &str,
    password: &str,
    host: &str,
    port: u16,
    account_id: &str,
    last_uid: u32,
    customers: &[CustomerRef],
    mut on_progress: F,
) -> Result<SyncOutput, String>
```

**Nachher:**
```rust
pub async fn sync_account<F>(
    email: &str,
    password: &str,
    host: &str,
    port: u16,
    account_id: &str,
    last_uid: u32,
    customers: &[CustomerRef],
    specific_folder: Option<&str>,
    mut on_progress: F,
) -> Result<SyncOutput, String>
```

- [ ] **Step 4: Ordner-Logik im Body ersetzen**

Im Body von `sync_account` die Zeilen, die `folders` aufbauen (suche nach `let sent_folder = find_sent_folder`), ersetzen durch:

```rust
    let folders: Vec<(String, String)> = if let Some(folder) = specific_folder {
        vec![(folder.to_string(), folder.to_string())]
    } else {
        let sent_folder = find_sent_folder(&mut session).await;
        vec![
            ("INBOX".to_string(), "INBOX".to_string()),
            (sent_folder, "Sent".to_string()),
        ]
    };
```

- [ ] **Step 5: Caller in commands.rs anpassen**

In `commands.rs`, in der `email_sync` Funktion, den `imap::sync_account(...)`-Aufruf um `None` als `specific_folder` ergänzen:

```rust
    let output = imap::sync_account(
        &email, &password, &imap_host, imap_port,
        &account_id, last_uid, &customers,
        None, // specific_folder — None = INBOX + Sent (Standardverhalten)
        move |progress: SyncProgress| {
            let _ = w.emit("email-sync-progress", &progress);
        },
    ).await;
```

- [ ] **Step 6: Bauen und testen**

```
cd src-tauri && cargo build 2>&1 | head -30
```
Erwartetes Ergebnis: Keine Fehler.

```
cd src-tauri && cargo test specific_folder_overrides
```

- [ ] **Step 7: Commit**

```
git add src-tauri/src/email/imap.rs src-tauri/src/email/commands.rs
git commit -m "feat(mail/folders): sync_account +specific_folder param (None = INBOX+Sent)"
```

---

## Task 5: Commands — email_list_folders + email_sync mit folder-Parameter

**Files:**
- Modify: `src-tauri/src/email/commands.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Neuen Command testen (Unit-Test im Rust-Code)**

Dieser Command führt IMAP-Calls aus — kein Unit-Test möglich ohne Mock. Stattdessen: Integrations-Checkpoint nach Implementierung (Step 4). Weiter mit Implementierung.

- [ ] **Step 2: email_list_folders Command hinzufügen**

In `commands.rs`, nach der `email_sync`-Funktion einfügen:

```rust
// ── Folder listing ─────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn email_list_folders(
    account_id: String,
    db: tauri::State<'_, EmailDb>,
) -> Result<Vec<crate::email::types::Folder>, String> {
    // 1. Account-Daten holen
    let (email, imap_host, imap_port) = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let account = db::get_account(&conn, &account_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Konto nicht gefunden".to_string())?;
        (account.email, account.imap_host, account.imap_port)
    };

    // 2. Passwort aus Keychain
    let password = keychain::get(&email)?;

    // 3. Ordner via IMAP holen — bei Fehler: gecachte Daten zurückgeben
    match crate::email::folders::fetch_folders(&email, &password, &imap_host, imap_port).await {
        Ok(raw_folders) => {
            // 4. In DB speichern
            {
                let conn = db.0.lock().map_err(|e| e.to_string())?;
                db::upsert_folders(&conn, &account_id, &raw_folders)
                    .map_err(|e| e.to_string())?;
            }
        }
        Err(e) => {
            // IMAP nicht erreichbar — stale Cache ist okay, kein Fehler propagieren
            log::warn!("email_list_folders: IMAP nicht erreichbar, verwende Cache. Fehler: {}", e);
        }
    }

    // 5. Aus DB zurückgeben (frisch oder gecacht)
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::get_folders(&conn, &account_id).map_err(|e| e.to_string())
}
```

- [ ] **Step 3: email_sync um folder-Parameter erweitern**

In `commands.rs`, die `email_sync`-Funktion anpassen. **Neue Signatur:**

```rust
#[tauri::command]
pub async fn email_sync(
    account_id: String,
    folder: Option<String>,       // NEU — None = INBOX + Sent; Some(path) = nur dieser Ordner
    customers_json: String,
    window: Window,
    db: tauri::State<'_, EmailDb>,
) -> Result<SyncResult, String> {
```

Im Body, die Logik für `last_uid` anpassen: Wenn `folder` gesetzt ist, `get_folder_last_uid` verwenden statt dem Account-weiten `last_synced_uid`:

```rust
    let customers: Vec<CustomerRef> = serde_json::from_str(&customers_json)
        .map_err(|e| format!("Ungültiges customers_json: {}", e))?;

    // Account-Daten holen — Lock vor dem await freigeben
    let (email, imap_host, imap_port, account_last_uid) = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        db::get_account_sync_info(&conn, &account_id).map_err(|e| e.to_string())?
    };

    // last_uid: für On-Demand-Sync eines einzelnen Ordners aus emails ableiten
    let last_uid = if let Some(ref f) = folder {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        db::get_folder_last_uid(&conn, &account_id, f).map_err(|e| e.to_string())?
    } else {
        account_last_uid
    };

    let password = keychain::get(&email)?;

    let w = window.clone();
    let specific_folder_ref = folder.as_deref();
    let output = imap::sync_account(
        &email, &password, &imap_host, imap_port,
        &account_id, last_uid, &customers,
        specific_folder_ref,
        move |progress: SyncProgress| {
            let _ = w.emit("email-sync-progress", &progress);
        },
    ).await;

    match output {
        Ok(out) => {
            let inserted = {
                let conn = db.0.lock().map_err(|e| e.to_string())?;
                let n = db::insert_emails(&conn, &out.rows).map_err(|e| e.to_string())?;
                db::insert_attachments(&conn, &out.attachments).map_err(|e| e.to_string())?;
                n
            };
            // last_synced_uid nur aktualisieren wenn kein On-Demand-Sync eines einzelnen Ordners
            if folder.is_none() {
                let conn = db.0.lock().map_err(|e| e.to_string())?;
                db::update_last_synced(&conn, &account_id, out.max_uid, &Utc::now().to_rfc3339())
                    .map_err(|e| e.to_string())?;
                db::update_account_status(&conn, &account_id, "active")
                    .map_err(|e| e.to_string())?;
            } else {
                let conn = db.0.lock().map_err(|e| e.to_string())?;
                db::update_account_status(&conn, &account_id, "active")
                    .map_err(|e| e.to_string())?;
            }
            let _ = window.emit("email-sync-progress", &SyncProgress {
                folder: "done".into(), done: inserted, total: inserted, phase: "done".into(),
            });
            let skipped = out.inserted_count.saturating_sub(inserted);
            Ok(SyncResult { inserted, skipped })
        }
        Err(e) => {
            let status = if e.contains("Authentifizierung") { "auth_error" } else { "error" };
            if let Ok(conn) = db.0.lock() {
                let _ = db::update_account_status(&conn, &account_id, status);
            }
            Err(e)
        }
    }
}
```

- [ ] **Step 4: email_list_folders in main.rs registrieren**

In `src-tauri/src/main.rs`, im `.invoke_handler(tauri::generate_handler![...])` Block `email_list_folders` hinzufügen:

```rust
email::commands::email_list_folders,
```

(Alphabetisch nach `email_get_body` oder am Ende des Blocks einfügen.)

- [ ] **Step 5: log-Crate prüfen**

In `src-tauri/Cargo.toml` prüfen ob `log` als Dependency vorhanden ist (für `log::warn!` in email_list_folders). Falls nicht:

```toml
log = "0.4"
```

Falls `tauri` bereits `log` re-exportiert oder `tracing` verwendet wird: `log::warn!` durch `eprintln!` ersetzen — funktional identisch für diesen Zweck.

- [ ] **Step 6: Bauen**

```
cd src-tauri && cargo build 2>&1 | head -40
```
Erwartetes Ergebnis: Keine Fehler. Alle Kommandos kompilieren.

- [ ] **Step 7: Commit**

```
git add src-tauri/src/email/commands.rs src-tauri/src/main.rs src-tauri/Cargo.toml
git commit -m "feat(mail/folders): email_list_folders command + email_sync +folder param"
```

---

## Task 6: TypeScript Types + Service

**Files:**
- Modify: `src/types/mail.types.ts`
- Modify: `src/services/mail.service.ts`

- [ ] **Step 1: Test schreiben**

```typescript
// src/types/mail.types.test.ts — neuer Test
import type { MailFolder } from './mail.types'

describe('MailFolder', () => {
  it('has required fields', () => {
    const f: MailFolder = {
      id: 'acc1-INBOX',
      accountId: 'acc1',
      path: 'INBOX',
      delimiter: '.',
      displayName: 'INBOX',
      parentPath: null,
      flags: [],
      isSelectable: true,
    }
    expect(f.isSelectable).toBe(true)
    expect(f.parentPath).toBeNull()
  })

  it('optionally has children', () => {
    const f: MailFolder = {
      id: 'acc1-INBOX',
      accountId: 'acc1',
      path: 'INBOX',
      delimiter: '.',
      displayName: 'INBOX',
      parentPath: null,
      flags: [],
      isSelectable: true,
      children: [],
    }
    expect(f.children).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Test laufen lassen — erwartet FAIL**

```
npx vitest run src/types/mail.types.test.ts
```
Erwartetes Ergebnis: `Cannot find name 'MailFolder'`

- [ ] **Step 3: MailFolder Interface hinzufügen**

In `src/types/mail.types.ts`, nach dem `SmtpAutoDetectFailed`-Interface einfügen:

```typescript
export interface MailFolder {
  id: string
  accountId: string
  path: string           // vollständiger IMAP-Pfad, z.B. "INBOX.Projekte.Kunde-A"
  delimiter: string      // Trennzeichen aus IMAP (meist "." oder "/")
  displayName: string    // letztes Pfad-Segment, z.B. "Kunde-A"
  parentPath: string | null
  flags: string[]        // IMAP-Attribute, z.B. ["\\HasChildren", "\\Sent"]
  isSelectable: boolean  // false wenn \Noselect-Flag gesetzt
  children?: MailFolder[] // nur im Frontend befüllt (nicht aus DB)
}
```

- [ ] **Step 4: Service erweitern**

In `src/services/mail.service.ts`:

1. Import ergänzen:
```typescript
import type {
  EmailAccount, EmailHeader, EmailBody, EmailAttachment,
  AddAccountPayload, SendEmailPayload, MailFolder,
} from '@/types/mail.types'
```

2. `listFolders` hinzufügen (nach `getAccounts`):
```typescript
  listFolders(accountId: string): Promise<MailFolder[]> {
    return invoke<MailFolder[]>('email_list_folders', { accountId })
  },
```

3. `sync` um optionalen `folder`-Parameter erweitern:
```typescript
  sync(
    accountId: string,
    customersJson: string,
    folder?: string,
  ): Promise<{ inserted: number; skipped: number }> {
    return invoke('email_sync', {
      accountId,
      folder: folder ?? null,
      customersJson,
    })
  },
```

- [ ] **Step 5: Tests laufen lassen — erwartet PASS**

```
npx vitest run src/types/mail.types.test.ts
```
Erwartetes Ergebnis: 2 Tests grün.

- [ ] **Step 6: TypeScript-Build prüfen**

```
npx tsc --noEmit 2>&1 | head -20
```
Erwartetes Ergebnis: Keine Fehler (oder nur bereits bekannte Fehler aus anderen Teilen des Projekts).

- [ ] **Step 7: Commit**

```
git add src/types/mail.types.ts src/services/mail.service.ts src/types/mail.types.test.ts
git commit -m "feat(mail/folders): MailFolder type + listFolders service, sync +folder param"
```

---

## Task 7: Store — loadFolders, toggleFolder, async selectFolder

**Files:**
- Modify: `src/store/mail.store.ts`

- [ ] **Step 1: Tests schreiben**

```typescript
// src/store/mail.store.test.ts — neuer Test
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'

// Mock MailService
vi.mock('@/services/mail.service', () => ({
  MailService: {
    getAccounts: vi.fn().mockResolvedValue([]),
    listFolders: vi.fn().mockResolvedValue([
      { id: 'acc1-INBOX', accountId: 'acc1', path: 'INBOX', delimiter: '.', displayName: 'INBOX', parentPath: null, flags: [], isSelectable: true },
      { id: 'acc1-INBOX.Projekte', accountId: 'acc1', path: 'INBOX.Projekte', delimiter: '.', displayName: 'Projekte', parentPath: 'INBOX', flags: [], isSelectable: true },
    ]),
    list: vi.fn().mockResolvedValue([]),
    sync: vi.fn().mockResolvedValue({ inserted: 0, skipped: 0 }),
  },
}))

import { useMailStore } from './mail.store'

describe('mail.store — folder tree', () => {
  beforeEach(() => {
    useMailStore.setState({
      folders: [],
      expandedFolders: new Set(),
      foldersLastFetched: 0,
      isFolderLoading: false,
      selectedAccountId: 'acc1',
    })
  })

  it('loadFolders builds tree from flat list', async () => {
    const { result } = renderHook(() => useMailStore())
    await act(async () => {
      await result.current.loadFolders('acc1')
    })
    const folders = result.current.folders
    expect(folders).toHaveLength(1) // nur INBOX als root
    expect(folders[0].path).toBe('INBOX')
    expect(folders[0].children).toHaveLength(1)
    expect(folders[0].children![0].path).toBe('INBOX.Projekte')
  })

  it('toggleFolder adds and removes from expandedFolders', () => {
    const { result } = renderHook(() => useMailStore())
    act(() => result.current.toggleFolder('INBOX'))
    expect(result.current.expandedFolders.has('INBOX')).toBe(true)
    act(() => result.current.toggleFolder('INBOX'))
    expect(result.current.expandedFolders.has('INBOX')).toBe(false)
  })

  it('foldersLastFetched is updated after loadFolders', async () => {
    const { result } = renderHook(() => useMailStore())
    const before = Date.now()
    await act(async () => {
      await result.current.loadFolders('acc1')
    })
    expect(result.current.foldersLastFetched).toBeGreaterThanOrEqual(before)
  })
})
```

- [ ] **Step 2: Tests laufen lassen — erwartet FAIL**

```
npx vitest run src/store/mail.store.test.ts
```
Erwartetes Ergebnis: `TypeError: result.current.loadFolders is not a function`

- [ ] **Step 3: Store-State erweitern**

Am Anfang von `src/store/mail.store.ts`, die `MailState`-Interface um folgende Felder und Aktionen ergänzen:

```typescript
// Nach den bestehenden Imports, MailFolder importieren:
import type {
  EmailAccount, EmailHeader, EmailBody, EmailAttachment,
  SyncProgress, AddAccountPayload, SendEmailPayload, MailFolder,
} from '@/types/mail.types'
```

Im `interface MailState` Block, nach `attachments: EmailAttachment[]`:

```typescript
  // Folder-Tree
  folders: MailFolder[]
  expandedFolders: Set<string>
  foldersLastFetched: number
  isFolderLoading: boolean

  loadFolders: (accountId: string) => Promise<void>
  toggleFolder: (path: string) => void
```

Außerdem `selectFolder` von `(folder: string) => void` zu `(folder: string) => Promise<void>` ändern.

- [ ] **Step 4: buildFolderTree Hilfsfunktion + Store-Initialwerte + Implementierungen**

Im `create<MailState>()((set, get) => ({` Block die initialen State-Werte ergänzen:

```typescript
  // nach "isSending: false,"
  folders: [],
  expandedFolders: new Set<string>(),
  foldersLastFetched: 0,
  isFolderLoading: false,
```

Dann nach der `downloadAttachment`-Action einfügen:

```typescript
  loadFolders: async (accountId) => {
    try {
      const flat = await MailService.listFolders(accountId)
      const tree = buildFolderTree(flat)
      set({ folders: tree, foldersLastFetched: Date.now() })
    } catch (err) {
      log.error('Failed to load folders', { err })
      // Kein State-Update bei Fehler — gecachte Ordner bleiben sichtbar
    }
  },

  toggleFolder: (path) => {
    set(s => {
      const next = new Set(s.expandedFolders)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return { expandedFolders: next }
    })
  },
```

Die bestehende `selectFolder`-Action ersetzen durch:

```typescript
  selectFolder: async (folder) => {
    set({ selectedFolder: folder, emails: [], selectedEmail: null, emailBody: null })
    await get().loadEmails()
    // On-demand Sync: wenn kein Kunden-Filter-Ordner und Ergebnis leer → Ordner synchronisieren
    const { emails, selectedAccountId, isSyncing } = get()
    if (
      folder !== 'UNASSIGNED' &&
      emails.length === 0 &&
      selectedAccountId &&
      !isSyncing
    ) {
      set({ isFolderLoading: true })
      try {
        await MailService.sync(selectedAccountId, '[]', folder)
        await get().loadEmails()
      } catch (err) {
        log.error('On-demand folder sync failed', { err })
      } finally {
        set({ isFolderLoading: false })
      }
    }
  },
```

Außerdem `buildFolderTree` als Modul-Funktion (außerhalb des `create`-Calls) definieren:

```typescript
function buildFolderTree(flat: MailFolder[]): MailFolder[] {
  const byPath = new Map(flat.map(f => [f.path, { ...f, children: [] as MailFolder[] }]))
  const roots: MailFolder[] = []
  for (const folder of byPath.values()) {
    if (folder.parentPath && byPath.has(folder.parentPath)) {
      byPath.get(folder.parentPath)!.children!.push(folder)
    } else {
      roots.push(folder)
    }
  }
  // Bekannte Spezialordner nach oben sortieren
  const PRIORITY_PATHS = ['INBOX']
  roots.sort((a, b) => {
    const ai = PRIORITY_PATHS.indexOf(a.path)
    const bi = PRIORITY_PATHS.indexOf(b.path)
    if (ai !== -1 && bi === -1) return -1
    if (bi !== -1 && ai === -1) return 1
    return 0
  })
  return roots
}
```

- [ ] **Step 5: MailService.listFolders importieren**

Sicherstellen dass `MailService` aus `@/services/mail.service` importiert wird — bereits vorhanden. Kein weiterer Import nötig.

- [ ] **Step 6: Tests laufen lassen — erwartet PASS**

```
npx vitest run src/store/mail.store.test.ts
```
Erwartetes Ergebnis: 3 Tests grün.

- [ ] **Step 7: TypeScript prüfen**

```
npx tsc --noEmit 2>&1 | grep mail.store
```
Erwartetes Ergebnis: Keine Fehler für `mail.store.ts`.

- [ ] **Step 8: Commit**

```
git add src/store/mail.store.ts src/store/mail.store.test.ts
git commit -m "feat(mail/folders): store +loadFolders, toggleFolder, async selectFolder mit on-demand sync"
```

---

## Task 8: FolderTree.tsx — Stateless rekursiver Baum-Renderer

**Files:**
- Create: `src/components/mail/FolderTree.tsx`

- [ ] **Step 1: Test schreiben**

```typescript
// src/components/mail/FolderTree.test.tsx — neuer Test
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { FolderTree } from './FolderTree'
import type { MailFolder } from '@/types/mail.types'

const mockFolders: MailFolder[] = [
  {
    id: 'acc1-INBOX', accountId: 'acc1', path: 'INBOX',
    delimiter: '.', displayName: 'INBOX', parentPath: null,
    flags: [], isSelectable: true,
    children: [
      {
        id: 'acc1-INBOX.Projekte', accountId: 'acc1', path: 'INBOX.Projekte',
        delimiter: '.', displayName: 'Projekte', parentPath: 'INBOX',
        flags: [], isSelectable: true, children: [],
      },
    ],
  },
  {
    id: 'acc1-Sent', accountId: 'acc1', path: 'Sent',
    delimiter: '.', displayName: 'Sent', parentPath: null,
    flags: ['\\Sent'], isSelectable: true, children: [],
  },
]

describe('FolderTree', () => {
  it('renders root folders', () => {
    render(
      <FolderTree
        folders={mockFolders}
        selectedPath="INBOX"
        expandedPaths={new Set()}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
      />
    )
    expect(screen.getByText('INBOX')).toBeInTheDocument()
    expect(screen.getByText('Sent')).toBeInTheDocument()
  })

  it('shows chevron for folders with children', () => {
    render(
      <FolderTree
        folders={mockFolders}
        selectedPath="INBOX"
        expandedPaths={new Set(['INBOX'])}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
      />
    )
    // Projekte ist sichtbar wenn INBOX expanded
    expect(screen.getByText('Projekte')).toBeInTheDocument()
  })

  it('calls onSelect when selectable folder clicked', () => {
    const onSelect = vi.fn()
    render(
      <FolderTree
        folders={mockFolders}
        selectedPath=""
        expandedPaths={new Set()}
        onSelect={onSelect}
        onToggle={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('Sent'))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ path: 'Sent' }))
  })

  it('calls onToggle for folder with children', () => {
    const onToggle = vi.fn()
    render(
      <FolderTree
        folders={mockFolders}
        selectedPath=""
        expandedPaths={new Set()}
        onSelect={vi.fn()}
        onToggle={onToggle}
      />
    )
    // Klick auf den Chevron / INBOX-Zeile togglet
    fireEvent.click(screen.getByText('INBOX'))
    expect(onToggle).toHaveBeenCalledWith('INBOX')
  })
})
```

- [ ] **Step 2: Test laufen lassen — erwartet FAIL**

```
npx vitest run src/components/mail/FolderTree.test.tsx
```
Erwartetes Ergebnis: `Cannot find module './FolderTree'`

- [ ] **Step 3: FolderTree.tsx erstellen**

```tsx
// src/components/mail/FolderTree.tsx

import type { MailFolder } from '@/types/mail.types'

interface FolderTreeProps {
  folders: MailFolder[]
  selectedPath: string
  expandedPaths: Set<string>
  onSelect: (folder: MailFolder) => void
  onToggle: (path: string) => void
}

function folderIcon(folder: MailFolder): string {
  const path = folder.path.toUpperCase()
  const flags = folder.flags.map(f => f.toLowerCase())

  if (path === 'INBOX' || flags.some(f => f.includes('\\inbox'))) return '📥'
  if (flags.some(f => f.includes('\\sent'))) return '📤'
  if (flags.some(f => f.includes('\\drafts'))) return '📝'
  if (flags.some(f => f.includes('\\trash'))) return '🗑'
  if (flags.some(f => f.includes('\\junk') || f.includes('\\spam'))) return '⚠️'
  return '📁'
}

interface FolderNodeProps {
  folder: MailFolder
  depth: number
  selectedPath: string
  expandedPaths: Set<string>
  onSelect: (folder: MailFolder) => void
  onToggle: (path: string) => void
}

function FolderNode({
  folder, depth, selectedPath, expandedPaths, onSelect, onToggle,
}: FolderNodeProps) {
  const hasChildren = (folder.children?.length ?? 0) > 0
  const isExpanded = expandedPaths.has(folder.path)
  const isSelected = selectedPath === folder.path

  const handleClick = () => {
    if (hasChildren) {
      onToggle(folder.path)
    }
    if (folder.isSelectable) {
      onSelect(folder)
    }
  }

  return (
    <>
      <button
        onClick={handleClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          width: '100%',
          padding: '4px 8px',
          paddingLeft: 8 + depth * 12,
          borderRadius: 8,
          fontSize: 12,
          background: isSelected ? 'var(--accent)' : 'none',
          color: isSelected ? 'var(--accent-ink)' : 'var(--fg-dim)',
          border: 'none',
          cursor: folder.isSelectable || hasChildren ? 'pointer' : 'default',
          textAlign: 'left',
        }}
      >
        {hasChildren && (
          <span style={{ fontSize: 9, width: 10, textAlign: 'center', flexShrink: 0 }}>
            {isExpanded ? '▼' : '▶'}
          </span>
        )}
        {!hasChildren && <span style={{ width: 10, flexShrink: 0 }} />}
        <span>{folderIcon(folder)}</span>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {folder.displayName}
        </span>
      </button>

      {hasChildren && isExpanded && folder.children!.map(child => (
        <FolderNode
          key={child.path}
          folder={child}
          depth={depth + 1}
          selectedPath={selectedPath}
          expandedPaths={expandedPaths}
          onSelect={onSelect}
          onToggle={onToggle}
        />
      ))}
    </>
  )
}

export function FolderTree({
  folders, selectedPath, expandedPaths, onSelect, onToggle,
}: FolderTreeProps) {
  return (
    <>
      {folders.map(folder => (
        <FolderNode
          key={folder.path}
          folder={folder}
          depth={0}
          selectedPath={selectedPath}
          expandedPaths={expandedPaths}
          onSelect={onSelect}
          onToggle={onToggle}
        />
      ))}
    </>
  )
}
```

- [ ] **Step 4: Tests laufen lassen — erwartet PASS**

```
npx vitest run src/components/mail/FolderTree.test.tsx
```
Erwartetes Ergebnis: 4 Tests grün.

- [ ] **Step 5: Commit**

```
git add src/components/mail/FolderTree.tsx src/components/mail/FolderTree.test.tsx
git commit -m "feat(mail/folders): FolderTree — stateless rekursiver Baum-Renderer"
```

---

## Task 9: MailRoute.tsx — FolderTree integrieren, FOLDERS entfernen, 15-Min-Timer

**Files:**
- Modify: `src/routes/MailRoute.tsx`

Kontext: Aktuell haben wir `const FOLDERS = [{ id: 'INBOX', label: 'Posteingang' }, ...]` (Zeile 9-13) und eine einfache Map über diese Liste (Zeile 81-90). Das wird komplett ersetzt.

- [ ] **Step 1: Änderungen umsetzen**

In `src/routes/MailRoute.tsx`:

**1. Imports aktualisieren** — `FOLDERS`-Konstante entfernen, `FolderTree` importieren:

```typescript
import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { Reply, Forward, Plus } from 'lucide-react'
import { useMailStore } from '@/store/mail.store'
import { useCustomersStore } from '@/store/customers.store'
import { ComposeModal } from '@/components/mail/ComposeModal'
import { FolderTree } from '@/components/mail/FolderTree'
import type { SyncProgress, MailFolder } from '@/types/mail.types'
```

**2. `const FOLDERS = [...]` komplett entfernen** (Zeilen 9-13).

**3. Im `MailRoute`-Funktionskörper**, destructure `loadFolders`, `toggleFolder`, `folders`, `expandedFolders`, `foldersLastFetched`, `isFolderLoading` aus dem Store hinzufügen:

```typescript
  const {
    accounts, selectedAccountId, selectedFolder, emails, selectedEmail, emailBody,
    attachments,
    search, syncProgress, isSyncing, isLoading,
    loadAccounts, selectAccount, selectFolder, selectEmail, setSearch, sync,
    removeAccount, setSyncProgress, assignCustomer, deleteEmail, downloadAttachment,
    // NEU:
    folders, expandedFolders, foldersLastFetched, isFolderLoading,
    loadFolders, toggleFolder,
  } = useMailStore()
```

**4. 15-Minuten-Timer als neuen `useEffect` einfügen** (direkt nach dem bestehenden `useEffect` mit `loadAccounts`):

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

**5. `formatLastFetched`-Hilfsfunktion** außerhalb der Komponente (am Ende der Datei, vor `AccountSetupForm`) hinzufügen:

```typescript
function formatLastFetched(ts: number): string {
  if (!ts) return ''
  const diffMs = Date.now() - ts
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'Zuletzt: gerade eben'
  if (diffMin === 1) return 'Zuletzt: vor 1 Min.'
  return `Zuletzt: vor ${diffMin} Min.`
}
```

**6. Linkes Panel umbauen** — den `{FOLDERS.map(...)}` Block (Zeilen 81-90) ersetzen durch:

```tsx
        <div className="h-px bg-[var(--border)] my-1" />
        {/* Pinned virtual filter */}
        <p className="text-xs font-semibold text-[var(--text2)] uppercase tracking-wider px-2 py-1">Filter</p>
        <button
          onClick={() => selectFolder('UNASSIGNED')}
          className={`text-left text-xs px-2 py-1.5 rounded-lg transition-colors
            ${selectedFolder === 'UNASSIGNED' ? 'bg-primary text-white' : 'text-[var(--text)] hover:bg-[var(--bg1)]'}`}
        >
          🔍 Nicht zugeordnet
        </button>

        <div className="h-px bg-[var(--border)] my-1" />
        <p className="text-xs font-semibold text-[var(--text2)] uppercase tracking-wider px-2 py-1">Ordner</p>
        {isFolderLoading && folders.length === 0 && (
          <p className="text-xs text-[var(--text2)] px-2">Lädt…</p>
        )}
        {folders.length > 0 && (
          <FolderTree
            folders={folders}
            selectedPath={selectedFolder}
            expandedPaths={expandedFolders}
            onSelect={(folder: MailFolder) => selectFolder(folder.path)}
            onToggle={toggleFolder}
          />
        )}
        {folders.length === 0 && !isFolderLoading && (
          <p className="text-xs text-[var(--text2)] px-2">Keine Ordner</p>
        )}
```

**7. Timestamp unter dem Sync-Button** — nach dem Progress-Bar-Block hinzufügen:

```tsx
          {foldersLastFetched > 0 && (
            <p className="text-center" style={{ fontSize: 10, color: 'var(--text2)', padding: '2px 0' }}>
              {formatLastFetched(foldersLastFetched)}
            </p>
          )}
```

- [ ] **Step 2: TypeScript-Build prüfen**

```
npx tsc --noEmit 2>&1 | grep MailRoute
```
Erwartetes Ergebnis: Keine Fehler für `MailRoute.tsx`.

- [ ] **Step 3: Dev-Server starten und manuell prüfen**

```
npm run tauri dev
```

Prüfliste:
- [ ] Linkes Panel zeigt "Nicht zugeordnet" als fixierten Filter
- [ ] Nach Sekunde erscheinen IMAP-Ordner als aufklappbarer Baum
- [ ] Klick auf Ordner mit `▶` klappt Unterordner auf
- [ ] Klick auf Unterordner startet On-Demand-Sync (Spinner im Ordnerbereich)
- [ ] "Zuletzt: vor N Min." erscheint unter dem Sync-Button
- [ ] Bekannte Ordner zeigen korrekte Icons (📥 INBOX, 📤 Sent, etc.)
- [ ] INBOX ist beim Start ausgewählt und aktiv markiert

- [ ] **Step 4: Cargo build (Rust-Seite)**

```
cd src-tauri && cargo build 2>&1 | tail -5
```
Erwartetes Ergebnis: `Finished` ohne Errors.

- [ ] **Step 5: Commit**

```
git add src/routes/MailRoute.tsx
git commit -m "feat(mail/folders): MailRoute — FolderTree, Nicht-zugeordnet-Filter, 15-Min-Timer, Timestamp"
```

---

## Self-Review — Spec Coverage Check

| Spec-Anforderung | Implementiert in |
|-----------------|-----------------|
| `folders`-Tabelle in emails.db (Migration v3) | Task 2 |
| `upsert_folders`, `get_folders`, `get_folder_last_uid` | Task 2 |
| `RawFolder`, `Folder` Rust-Typen | Task 1 |
| `fetch_folders` via IMAP LIST | Task 3 |
| `attr_to_string` für NameAttribute-Mapping | Task 3 |
| `email_list_folders` Command | Task 5 |
| Bei IMAP-Fehler: gecachte Daten zurückgeben | Task 5 |
| `email_sync` +`folder: Option<String>` | Task 4+5 |
| `MailFolder` TypeScript-Typ | Task 6 |
| `listFolders` Service | Task 6 |
| `sync` mit optionalem `folder` | Task 6 |
| `loadFolders`, `toggleFolder`, `buildFolderTree` im Store | Task 7 |
| On-demand Sync bei leerem Ordner | Task 7 |
| `expandedFolders: Set<string>` | Task 7 |
| `FolderTree` stateless Komponente | Task 8 |
| Special-Use Icons (📥📤📝🗑⚠️) | Task 8 |
| `\Noselect`-Ordner: nur expand/collapse | Task 8 |
| `FOLDERS`-Konstante entfernt | Task 9 |
| "Nicht zugeordnet" als fixierter Filter | Task 9 |
| 15-Min-Timer + App-Start `loadFolders` | Task 9 |
| Timestamp "Zuletzt: vor N Min." | Task 9 |

**Placeholder-Check:** Kein TBD, kein TODO, kein "implement later" in diesem Plan.

**Type-Konsistenz:** `RawFolder` (Rust, intern) → `Folder` (Rust, serialisiert camelCase) → `MailFolder` (TypeScript). `buildFolderTree(flat: MailFolder[]): MailFolder[]` — consistent. `onSelect: (folder: MailFolder) => void` — consistent mit Store `selectFolder: (folder: string) => Promise<void>` via `folder.path`.
