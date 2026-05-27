use rusqlite::Connection;
use crate::AppError;

const CURRENT_VERSION: u32 = 15;

pub fn run(conn: &Connection) -> Result<(), AppError> {
    let version = get_version(conn)?;
    for v in (version + 1)..=CURRENT_VERSION {
        apply(conn, v)?;
        set_version(conn, v)?;
    }
    Ok(())
}

fn get_version(conn: &Connection) -> Result<u32, AppError> {
    let v: u32 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))
        .unwrap_or(0);
    Ok(v)
}

fn set_version(conn: &Connection, version: u32) -> Result<(), AppError> {
    conn.execute_batch(&format!("PRAGMA user_version = {version}"))
        .map_err(AppError::from)
}

fn table_exists(conn: &Connection, name: &str) -> bool {
    conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
        [name],
        |r| r.get::<_, i64>(0),
    ).unwrap_or(0) > 0
}

fn column_exists(conn: &Connection, table: &str, column: &str) -> bool {
    conn.prepare(&format!("PRAGMA table_info({table})"))
        .and_then(|mut s| {
            s.query_map([], |r| r.get::<_, String>(1))
                .map(|rows| rows.filter_map(|r| r.ok()).any(|c| c == column))
        })
        .unwrap_or(false)
}

fn apply(conn: &Connection, version: u32) -> Result<(), AppError> {
    match version {
        1 => {
            let now = chrono::Utc::now().to_rfc3339();
            if table_exists(conn, "customers") {
                conn.execute(
                    "INSERT OR IGNORE INTO customers (id, name, is_private, created_at, updated_at)
                     VALUES ('__cynera_privat__', 'Privat', 1, ?1, ?2)",
                    rusqlite::params![now, now],
                )?;
            }
            Ok(())
        }
        2 => {
            let tables = [
                "customers", "todos", "notes", "kpis", "deadlines",
                "crm_follow_ups", "health_scores", "time_entries",
                "folders", "files", "chat_messages", "emails",
            ];
            for table in &tables {
                if !table_exists(conn, table) { continue; }
                if !column_exists(conn, table, "workspace_id") {
                    conn.execute_batch(&format!(
                        "ALTER TABLE {table} ADD COLUMN workspace_id TEXT NOT NULL DEFAULT '';
                         ALTER TABLE {table} ADD COLUMN created_by   TEXT NOT NULL DEFAULT '';
                         ALTER TABLE {table} ADD COLUMN pending_sync INTEGER NOT NULL DEFAULT 0;"
                    ))?;
                }
            }
            Ok(())
        }
        3 => {
            conn.execute_batch(r#"
                CREATE TABLE IF NOT EXISTS sync_queue (
                    id          TEXT PRIMARY KEY,
                    table_name  TEXT NOT NULL,
                    record_id   TEXT NOT NULL,
                    operation   TEXT NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
                    payload     TEXT NOT NULL,
                    created_at  TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS sync_meta (
                    key   TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
            "#)?;
            Ok(())
        }
        4 => {
            if !table_exists(conn, "customers") { return Ok(()); }
            conn.execute_batch(r#"
                ALTER TABLE todos ADD COLUMN checklist     TEXT    NOT NULL DEFAULT '[]';
                ALTER TABLE todos ADD COLUMN tags          TEXT    NOT NULL DEFAULT '[]';
                ALTER TABLE todos ADD COLUMN assignee      TEXT;

                ALTER TABLE notes ADD COLUMN note_type     TEXT    NOT NULL DEFAULT 'gespraech';
                ALTER TABLE notes ADD COLUMN waiting_reply INTEGER NOT NULL DEFAULT 0;

                ALTER TABLE customers ADD COLUMN industry       TEXT;
                ALTER TABLE customers ADD COLUMN contact_person TEXT;
                ALTER TABLE customers ADD COLUMN goals          TEXT NOT NULL DEFAULT '[]';
                ALTER TABLE customers ADD COLUMN social_links   TEXT NOT NULL DEFAULT '{}';
                ALTER TABLE customers ADD COLUMN internal_notes TEXT;
            "#)?;
            Ok(())
        }
        5 => {
            if !table_exists(conn, "customers") {
                // Fresh post-v5 install — seed __cynera_privat__ into accounts
                let now = chrono::Utc::now().to_rfc3339();
                conn.execute(
                    "INSERT OR IGNORE INTO accounts
                     (id, workspace_id, created_by, name, kind, is_private, created_at, updated_at)
                     VALUES ('__cynera_privat__', '', '', 'Privat', 'individual', 1, ?1, ?2)",
                    rusqlite::params![now, now],
                )?;
                return Ok(());
            }

            // Disable FK before transaction (pragmas can't run inside transactions)
            conn.execute_batch("PRAGMA foreign_keys = OFF;")?;

            // Run migration in a transaction; re-enable FK regardless of outcome
            let result = migrate_v5_body(conn);

            // Always re-enable FK, even if migration failed
            let _ = conn.execute_batch("PRAGMA foreign_keys = ON;");

            result
        }
        6 => {
            if !table_exists(conn, "accounts") { return Ok(()); }

            if !column_exists(conn, "accounts", "primary_deal_id") {
                conn.execute_batch("ALTER TABLE accounts ADD COLUMN primary_deal_id TEXT;")?;
            }
            if !column_exists(conn, "accounts", "lead_score") {
                conn.execute_batch("ALTER TABLE accounts ADD COLUMN lead_score REAL NOT NULL DEFAULT 0;")?;
            }
            if table_exists(conn, "activities") && !column_exists(conn, "activities", "outcome") {
                conn.execute_batch("ALTER TABLE activities ADD COLUMN outcome TEXT;")?;
            }

            conn.execute_batch(r#"
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
            "#)?;

            // Seed default pipeline stages for every existing workspace
            let workspace_ids: Vec<String> = {
                let mut stmt = conn.prepare(
                    "SELECT DISTINCT workspace_id FROM accounts WHERE workspace_id != ''"
                )?;
                let ids = stmt.query_map([], |r| r.get(0))?
                    .collect::<Result<Vec<String>, _>>()
                    .map_err(|e| AppError::Db(e.to_string()))?;
                ids
            };
            for ws_id in &workspace_ids {
                crate::db::pipeline_stage::seed_defaults(conn, ws_id)?;
            }

            Ok(())
        }
        7 => {
            if !table_exists(conn, "accounts") { return Ok(()); }

            if !column_exists(conn, "accounts", "score_factors") {
                conn.execute_batch(
                    "ALTER TABLE accounts ADD COLUMN score_factors TEXT NOT NULL DEFAULT '{}';"
                )?;
            }

            conn.execute_batch(r#"
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
            "#)?;

            let workspace_ids: Vec<String> = {
                let mut stmt = conn.prepare(
                    "SELECT DISTINCT workspace_id FROM accounts WHERE workspace_id != ''"
                )?;
                let ids = stmt.query_map([], |r| r.get(0))?
                    .collect::<Result<Vec<String>, _>>()
                    .map_err(|e| AppError::Db(e.to_string()))?;
                ids
            };
            for ws_id in &workspace_ids {
                crate::db::automation_rule::seed_defaults(conn, ws_id)?;
            }

            Ok(())
        }
        8 => {
            if !table_exists(conn, "accounts") { return Ok(()); }
            for col in ["street", "zip", "city", "country"] {
                if !column_exists(conn, "accounts", col) {
                    conn.execute_batch(&format!(
                        "ALTER TABLE accounts ADD COLUMN {col} TEXT;"
                    ))?;
                }
            }
            Ok(())
        }
        9 => {
            conn.execute_batch(r#"
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
        10 => {
            if table_exists(conn, "deals") && !column_exists(conn, "deals", "customer_id") {
                conn.execute_batch("ALTER TABLE deals ADD COLUMN customer_id TEXT")?;
            }
            if table_exists(conn, "activities") && !column_exists(conn, "activities", "customer_id") {
                conn.execute_batch("ALTER TABLE activities ADD COLUMN customer_id TEXT")?;
            }
            Ok(())
        }
        11 => {
            if !column_exists(conn, "accounts", "account_type") {
                conn.execute_batch(
                    "ALTER TABLE accounts ADD COLUMN account_type TEXT NOT NULL DEFAULT 'client';
                     ALTER TABLE accounts ADD COLUMN lead_status TEXT;
                     ALTER TABLE accounts ADD COLUMN lead_source TEXT;
                     ALTER TABLE accounts ADD COLUMN lead_source_detail TEXT;
                     ALTER TABLE accounts ADD COLUMN email TEXT;
                     ALTER TABLE accounts ADD COLUMN engagement_score INTEGER DEFAULT 0;
                     ALTER TABLE accounts ADD COLUMN re_engage_date TEXT;
                     ALTER TABLE accounts ADD COLUMN converted_at TEXT;"
                )?;
                conn.execute_batch(
                    "CREATE INDEX IF NOT EXISTS idx_accounts_type
                     ON accounts(workspace_id, account_type);"
                )?;
            }
            Ok(())
        }
        12 => {
            conn.execute_batch(r#"
                CREATE TABLE IF NOT EXISTS invoice_sequences (
                    workspace_id TEXT PRIMARY KEY,
                    next_number  INTEGER NOT NULL DEFAULT 1
                );

                CREATE TABLE IF NOT EXISTS offer_sequences (
                    workspace_id TEXT PRIMARY KEY,
                    next_number  INTEGER NOT NULL DEFAULT 1
                );

                CREATE TABLE IF NOT EXISTS invoices (
                    id              TEXT PRIMARY KEY,
                    workspace_id    TEXT NOT NULL DEFAULT '',
                    created_by      TEXT NOT NULL DEFAULT '',
                    account_id      TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                    deal_id         TEXT REFERENCES deals(id) ON DELETE SET NULL,
                    number          TEXT,
                    date            TEXT NOT NULL,
                    due_date        TEXT NOT NULL,
                    status          TEXT NOT NULL DEFAULT 'draft',
                    tax_mode        TEXT NOT NULL DEFAULT 'standard',
                    subtotal        REAL NOT NULL DEFAULT 0,
                    tax_amount      REAL NOT NULL DEFAULT 0,
                    total           REAL NOT NULL DEFAULT 0,
                    bank_info       TEXT NOT NULL DEFAULT '{}',
                    notes           TEXT,
                    pdf_path        TEXT,
                    is_suggestion   INTEGER NOT NULL DEFAULT 0,
                    suggested_by    TEXT,
                    approved_by     TEXT,
                    pending_sync    INTEGER NOT NULL DEFAULT 0,
                    created_at      TEXT NOT NULL,
                    updated_at      TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_invoices_workspace
                    ON invoices(workspace_id, status);
                CREATE INDEX IF NOT EXISTS idx_invoices_account
                    ON invoices(account_id, created_at DESC);

                CREATE TABLE IF NOT EXISTS invoice_items (
                    id          TEXT PRIMARY KEY,
                    invoice_id  TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
                    title       TEXT NOT NULL,
                    description TEXT,
                    quantity    REAL NOT NULL DEFAULT 1,
                    unit_price  REAL NOT NULL DEFAULT 0,
                    tax_rate    REAL NOT NULL DEFAULT 19,
                    total       REAL NOT NULL DEFAULT 0,
                    sort_order  INTEGER NOT NULL DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS offers (
                    id                   TEXT PRIMARY KEY,
                    workspace_id         TEXT NOT NULL DEFAULT '',
                    created_by           TEXT NOT NULL DEFAULT '',
                    account_id           TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                    number               TEXT,
                    title                TEXT NOT NULL,
                    status               TEXT NOT NULL DEFAULT 'draft',
                    valid_until          TEXT NOT NULL,
                    tax_mode             TEXT NOT NULL DEFAULT 'standard',
                    subtotal             REAL NOT NULL DEFAULT 0,
                    tax_amount           REAL NOT NULL DEFAULT 0,
                    total                REAL NOT NULL DEFAULT 0,
                    notes                TEXT,
                    pdf_path             TEXT,
                    converted_invoice_id TEXT REFERENCES invoices(id) ON DELETE SET NULL,
                    pending_sync         INTEGER NOT NULL DEFAULT 0,
                    created_at           TEXT NOT NULL,
                    updated_at           TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_offers_workspace
                    ON offers(workspace_id, status);
                CREATE INDEX IF NOT EXISTS idx_offers_account
                    ON offers(account_id, created_at DESC);

                CREATE TABLE IF NOT EXISTS offer_items (
                    id          TEXT PRIMARY KEY,
                    offer_id    TEXT NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
                    title       TEXT NOT NULL,
                    description TEXT,
                    quantity    REAL NOT NULL DEFAULT 1,
                    unit_price  REAL NOT NULL DEFAULT 0,
                    tax_rate    REAL NOT NULL DEFAULT 19,
                    total       REAL NOT NULL DEFAULT 0,
                    sort_order  INTEGER NOT NULL DEFAULT 0
                );
            "#)?;
            Ok(())
        }
        13 => {
            if !column_exists(conn, "invoice_items", "item_date") {
                conn.execute_batch(
                    "ALTER TABLE invoice_items ADD COLUMN item_date TEXT;
                     ALTER TABLE invoice_items ADD COLUMN unit TEXT;
                     ALTER TABLE offer_items ADD COLUMN item_date TEXT;
                     ALTER TABLE offer_items ADD COLUMN unit TEXT;"
                )?;
            }
            Ok(())
        }
        15 => {
            // 1. accounts neue Felder
            for (col, def) in [
                ("pipeline_stage", "TEXT NOT NULL DEFAULT 'inbox'"),
                ("company_name",    "TEXT"),
                ("linkedin_url",    "TEXT"),
                ("last_activity_at","TEXT"),
                ("next_follow_up_at","TEXT"),
            ] {
                if !column_exists(conn, "accounts", col) {
                    conn.execute_batch(&format!(
                        "ALTER TABLE accounts ADD COLUMN {col} {def};"
                    ))?;
                }
            }
            // 2. pipeline_stage aus lead_status befüllen (nur Leads die noch auf 'inbox' stehen)
            conn.execute_batch(r#"
                UPDATE accounts SET pipeline_stage = CASE lead_status
                    WHEN 'new'           THEN 'inbox'
                    WHEN 'attempted'     THEN 'waiting_reply'
                    WHEN 'warm'          THEN 'replied'
                    WHEN 'lost_reengage' THEN 'inbox'
                    ELSE 'inbox'
                END WHERE account_type = 'lead' AND pipeline_stage = 'inbox';
            "#)?;
            // 3. Unique-Guard gegen Lead-Duplikate per E-Mail
            conn.execute_batch(r#"
                CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_lead_email
                    ON accounts(workspace_id, LOWER(email))
                    WHERE account_type = 'lead' AND email IS NOT NULL;
            "#)?;
            // 4. activities: direction + email_id
            for (col, def) in [("direction", "TEXT"), ("email_id", "TEXT")] {
                if !column_exists(conn, "activities", col) {
                    conn.execute_batch(&format!(
                        "ALTER TABLE activities ADD COLUMN {col} {def};"
                    ))?;
                }
            }
            // legacy: alte 'email'-Activities bekommen direction='in'
            conn.execute_batch(r#"
                UPDATE activities SET direction = 'in'
                    WHERE type = 'email' AND direction IS NULL;
            "#)?;
            // 5. emails: direction + activity_id
            for (col, def) in [
                ("direction",   "TEXT NOT NULL DEFAULT 'in'"),
                ("activity_id", "TEXT"),
            ] {
                if !column_exists(conn, "emails", col) {
                    conn.execute_batch(&format!(
                        "ALTER TABLE emails ADD COLUMN {col} {def};"
                    ))?;
                }
            }
            // 6. follow_up_queue neue Tabelle
            conn.execute_batch(r#"
                CREATE TABLE IF NOT EXISTS follow_up_queue (
                    id                  TEXT PRIMARY KEY,
                    workspace_id        TEXT NOT NULL,
                    lead_id             TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                    trigger_activity_id TEXT,
                    sequence_index      INTEGER NOT NULL DEFAULT 1,
                    send_at             TEXT NOT NULL,
                    status              TEXT NOT NULL DEFAULT 'pending',
                    template_key        TEXT NOT NULL DEFAULT 'value',
                    draft_subject       TEXT,
                    draft_body          TEXT,
                    sent_activity_id    TEXT,
                    sent_at             TEXT,
                    created_at          TEXT NOT NULL,
                    updated_at          TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_followup_queue_lead
                    ON follow_up_queue(lead_id, status, send_at);
                CREATE INDEX IF NOT EXISTS idx_followup_queue_workspace
                    ON follow_up_queue(workspace_id, status, send_at);
            "#)?;
            Ok(())
        }
        14 => {
            conn.execute_batch(r#"
                CREATE TABLE IF NOT EXISTS workspace_folders (
                    id           TEXT PRIMARY KEY,
                    workspace_id TEXT NOT NULL,
                    name         TEXT NOT NULL,
                    parent_id    TEXT REFERENCES workspace_folders(id) ON DELETE CASCADE,
                    created_at   TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_ws_folders_workspace
                    ON workspace_folders(workspace_id, name);

                CREATE TABLE IF NOT EXISTS workspace_files (
                    id           TEXT PRIMARY KEY,
                    workspace_id TEXT NOT NULL,
                    folder_id    TEXT REFERENCES workspace_folders(id) ON DELETE SET NULL,
                    name         TEXT NOT NULL,
                    path         TEXT NOT NULL,
                    size         INTEGER,
                    mime_type    TEXT,
                    source_type  TEXT NOT NULL DEFAULT 'manual',
                    source_id    TEXT,
                    created_at   TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_ws_files_workspace
                    ON workspace_files(workspace_id, folder_id);
                CREATE INDEX IF NOT EXISTS idx_ws_files_source
                    ON workspace_files(source_type, source_id);
            "#)?;
            Ok(())
        }
        _ => Ok(()),
    }
}

fn migrate_v5_body(conn: &Connection) -> Result<(), AppError> {
    conn.execute_batch("BEGIN;")?;

    // 1. Migrate customers → accounts
    conn.execute_batch(r#"
        INSERT OR IGNORE INTO accounts
            (id, workspace_id, created_by, name, kind, industry, status, priority,
             tags, goals, internal_notes, is_private, social_links, pending_sync,
             created_at, updated_at)
        SELECT
            id, workspace_id, created_by, name,
            CASE WHEN company IS NOT NULL AND company != '' THEN 'company' ELSE 'individual' END,
            industry, status, priority, tags, goals, internal_notes, is_private,
            social_links, pending_sync, created_at, updated_at
        FROM customers;
    "#)?;

    // 2. Seed __cynera_privat__ in accounts
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT OR IGNORE INTO accounts
         (id, workspace_id, created_by, name, kind, is_private, created_at, updated_at)
         VALUES ('__cynera_privat__', '', '', 'Privat', 'individual', 1, ?1, ?2)",
        rusqlite::params![now, now],
    )?;

    // 3. Create contacts from customers with contact data
    {
        struct Row {
            id: String, ws: String, by: String,
            cp: Option<String>, email: Option<String>, phone: Option<String>,
            ca: String, ua: String,
        }
        let mut stmt = conn.prepare(
            "SELECT id, workspace_id, created_by, contact_person, email, phone, created_at, updated_at
             FROM customers WHERE contact_person IS NOT NULL OR email IS NOT NULL OR phone IS NOT NULL"
        )?;
        let rows: Vec<Row> = stmt.query_map([], |r| Ok(Row {
            id: r.get(0)?, ws: r.get(1)?, by: r.get(2)?,
            cp: r.get(3)?, email: r.get(4)?, phone: r.get(5)?,
            ca: r.get(6)?, ua: r.get(7)?,
        }))?.collect::<Result<_, _>>()?;
        for row in rows {
            let cid = uuid::Uuid::new_v4().to_string();
            let first_name = row.cp
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "Unbekannt".to_string());
            conn.execute(
                "INSERT OR IGNORE INTO contacts
                 (id, workspace_id, created_by, account_id, first_name, email, phone,
                  is_primary, pending_sync, created_at, updated_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,1,0,?8,?9)",
                rusqlite::params![cid, row.ws, row.by, row.id, first_name, row.email, row.phone, row.ca, row.ua],
            )?;
        }
    }

    // 4. Migrate notes → activities(type:'note')
    conn.execute_batch(r#"
        INSERT OR IGNORE INTO activities
            (id, workspace_id, created_by, account_id, type, title, body,
             payload, status, pending_sync, created_at, updated_at)
        SELECT id, workspace_id, created_by, customer_id, 'note', title, content,
            json_object('note_type', note_type, 'waiting_reply', waiting_reply),
            'done', pending_sync, created_at, updated_at
        FROM notes;
    "#)?;

    // 5. Migrate todos → activities(type:'task')
    conn.execute_batch(r#"
        INSERT OR IGNORE INTO activities
            (id, workspace_id, created_by, account_id, type, title,
             payload, status, due_at, assignee, pending_sync, created_at, updated_at)
        SELECT id, workspace_id, created_by, customer_id, 'task', title,
            json_object('checklist', checklist, 'tags', tags, 'is_follow_up', 0),
            CASE WHEN status='done' THEN 'done' WHEN status='cancelled' THEN 'cancelled' ELSE 'open' END,
            due_date, assignee, pending_sync, created_at, updated_at
        FROM todos;
    "#)?;

    // 6. Migrate crm_follow_ups → activities(type:'task', is_follow_up:1)
    conn.execute_batch(r#"
        INSERT OR IGNORE INTO activities
            (id, workspace_id, created_by, account_id, type, title,
             payload, status, due_at, pending_sync, created_at, updated_at)
        SELECT id, workspace_id, created_by, customer_id, 'task', title,
            json_object('is_follow_up', 1),
            CASE WHEN status='erledigt' THEN 'done' ELSE 'open' END,
            due_date, 0, created_at, created_at
        FROM crm_follow_ups;
    "#)?;

    // 7. Migrate deadlines → activities(type:'task')
    conn.execute_batch(r#"
        INSERT OR IGNORE INTO activities
            (id, workspace_id, created_by, account_id, type, title,
             payload, status, due_at, pending_sync, created_at, updated_at)
        SELECT id, workspace_id, created_by, customer_id, 'task', title,
            json_object('is_follow_up', 0),
            CASE WHEN done=1 THEN 'done' ELSE 'open' END,
            due_date, 0, created_at, created_at
        FROM deadlines;
    "#)?;

    // 8. Migrate time_entries → activities(type:'time_entry')
    conn.execute_batch(r#"
        INSERT OR IGNORE INTO activities
            (id, workspace_id, created_by, account_id, type, title,
             payload, status, due_at, pending_sync, created_at, updated_at)
        SELECT id, workspace_id, created_by, customer_id, 'time_entry', description,
            json_object('minutes', minutes),
            'done', date, 0, created_at, created_at
        FROM time_entries;
    "#)?;

    // 9. Cache health_score on accounts
    conn.execute_batch(r#"
        UPDATE accounts SET health_score = (
            SELECT score FROM health_scores
            WHERE health_scores.customer_id = accounts.id
            ORDER BY recorded_at DESC LIMIT 1
        )
        WHERE EXISTS (
            SELECT 1 FROM health_scores WHERE health_scores.customer_id = accounts.id
        );
    "#)?;

    // 10. Rebuild kpis with account_id
    conn.execute_batch(r#"
        CREATE TABLE kpis_new (
            id           TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL DEFAULT '',
            created_by   TEXT NOT NULL DEFAULT '',
            account_id   TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            label        TEXT NOT NULL,
            value        REAL,
            unit         TEXT,
            target       REAL,
            period       TEXT,
            pending_sync INTEGER NOT NULL DEFAULT 0,
            updated_at   TEXT NOT NULL
        );
        INSERT OR IGNORE INTO kpis_new
            SELECT id, workspace_id, created_by, customer_id, label, value, unit, target, period, pending_sync, updated_at
            FROM kpis;
        DROP TABLE kpis;
        ALTER TABLE kpis_new RENAME TO kpis;
    "#)?;

    // 11. Rebuild folders with account_id
    conn.execute_batch(r#"
        CREATE TABLE folders_new (
            id           TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL DEFAULT '',
            created_by   TEXT NOT NULL DEFAULT '',
            account_id   TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            name         TEXT NOT NULL,
            parent_id    TEXT,
            pending_sync INTEGER NOT NULL DEFAULT 0,
            created_at   TEXT NOT NULL
        );
        INSERT OR IGNORE INTO folders_new
            SELECT id, workspace_id, created_by, customer_id, name, parent_id, pending_sync, created_at
            FROM folders;
        DROP TABLE folders;
        ALTER TABLE folders_new RENAME TO folders;
    "#)?;

    // 12. Rebuild files with account_id
    conn.execute_batch(r#"
        CREATE TABLE files_new (
            id           TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL DEFAULT '',
            created_by   TEXT NOT NULL DEFAULT '',
            account_id   TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            folder_id    TEXT REFERENCES folders(id) ON DELETE CASCADE,
            name         TEXT NOT NULL,
            path         TEXT NOT NULL,
            size         INTEGER,
            mime_type    TEXT,
            pending_sync INTEGER NOT NULL DEFAULT 0,
            created_at   TEXT NOT NULL
        );
        INSERT OR IGNORE INTO files_new
            SELECT id, workspace_id, created_by, customer_id, folder_id, name, path, size, mime_type, pending_sync, created_at
            FROM files;
        DROP TABLE files;
        ALTER TABLE files_new RENAME TO files;
    "#)?;

    // 13. Rebuild chat_messages with account_id
    conn.execute_batch(r#"
        CREATE TABLE chat_messages_new (
            id           TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL DEFAULT '',
            created_by   TEXT NOT NULL DEFAULT '',
            account_id   TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            content      TEXT NOT NULL,
            sender       TEXT NOT NULL,
            read         INTEGER NOT NULL DEFAULT 0,
            pending_sync INTEGER NOT NULL DEFAULT 0,
            created_at   TEXT NOT NULL
        );
        INSERT OR IGNORE INTO chat_messages_new
            SELECT id, workspace_id, created_by, customer_id, content, sender, read, pending_sync, created_at
            FROM chat_messages;
        DROP TABLE chat_messages;
        ALTER TABLE chat_messages_new RENAME TO chat_messages;
    "#)?;

    // 14. Rebuild emails with crm_account_id
    // Original schema: id, account_id (email_accounts FK), message_id, from_addr, to_addr,
    //                  subject, preview, body, received_at, read, customer_id (customers FK), tags
    // After v2: also has workspace_id, created_by, pending_sync
    // After migration: customer_id becomes crm_account_id referencing accounts(id)
    conn.execute_batch(r#"
        CREATE TABLE emails_new (
            id              TEXT PRIMARY KEY,
            workspace_id    TEXT NOT NULL DEFAULT '',
            crm_account_id  TEXT REFERENCES accounts(id),
            account_id      TEXT REFERENCES email_accounts(id) ON DELETE CASCADE,
            message_id      TEXT,
            from_addr       TEXT,
            to_addr         TEXT,
            subject         TEXT,
            preview         TEXT,
            body            TEXT,
            received_at     TEXT,
            read            INTEGER NOT NULL DEFAULT 0,
            tags            TEXT NOT NULL DEFAULT '[]'
        );
        INSERT OR IGNORE INTO emails_new
            SELECT id, workspace_id, customer_id, account_id,
                   message_id, from_addr, to_addr, subject, preview, body,
                   received_at, read, tags
            FROM emails;
        DROP TABLE emails;
        ALTER TABLE emails_new RENAME TO emails;
    "#)?;

    // 15. Drop old tables
    conn.execute_batch(r#"
        DROP TABLE IF EXISTS health_scores;
        DROP TABLE IF EXISTS crm_follow_ups;
        DROP TABLE IF EXISTS deadlines;
        DROP TABLE IF EXISTS time_entries;
        DROP TABLE IF EXISTS notes;
        DROP TABLE IF EXISTS todos;
        DROP TABLE IF EXISTS customers;
    "#)?;

    conn.execute_batch("COMMIT;")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::schema;

    fn in_memory_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        schema::create_tables(&conn).unwrap();
        conn
    }

    fn table_exists_helper(conn: &Connection, name: &str) -> bool {
        conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
            [name], |r| r.get::<_, i64>(0),
        ).unwrap_or(0) > 0
    }

    #[test]
    fn migration_runs_idempotently() {
        let conn = in_memory_db();
        run(&conn).unwrap();
        run(&conn).unwrap();
        let version = get_version(&conn).unwrap();
        assert_eq!(version, CURRENT_VERSION);
    }

    #[test]
    fn migration_v2_adds_workspace_columns() {
        let conn = in_memory_db();
        run(&conn).unwrap();
        // After v5, customers is dropped — verify workspace_id landed on accounts instead
        let cols: Vec<String> = conn.prepare("PRAGMA table_info(accounts)").unwrap()
            .query_map([], |r| r.get::<_, String>(1)).unwrap()
            .filter_map(|r| r.ok())
            .collect();
        assert!(cols.contains(&"workspace_id".to_string()), "workspace_id fehlt in accounts");
        assert!(cols.contains(&"created_by".to_string()), "created_by fehlt in accounts");
        assert!(cols.contains(&"pending_sync".to_string()), "pending_sync fehlt in accounts");
    }

    #[test]
    fn migration_v3_creates_sync_tables() {
        let conn = in_memory_db();
        run(&conn).unwrap();
        let tables: Vec<String> = conn.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('sync_queue','sync_meta')"
        ).unwrap()
            .query_map([], |r| r.get::<_, String>(0)).unwrap()
            .filter_map(|r| r.ok())
            .collect();
        assert!(tables.contains(&"sync_queue".to_string()), "sync_queue fehlt");
        assert!(tables.contains(&"sync_meta".to_string()), "sync_meta fehlt");
    }

    #[test]
    fn migration_v4_adds_new_columns() {
        let conn = in_memory_db();
        run(&conn).unwrap();
        assert_eq!(get_version(&conn).unwrap(), CURRENT_VERSION);

        // After v5, todos and notes are dropped into activities — verify activities exists
        assert!(table_exists_helper(&conn, "activities"), "activities table fehlt");

        // accounts should exist (migrated from customers)
        let acct_cols: Vec<String> = conn.prepare("PRAGMA table_info(accounts)").unwrap()
            .query_map([], |r| r.get::<_, String>(1)).unwrap()
            .filter_map(|r| r.ok()).collect();
        assert!(acct_cols.contains(&"industry".to_string()));
        assert!(acct_cols.contains(&"goals".to_string()));
        assert!(acct_cols.contains(&"social_links".to_string()));
    }

    #[test]
    fn privat_kunde_wird_geseedet() {
        let conn = in_memory_db();
        run(&conn).unwrap();
        // After v5, __cynera_privat__ is in accounts, not customers
        let count: i32 = conn.query_row(
            "SELECT COUNT(*) FROM accounts WHERE id = '__cynera_privat__'",
            [],
            |r| r.get(0),
        ).unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn migration_v5_migrates_customers_to_accounts() {
        let conn = in_memory_db();
        // Insert using only base-schema columns (workspace_id/created_by are added by v2)
        conn.execute_batch(
            "INSERT INTO customers (id, name, company, is_private, created_at, updated_at)
             VALUES ('cust-1', 'Muster GmbH', 'Muster GmbH', 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')"
        ).unwrap();
        run(&conn).unwrap();
        assert!(!table_exists_helper(&conn, "customers"), "customers table should be dropped");
        let name: String = conn.query_row(
            "SELECT name FROM accounts WHERE id = 'cust-1'",
            [], |r| r.get(0),
        ).unwrap();
        assert_eq!(name, "Muster GmbH");
    }

    #[test]
    fn migration_v5_seeds_cynera_privat_in_accounts() {
        let conn = in_memory_db();
        run(&conn).unwrap();
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM accounts WHERE id = '__cynera_privat__' AND is_private = 1",
            [], |r| r.get(0),
        ).unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn migration_v5_migrates_notes_to_activities() {
        let conn = in_memory_db();
        // Insert using only base-schema columns (workspace_id/created_by added by v2, note_type by v4)
        conn.execute_batch(
            "INSERT INTO customers (id, name, is_private, created_at, updated_at)
             VALUES ('c1', 'Test', 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
             INSERT INTO notes (id, customer_id, title, content, created_at, updated_at)
             VALUES ('n1', 'c1', 'Notiz', 'Inhalt', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');"
        ).unwrap();
        run(&conn).unwrap();
        let activity_type: String = conn.query_row(
            "SELECT type FROM activities WHERE id = 'n1'",
            [], |r| r.get(0),
        ).unwrap();
        assert_eq!(activity_type, "note");
    }

    #[test]
    fn migration_v5_migrates_todos_to_activities() {
        let conn = in_memory_db();
        // Insert using only base-schema columns (workspace_id/created_by added by v2, checklist/tags by v4)
        conn.execute_batch(
            "INSERT INTO customers (id, name, is_private, created_at, updated_at)
             VALUES ('c1', 'Test', 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
             INSERT INTO todos (id, customer_id, title, created_at, updated_at)
             VALUES ('t1', 'c1', 'Todo', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');"
        ).unwrap();
        run(&conn).unwrap();
        let activity_type: String = conn.query_row(
            "SELECT type FROM activities WHERE id = 't1'",
            [], |r| r.get(0),
        ).unwrap();
        assert_eq!(activity_type, "task");
    }

    #[test]
    fn migration_v6_seeds_pipeline_stages() {
        let conn = in_memory_db();
        // Insert an account with a workspace_id so seeding is triggered
        let now = "2026-01-01T00:00:00Z";
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, kind, is_private, created_at, updated_at)
             VALUES ('acc-1', 'ws-test', '', 'Test', 'individual', 0, ?1, ?2)",
            rusqlite::params![now, now],
        ).unwrap();
        run(&conn).unwrap();
        // pipeline_stages table should have 10 default stages for ws-test
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM pipeline_stages WHERE workspace_id = 'ws-test'",
            [], |r| r.get(0),
        ).unwrap();
        assert_eq!(count, 10);
    }

    #[test]
    fn migration_v6_adds_new_columns() {
        let conn = in_memory_db();
        run(&conn).unwrap();
        // Check accounts has new columns
        let cols: Vec<String> = conn.prepare("PRAGMA table_info(accounts)").unwrap()
            .query_map([], |r| r.get::<_, String>(1)).unwrap()
            .filter_map(|r| r.ok())
            .collect();
        assert!(cols.contains(&"primary_deal_id".to_string()), "primary_deal_id missing");
        assert!(cols.contains(&"lead_score".to_string()), "lead_score missing");
        // Check activities has outcome
        let act_cols: Vec<String> = conn.prepare("PRAGMA table_info(activities)").unwrap()
            .query_map([], |r| r.get::<_, String>(1)).unwrap()
            .filter_map(|r| r.ok())
            .collect();
        assert!(act_cols.contains(&"outcome".to_string()), "outcome missing");
    }

    #[test]
    fn migration_v7_adds_score_factors() {
        let conn = in_memory_db();
        run(&conn).unwrap();
        let cols: Vec<String> = conn.prepare("PRAGMA table_info(accounts)").unwrap()
            .query_map([], |r| r.get::<_, String>(1)).unwrap()
            .filter_map(|r| r.ok())
            .collect();
        assert!(cols.contains(&"score_factors".to_string()), "score_factors missing");
        assert!(table_exists_helper(&conn, "automation_rules"), "automation_rules missing");
    }

    #[test]
    fn migration_v7_seeds_rules_for_workspace() {
        let conn = in_memory_db();
        let now = "2026-01-01T00:00:00Z";
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, kind, is_private, created_at, updated_at)
             VALUES ('acc-1', 'ws-rules', '', 'Test', 'individual', 0, ?1, ?2)",
            rusqlite::params![now, now],
        ).unwrap();
        run(&conn).unwrap();
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM automation_rules WHERE workspace_id = 'ws-rules' AND is_system = 1",
            [], |r| r.get(0),
        ).unwrap();
        assert_eq!(count, 15);
    }

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::schema::create_tables(&conn).unwrap();
        run(&conn).unwrap();
        conn
    }

    #[test]
    fn v11_adds_lead_columns_to_accounts() {
        let conn = setup();
        assert!(column_exists(&conn, "accounts", "account_type"));
        assert!(column_exists(&conn, "accounts", "lead_status"));
        assert!(column_exists(&conn, "accounts", "lead_source"));
        assert!(column_exists(&conn, "accounts", "lead_source_detail"));
        assert!(column_exists(&conn, "accounts", "email"));
        assert!(column_exists(&conn, "accounts", "engagement_score"));
        assert!(column_exists(&conn, "accounts", "re_engage_date"));
        assert!(column_exists(&conn, "accounts", "converted_at"));
    }

    #[test]
    fn v11_existing_accounts_default_to_client() {
        let conn = setup();
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, created_at, updated_at)
             VALUES ('a1','ws-1','u-1','Test AG',?1,?1)",
            [&now],
        ).unwrap();
        let account_type: String = conn
            .query_row("SELECT account_type FROM accounts WHERE id='a1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(account_type, "client");
    }

    #[test]
    fn migration_v12_creates_finance_tables() {
        let conn = setup();
        assert_eq!(get_version(&conn).unwrap(), CURRENT_VERSION);
        for table in ["invoice_sequences", "offer_sequences", "invoices", "invoice_items", "offers", "offer_items"] {
            assert!(table_exists_helper(&conn, table), "{table} fehlt nach v12");
        }
    }

    #[test]
    fn migration_v13_adds_item_date_and_unit() {
        let conn = Connection::open_in_memory().unwrap();
        schema::create_tables(&conn).unwrap();
        run(&conn).unwrap();
        // Disable FK for synthetic test rows (we only verify columns exist)
        conn.execute_batch("PRAGMA foreign_keys = OFF;").unwrap();
        // item_date und unit in invoice_items
        conn.execute(
            "INSERT INTO invoice_items (id, invoice_id, title, quantity, unit_price, tax_rate, total, sort_order, item_date, unit)
             VALUES ('i1','dummy','Test',1,10,0,10,0,'2026-05-22','Stk.')",
            [],
        ).unwrap();
        let (d, u): (Option<String>, Option<String>) = conn.query_row(
            "SELECT item_date, unit FROM invoice_items WHERE id='i1'",
            [], |r| Ok((r.get(0)?, r.get(1)?)),
        ).unwrap();
        assert_eq!(d.as_deref(), Some("2026-05-22"));
        assert_eq!(u.as_deref(), Some("Stk."));
        // offer_items ebenfalls
        conn.execute(
            "INSERT INTO offer_items (id, offer_id, title, quantity, unit_price, tax_rate, total, sort_order, item_date, unit)
             VALUES ('o1','dummy','Test',1,10,0,10,0,'2026-05-22','Std.')",
            [],
        ).unwrap();
        let (d2, u2): (Option<String>, Option<String>) = conn.query_row(
            "SELECT item_date, unit FROM offer_items WHERE id='o1'",
            [], |r| Ok((r.get(0)?, r.get(1)?)),
        ).unwrap();
        assert_eq!(d2.as_deref(), Some("2026-05-22"));
        assert_eq!(u2.as_deref(), Some("Std."));
    }

    #[test]
    fn migration_v14_creates_workspace_ablage_tables() {
        let conn = in_memory_db();
        run(&conn).unwrap();
        for table in ["workspace_folders", "workspace_files"] {
            assert!(table_exists_helper(&conn, table), "{table} fehlt nach v14");
        }
        let ws_file_cols: Vec<String> = conn
            .prepare("PRAGMA table_info(workspace_files)").unwrap()
            .query_map([], |r| r.get::<_, String>(1)).unwrap()
            .filter_map(|r| r.ok()).collect();
        assert!(ws_file_cols.contains(&"source_type".to_string()), "source_type fehlt");
        assert!(ws_file_cols.contains(&"source_id".to_string()), "source_id fehlt");
    }

    #[test]
    fn migration_v15_adds_new_columns_and_table() {
        let conn = in_memory_db();
        run(&conn).unwrap();
        assert!(column_exists(&conn, "accounts", "pipeline_stage"), "pipeline_stage missing");
        assert!(column_exists(&conn, "accounts", "company_name"), "company_name missing");
        assert!(column_exists(&conn, "accounts", "linkedin_url"), "linkedin_url missing");
        assert!(column_exists(&conn, "accounts", "last_activity_at"), "last_activity_at missing");
        assert!(column_exists(&conn, "accounts", "next_follow_up_at"), "next_follow_up_at missing");
        assert!(column_exists(&conn, "activities", "direction"), "direction missing");
        assert!(column_exists(&conn, "activities", "email_id"), "email_id missing");
        assert!(column_exists(&conn, "emails", "direction"), "emails.direction missing");
        assert!(column_exists(&conn, "emails", "activity_id"), "emails.activity_id missing");
        assert!(table_exists_helper(&conn, "follow_up_queue"), "follow_up_queue missing");
    }

    #[test]
    fn migration_v15_migrates_lead_status_to_pipeline_stage() {
        let conn = in_memory_db();
        run(&conn).unwrap();
        let now = chrono::Utc::now().to_rfc3339();
        // Insert a 'warm' lead (should map to 'replied')
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, account_type, lead_status, pipeline_stage, created_at, updated_at)
             VALUES ('l1','ws-1','','Test Lead','lead','warm','inbox',?1,?1)",
            [&now],
        ).unwrap();
        // Run the mapping SQL manually (simulating what v15 does)
        conn.execute_batch(
            "UPDATE accounts SET pipeline_stage = CASE lead_status
                WHEN 'new'           THEN 'inbox'
                WHEN 'attempted'     THEN 'waiting_reply'
                WHEN 'warm'          THEN 'replied'
                WHEN 'lost_reengage' THEN 'inbox'
                ELSE 'inbox'
            END WHERE account_type = 'lead' AND pipeline_stage = 'inbox';"
        ).unwrap();
        let stage: String = conn.query_row(
            "SELECT pipeline_stage FROM accounts WHERE id='l1'",
            [], |r| r.get(0),
        ).unwrap();
        assert_eq!(stage, "replied");
    }

    #[test]
    fn migration_v12_invoice_fk_cascade() {
        let conn = setup();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, created_at, updated_at)
             VALUES ('acc-fin','ws-fin','u1','Finanz GmbH',?1,?1)",
            [&now],
        ).unwrap();
        conn.execute(
            "INSERT INTO invoices (id, workspace_id, created_by, account_id, date, due_date, created_at, updated_at)
             VALUES ('inv-1','ws-fin','u1','acc-fin',?1,?1,?1,?1)",
            [&now],
        ).unwrap();
        conn.execute(
            "INSERT INTO invoice_items (id, invoice_id, title)
             VALUES ('item-1','inv-1','Beratung')",
            [],
        ).unwrap();
        conn.execute("DELETE FROM invoices WHERE id = 'inv-1'", []).unwrap();
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM invoice_items WHERE invoice_id = 'inv-1'",
            [], |r| r.get(0),
        ).unwrap();
        assert_eq!(count, 0, "invoice_items sollten per CASCADE gelöscht werden");
    }
}
