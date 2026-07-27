use rusqlite::Connection;
use crate::AppError;

const CURRENT_VERSION: u32 = 42;

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
                    template_key        TEXT NOT NULL DEFAULT 'none',
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
        16 => {
            conn.execute_batch(r#"
                CREATE TABLE IF NOT EXISTS campaigns (
                    id                TEXT PRIMARY KEY,
                    workspace_id      TEXT NOT NULL,
                    name              TEXT NOT NULL,
                    subject           TEXT NOT NULL,
                    body              TEXT NOT NULL,
                    sender_account_id TEXT NOT NULL,
                    smart_list_id     TEXT,
                    status            TEXT NOT NULL DEFAULT 'draft',
                    sent_at           TEXT,
                    created_at        TEXT NOT NULL,
                    updated_at        TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_campaigns_workspace
                    ON campaigns(workspace_id, created_at DESC);

                CREATE TABLE IF NOT EXISTS campaign_recipients (
                    id          TEXT PRIMARY KEY,
                    campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
                    lead_id     TEXT NOT NULL,
                    email       TEXT NOT NULL,
                    sent_at     TEXT,
                    replied_at  TEXT,
                    error       TEXT,
                    activity_id TEXT,
                    created_at  TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign
                    ON campaign_recipients(campaign_id);
                CREATE INDEX IF NOT EXISTS idx_campaign_recipients_email
                    ON campaign_recipients(email);
            "#)?;
            Ok(())
        }
        17 => {
            // Enrich contacts with B2B-grade fields: LinkedIn, decision power,
            // preferred channel, free notes, birthday. All nullable — no migration
            // of existing data needed.
            for (col, def) in [
                ("linkedin_url",      "TEXT"),
                ("decision_power",    "TEXT"),  // 'high' | 'medium' | 'low' | NULL
                ("preferred_channel", "TEXT"),  // 'email' | 'phone' | 'whatsapp' | 'in_person' | NULL
                ("notes",             "TEXT"),
                ("birthday",          "TEXT"),  // ISO date string
            ] {
                if !column_exists(conn, "contacts", col) {
                    conn.execute_batch(&format!(
                        "ALTER TABLE contacts ADD COLUMN {col} {def};"
                    ))?;
                }
            }
            Ok(())
        }
        18 => {
            // activities.account_id: NOT NULL → nullable (Table-Rebuild — SQLite kann das nicht via ALTER)
            if !table_exists(conn, "activities") { return Ok(()); }
            conn.execute_batch(r#"
                CREATE TABLE activities_new (
                    id              TEXT PRIMARY KEY,
                    workspace_id    TEXT NOT NULL DEFAULT '',
                    created_by      TEXT NOT NULL DEFAULT '',
                    account_id      TEXT REFERENCES accounts(id) ON DELETE CASCADE,
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
                    direction       TEXT,
                    email_id        TEXT,
                    pending_sync    INTEGER NOT NULL DEFAULT 0,
                    created_at      TEXT NOT NULL,
                    updated_at      TEXT NOT NULL
                );
                INSERT INTO activities_new SELECT * FROM activities;
                DROP TABLE activities;
                ALTER TABLE activities_new RENAME TO activities;
                CREATE INDEX IF NOT EXISTS idx_activities_account
                    ON activities(account_id, created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_activities_deal
                    ON activities(deal_id, created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_activities_contact
                    ON activities(contact_id, created_at DESC);
            "#)?;
            Ok(())
        }
        19 => {
            conn.execute_batch(r#"
                CREATE TABLE IF NOT EXISTS lead_stages (
                    id               TEXT PRIMARY KEY,
                    workspace_id     TEXT NOT NULL,
                    name             TEXT NOT NULL,
                    label            TEXT NOT NULL,
                    color            TEXT NOT NULL DEFAULT '#6B7280',
                    order_index      INTEGER NOT NULL DEFAULT 0,
                    is_qualified     INTEGER NOT NULL DEFAULT 0,
                    is_disqualified  INTEGER NOT NULL DEFAULT 0,
                    created_at       TEXT NOT NULL,
                    UNIQUE(workspace_id, name)
                );
                UPDATE accounts SET lead_status = 'neu'             WHERE lead_status = 'new';
                UPDATE accounts SET lead_status = 'kontaktiert'     WHERE lead_status = 'attempted';
                UPDATE accounts SET lead_status = 'qualifiziert'    WHERE lead_status = 'call_booked';
                UPDATE accounts SET lead_status = 'disqualifiziert' WHERE lead_status = 'lost_reengage';
                -- 'warm' intentionally kept as-is (seed stage name matches)
            "#)?;
            Ok(())
        }
        20 => {
            if table_exists(conn, "deals") && !column_exists(conn, "deals", "notes") {
                conn.execute_batch("ALTER TABLE deals ADD COLUMN notes TEXT;")?;
            }
            Ok(())
        }
        21 => {
            conn.execute_batch(r#"
                CREATE TABLE IF NOT EXISTS note_entries (
                    id           TEXT PRIMARY KEY,
                    workspace_id TEXT NOT NULL,
                    account_id   TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                    title        TEXT,
                    content      TEXT NOT NULL DEFAULT '',
                    tags         TEXT NOT NULL DEFAULT '[]',
                    created_by   TEXT NOT NULL,
                    updated_by   TEXT,
                    pending_sync INTEGER NOT NULL DEFAULT 0,
                    created_at   TEXT NOT NULL,
                    updated_at   TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_note_entries_account
                    ON note_entries(account_id, created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_note_entries_workspace
                    ON note_entries(workspace_id, created_at DESC);

                CREATE TABLE IF NOT EXISTS note_docs (
                    id           TEXT PRIMARY KEY,
                    workspace_id TEXT NOT NULL,
                    account_id   TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                    title        TEXT NOT NULL DEFAULT 'Unbenanntes Dokument',
                    content      TEXT NOT NULL DEFAULT '',
                    created_by   TEXT NOT NULL,
                    updated_by   TEXT,
                    pending_sync INTEGER NOT NULL DEFAULT 0,
                    created_at   TEXT NOT NULL,
                    updated_at   TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_note_docs_account
                    ON note_docs(account_id, created_at DESC);
            "#)?;
            Ok(())
        }
        24 => {
            if table_exists(conn, "invoice_sequences") && !column_exists(conn, "invoice_sequences", "start_number") {
                conn.execute_batch("ALTER TABLE invoice_sequences ADD COLUMN start_number INTEGER NOT NULL DEFAULT 1;")?;
            }
            if table_exists(conn, "offer_sequences") && !column_exists(conn, "offer_sequences", "start_number") {
                conn.execute_batch("ALTER TABLE offer_sequences ADD COLUMN start_number INTEGER NOT NULL DEFAULT 1;")?;
            }
            Ok(())
        }
        23 => {
            if table_exists(conn, "campaigns") && !column_exists(conn, "campaigns", "attachment_path") {
                conn.execute_batch("ALTER TABLE campaigns ADD COLUMN attachment_path TEXT;")?;
            }
            Ok(())
        }
        22 => {
            conn.execute_batch(r#"
                CREATE TABLE IF NOT EXISTS note_folders (
                    id           TEXT PRIMARY KEY,
                    workspace_id TEXT NOT NULL,
                    account_id   TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                    name         TEXT NOT NULL,
                    created_by   TEXT NOT NULL,
                    created_at   TEXT NOT NULL,
                    updated_at   TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_note_folders_account
                    ON note_folders(account_id, name ASC);
            "#)?;
            if !column_exists(conn, "note_entries", "folder_id") {
                conn.execute_batch(
                    "ALTER TABLE note_entries ADD COLUMN folder_id TEXT REFERENCES note_folders(id) ON DELETE SET NULL;"
                )?;
            }
            Ok(())
        }
        25 => {
            if column_exists(conn, "note_entries", "stickies") { return Ok(()); }
            conn.execute_batch(
                "ALTER TABLE note_entries ADD COLUMN stickies TEXT NOT NULL DEFAULT '[]';"
            )?;
            Ok(())
        }
        26 => {
            if table_exists(conn, "accounts") && !column_exists(conn, "accounts", "phone") {
                conn.execute_batch("ALTER TABLE accounts ADD COLUMN phone TEXT;")?;
            }
            Ok(())
        }
        27 => {
            // Kunden archivieren: NULL = aktiv, Zeitstempel = archiviert.
            if table_exists(conn, "accounts") && !column_exists(conn, "accounts", "archived_at") {
                conn.execute_batch("ALTER TABLE accounts ADD COLUMN archived_at TEXT;")?;
            }
            Ok(())
        }
        28 => {
            // Verwaiste Follow-Ups reparieren: Das FollowUpModal hatte sie früher als
            // type='followup' angelegt, aber alle Follow-Up-Listen erwarten
            // type='task' + payload.is_follow_up (get_open_tasks: WHERE type='task').
            // Solche Einträge waren real gespeichert, aber unsichtbar — hier zurückholen.
            if table_exists(conn, "activities") {
                conn.execute_batch("UPDATE activities SET type = 'task' WHERE type = 'followup';")?;
            }
            Ok(())
        }
        29 => {
            // Empfänger-USt-IdNr. für Rechnungen (Reverse-Charge / EU-B2B, §14 UStG).
            if table_exists(conn, "accounts") && !column_exists(conn, "accounts", "vat_id") {
                conn.execute_batch("ALTER TABLE accounts ADD COLUMN vat_id TEXT;")?;
            }
            Ok(())
        }
        30 => {
            // Konfigurierbares Rechnungsnummern-Format + Jahres-Reset.
            if table_exists(conn, "invoice_sequences") {
                if !column_exists(conn, "invoice_sequences", "format") {
                    conn.execute_batch("ALTER TABLE invoice_sequences ADD COLUMN format TEXT;")?;
                }
                if !column_exists(conn, "invoice_sequences", "seq_year") {
                    conn.execute_batch("ALTER TABLE invoice_sequences ADD COLUMN seq_year INTEGER;")?;
                }
            }
            Ok(())
        }
        31 => {
            // Verträge (wiederkehrende Rechnungen) von localStorage in die DB —
            // damit sie im Backup/Export landen und GoBD-relevant erhalten bleiben.
            conn.execute_batch(r#"
                CREATE TABLE IF NOT EXISTS contracts (
                    id                TEXT PRIMARY KEY,
                    workspace_id      TEXT NOT NULL,
                    account_id        TEXT NOT NULL,
                    title             TEXT NOT NULL,
                    interval_value    INTEGER NOT NULL DEFAULT 1,
                    interval_unit     TEXT NOT NULL DEFAULT 'months',
                    start_date        TEXT NOT NULL,
                    next_billing_date TEXT NOT NULL,
                    end_date          TEXT,
                    status            TEXT NOT NULL DEFAULT 'active',
                    tax_mode          TEXT NOT NULL DEFAULT 'standard',
                    notes             TEXT NOT NULL DEFAULT '',
                    items             TEXT NOT NULL DEFAULT '[]',
                    created_at        TEXT NOT NULL,
                    updated_at        TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_contracts_workspace
                    ON contracts(workspace_id, status);
            "#)?;
            Ok(())
        }
        32 => {
            // Zahlungs-Journal: echte Zahlungseingänge (Teilzahlungen) statt nur
            // binär bezahlt/offen.
            conn.execute_batch(r#"
                CREATE TABLE IF NOT EXISTS payments (
                    id           TEXT PRIMARY KEY,
                    workspace_id TEXT NOT NULL,
                    invoice_id   TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
                    amount       REAL NOT NULL,
                    paid_at      TEXT NOT NULL,
                    method       TEXT,
                    note         TEXT,
                    created_at   TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
                CREATE INDEX IF NOT EXISTS idx_payments_workspace ON payments(workspace_id, paid_at);
            "#)?;
            Ok(())
        }
        33 => {
            // pipeline_stages: gleichnamige Duplikate entfernen (durch rescope/
            // Share-Migration konnten sich Stages stapeln → "3× im Board") und
            // UNIQUE(workspace_id, name) erzwingen — analog lead_stages (Migration 19).
            // Deals referenzieren die Stage per NAME; der Keeper behält den Namen,
            // also bleiben Deals konsistent.
            conn.execute_batch(r#"
                DELETE FROM pipeline_stages
                WHERE rowid NOT IN (
                    SELECT MIN(rowid) FROM pipeline_stages GROUP BY workspace_id, name
                );
                CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_stages_ws_name
                    ON pipeline_stages(workspace_id, name);
            "#)?;
            Ok(())
        }
        34 => {
            // calendar_events.is_private — Termin-Privatsphäre (im geteilten
            // Workspace sehen andere nur „Gebucht"). Guard: create_tables legt die
            // Spalte bei frischen Installs bereits an, dann darf ALTER nicht erneut laufen.
            if !column_exists(conn, "calendar_events", "is_private") {
                conn.execute_batch(
                    "ALTER TABLE calendar_events ADD COLUMN is_private INTEGER NOT NULL DEFAULT 0;",
                )?;
            }
            Ok(())
        }
        35 => {
            // sync_queue: Fehler-Tracking — Server-Ablehnungen (4xx) wurden bisher
            // still endlos wiederholt. attempts/last_error machen sie zähl- und anzeigbar.
            if !column_exists(conn, "sync_queue", "attempts") {
                conn.execute_batch("ALTER TABLE sync_queue ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;")?;
            }
            if !column_exists(conn, "sync_queue", "last_error") {
                conn.execute_batch("ALTER TABLE sync_queue ADD COLUMN last_error TEXT;")?;
            }
            Ok(())
        }
        36 => {
            // prepared_items — der EINE Vorbereitungs-Kanal des Stapels (Spec §6).
            // create_tables legt die Tabelle bei Frischinstalls an; hier für Bestandsinstallationen.
            if !table_exists(conn, "prepared_items") {
                conn.execute_batch(r#"
                    CREATE TABLE prepared_items (
                        id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, type TEXT NOT NULL,
                        source_kind TEXT NOT NULL, source_id TEXT NOT NULL, assignee TEXT,
                        payload TEXT NOT NULL DEFAULT '{}', score REAL NOT NULL DEFAULT 0,
                        status TEXT NOT NULL DEFAULT 'pending', snooze_until TEXT,
                        rule_id TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL, approved_at TEXT,
                        UNIQUE(workspace_id, source_kind, source_id)
                    );
                    CREATE INDEX IF NOT EXISTS idx_prepared_items_ws_status ON prepared_items(workspace_id, status, score);
                "#)?;
            }
            Ok(())
        }
        37 => {
            // Projektplaner-Kern: Projekte + freie Phasenliste pro Projekt.
            // create_tables() deckt nur Frischinstalls ab; hier fuer Bestandsinstallationen.
            if !table_exists(conn, "projects") {
                conn.execute_batch(r#"
                    CREATE TABLE projects (
                        id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL,
                        account_id TEXT NOT NULL REFERENCES accounts(id),
                        title TEXT NOT NULL, description TEXT,
                        status TEXT NOT NULL DEFAULT 'active',
                        current_phase_id TEXT,
                        created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                        completed_at TEXT
                    );
                    CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects(workspace_id, status);
                    CREATE INDEX IF NOT EXISTS idx_projects_account ON projects(account_id);
                "#)?;
            }
            if !table_exists(conn, "project_phases") {
                conn.execute_batch(r#"
                    CREATE TABLE project_phases (
                        id TEXT PRIMARY KEY,
                        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                        name TEXT NOT NULL, order_index INTEGER NOT NULL,
                        created_at TEXT NOT NULL
                    );
                    CREATE INDEX IF NOT EXISTS idx_project_phases_project ON project_phases(project_id, order_index);
                "#)?;
            }
            if !column_exists(conn, "activities", "project_id") {
                conn.execute_batch("ALTER TABLE activities ADD COLUMN project_id TEXT REFERENCES projects(id);")?;
                conn.execute_batch("CREATE INDEX IF NOT EXISTS idx_activities_project ON activities(project_id, created_at DESC);")?;
            }
            Ok(())
        }
        38 => {
            // Etappe 1 des Projekt-Ausbaus: Retainer am Projekt, Zeitraum + Gate
            // an der Phase. Additive Spalten mit Backfill fuer Bestandsdaten.
            if !column_exists(conn, "projects", "retainer_monthly") {
                conn.execute_batch(
                    "ALTER TABLE projects ADD COLUMN retainer_monthly REAL NOT NULL DEFAULT 0;
                     ALTER TABLE projects ADD COLUMN retainer_hours   INTEGER NOT NULL DEFAULT 0;
                     ALTER TABLE projects ADD COLUMN retainer_months  INTEGER;"
                )?;
            }
            if !column_exists(conn, "project_phases", "start_date") {
                conn.execute_batch(
                    "ALTER TABLE project_phases ADD COLUMN start_date        TEXT NOT NULL DEFAULT '';
                     ALTER TABLE project_phases ADD COLUMN end_date          TEXT NOT NULL DEFAULT '';
                     ALTER TABLE project_phases ADD COLUMN gate_name         TEXT NOT NULL DEFAULT 'Freigabe';
                     ALTER TABLE project_phases ADD COLUMN gate_state        TEXT NOT NULL DEFAULT 'open';
                     ALTER TABLE project_phases ADD COLUMN gate_date         TEXT;
                     ALTER TABLE project_phases ADD COLUMN gate_approved_by  TEXT;
                     ALTER TABLE project_phases ADD COLUMN progress_percent  INTEGER NOT NULL DEFAULT 0;"
                )?;
                conn.execute_batch(
                    "UPDATE project_phases
                     SET start_date = date(created_at), end_date = date(created_at, '+14 days')
                     WHERE start_date = '';"
                )?;
            }
            Ok(())
        }
        39 => {
            // Etappe 3 des Projekt-Ausbaus: Deliverables (Ergebnisse) pro Phase
            // als JSON-Liste, analog zum todos.checklist-Muster -- Rust parst
            // den Inhalt nicht, nur TypeScript.
            if !column_exists(conn, "project_phases", "deliverables") {
                conn.execute_batch(
                    "ALTER TABLE project_phases ADD COLUMN deliverables TEXT NOT NULL DEFAULT '[]';"
                )?;
            }
            Ok(())
        }
        40 => {
            // Etappe 4 des Projekt-Ausbaus: Team-Zuweisung (assignee_ids) pro
            // Phase als JSON-Liste von user_id-Strings, gleiches Muster wie
            // deliverables (v39) -- Rust parst den Inhalt nicht, nur TypeScript.
            if !column_exists(conn, "project_phases", "assignee_ids") {
                conn.execute_batch(
                    "ALTER TABLE project_phases ADD COLUMN assignee_ids TEXT NOT NULL DEFAULT '[]';"
                )?;
            }
            Ok(())
        }
        41 => {
            // Etappe 5 des Projekt-Ausbaus: Moodboard-Kacheln (moodboard_items)
            // pro Projekt als JSON-Liste, gleiches Muster wie deliverables/
            // assignee_ids -- Rust parst den Inhalt nicht, nur TypeScript.
            if !column_exists(conn, "projects", "moodboard_items") {
                conn.execute_batch(
                    "ALTER TABLE projects ADD COLUMN moodboard_items TEXT NOT NULL DEFAULT '[]';"
                )?;
            }
            Ok(())
        }
        42 => {
            // Etappe 6 des Projekt-Ausbaus: optionale Projekt-Zuordnung fuer
            // Rechnungen. NULL bleibt ein gueltiger Zustand -- nicht jede
            // Rechnung ist an ein Projekt gekoppelt.
            if !column_exists(conn, "invoices", "project_id") {
                conn.execute_batch(
                    "ALTER TABLE invoices ADD COLUMN project_id TEXT;"
                )?;
            }
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
    fn migration_33_dedupes_pipeline_stages_and_enforces_unique() {
        // pipeline_stages OHNE Unique-Index (Zustand vor Migration 33), mit Duplikaten
        // wie sie durch rescope/Share-Migration entstehen konnten.
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(r#"
            CREATE TABLE pipeline_stages (
                id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL,
                label TEXT NOT NULL, order_index INTEGER, color TEXT,
                is_won INTEGER, is_lost INTEGER, created_at TEXT, updated_at TEXT
            );
            INSERT INTO pipeline_stages VALUES ('a','ws','won','Won',0,'#fff',1,0,'t','t');
            INSERT INTO pipeline_stages VALUES ('b','ws','won','Won',0,'#fff',1,0,'t','t');
            INSERT INTO pipeline_stages VALUES ('c','ws','won','Won',0,'#fff',1,0,'t','t');
            INSERT INTO pipeline_stages VALUES ('d','ws','lost','Lost',1,'#fff',0,1,'t','t');
            INSERT INTO pipeline_stages VALUES ('e','ws2','won','Won',0,'#fff',1,0,'t','t');
        "#).unwrap();

        apply(&conn, 33).unwrap();

        let won_ws: i64 = conn.query_row(
            "SELECT count(*) FROM pipeline_stages WHERE workspace_id='ws' AND name='won'", [], |r| r.get(0)).unwrap();
        let total: i64 = conn.query_row("SELECT count(*) FROM pipeline_stages", [], |r| r.get(0)).unwrap();
        assert_eq!(won_ws, 1, "Duplikate in ws entfernt");
        assert_eq!(total, 3, "ws: won+lost, ws2: won = 3 (andere Workspace unberührt)");

        // UNIQUE-Index verhindert ein neues Duplikat.
        let dup = conn.execute(
            "INSERT INTO pipeline_stages VALUES ('f','ws','won','Won',0,'#fff',1,0,'t','t')", []);
        assert!(dup.is_err(), "UNIQUE(workspace_id,name) muss greifen");
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
        // Use in_memory_db (creates base schema without migrations),
        // run migrations up to v14 manually, insert a warm lead, then run v15
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        crate::db::schema::create_tables(&conn).unwrap();

        let now = chrono::Utc::now().to_rfc3339();

        // Run migrations 1–14 only (stop before v15)
        for v in 1..=14u32 {
            apply(&conn, v).unwrap();
            set_version(&conn, v).unwrap();
        }

        // Insert a lead with lead_status='warm' — pipeline_stage will be 'inbox' (default)
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, account_type, lead_status, created_at, updated_at)
             VALUES ('l1','ws-1','','Test Lead','lead','warm',?1,?1)",
            [&now],
        ).unwrap();

        // Verify it starts as 'inbox'
        let stage_before: String = conn.query_row(
            "SELECT pipeline_stage FROM accounts WHERE id='l1'",
            [], |r| r.get(0),
        ).unwrap();
        assert_eq!(stage_before, "inbox");

        // Now run v15
        apply(&conn, 15).unwrap();

        // Assert it was migrated to 'replied' (warm → replied)
        let stage: String = conn.query_row(
            "SELECT pipeline_stage FROM accounts WHERE id='l1'",
            [], |r| r.get(0),
        ).unwrap();
        assert_eq!(stage, "replied");
    }

    #[test]
    fn migration_v16_creates_campaign_tables() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::schema::create_tables(&conn).unwrap();
        for v in 1..=16 { apply(&conn, v).unwrap(); set_version(&conn, v).unwrap(); }
        let n: i64 = conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='campaigns'",
            [], |r| r.get(0),
        ).unwrap();
        assert_eq!(n, 1, "campaigns table missing");
        let m: i64 = conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='campaign_recipients'",
            [], |r| r.get(0),
        ).unwrap();
        assert_eq!(m, 1, "campaign_recipients table missing");
    }

    #[test]
    fn migration_v16_campaign_recipients_cascade_delete() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::schema::create_tables(&conn).unwrap();
        for v in 1..=16 { apply(&conn, v).unwrap(); set_version(&conn, v).unwrap(); }
        // Enable FK enforcement (SQLite disables it by default)
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();

        let now = chrono::Utc::now().to_rfc3339();
        // Insert campaign
        conn.execute(
            "INSERT INTO campaigns (id, workspace_id, name, subject, body, sender_account_id, created_at, updated_at)
             VALUES ('c1', 'ws1', 'Test', 'Subj', 'Body', 'acc1', ?1, ?1)",
            [&now],
        ).unwrap();
        // Insert recipient
        conn.execute(
            "INSERT INTO campaign_recipients (id, campaign_id, lead_id, email, created_at)
             VALUES ('r1', 'c1', 'l1', 'test@example.com', ?1)",
            [&now],
        ).unwrap();
        // Verify recipient exists
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id='c1'",
            [], |r| r.get(0),
        ).unwrap();
        assert_eq!(count, 1);
        // Delete campaign — should cascade-delete recipient
        conn.execute("DELETE FROM campaigns WHERE id='c1'", []).unwrap();
        let count_after: i64 = conn.query_row(
            "SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id='c1'",
            [], |r| r.get(0),
        ).unwrap();
        assert_eq!(count_after, 0, "recipient should be cascade-deleted");
    }

    #[test]
    fn migration_v18_makes_activities_account_id_nullable() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        crate::db::schema::create_tables(&conn).unwrap();
        // Inserting a task with NULL account_id must succeed
        let result = conn.execute(
            "INSERT INTO activities (id, workspace_id, created_by, account_id, type, payload, status, created_at, updated_at)
             VALUES ('t1', 'ws-1', 'u-1', NULL, 'task', '{}', 'open', '2026-01-01', '2026-01-01')",
            [],
        );
        assert!(result.is_ok(), "Should accept NULL account_id: {:?}", result);
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

    #[test]
    fn migration_v21_creates_note_tables() {
        let conn = in_memory_db();
        run(&conn).unwrap();
        for table in ["note_entries", "note_docs"] {
            assert!(
                table_exists_helper(&conn, table),
                "{table} fehlt nach v21"
            );
        }
        // note_entries: account_id FK cascade
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, created_at, updated_at)
             VALUES ('acc-n1','ws-1','u1','Test AG',?1,?1)",
            [&now],
        ).unwrap();
        conn.execute(
            "INSERT INTO note_entries (id, workspace_id, account_id, created_by, created_at, updated_at)
             VALUES ('ne1','ws-1','acc-n1','u1',?1,?1)",
            [&now],
        ).unwrap();
        conn.execute("DELETE FROM accounts WHERE id='acc-n1'", []).unwrap();
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM note_entries WHERE id='ne1'",
            [], |r| r.get(0),
        ).unwrap();
        assert_eq!(count, 0, "note_entries should CASCADE on account delete");
    }

    #[test]
    fn migration_v21_runs_idempotently() {
        let conn = in_memory_db();
        run(&conn).unwrap();
        run(&conn).unwrap();
        assert_eq!(get_version(&conn).unwrap(), CURRENT_VERSION);
    }

    #[test]
    fn migration_37_creates_project_tables_and_column() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        schema::create_tables(&conn).unwrap();
        run(&conn).unwrap();

        assert!(table_exists(&conn, "projects"), "projects table missing");
        assert!(table_exists(&conn, "project_phases"), "project_phases table missing");
        assert!(column_exists(&conn, "activities", "project_id"), "activities.project_id missing");

        // Idempotent: running again must not error (table_exists/column_exists guards).
        run(&conn).unwrap();
    }

    #[test]
    fn migration_37_project_phases_cascade_delete_with_project() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        schema::create_tables(&conn).unwrap();
        run(&conn).unwrap();

        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, created_at, updated_at)
             VALUES ('a1','ws-1','u-1','Test','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO projects (id, workspace_id, account_id, title, status, created_at, updated_at)
             VALUES ('p1','ws-1','a1','Test-Projekt','active','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO project_phases (id, project_id, name, order_index, created_at)
             VALUES ('ph1','p1','Konzept',0,'2026-01-01T00:00:00Z')",
            [],
        ).unwrap();

        conn.execute("DELETE FROM projects WHERE id = 'p1'", []).unwrap();

        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM project_phases WHERE project_id = 'p1'", [], |r| r.get(0),
        ).unwrap();
        assert_eq!(count, 0, "project_phases should cascade-delete with its project");
    }

    #[test]
    fn migration_38_adds_retainer_and_gate_columns_with_backfill() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        schema::create_tables(&conn).unwrap();

        // Bestandsdaten VOR Migration 38 anlegen, damit der Backfill-Pfad greift.
        // Migration 37 legt projects/project_phases bereits ohne die neuen Spalten an,
        // also reicht es, bis inklusive Version 37 zu laufen.
        for v in 1..=37u32 {
            apply(&conn, v).unwrap();
            set_version(&conn, v).unwrap();
        }
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, created_at, updated_at)
             VALUES ('a1','ws-1','u-1','Test','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO projects (id, workspace_id, account_id, title, status, created_at, updated_at)
             VALUES ('p1','ws-1','a1','Test-Projekt','active','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO project_phases (id, project_id, name, order_index, created_at)
             VALUES ('ph1','p1','Konzept',0,'2026-01-01T00:00:00Z')",
            [],
        ).unwrap();

        run(&conn).unwrap();

        assert!(column_exists(&conn, "projects", "retainer_monthly"));
        assert!(column_exists(&conn, "project_phases", "gate_state"));

        let (start, end, gate_state, progress): (String, String, String, i32) = conn.query_row(
            "SELECT start_date, end_date, gate_state, progress_percent FROM project_phases WHERE id = 'ph1'",
            [], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        ).unwrap();
        assert_eq!(start, "2026-01-01");
        assert_eq!(end, "2026-01-15");
        assert_eq!(gate_state, "open");
        assert_eq!(progress, 0);

        // Idempotent.
        run(&conn).unwrap();
    }

    #[test]
    fn migration_38_runs_idempotently_on_fresh_db() {
        let conn = in_memory_db();
        run(&conn).unwrap();
        run(&conn).unwrap();
        assert_eq!(get_version(&conn).unwrap(), CURRENT_VERSION);
    }

    #[test]
    fn migration_39_adds_deliverables_column_with_default() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        schema::create_tables(&conn).unwrap();

        for v in 1..=38u32 {
            apply(&conn, v).unwrap();
            set_version(&conn, v).unwrap();
        }
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, created_at, updated_at)
             VALUES ('a1','ws-1','u-1','Test','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO projects (id, workspace_id, account_id, title, status, created_at, updated_at,
             retainer_monthly, retainer_hours, retainer_months)
             VALUES ('p1','ws-1','a1','Test-Projekt','active','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z',0,0,NULL)",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO project_phases (id, project_id, name, order_index, created_at, start_date, end_date, gate_name, gate_state, progress_percent)
             VALUES ('ph1','p1','Konzept',0,'2026-01-01T00:00:00Z','2026-01-01','2026-01-15','Freigabe','open',0)",
            [],
        ).unwrap();

        run(&conn).unwrap();

        assert!(column_exists(&conn, "project_phases", "deliverables"));
        let deliverables: String = conn.query_row(
            "SELECT deliverables FROM project_phases WHERE id = 'ph1'", [], |r| r.get(0),
        ).unwrap();
        assert_eq!(deliverables, "[]");

        run(&conn).unwrap(); // idempotent
    }

    #[test]
    fn migration_40_adds_assignee_ids_column_with_default() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        schema::create_tables(&conn).unwrap();

        for v in 1..=39u32 {
            apply(&conn, v).unwrap();
            set_version(&conn, v).unwrap();
        }
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, created_at, updated_at)
             VALUES ('a1','ws-1','u-1','Test','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO projects (id, workspace_id, account_id, title, status, created_at, updated_at,
             retainer_monthly, retainer_hours, retainer_months)
             VALUES ('p1','ws-1','a1','Test-Projekt','active','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z',0,0,NULL)",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO project_phases (id, project_id, name, order_index, created_at, start_date, end_date, gate_name, gate_state, progress_percent)
             VALUES ('ph1','p1','Konzept',0,'2026-01-01T00:00:00Z','2026-01-01','2026-01-15','Freigabe','open',0)",
            [],
        ).unwrap();

        run(&conn).unwrap();

        assert!(column_exists(&conn, "project_phases", "assignee_ids"));
        let assignee_ids: String = conn.query_row(
            "SELECT assignee_ids FROM project_phases WHERE id = 'ph1'", [], |r| r.get(0),
        ).unwrap();
        assert_eq!(assignee_ids, "[]");

        run(&conn).unwrap(); // idempotent
    }

    #[test]
    fn migration_41_adds_moodboard_items_column_with_default() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        schema::create_tables(&conn).unwrap();

        for v in 1..=40u32 {
            apply(&conn, v).unwrap();
            set_version(&conn, v).unwrap();
        }
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, created_at, updated_at)
             VALUES ('a1','ws-1','u-1','Test','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO projects (id, workspace_id, account_id, title, status, created_at, updated_at,
             retainer_monthly, retainer_hours, retainer_months)
             VALUES ('p1','ws-1','a1','Test-Projekt','active','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z',0,0,NULL)",
            [],
        ).unwrap();

        run(&conn).unwrap();

        assert!(column_exists(&conn, "projects", "moodboard_items"));
        let items: String = conn.query_row(
            "SELECT moodboard_items FROM projects WHERE id = 'p1'", [], |r| r.get(0),
        ).unwrap();
        assert_eq!(items, "[]");

        run(&conn).unwrap(); // idempotent
    }

    #[test]
    fn migration_42_adds_invoices_project_id_column_nullable() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        schema::create_tables(&conn).unwrap();

        for v in 1..=41u32 {
            apply(&conn, v).unwrap();
            set_version(&conn, v).unwrap();
        }
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, created_at, updated_at)
             VALUES ('a1','ws-1','u-1','Test','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO invoices (id, workspace_id, created_by, account_id, date, due_date, status, tax_mode, subtotal, tax_amount, total, bank_info, created_at, updated_at)
             VALUES ('inv-1','ws-1','u-1','a1','2026-01-01','2026-01-15','draft','standard',100,19,119,'{}','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')",
            [],
        ).unwrap();

        run(&conn).unwrap();

        assert!(column_exists(&conn, "invoices", "project_id"));
        let project_id: Option<String> = conn.query_row(
            "SELECT project_id FROM invoices WHERE id = 'inv-1'", [], |r| r.get(0),
        ).unwrap();
        assert_eq!(project_id, None);

        run(&conn).unwrap(); // idempotent
    }
}
