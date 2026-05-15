use rusqlite::Connection;
use crate::AppError;

const CURRENT_VERSION: u32 = 4;

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

fn apply(conn: &Connection, version: u32) -> Result<(), AppError> {
    match version {
        1 => {
            let now = chrono::Utc::now().to_rfc3339();
            conn.execute(
                "INSERT OR IGNORE INTO customers (id, name, is_private, created_at, updated_at)
                 VALUES ('__cynera_privat__', 'Privat', 1, ?1, ?2)",
                rusqlite::params![now, now],
            )?;
            Ok(())
        }
        2 => {
            let tables = [
                "customers", "todos", "notes", "kpis", "deadlines",
                "crm_follow_ups", "health_scores", "time_entries",
                "folders", "files", "chat_messages", "emails",
            ];
            for table in &tables {
                conn.execute_batch(&format!(
                    "ALTER TABLE {table} ADD COLUMN workspace_id TEXT NOT NULL DEFAULT '';
                     ALTER TABLE {table} ADD COLUMN created_by   TEXT NOT NULL DEFAULT '';
                     ALTER TABLE {table} ADD COLUMN pending_sync INTEGER NOT NULL DEFAULT 0;"
                ))?;
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
        _ => Ok(()),
    }
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
        let cols: Vec<String> = conn.prepare("PRAGMA table_info(customers)").unwrap()
            .query_map([], |r| r.get::<_, String>(1)).unwrap()
            .filter_map(|r| r.ok())
            .collect();
        assert!(cols.contains(&"workspace_id".to_string()), "workspace_id fehlt in customers");
        assert!(cols.contains(&"created_by".to_string()), "created_by fehlt in customers");
        assert!(cols.contains(&"pending_sync".to_string()), "pending_sync fehlt in customers");
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
        assert_eq!(get_version(&conn).unwrap(), 4);

        let todo_cols: Vec<String> = conn.prepare("PRAGMA table_info(todos)").unwrap()
            .query_map([], |r| r.get::<_, String>(1)).unwrap()
            .filter_map(|r| r.ok()).collect();
        assert!(todo_cols.contains(&"checklist".to_string()));
        assert!(todo_cols.contains(&"tags".to_string()));
        assert!(todo_cols.contains(&"assignee".to_string()));

        let note_cols: Vec<String> = conn.prepare("PRAGMA table_info(notes)").unwrap()
            .query_map([], |r| r.get::<_, String>(1)).unwrap()
            .filter_map(|r| r.ok()).collect();
        assert!(note_cols.contains(&"note_type".to_string()));
        assert!(note_cols.contains(&"waiting_reply".to_string()));

        let cust_cols: Vec<String> = conn.prepare("PRAGMA table_info(customers)").unwrap()
            .query_map([], |r| r.get::<_, String>(1)).unwrap()
            .filter_map(|r| r.ok()).collect();
        assert!(cust_cols.contains(&"industry".to_string()));
        assert!(cust_cols.contains(&"goals".to_string()));
        assert!(cust_cols.contains(&"social_links".to_string()));
    }

    #[test]
    fn privat_kunde_wird_geseedet() {
        let conn = in_memory_db();
        run(&conn).unwrap();
        let count: i32 = conn.query_row(
            "SELECT COUNT(*) FROM customers WHERE id = '__cynera_privat__'",
            [],
            |r| r.get(0),
        ).unwrap();
        assert_eq!(count, 1);
    }
}
