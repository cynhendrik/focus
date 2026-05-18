use rusqlite::Connection;
use crate::AppError;

pub fn create_tables(conn: &Connection) -> Result<(), AppError> {
    conn.execute_batch(r#"
        CREATE TABLE IF NOT EXISTS accounts (
            id              TEXT PRIMARY KEY,
            workspace_id    TEXT NOT NULL DEFAULT '',
            created_by      TEXT NOT NULL DEFAULT '',
            name            TEXT NOT NULL,
            kind            TEXT NOT NULL DEFAULT 'company',
            industry        TEXT,
            website         TEXT,
            status          TEXT NOT NULL DEFAULT 'prospect',
            priority        TEXT NOT NULL DEFAULT 'normal',
            tags            TEXT NOT NULL DEFAULT '[]',
            goals           TEXT NOT NULL DEFAULT '[]',
            health_score    REAL,
            internal_notes  TEXT,
            is_private      INTEGER NOT NULL DEFAULT 0,
            social_links    TEXT NOT NULL DEFAULT '{}',
            primary_deal_id TEXT,
            lead_score      REAL NOT NULL DEFAULT 0,
            score_factors   TEXT NOT NULL DEFAULT '{}',
            street          TEXT,
            zip             TEXT,
            city            TEXT,
            country         TEXT,
            pending_sync    INTEGER NOT NULL DEFAULT 0,
            created_at      TEXT NOT NULL,
            updated_at      TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS contacts (
            id              TEXT PRIMARY KEY,
            workspace_id    TEXT NOT NULL DEFAULT '',
            created_by      TEXT NOT NULL DEFAULT '',
            account_id      TEXT REFERENCES accounts(id) ON DELETE SET NULL,
            first_name      TEXT NOT NULL,
            last_name       TEXT,
            email           TEXT,
            phone           TEXT,
            role            TEXT,
            is_primary      INTEGER NOT NULL DEFAULT 0,
            avatar_url      TEXT,
            pending_sync    INTEGER NOT NULL DEFAULT 0,
            created_at      TEXT NOT NULL,
            updated_at      TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS deals (
            id              TEXT PRIMARY KEY,
            workspace_id    TEXT NOT NULL DEFAULT '',
            created_by      TEXT NOT NULL DEFAULT '',
            account_id      TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            contact_id      TEXT REFERENCES contacts(id) ON DELETE SET NULL,
            customer_id     TEXT,
            title           TEXT NOT NULL,
            stage           TEXT NOT NULL DEFAULT 'prospect',
            value           REAL,
            currency        TEXT NOT NULL DEFAULT 'EUR',
            probability     INTEGER,
            expected_close  TEXT,
            owner           TEXT,
            pending_sync    INTEGER NOT NULL DEFAULT 0,
            created_at      TEXT NOT NULL,
            updated_at      TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS activities (
            id              TEXT PRIMARY KEY,
            workspace_id    TEXT NOT NULL DEFAULT '',
            created_by      TEXT NOT NULL DEFAULT '',
            account_id      TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            contact_id      TEXT REFERENCES contacts(id) ON DELETE SET NULL,
            deal_id         TEXT REFERENCES deals(id) ON DELETE SET NULL,
            customer_id     TEXT,
            type            TEXT NOT NULL,
            title           TEXT,
            body            TEXT,
            payload         TEXT NOT NULL DEFAULT '{}',
            status          TEXT NOT NULL DEFAULT 'open',
            due_at          TEXT,
            assignee        TEXT,
            outcome         TEXT,
            pending_sync    INTEGER NOT NULL DEFAULT 0,
            created_at      TEXT NOT NULL,
            updated_at      TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_activities_account
            ON activities(account_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_activities_deal
            ON activities(deal_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_activities_contact
            ON activities(contact_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS pipeline_stages (
            id           TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            name         TEXT NOT NULL,
            label        TEXT NOT NULL,
            order_index  INTEGER NOT NULL DEFAULT 0,
            color        TEXT NOT NULL DEFAULT '#6B7280',
            is_won       INTEGER NOT NULL DEFAULT 0,
            is_lost      INTEGER NOT NULL DEFAULT 0,
            created_at   TEXT NOT NULL,
            updated_at   TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_pipeline_stages_workspace
            ON pipeline_stages(workspace_id, order_index);

        CREATE TABLE IF NOT EXISTS automation_rules (
            id             TEXT PRIMARY KEY,
            workspace_id   TEXT NOT NULL,
            name           TEXT NOT NULL,
            is_system      INTEGER NOT NULL DEFAULT 0,
            is_active      INTEGER NOT NULL DEFAULT 1,
            trigger_type   TEXT NOT NULL,
            trigger_filter TEXT NOT NULL DEFAULT '{}',
            action_type    TEXT NOT NULL,
            action_params  TEXT NOT NULL DEFAULT '{}',
            order_index    INTEGER NOT NULL DEFAULT 0,
            created_at     TEXT NOT NULL,
            updated_at     TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_automation_rules_workspace
            ON automation_rules(workspace_id, is_active, trigger_type);

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
            folder_id   TEXT REFERENCES folders(id) ON DELETE CASCADE,
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

        CREATE TABLE IF NOT EXISTS smart_lists (
            id           TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            name         TEXT NOT NULL,
            icon         TEXT NOT NULL DEFAULT '📋',
            filter       TEXT NOT NULL DEFAULT '{}',
            order_index  INTEGER NOT NULL DEFAULT 0,
            is_system    INTEGER NOT NULL DEFAULT 0,
            created_at   TEXT NOT NULL,
            updated_at   TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_smart_lists_workspace
            ON smart_lists(workspace_id, order_index);
    "#)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_tables_created_in_schema() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        create_tables(&conn).unwrap();
        let tables: Vec<String> = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table'")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();
        assert!(tables.contains(&"accounts".to_string()));
        assert!(tables.contains(&"contacts".to_string()));
        assert!(tables.contains(&"deals".to_string()));
        assert!(tables.contains(&"activities".to_string()));
        assert!(tables.contains(&"pipeline_stages".to_string()));
    }

    #[test]
    fn schema_has_pipeline_stages_table() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        create_tables(&conn).unwrap();
        // Check new account columns exist
        let cols: Vec<String> = conn
            .prepare("PRAGMA table_info(accounts)").unwrap()
            .query_map([], |r| r.get(1)).unwrap()
            .filter_map(|r| r.ok()).collect();
        assert!(cols.contains(&"primary_deal_id".to_string()));
        assert!(cols.contains(&"lead_score".to_string()));
        // Check new activity column exists
        let act_cols: Vec<String> = conn
            .prepare("PRAGMA table_info(activities)").unwrap()
            .query_map([], |r| r.get(1)).unwrap()
            .filter_map(|r| r.ok()).collect();
        assert!(act_cols.contains(&"outcome".to_string()));
        // Check pipeline_stages columns exist
        let ps_cols: Vec<String> = conn
            .prepare("PRAGMA table_info(pipeline_stages)").unwrap()
            .query_map([], |r| r.get(1)).unwrap()
            .filter_map(|r| r.ok()).collect();
        assert!(ps_cols.contains(&"updated_at".to_string()));
    }
}
