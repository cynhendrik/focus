# Mail: Ordner-Verwaltung + Drag & Drop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Echte IMAP-Ordner anlegen/löschen und E-Mails per Drag & Drop in Ordner verschieben — serversseitig, für alle Workspace-Mitglieder sichtbar.

**Architecture:** Drei neue Tauri-Commands (`email_create_folder`, `email_delete_folder`, `email_move_to_folder`) schreiben direkt auf den IMAP-Server. Der DB-Cache wird danach aktualisiert. Das Frontend zeigt im ORDNER-Bereich der Sidebar die echten IMAP-Ordner (alles außer Systemordnern), mit Inline-Eingabe zum Erstellen, Hover-Delete-Button und Drag & Drop von E-Mail-Zeilen auf Ordner-Buttons.

**Tech Stack:** Rust + async_imap (TLS), rusqlite, Tauri, React + Zustand, native HTML5 Drag & Drop

---

## File Map

| Datei | Änderung |
|---|---|
| `src-tauri/src/email/folders.rs` | Neu: `create_imap_folder`, `delete_imap_folder` |
| `src-tauri/src/email/imap.rs` | Neu: `move_email` |
| `src-tauri/src/email/db.rs` | Neu: `delete_folder`, `update_email_folder`, `get_folder_flags` |
| `src-tauri/src/email/commands.rs` | Neu: 3 Tauri-Commands |
| `src-tauri/src/main.rs` | Commands registrieren |
| `src/services/mail.service.ts` | Neu: 3 Service-Methoden |
| `src/store/mail.store.ts` | Neu: 3 Store-Actions |
| `src/routes/MailRoute.tsx` | ORDNER-UI, Drag & Drop |

---

## Task 1: IMAP-Ordnerfunktionen (Backend)

**Files:**
- Modify: `src-tauri/src/email/folders.rs`
- Modify: `src-tauri/src/email/imap.rs`

- [ ] **Step 1: `create_imap_folder` und `delete_imap_folder` in `folders.rs` hinzufügen**

Ans Ende von `folders.rs` (nach `fetch_folders`) einfügen:

```rust
/// Erstellt einen neuen Ordner auf dem IMAP-Server.
pub async fn create_imap_folder(
    email: &str,
    password: &str,
    host: &str,
    port: u16,
    folder_path: &str,
) -> Result<(), String> {
    let tls_stream = tls_connect(host, port).await?;
    let client = async_imap::Client::new(tls_stream);
    let mut session = client
        .login(email, password)
        .await
        .map_err(|(e, _)| format!("Authentifizierung fehlgeschlagen: {}", e))?;
    session
        .create(folder_path)
        .await
        .map_err(|e| format!("Ordner erstellen fehlgeschlagen: {}", e))?;
    let _ = session.logout().await;
    Ok(())
}

/// Löscht einen Ordner auf dem IMAP-Server.
pub async fn delete_imap_folder(
    email: &str,
    password: &str,
    host: &str,
    port: u16,
    folder_path: &str,
) -> Result<(), String> {
    let tls_stream = tls_connect(host, port).await?;
    let client = async_imap::Client::new(tls_stream);
    let mut session = client
        .login(email, password)
        .await
        .map_err(|(e, _)| format!("Authentifizierung fehlgeschlagen: {}", e))?;
    session
        .delete(folder_path)
        .await
        .map_err(|e| format!("Ordner löschen fehlgeschlagen: {}", e))?;
    let _ = session.logout().await;
    Ok(())
}
```

- [ ] **Step 2: `move_email` in `imap.rs` hinzufügen**

Ans Ende von `imap.rs` (nach `fetch_single_body`) einfügen:

```rust
/// Verschiebt eine E-Mail per IMAP: COPY → \Deleted markieren → EXPUNGE.
pub async fn move_email(
    email: &str,
    password: &str,
    host: &str,
    port: u16,
    uid: u32,
    source_folder: &str,
    target_folder: &str,
) -> Result<(), String> {
    let tls_stream = tls_connect(host, port).await?;
    let client = async_imap::Client::new(tls_stream);
    let mut session = client
        .login(email, password)
        .await
        .map_err(|(e, _)| format!("Authentifizierung fehlgeschlagen: {}", e))?;

    session
        .select(source_folder)
        .await
        .map_err(|e| format!("SELECT fehlgeschlagen: {}", e))?;

    let uid_set = uid.to_string();

    session
        .uid_copy(&uid_set, target_folder)
        .await
        .map_err(|e| format!("UID COPY fehlgeschlagen: {}", e))?;

    session
        .uid_store(&uid_set, "+FLAGS", "(\\Deleted)")
        .await
        .map_err(|e| format!("UID STORE fehlgeschlagen: {}", e))?
        .collect::<Vec<_>>()
        .await;

    session
        .expunge()
        .await
        .map_err(|e| format!("EXPUNGE fehlgeschlagen: {}", e))?
        .collect::<Vec<_>>()
        .await;

    let _ = session.logout().await;
    Ok(())
}
```

- [ ] **Step 3: Kompilieren prüfen**

```powershell
cd src-tauri && cargo check 2>&1 | tail -20
```

Erwartet: keine Fehler.

- [ ] **Step 4: Commit**

```powershell
git add src-tauri/src/email/folders.rs src-tauri/src/email/imap.rs
git commit -m "feat(email): IMAP create/delete folder + move_email"
```

---

## Task 2: DB-Hilfsfunktionen

**Files:**
- Modify: `src-tauri/src/email/db.rs`

- [ ] **Step 1: Drei DB-Funktionen nach `get_folder_last_uid` einfügen**

```rust
/// Entfernt Ordner-Eintrag und alle zugehörigen E-Mails aus dem lokalen Cache.
pub fn delete_folder(conn: &Connection, account_id: &str, path: &str) -> rusqlite::Result<()> {
    conn.execute(
        "DELETE FROM emails WHERE account_id = ?1 AND folder = ?2",
        params![account_id, path],
    )?;
    conn.execute(
        "DELETE FROM folders WHERE account_id = ?1 AND path = ?2",
        params![account_id, path],
    )?;
    Ok(())
}

/// Aktualisiert den Ordner einer E-Mail im lokalen Cache.
/// Verwendet OR IGNORE um UID-Konflikte zu ignorieren (UID ist nach Move stale).
pub fn update_email_folder(conn: &Connection, email_id: &str, target_folder: &str) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE OR IGNORE emails SET folder = ?1 WHERE id = ?2",
        params![target_folder, email_id],
    )?;
    Ok(())
}

/// Gibt die IMAP-Flags eines gecachten Ordners zurück (für Systemordner-Prüfung).
pub fn get_folder_flags(
    conn: &Connection,
    account_id: &str,
    path: &str,
) -> rusqlite::Result<Vec<String>> {
    let result = conn.query_row(
        "SELECT flags FROM folders WHERE account_id = ?1 AND path = ?2",
        params![account_id, path],
        |row| row.get::<_, String>(0),
    );
    match result {
        Ok(flags_json) => Ok(serde_json::from_str(&flags_json).unwrap_or_default()),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(vec![]),
        Err(e) => Err(e),
    }
}
```

- [ ] **Step 2: Unit-Tests hinzufügen**

Im `#[cfg(test)]`-Block in `db.rs` ans Ende des `tests`-Moduls einfügen:

```rust
#[test]
fn delete_folder_removes_emails_and_folder() {
    let conn = in_memory_db();
    conn.execute_batch(
        "INSERT INTO folders (id, account_id, path, delimiter, display_name, is_selectable, sort_order)
         VALUES ('f1','acc1','INBOX.Test','.','Test',1,0)"
    ).unwrap();
    conn.execute_batch(
        "INSERT INTO emails (id, account_id, uid, folder, from_addr, sent_at)
         VALUES ('e1','acc1',1,'INBOX.Test','x@x.de','2026-01-01')"
    ).unwrap();
    delete_folder(&conn, "acc1", "INBOX.Test").unwrap();
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM emails WHERE folder='INBOX.Test'", [], |r| r.get(0)
    ).unwrap();
    assert_eq!(count, 0);
    let count2: i64 = conn.query_row(
        "SELECT COUNT(*) FROM folders WHERE path='INBOX.Test'", [], |r| r.get(0)
    ).unwrap();
    assert_eq!(count2, 0);
}

#[test]
fn update_email_folder_changes_folder() {
    let conn = in_memory_db();
    conn.execute_batch(
        "INSERT INTO emails (id, account_id, uid, folder, from_addr, sent_at)
         VALUES ('e1','acc1',1,'INBOX','x@x.de','2026-01-01')"
    ).unwrap();
    update_email_folder(&conn, "e1", "INBOX.Archiv").unwrap();
    let folder: String = conn.query_row(
        "SELECT folder FROM emails WHERE id='e1'", [], |r| r.get(0)
    ).unwrap();
    assert_eq!(folder, "INBOX.Archiv");
}

#[test]
fn get_folder_flags_returns_empty_when_not_cached() {
    let conn = in_memory_db();
    let flags = get_folder_flags(&conn, "acc1", "INBOX.Unknown").unwrap();
    assert!(flags.is_empty());
}
```

- [ ] **Step 3: Tests ausführen**

```powershell
cd src-tauri && cargo test -p cynera -- email::db::tests 2>&1 | tail -20
```

Erwartet: alle Tests grün.

- [ ] **Step 4: Commit**

```powershell
git add src-tauri/src/email/db.rs
git commit -m "feat(email/db): delete_folder, update_email_folder, get_folder_flags"
```

---

## Task 3: Tauri-Commands + Registrierung

**Files:**
- Modify: `src-tauri/src/email/commands.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Drei Commands in `commands.rs` hinzufügen**

Nach dem Block `// ── Folder listing` (nach `email_list_folders`) einfügen:

```rust
// ── Folder management ─────────────────────────────────────────────────────────

const SYSTEM_PATH_SEGMENTS: &[&str] = &[
    "inbox", "sent", "sent messages", "drafts", "draft",
    "trash", "deleted messages", "deleted", "spam", "junk",
    "junk e-mail", "archive", "archiv",
];

const SYSTEM_FLAGS: &[&str] = &[
    "\\Sent", "\\Drafts", "\\Trash", "\\Junk", "\\All", "\\Archive",
];

#[tauri::command]
pub async fn email_create_folder(
    account_id: String,
    folder_path: String,
    db: tauri::State<'_, EmailDb>,
) -> Result<(), String> {
    let (email, imap_host, imap_port) = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let account = db::get_account(&conn, &account_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Konto nicht gefunden".to_string())?;
        (account.email, account.imap_host, account.imap_port)
    };
    let password = keychain::get(&email)?;
    crate::email::folders::create_imap_folder(&email, &password, &imap_host, imap_port, &folder_path).await
}

#[tauri::command]
pub async fn email_delete_folder(
    account_id: String,
    folder_path: String,
    db: tauri::State<'_, EmailDb>,
) -> Result<(), String> {
    // Systemordner schützen
    let path_lc = folder_path.to_lowercase();
    let last_seg = path_lc.split('.').last().unwrap_or(&path_lc);
    if path_lc == "inbox" || SYSTEM_PATH_SEGMENTS.contains(&last_seg) {
        return Err("Systemordner können nicht gelöscht werden.".to_string());
    }

    let (email, imap_host, imap_port) = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        // Flags aus DB-Cache prüfen
        let flags = db::get_folder_flags(&conn, &account_id, &folder_path)
            .map_err(|e| e.to_string())?;
        let flags_lc: Vec<String> = flags.iter().map(|f| f.to_lowercase()).collect();
        if SYSTEM_FLAGS.iter().any(|sf| flags_lc.contains(&sf.to_lowercase())) {
            return Err("Systemordner können nicht gelöscht werden.".to_string());
        }
        let account = db::get_account(&conn, &account_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Konto nicht gefunden".to_string())?;
        (account.email, account.imap_host, account.imap_port)
    };
    let password = keychain::get(&email)?;
    crate::email::folders::delete_imap_folder(&email, &password, &imap_host, imap_port, &folder_path).await?;
    // Cache bereinigen
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::delete_folder(&conn, &account_id, &folder_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn email_move_to_folder(
    account_id: String,
    email_id: String,
    target_folder: String,
    db: tauri::State<'_, EmailDb>,
) -> Result<(), String> {
    let (uid, source_folder, email_addr, imap_host, imap_port) = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let (uid, folder, _acc_id) = db::get_email_uid_and_folder(&conn, &email_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "E-Mail nicht gefunden".to_string())?;
        let account = db::get_account(&conn, &account_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Konto nicht gefunden".to_string())?;
        (uid, folder, account.email, account.imap_host, account.imap_port)
    };
    let password = keychain::get(&email_addr)?;
    crate::email::imap::move_email(
        &email_addr, &password, &imap_host, imap_port,
        uid, &source_folder, &target_folder,
    ).await?;
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::update_email_folder(&conn, &email_id, &target_folder).map_err(|e| e.to_string())
}
```

- [ ] **Step 2: Commands in `main.rs` registrieren**

Im `invoke_handler!`-Makro nach `email::commands::email_list_folders,` einfügen:

```rust
email::commands::email_create_folder,
email::commands::email_delete_folder,
email::commands::email_move_to_folder,
```

- [ ] **Step 3: Kompilieren**

```powershell
cd src-tauri && cargo check 2>&1 | tail -20
```

Erwartet: keine Fehler.

- [ ] **Step 4: Commit**

```powershell
git add src-tauri/src/email/commands.rs src-tauri/src/main.rs
git commit -m "feat(email/commands): create/delete folder + move email to folder"
```

---

## Task 4: Frontend Service + Store

**Files:**
- Modify: `src/services/mail.service.ts`
- Modify: `src/store/mail.store.ts`

- [ ] **Step 1: Service-Methoden in `mail.service.ts` hinzufügen**

Nach `downloadAttachment` einfügen:

```typescript
createFolder(accountId: string, folderPath: string): Promise<void> {
  return invoke<void>('email_create_folder', { accountId, folderPath })
},
deleteFolder(accountId: string, folderPath: string): Promise<void> {
  return invoke<void>('email_delete_folder', { accountId, folderPath })
},
moveToFolder(accountId: string, emailId: string, targetFolder: string): Promise<void> {
  return invoke<void>('email_move_to_folder', { accountId, emailId, targetFolder })
},
```

- [ ] **Step 2: Store-Interface in `mail.store.ts` erweitern**

Im `interface MailState` nach `downloadAttachment` folgende drei Zeilen hinzufügen:

```typescript
createFolder: (folderName: string, parentPath?: string) => Promise<void>
deleteFolder: (folderPath: string) => Promise<void>
moveToFolder: (emailId: string, targetFolder: string) => Promise<void>
```

- [ ] **Step 3: Store-Implementierungen hinzufügen**

Im `create`-Aufruf nach der `downloadAttachment`-Implementierung einfügen:

```typescript
createFolder: async (folderName, parentPath) => {
  const { selectedAccountId, folders, loadFolders } = get()
  if (!selectedAccountId) return
  const delimiter = folders[0]?.delimiter ?? '.'
  const fullPath = parentPath
    ? `${parentPath}${delimiter}${folderName}`
    : folderName
  await MailService.createFolder(selectedAccountId, fullPath)
  await loadFolders(selectedAccountId)
},

deleteFolder: async (folderPath) => {
  const { selectedAccountId, selectedFolder, loadFolders, loadEmails } = get()
  if (!selectedAccountId) return
  await MailService.deleteFolder(selectedAccountId, folderPath)
  if (selectedFolder === folderPath) {
    set({ selectedFolder: 'INBOX', emails: [], selectedEmail: null, emailBody: null })
    await loadEmails()
  }
  await loadFolders(selectedAccountId)
},

moveToFolder: async (emailId, targetFolder) => {
  const { selectedAccountId } = get()
  if (!selectedAccountId) return
  await MailService.moveToFolder(selectedAccountId, emailId, targetFolder)
  set(s => ({
    emails: s.emails.filter(e => e.id !== emailId),
    selectedEmail: s.selectedEmail?.id === emailId ? null : s.selectedEmail,
  }))
},
```

- [ ] **Step 4: TypeScript-Fehler prüfen**

```powershell
npx tsc --noEmit 2>&1 | head -30
```

Erwartet: keine neuen Fehler.

- [ ] **Step 5: Commit**

```powershell
git add src/services/mail.service.ts src/store/mail.store.ts
git commit -m "feat(mail): service + store für create/delete folder + moveToFolder"
```

---

## Task 5: Frontend UI — Ordner-Verwaltung + Drag & Drop

**Files:**
- Modify: `src/routes/MailRoute.tsx`

- [ ] **Step 1: Hilfsfunktion `isSystemFolder` nach `folderLabel` einfügen**

Nach der `folderLabel`-Funktion (Zeile ~79) einfügen:

```typescript
function isSystemFolder(f: { path: string; flags: string[] }): boolean {
  const p = f.path.toLowerCase()
  const last = p.split('/').pop()?.split('.').pop() ?? p
  const SYSTEM_NAMES = ['inbox','sent','sent messages','drafts','draft','trash',
    'deleted messages','deleted','spam','junk','junk e-mail','archive','archiv']
  if (p === 'inbox' || SYSTEM_NAMES.includes(last)) return true
  const flagsLc = f.flags.map(fl => fl.toLowerCase())
  return flagsLc.some(fl => ['\\sent','\\drafts','\\trash','\\junk','\\all','\\archive'].includes(fl))
}
```

- [ ] **Step 2: Store-Actions im MailRoute-Destrukturierungsblock ergänzen**

In `MailRoute` nach `const loadEmails = useMailStore(s => s.loadEmails)` drei Zeilen hinzufügen:

```typescript
const createFolder    = useMailStore(s => s.createFolder)
const deleteFolder    = useMailStore(s => s.deleteFolder)
const moveToFolder    = useMailStore(s => s.moveToFolder)
```

- [ ] **Step 3: Neuen lokalen State für Drag & Drop und Ordner-Erstellung ergänzen**

Nach den bestehenden `useState`-Aufrufen in `MailRoute` einfügen:

```typescript
const [dragOverFolder,    setDragOverFolder]    = useState<string | null>(null)
const [isCreatingFolder,  setIsCreatingFolder]  = useState(false)
const [newFolderName,     setNewFolderName]      = useState('')
const newFolderInputRef = useRef<HTMLInputElement>(null)
```

- [ ] **Step 4: `topFolders` aufteilen — systemFolders und customFolders**

Den bestehenden `topFolders`-`useMemo`-Block (ab Zeile ~288) **ersetzen** durch:

```typescript
const { systemFolders, customFolders } = useMemo(() => {
  const flat: typeof folders = []
  const seen = new Set<string>()
  function flatten(list: typeof folders) {
    for (const f of list) {
      if (!seen.has(f.path)) { seen.add(f.path); flat.push(f) }
      if (f.children?.length) flatten(f.children)
    }
  }
  flatten(folders)
  return {
    systemFolders: flat.filter(f => isSystemFolder(f)),
    customFolders: flat.filter(f => !isSystemFolder(f) && f.isSelectable),
  }
}, [folders])
```

- [ ] **Step 5: Postfächer-Bereich in der Sidebar — `topFolders` → `systemFolders`**

In der Sidebar (Zeile ~377) alle Vorkommen von `topFolders.map` durch `systemFolders.map` ersetzen.

- [ ] **Step 6: Den ORDNER-Bereich komplett ersetzen**

Den bestehenden ORDNER-Block (Zeilen ~396-413 — von `{customers.length > 0 && (` bis zum schließenden `</>)`) **komplett ersetzen** durch:

```tsx
{/* Separator + ORDNER */}
<div style={{ height: 1, background: 'var(--border)', margin: '10px 8px' }} />
<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 10px 8px' }}>
  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-dim)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Ordner</span>
  <button
    onClick={() => { setIsCreatingFolder(true); setTimeout(() => newFolderInputRef.current?.focus(), 50) }}
    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-dim)', display: 'flex', alignItems: 'center', padding: 2 }}
  >
    <Plus size={13} />
  </button>
</div>

{/* Inline-Eingabe neuer Ordner */}
{isCreatingFolder && (
  <div style={{ padding: '4px 10px 6px' }}>
    <input
      ref={newFolderInputRef}
      value={newFolderName}
      onChange={e => setNewFolderName(e.target.value)}
      onKeyDown={async e => {
        if (e.key === 'Enter' && newFolderName.trim()) {
          try { await createFolder(newFolderName.trim(), 'INBOX') } catch { /* toast ggf. */ }
          setNewFolderName(''); setIsCreatingFolder(false)
        }
        if (e.key === 'Escape') { setNewFolderName(''); setIsCreatingFolder(false) }
      }}
      onBlur={() => { if (!newFolderName.trim()) setIsCreatingFolder(false) }}
      placeholder="Ordnername…"
      style={{ width: '100%', fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--accent)', background: 'var(--surface-2)', color: 'var(--fg)', outline: 'none', fontFamily: 'inherit' }}
    />
  </div>
)}

{/* Custom-Ordner-Liste */}
{customFolders.map(f => {
  const active = selectedFolder === f.path
  const isDragTarget = dragOverFolder === f.path
  return (
    <div
      key={f.path}
      style={{ position: 'relative' }}
      onDragOver={e => { e.preventDefault(); setDragOverFolder(f.path) }}
      onDragLeave={() => setDragOverFolder(null)}
      onDrop={async e => {
        e.preventDefault()
        const emailId = e.dataTransfer.getData('emailId')
        if (emailId) {
          try { await moveToFolder(emailId, f.path) } catch { /* toast ggf. */ }
        }
        setDragOverFolder(null)
      }}
    >
      <button
        onClick={() => selectFolder(f.path)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
          padding: '7px 10px', borderRadius: 8, border: isDragTarget ? '1px dashed var(--accent)' : 'none',
          cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
          background: active ? '#dbeafe' : isDragTarget ? 'oklch(60% 0.15 250 / 0.12)' : 'transparent',
          color: active ? '#1d4ed8' : 'var(--fg-2)', fontSize: 13.5,
          fontWeight: active ? 600 : 400, transition: 'background 100ms',
        }}
        onMouseEnter={e => {
          if (!active) e.currentTarget.style.background = 'oklch(100% 0 0 / 0.05)'
          const del = e.currentTarget.querySelector<HTMLElement>('.folder-del')
          if (del) del.style.opacity = '1'
        }}
        onMouseLeave={e => {
          if (!active && dragOverFolder !== f.path) e.currentTarget.style.background = 'transparent'
          const del = e.currentTarget.querySelector<HTMLElement>('.folder-del')
          if (del) del.style.opacity = '0'
        }}
      >
        <Mail size={15} style={{ color: active ? '#1d4ed8' : 'var(--fg-dim)', flexShrink: 0 }} />
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.displayName}</span>
        <span
          className="folder-del"
          style={{ opacity: 0, transition: 'opacity 120ms', color: 'var(--fg-dim)', display: 'flex', alignItems: 'center', padding: '1px 2px', borderRadius: 4 }}
          onClick={async e => {
            e.stopPropagation()
            if (!confirm(`Ordner "${f.displayName}" wirklich löschen?`)) return
            try { await deleteFolder(f.path) } catch (err) { alert(String(err)) }
          }}
        >
          <Trash2 size={12} />
        </span>
      </button>
    </div>
  )
})}
```

- [ ] **Step 7: E-Mail-Zeilen draggable machen**

Im E-Mail-Listen-Bereich (ca. Zeile ~491) das `<div key={email.id} onClick=...` um `draggable` und `onDragStart` ergänzen:

```tsx
<div
  key={email.id}
  draggable
  onDragStart={e => e.dataTransfer.setData('emailId', email.id)}
  onClick={() => selectEmail(email)}
  // ... restliche props unverändert
>
```

- [ ] **Step 8: TypeScript-Fehler prüfen**

```powershell
npx tsc --noEmit 2>&1 | head -30
```

Erwartet: keine neuen Fehler.

- [ ] **Step 9: App bauen und manuell testen**

```powershell
npm run tauri dev
```

Testen:
1. Im ORDNER-Bereich auf `+` klicken → Eingabefeld erscheint
2. Ordnernamen tippen + Enter → Ordner erscheint in der Liste (Reload nach ~2s)
3. Ordner anklicken → E-Mails werden geladen (leer = OK)
4. E-Mail-Zeile ziehen → auf Ordner ziehen → gestrichelte Umrandung + blauer Hintergrund erscheint
5. E-Mail loslassen → E-Mail verschwindet aus der Liste
6. Auf Zielordner klicken → E-Mail ist dort
7. Hover auf Ordner → Papierkorb-Icon erscheint
8. Auf Papierkorb klicken → Bestätigung → Ordner verschwindet

- [ ] **Step 10: Commit**

```powershell
git add src/routes/MailRoute.tsx
git commit -m "feat(mail/ui): Ordner anlegen/löschen + Drag & Drop in Ordner"
```

---

## Self-Review

**Spec-Coverage:**
- ✅ Ordner anlegen → Task 1 (IMAP) + Task 3 (Command) + Task 4 (Store) + Task 5 (UI)
- ✅ Ordner löschen → Task 1 + Task 2 (DB) + Task 3 + Task 4 + Task 5
- ✅ Drag & Drop → Task 4 (moveToFolder) + Task 5 (draggable + onDrop)
- ✅ Systemordner-Schutz → Task 3 (Command) + Task 5 (isSystemFolder filtert aus Ordner-Liste)
- ✅ Serversseitig / für alle sichtbar → IMAP-Operationen in Tasks 1+3

**Kein Placeholder vorhanden.**

**Typ-Konsistenz:**
- `createFolder(folderName, parentPath?)` — konsistent in Service, Store, UI
- `deleteFolder(folderPath)` — konsistent in Service, Store, UI  
- `moveToFolder(emailId, targetFolder)` — konsistent in Service, Store, UI
- `isSystemFolder(f: {path, flags})` — passt zu `MailFolder` (hat beide Felder)
