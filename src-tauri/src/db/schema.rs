use rusqlite::Connection;
use crate::AppError;

pub fn create_tables(conn: &Connection) -> Result<(), AppError> {
    conn.execute_batch(r#"
        CREATE TABLE IF NOT EXISTS customers (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            company     TEXT,
            email       TEXT,
            phone       TEXT,
            status      TEXT NOT NULL DEFAULT 'aktiv',
            priority    TEXT NOT NULL DEFAULT 'normal',
            tags        TEXT NOT NULL DEFAULT '[]',
            notes_meta  TEXT NOT NULL DEFAULT '{}',
            is_private  INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT NOT NULL,
            updated_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS todos (
            id          TEXT PRIMARY KEY,
            customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
            title       TEXT NOT NULL,
            status      TEXT NOT NULL DEFAULT 'open',
            priority    TEXT NOT NULL DEFAULT 'normal',
            due_date    TEXT,
            created_at  TEXT NOT NULL,
            updated_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS notes (
            id          TEXT PRIMARY KEY,
            customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
            title       TEXT NOT NULL,
            content     TEXT NOT NULL DEFAULT '',
            pinned      INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT NOT NULL,
            updated_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS kpis (
            id          TEXT PRIMARY KEY,
            customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
            label       TEXT NOT NULL,
            value       REAL,
            unit        TEXT,
            target      REAL,
            period      TEXT,
            updated_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS deadlines (
            id          TEXT PRIMARY KEY,
            customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
            title       TEXT NOT NULL,
            due_date    TEXT NOT NULL,
            done        INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS crm_follow_ups (
            id          TEXT PRIMARY KEY,
            customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
            title       TEXT NOT NULL,
            due_date    TEXT NOT NULL,
            status      TEXT NOT NULL DEFAULT 'offen',
            priority    TEXT NOT NULL DEFAULT 'normal',
            created_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS health_scores (
            id          TEXT PRIMARY KEY,
            customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
            score       REAL NOT NULL,
            factors     TEXT NOT NULL DEFAULT '{}',
            recorded_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS time_entries (
            id          TEXT PRIMARY KEY,
            customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
            description TEXT NOT NULL,
            minutes     INTEGER NOT NULL,
            date        TEXT NOT NULL,
            created_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS time_planning (
            id                 TEXT PRIMARY KEY DEFAULT 'singleton',
            global_week_hours  REAL NOT NULL DEFAULT 40,
            global_month_hours REAL NOT NULL DEFAULT 160,
            per_customer       TEXT NOT NULL DEFAULT '{}'
        );

        INSERT OR IGNORE INTO time_planning (id) VALUES ('singleton');

        CREATE TABLE IF NOT EXISTS folders (
            id          TEXT PRIMARY KEY,
            customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
            name        TEXT NOT NULL,
            parent_id   TEXT REFERENCES folders(id),
            created_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS files (
            id          TEXT PRIMARY KEY,
            customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
            folder_id   TEXT REFERENCES folders(id),
            name        TEXT NOT NULL,
            path        TEXT NOT NULL,
            size        INTEGER,
            mime_type   TEXT,
            created_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS chat_messages (
            id          TEXT PRIMARY KEY,
            customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
            content     TEXT NOT NULL,
            sender      TEXT NOT NULL,
            read        INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS email_accounts (
            id             TEXT PRIMARY KEY,
            email          TEXT NOT NULL,
            display_name   TEXT,
            imap_host      TEXT NOT NULL,
            imap_port      INTEGER NOT NULL,
            last_synced_at TEXT,
            status         TEXT NOT NULL DEFAULT 'active'
        );

        CREATE TABLE IF NOT EXISTS emails (
            id          TEXT PRIMARY KEY,
            account_id  TEXT NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
            message_id  TEXT,
            from_addr   TEXT,
            to_addr     TEXT,
            subject     TEXT,
            preview     TEXT,
            body        TEXT,
            received_at TEXT,
            read        INTEGER NOT NULL DEFAULT 0,
            customer_id TEXT REFERENCES customers(id),
            tags        TEXT NOT NULL DEFAULT '[]'
        );

        CREATE TABLE IF NOT EXISTS company_settings (
            id         TEXT PRIMARY KEY DEFAULT 'singleton',
            profile    TEXT NOT NULL DEFAULT '{}',
            modules    TEXT NOT NULL DEFAULT '{}',
            crm_config TEXT NOT NULL DEFAULT '{}',
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS app_state (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    "#)?;
    Ok(())
}
