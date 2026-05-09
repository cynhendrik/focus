use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::AppError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CompanySettings {
    pub id: String,
    pub profile: String,
    pub modules: String,
    pub crm_config: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCompanyPayload {
    pub profile: Option<String>,
    pub modules: Option<String>,
    pub crm_config: Option<String>,
}

pub fn get(conn: &Connection) -> Result<CompanySettings, AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT OR IGNORE INTO company_settings (id, updated_at) VALUES ('singleton', ?1)",
        [&now],
    )?;
    let mut stmt = conn.prepare(
        "SELECT id, profile, modules, crm_config, updated_at FROM company_settings WHERE id = 'singleton'",
    )?;
    let settings = stmt.query_row([], |row| Ok(CompanySettings {
        id: row.get(0)?, profile: row.get(1)?, modules: row.get(2)?,
        crm_config: row.get(3)?, updated_at: row.get(4)?,
    }))?;
    Ok(settings)
}

pub fn update(conn: &Connection, payload: UpdateCompanyPayload) -> Result<CompanySettings, AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT OR IGNORE INTO company_settings (id, updated_at) VALUES ('singleton', ?1)",
        [&now],
    )?;
    if let Some(ref profile) = payload.profile {
        conn.execute("UPDATE company_settings SET profile = ?1, updated_at = ?2 WHERE id = 'singleton'", rusqlite::params![profile, now])?;
    }
    if let Some(ref modules) = payload.modules {
        conn.execute("UPDATE company_settings SET modules = ?1, updated_at = ?2 WHERE id = 'singleton'", rusqlite::params![modules, now])?;
    }
    if let Some(ref crm_config) = payload.crm_config {
        conn.execute("UPDATE company_settings SET crm_config = ?1, updated_at = ?2 WHERE id = 'singleton'", rusqlite::params![crm_config, now])?;
    }
    get(conn)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{schema, migrations};

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        schema::create_tables(&conn).unwrap();
        migrations::run(&conn).unwrap();
        conn
    }

    #[test]
    fn get_creates_singleton() {
        let conn = setup();
        let s = get(&conn).unwrap();
        assert_eq!(s.id, "singleton");
        assert_eq!(s.profile, "{}");
    }

    #[test]
    fn update_profile() {
        let conn = setup();
        let s = update(&conn, UpdateCompanyPayload {
            profile: Some(r#"{"name":"Cynera GmbH"}"#.to_string()),
            modules: None, crm_config: None,
        }).unwrap();
        assert!(s.profile.contains("Cynera GmbH"));
    }

    #[test]
    fn get_is_idempotent() {
        let conn = setup();
        get(&conn).unwrap();
        get(&conn).unwrap();
        let s = get(&conn).unwrap();
        assert_eq!(s.id, "singleton");
    }
}
