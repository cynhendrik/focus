use rusqlite::Connection;
use crate::AppError;

const CURRENT_VERSION: u32 = 1;

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
        assert_eq!(version, 1);
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
