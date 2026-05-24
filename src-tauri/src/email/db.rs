use rusqlite::{Connection, params};
use uuid::Uuid;
use crate::email::types::{Account, EmailHeader, EmailBody};

pub struct EmailDb(pub std::sync::Mutex<Connection>);

pub fn init_schema(conn: &Connection) -> rusqlite::Result<()> {
    // Base tables (idempotent)
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS accounts (
            id               TEXT PRIMARY KEY,
            email            TEXT NOT NULL UNIQUE,
            display_name     TEXT NOT NULL DEFAULT '',
            imap_host        TEXT NOT NULL,
            imap_port        INTEGER NOT NULL DEFAULT 993,
            smtp_host        TEXT NOT NULL DEFAULT '',
            smtp_port        INTEGER NOT NULL DEFAULT 587,
            smtp_starttls    INTEGER NOT NULL DEFAULT 1,
            last_synced_uid  INTEGER NOT NULL DEFAULT 0,
            last_synced_at   TEXT,
            status           TEXT NOT NULL DEFAULT 'active'
        );

        CREATE TABLE IF NOT EXISTS emails (
            id          TEXT PRIMARY KEY,
            account_id  TEXT NOT NULL,
            uid         INTEGER NOT NULL,
            folder      TEXT NOT NULL,
            message_id  TEXT,
            subject     TEXT NOT NULL DEFAULT '',
            from_addr   TEXT NOT NULL DEFAULT '',
            from_name   TEXT NOT NULL DEFAULT '',
            to_addrs    TEXT NOT NULL DEFAULT '[]',
            body_text   TEXT NOT NULL DEFAULT '',
            body_html   TEXT NOT NULL DEFAULT '',
            sent_at     TEXT NOT NULL DEFAULT '',
            is_read     INTEGER NOT NULL DEFAULT 0,
            customer_id TEXT,
            UNIQUE(account_id, folder, uid)
        );

        CREATE INDEX IF NOT EXISTS idx_emails_date     ON emails(sent_at DESC);
        CREATE INDEX IF NOT EXISTS idx_emails_folder   ON emails(account_id, folder);
        CREATE INDEX IF NOT EXISTS idx_emails_customer ON emails(customer_id);
        CREATE INDEX IF NOT EXISTS idx_emails_from     ON emails(from_addr);

        CREATE TABLE IF NOT EXISTS email_attachments (
            id          TEXT PRIMARY KEY,
            email_id    TEXT NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
            filename    TEXT NOT NULL,
            mime_type   TEXT NOT NULL DEFAULT 'application/octet-stream',
            size_bytes  INTEGER NOT NULL DEFAULT 0,
            content     BLOB NOT NULL,
            created_at  TEXT NOT NULL,
            UNIQUE(email_id, filename)
        );

        CREATE INDEX IF NOT EXISTS idx_email_attachments_email ON email_attachments(email_id);
    ")?;

    // Additive migration for existing databases (pre-smtp schema)
    let version: i32 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    if version < 2 {
        // Add SMTP columns if they don't exist yet (ALTER TABLE is idempotent-safe here
        // because we only run this block once, guarded by user_version)
        let _ = conn.execute_batch("
            ALTER TABLE accounts ADD COLUMN smtp_host     TEXT NOT NULL DEFAULT '';
            ALTER TABLE accounts ADD COLUMN smtp_port     INTEGER NOT NULL DEFAULT 587;
            ALTER TABLE accounts ADD COLUMN smtp_starttls INTEGER NOT NULL DEFAULT 1;
        ");
        conn.execute_batch("PRAGMA user_version = 2")?;
    }

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

    Ok(())
}

pub fn get_accounts(conn: &Connection) -> rusqlite::Result<Vec<Account>> {
    let mut stmt = conn.prepare(
        "SELECT id, email, display_name, imap_host, imap_port,
                smtp_host, smtp_port, smtp_starttls, last_synced_at, status
         FROM accounts ORDER BY email"
    )?;
    let rows = stmt.query_map([], |row| Ok(Account {
        id:             row.get(0)?,
        email:          row.get(1)?,
        display_name:   row.get(2)?,
        imap_host:      row.get(3)?,
        imap_port:      row.get(4)?,
        smtp_host:      row.get(5)?,
        smtp_port:      row.get(6)?,
        smtp_starttls:  row.get::<_, i32>(7)? != 0,
        last_synced_at: row.get(8)?,
        status:         row.get(9)?,
    }))?;
    rows.collect()
}

pub fn get_account(conn: &Connection, id: &str) -> rusqlite::Result<Option<Account>> {
    let mut stmt = conn.prepare(
        "SELECT id, email, display_name, imap_host, imap_port,
                smtp_host, smtp_port, smtp_starttls, last_synced_at, status
         FROM accounts WHERE id = ?1"
    )?;
    let mut rows = stmt.query_map(params![id], |row| Ok(Account {
        id:             row.get(0)?,
        email:          row.get(1)?,
        display_name:   row.get(2)?,
        imap_host:      row.get(3)?,
        imap_port:      row.get(4)?,
        smtp_host:      row.get(5)?,
        smtp_port:      row.get(6)?,
        smtp_starttls:  row.get::<_, i32>(7)? != 0,
        last_synced_at: row.get(8)?,
        status:         row.get(9)?,
    }))?;
    Ok(rows.next().transpose()?)
}

/// Returns `(email, smtp_host, smtp_port, smtp_starttls)` for the `email_send` command.
pub fn get_account_smtp(conn: &Connection, id: &str) -> rusqlite::Result<(String, String, u16, bool)> {
    conn.query_row(
        "SELECT email, smtp_host, smtp_port, smtp_starttls FROM accounts WHERE id = ?1",
        params![id],
        |row| Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, u16>(2)?,
            row.get::<_, i32>(3)? != 0,
        )),
    )
}

/// Returns (email, imap_host, imap_port, last_synced_uid)
pub fn get_account_sync_info(
    conn: &Connection,
    id: &str,
) -> rusqlite::Result<(String, String, u16, u32)> {
    conn.query_row(
        "SELECT email, imap_host, imap_port, last_synced_uid FROM accounts WHERE id = ?1",
        params![id],
        |row| Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, u16>(2)?,
            row.get::<_, u32>(3)?,
        )),
    )
}

pub fn insert_account(conn: &Connection, account: &Account) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO accounts
             (id, email, display_name, imap_host, imap_port, smtp_host, smtp_port, smtp_starttls, status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'active')",
        params![
            account.id, account.email, account.display_name,
            account.imap_host, account.imap_port,
            account.smtp_host, account.smtp_port, account.smtp_starttls as i32
        ],
    )?;
    Ok(())
}

pub fn delete_account(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM emails WHERE account_id = ?1", params![id])?;
    conn.execute("DELETE FROM accounts WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn update_account_status(conn: &Connection, id: &str, status: &str) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE accounts SET status = ?1 WHERE id = ?2",
        params![status, id],
    )?;
    Ok(())
}

pub fn update_last_synced(conn: &Connection, id: &str, uid: u32, at: &str) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE accounts SET last_synced_uid = ?1, last_synced_at = ?2 WHERE id = ?3",
        params![uid, at, id],
    )?;
    Ok(())
}

pub struct EmailRow {
    pub id: String,
    pub account_id: String,
    pub uid: u32,
    pub folder: String,
    pub message_id: String,
    pub subject: String,
    pub from_addr: String,
    pub from_name: String,
    pub to_addrs_json: String,
    pub body_text: String,
    pub body_html: String,
    pub sent_at: String,
    pub is_read: bool,
    pub customer_id: Option<String>,
}

pub fn insert_emails(conn: &Connection, rows: &[EmailRow]) -> rusqlite::Result<usize> {
    let mut inserted = 0;
    for row in rows {
        let n = conn.execute(
            "INSERT OR IGNORE INTO emails
             (id, account_id, uid, folder, message_id, subject, from_addr, from_name,
              to_addrs, body_text, body_html, sent_at, is_read, customer_id)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
            params![
                row.id, row.account_id, row.uid, row.folder, row.message_id,
                row.subject, row.from_addr, row.from_name, row.to_addrs_json,
                row.body_text, row.body_html, row.sent_at,
                row.is_read as i32, row.customer_id
            ],
        )?;
        inserted += n;
    }
    Ok(inserted)
}

pub fn list_emails(
    conn: &Connection,
    account_id: &str,
    folder: &str,
    limit: i64,
    offset: i64,
    search: &str,
) -> rusqlite::Result<Vec<EmailHeader>> {
    let pattern = format!("%{}%", search);
    let mut stmt = conn.prepare(
        "SELECT id, account_id, uid, folder, subject, from_addr, from_name,
                to_addrs, sent_at, is_read, customer_id
         FROM emails
         WHERE account_id = ?1 AND folder = ?2
           AND (subject LIKE ?3 OR from_addr LIKE ?3 OR from_name LIKE ?3)
         ORDER BY sent_at DESC
         LIMIT ?4 OFFSET ?5"
    )?;
    let rows = stmt.query_map(
        params![account_id, folder, pattern, limit, offset],
        |row| {
            let to_json: String = row.get(7)?;
            let to_addrs: Vec<String> = serde_json::from_str(&to_json).unwrap_or_default();
            Ok(EmailHeader {
                id:          row.get(0)?,
                account_id:  row.get(1)?,
                uid:         row.get(2)?,
                folder:      row.get(3)?,
                subject:     row.get(4)?,
                from_addr:   row.get(5)?,
                from_name:   row.get(6)?,
                to_addrs,
                sent_at:     row.get(8)?,
                is_read:     row.get::<_, i32>(9)? != 0,
                customer_id: row.get(10)?,
            })
        }
    )?;
    rows.collect()
}

pub fn get_email_body(conn: &Connection, id: &str) -> rusqlite::Result<Option<EmailBody>> {
    let mut stmt = conn.prepare(
        "SELECT id, body_text, body_html FROM emails WHERE id = ?1"
    )?;
    let mut rows = stmt.query_map(params![id], |row| Ok(EmailBody {
        id:        row.get(0)?,
        body_text: row.get(1)?,
        body_html: row.get(2)?,
    }))?;
    Ok(rows.next().transpose()?)
}

pub fn set_read(conn: &Connection, id: &str, is_read: bool) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE emails SET is_read = ?1 WHERE id = ?2",
        params![is_read as i32, id],
    )?;
    Ok(())
}

pub fn assign_customer(conn: &Connection, id: &str, customer_id: Option<&str>) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE emails SET customer_id = ?1 WHERE id = ?2",
        params![customer_id, id],
    )?;
    Ok(())
}

pub fn delete_email(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM emails WHERE id = ?1", params![id])?;
    Ok(())
}

// ── Folder CRUD ───────────────────────────────────────────────────────────────

pub fn upsert_folders(
    conn: &Connection,
    account_id: &str,
    folders: &[crate::email::types::RawFolder],
) -> rusqlite::Result<()> {
    // Komplett neu schreiben in einer Transaktion — atomisch: entweder alles oder nichts
    let tx = conn.unchecked_transaction()?;
    tx.execute("DELETE FROM folders WHERE account_id = ?1", params![account_id])?;
    for (i, f) in folders.iter().enumerate() {
        let id = format!("{}-{}", account_id, f.path);
        let flags_json = serde_json::to_string(&f.flags).unwrap_or_else(|_| "[]".to_string());
        tx.execute(
            "INSERT OR REPLACE INTO folders
             (id, account_id, path, delimiter, display_name, parent_path, flags, is_selectable, sort_order, last_fetched_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
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
                chrono::Utc::now().to_rfc3339(),
            ],
        )?;
    }
    tx.commit()
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

// ── Attachment CRUD ───────────────────────────────────────────────────────────

pub fn insert_attachments(conn: &Connection, attachments: &[crate::email::types::RawAttachment]) -> rusqlite::Result<()> {
    for att in attachments {
        conn.execute(
            "INSERT OR IGNORE INTO email_attachments (id, email_id, filename, mime_type, size_bytes, content, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                Uuid::new_v4().to_string(),
                att.email_id,
                att.filename,
                att.mime_type,
                att.content.len() as i64,
                att.content,
                chrono::Utc::now().to_rfc3339(),
            ],
        )?;
    }
    Ok(())
}

pub fn get_attachments(conn: &Connection, email_id: &str) -> rusqlite::Result<Vec<crate::email::types::EmailAttachment>> {
    let mut stmt = conn.prepare(
        "SELECT id, email_id, filename, mime_type, size_bytes
         FROM email_attachments WHERE email_id = ?1 ORDER BY filename"
    )?;
    let rows = stmt.query_map(params![email_id], |row| {
        Ok(crate::email::types::EmailAttachment {
            id:         row.get(0)?,
            email_id:   row.get(1)?,
            filename:   row.get(2)?,
            mime_type:  row.get(3)?,
            size_bytes: row.get::<_, i64>(4)? as usize,
        })
    })?;
    rows.collect()
}

pub fn get_attachment_content(conn: &Connection, attachment_id: &str) -> rusqlite::Result<Option<(String, Vec<u8>)>> {
    let mut stmt = conn.prepare(
        "SELECT filename, content FROM email_attachments WHERE id = ?1"
    )?;
    let mut rows = stmt.query_map(params![attachment_id], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, Vec<u8>>(1)?))
    })?;
    Ok(rows.next().transpose()?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn in_memory_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        conn
    }

    #[test]
    fn schema_creates_smtp_columns() {
        let conn = in_memory_db();
        conn.execute_batch(
            "INSERT INTO accounts (id, email, imap_host, imap_port, smtp_host, smtp_port, smtp_starttls)
             VALUES ('x','e@e.de','imap.e.de',993,'smtp.e.de',587,1)"
        ).unwrap();
    }

    #[test]
    fn schema_creates_email_attachments_table() {
        let conn = in_memory_db();
        conn.execute_batch(
            "INSERT INTO emails (id, account_id, uid, folder, from_addr, sent_at)
             VALUES ('e1','a1',1,'INBOX','f@f.de','2026-01-01')"
        ).unwrap();
        conn.execute_batch(
            "INSERT INTO email_attachments (id, email_id, filename, mime_type, size_bytes, content, created_at)
             VALUES ('att1','e1','file.pdf','application/pdf',1024,X'00','2026-01-01')"
        ).unwrap();
    }

    #[test]
    fn get_accounts_returns_smtp_fields() {
        let conn = in_memory_db();
        conn.execute_batch(
            "INSERT INTO accounts (id, email, imap_host, imap_port, smtp_host, smtp_port, smtp_starttls)
             VALUES ('a1','a@b.de','imap.b.de',993,'smtp.b.de',587,1)"
        ).unwrap();
        let accounts = get_accounts(&conn).unwrap();
        assert_eq!(accounts.len(), 1);
        assert_eq!(accounts[0].smtp_host, "smtp.b.de");
        assert_eq!(accounts[0].smtp_port, 587);
        assert!(accounts[0].smtp_starttls);
    }

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
}
