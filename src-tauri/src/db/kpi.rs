use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::AppError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Kpi {
    pub id: String,
    pub account_id: String,
    pub label: String,
    pub value: Option<f64>,
    pub unit: Option<String>,
    pub target: Option<f64>,
    pub period: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertKpiPayload {
    pub id: Option<String>,
    pub account_id: String,
    pub label: String,
    pub value: Option<f64>,
    pub unit: Option<String>,
    pub target: Option<f64>,
    pub period: Option<String>,
}

pub fn get_by_customer(conn: &Connection, account_id: &str) -> Result<Vec<Kpi>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, account_id, label, value, unit, target, period, updated_at
         FROM kpis WHERE account_id = ?1 ORDER BY label ASC",
    )?;
    let kpis = stmt
        .query_map([account_id], |row| {
            Ok(Kpi {
                id: row.get(0)?,
                account_id: row.get(1)?,
                label: row.get(2)?,
                value: row.get(3)?,
                unit: row.get(4)?,
                target: row.get(5)?,
                period: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(kpis)
}

pub fn upsert(conn: &Connection, payload: UpsertKpiPayload) -> Result<Kpi, AppError> {
    let id = payload.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO kpis (id, account_id, label, value, unit, target, period, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(id) DO UPDATE SET
           label = excluded.label, value = excluded.value, unit = excluded.unit,
           target = excluded.target, period = excluded.period, updated_at = excluded.updated_at",
        rusqlite::params![
            id, payload.account_id, payload.label,
            payload.value, payload.unit, payload.target, payload.period, now,
        ],
    )?;
    let kpi = conn.query_row(
        "SELECT id, account_id, label, value, unit, target, period, updated_at
         FROM kpis WHERE id = ?1",
        [&id],
        |row| Ok(Kpi {
            id: row.get(0)?, account_id: row.get(1)?, label: row.get(2)?,
            value: row.get(3)?, unit: row.get(4)?, target: row.get(5)?,
            period: row.get(6)?, updated_at: row.get(7)?,
        }),
    )?;
    Ok(kpi)
}

pub fn delete(conn: &Connection, id: &str) -> Result<(), AppError> {
    let affected = conn.execute("DELETE FROM kpis WHERE id = ?1", [id])?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("KPI {id} not found")));
    }
    Ok(())
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
    fn upsert_creates_kpi() {
        let conn = setup();
        let kpi = upsert(&conn, UpsertKpiPayload {
            id: None, account_id: "__cynera_privat__".to_string(),
            label: "Umsatz".to_string(), value: Some(5000.0),
            unit: Some("€".to_string()), target: Some(8000.0), period: Some("Q1".to_string()),
        }).unwrap();
        assert_eq!(kpi.label, "Umsatz");
        assert_eq!(kpi.value, Some(5000.0));
    }

    #[test]
    fn upsert_updates_kpi_value() {
        let conn = setup();
        let kpi = upsert(&conn, UpsertKpiPayload {
            id: None, account_id: "__cynera_privat__".to_string(),
            label: "KPI".to_string(), value: Some(1.0),
            unit: None, target: None, period: None,
        }).unwrap();
        let updated = upsert(&conn, UpsertKpiPayload {
            id: Some(kpi.id), account_id: "__cynera_privat__".to_string(),
            label: "KPI".to_string(), value: Some(2.0),
            unit: None, target: None, period: None,
        }).unwrap();
        assert_eq!(updated.value, Some(2.0));
    }

    #[test]
    fn get_by_customer_isolates() {
        let conn = setup();
        upsert(&conn, UpsertKpiPayload {
            id: None, account_id: "__cynera_privat__".to_string(),
            label: "K".to_string(), value: None, unit: None, target: None, period: None,
        }).unwrap();
        assert_eq!(get_by_customer(&conn, "__cynera_privat__").unwrap().len(), 1);
        assert_eq!(get_by_customer(&conn, "other").unwrap().len(), 0);
    }
}
