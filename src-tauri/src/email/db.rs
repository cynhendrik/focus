use rusqlite::{Connection, params};
use crate::email::types::{Account, EmailHeader, EmailBody};

pub struct EmailDb(pub std::sync::Mutex<Connection>);

pub fn init_schema(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS accounts (
            id               TEXT PRIMARY KEY,
            email            TEXT NOT NULL UNIQUE,
            display_name     TEXT NOT NULL DEFAULT '',
            imap_host        TEXT NOT NULL,
            imap_port        INTEGER NOT NULL DEFAULT 993,
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
    ")
}

pub fn get_accounts(conn: &Connection) -> rusqlite::Result<Vec<Account>> {
    let mut stmt = conn.prepare(
        "SELECT id, email, display_name, imap_host, imap_port, last_synced_at, status
         FROM accounts ORDER BY email"
    )?;
    let rows = stmt.query_map([], |row| Ok(Account {
        id:             row.get(0)?,
        email:          row.get(1)?,
        display_name:   row.get(2)?,
        imap_host:      row.get(3)?,
        imap_port:      row.get(4)?,
        last_synced_at: row.get(5)?,
        status:         row.get(6)?,
    }))?;
    rows.collect()
}

pub fn get_account(conn: &Connection, id: &str) -> rusqlite::Result<Option<Account>> {
    let mut stmt = conn.prepare(
        "SELECT id, email, display_name, imap_host, imap_port, last_synced_at, status
         FROM accounts WHERE id = ?1"
    )?;
    let mut rows = stmt.query_map(params![id], |row| Ok(Account {
        id:             row.get(0)?,
        email:          row.get(1)?,
        display_name:   row.get(2)?,
        imap_host:      row.get(3)?,
        imap_port:      row.get(4)?,
        last_synced_at: row.get(5)?,
        status:         row.get(6)?,
    }))?;
    Ok(rows.next().transpose()?)
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
        "INSERT INTO accounts (id, email, display_name, imap_host, imap_port, status)
         VALUES (?1, ?2, ?3, ?4, ?5, 'active')",
        params![
            account.id, account.email, account.display_name,
            account.imap_host, account.imap_port
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
