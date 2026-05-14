use std::path::Path;
use std::sync::{Arc, Mutex};
use rusqlite::Connection;
use crate::AppError;
use super::{migrations, schema};

pub struct DbPool {
    conn: Arc<Mutex<Connection>>,
}

impl DbPool {
    pub fn new(db_path: &Path) -> Result<Self, AppError> {
        let conn = Connection::open(db_path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
        let pool = DbPool { conn: Arc::new(Mutex::new(conn)) };
        pool.init()?;
        Ok(pool)
    }

    fn init(&self) -> Result<(), AppError> {
        let conn = self.conn.lock().unwrap();
        schema::create_tables(&conn)?;
        migrations::run(&conn)?;
        Ok(())
    }

    pub fn conn(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.conn.lock().unwrap()
    }
}

impl Clone for DbPool {
    fn clone(&self) -> Self {
        DbPool { conn: std::sync::Arc::clone(&self.conn) }
    }
}
