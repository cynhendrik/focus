use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use crate::AppError;

/// Vertrag (wiederkehrende Rechnung). `items` ist eine JSON-Array-Spalte; nach
/// außen geben wir sie als geparstes Array zurück, damit das Frontend
/// `VertragItem[]` erhält.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Contract {
    pub id: String,
    pub workspace_id: String,
    pub account_id: String,
    pub title: String,
    pub interval_value: i64,
    pub interval_unit: String,
    pub start_date: String,
    pub next_billing_date: String,
    pub end_date: Option<String>,
    pub status: String,
    pub tax_mode: String,
    pub notes: String,
    pub items: Value,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertContractPayload {
    pub id: String,
    pub workspace_id: String,
    pub account_id: String,
    pub title: String,
    pub interval_value: i64,
    pub interval_unit: String,
    pub start_date: String,
    pub next_billing_date: String,
    pub end_date: Option<String>,
    pub status: String,
    pub tax_mode: String,
    pub notes: String,
    pub items: Value,
    pub created_at: String,
}

const SELECT: &str =
    "SELECT id, workspace_id, account_id, title, interval_value, interval_unit,
            start_date, next_billing_date, end_date, status, tax_mode, notes,
            items, created_at, updated_at
     FROM contracts";

fn map_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<Contract> {
    let items_str: String = r.get(12)?;
    let items: Value = serde_json::from_str(&items_str).unwrap_or_else(|_| Value::Array(vec![]));
    Ok(Contract {
        id: r.get(0)?,
        workspace_id: r.get(1)?,
        account_id: r.get(2)?,
        title: r.get(3)?,
        interval_value: r.get(4)?,
        interval_unit: r.get(5)?,
        start_date: r.get(6)?,
        next_billing_date: r.get(7)?,
        end_date: r.get(8)?,
        status: r.get(9)?,
        tax_mode: r.get(10)?,
        notes: r.get(11)?,
        items,
        created_at: r.get(13)?,
        updated_at: r.get(14)?,
    })
}

pub fn get_by_workspace(conn: &Connection, workspace_id: &str) -> Result<Vec<Contract>, AppError> {
    let mut stmt = conn.prepare(&format!("{SELECT} WHERE workspace_id=?1 ORDER BY created_at DESC"))?;
    let rows = stmt.query_map([workspace_id], map_row)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn upsert(conn: &Connection, p: UpsertContractPayload) -> Result<Contract, AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    let items_str = serde_json::to_string(&p.items).unwrap_or_else(|_| "[]".to_string());
    conn.execute(
        "INSERT INTO contracts
         (id, workspace_id, account_id, title, interval_value, interval_unit, start_date,
          next_billing_date, end_date, status, tax_mode, notes, items, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)
         ON CONFLICT(id) DO UPDATE SET
           account_id=excluded.account_id, title=excluded.title,
           interval_value=excluded.interval_value, interval_unit=excluded.interval_unit,
           start_date=excluded.start_date, next_billing_date=excluded.next_billing_date,
           end_date=excluded.end_date, status=excluded.status, tax_mode=excluded.tax_mode,
           notes=excluded.notes, items=excluded.items, updated_at=excluded.updated_at",
        rusqlite::params![
            p.id, p.workspace_id, p.account_id, p.title, p.interval_value, p.interval_unit,
            p.start_date, p.next_billing_date, p.end_date, p.status, p.tax_mode, p.notes,
            items_str, p.created_at, now,
        ],
    )?;
    conn.query_row(&format!("{SELECT} WHERE id=?1"), [&p.id], map_row)
        .map_err(AppError::from)
}

pub fn delete(conn: &Connection, id: &str) -> Result<(), AppError> {
    conn.execute("DELETE FROM contracts WHERE id=?1", [id])?;
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

    fn payload(id: &str) -> UpsertContractPayload {
        UpsertContractPayload {
            id: id.into(), workspace_id: "ws-1".into(), account_id: "acc-1".into(),
            title: "Hosting-Retainer".into(), interval_value: 1, interval_unit: "months".into(),
            start_date: "2026-01-01".into(), next_billing_date: "2026-02-01".into(),
            end_date: None, status: "active".into(), tax_mode: "standard".into(),
            notes: "".into(),
            items: serde_json::json!([{ "title": "Hosting", "quantity": 1, "unitPrice": 50.0, "taxRate": 19 }]),
            created_at: "2026-01-01T00:00:00Z".into(),
        }
    }

    #[test]
    fn upsert_and_get_roundtrips_items() {
        let conn = setup();
        let c = upsert(&conn, payload("c-1")).unwrap();
        assert_eq!(c.title, "Hosting-Retainer");
        assert!(c.items.is_array());
        assert_eq!(c.items[0]["title"], "Hosting");
        let all = get_by_workspace(&conn, "ws-1").unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].items[0]["unitPrice"], 50.0);
    }

    #[test]
    fn upsert_updates_existing() {
        let conn = setup();
        upsert(&conn, payload("c-1")).unwrap();
        let mut p = payload("c-1");
        p.status = "paused".into();
        upsert(&conn, p).unwrap();
        let all = get_by_workspace(&conn, "ws-1").unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].status, "paused");
    }

    #[test]
    fn delete_removes_row() {
        let conn = setup();
        upsert(&conn, payload("c-1")).unwrap();
        delete(&conn, "c-1").unwrap();
        assert_eq!(get_by_workspace(&conn, "ws-1").unwrap().len(), 0);
    }
}
