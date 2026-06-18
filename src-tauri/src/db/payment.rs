use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::AppError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Payment {
    pub id: String,
    pub workspace_id: String,
    pub invoice_id: String,
    pub amount: f64,
    pub paid_at: String,
    pub method: Option<String>,
    pub note: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePaymentPayload {
    pub workspace_id: String,
    pub invoice_id: String,
    pub amount: f64,
    pub paid_at: String,
    pub method: Option<String>,
    pub note: Option<String>,
}

const SELECT: &str =
    "SELECT id, workspace_id, invoice_id, amount, paid_at, method, note, created_at FROM payments";

fn map_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<Payment> {
    Ok(Payment {
        id: r.get(0)?,
        workspace_id: r.get(1)?,
        invoice_id: r.get(2)?,
        amount: r.get(3)?,
        paid_at: r.get(4)?,
        method: r.get(5)?,
        note: r.get(6)?,
        created_at: r.get(7)?,
    })
}

pub fn create(conn: &Connection, p: CreatePaymentPayload) -> Result<Payment, AppError> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO payments (id, workspace_id, invoice_id, amount, paid_at, method, note, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
        rusqlite::params![id, p.workspace_id, p.invoice_id, p.amount, p.paid_at, p.method, p.note, now],
    )?;
    conn.query_row(&format!("{SELECT} WHERE id=?1"), [&id], map_row).map_err(AppError::from)
}

pub fn get_by_invoice(conn: &Connection, invoice_id: &str) -> Result<Vec<Payment>, AppError> {
    let mut stmt = conn.prepare(&format!("{SELECT} WHERE invoice_id=?1 ORDER BY paid_at ASC, created_at ASC"))?;
    let rows = stmt.query_map([invoice_id], map_row)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn get_by_workspace(conn: &Connection, workspace_id: &str) -> Result<Vec<Payment>, AppError> {
    let mut stmt = conn.prepare(&format!("{SELECT} WHERE workspace_id=?1 ORDER BY paid_at DESC"))?;
    let rows = stmt.query_map([workspace_id], map_row)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn total_paid(conn: &Connection, invoice_id: &str) -> Result<f64, AppError> {
    let sum: f64 = conn.query_row(
        "SELECT COALESCE(SUM(amount),0) FROM payments WHERE invoice_id=?1",
        [invoice_id],
        |r| r.get(0),
    )?;
    Ok(sum)
}

pub fn delete(conn: &Connection, id: &str) -> Result<(), AppError> {
    conn.execute("DELETE FROM payments WHERE id=?1", [id])?;
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
        // minimal invoice to reference (account + invoice)
        let now = "2026-01-01T00:00:00Z";
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, account_type, created_at, updated_at)
             VALUES ('acc-1','ws-1','u','ACME','client',?1,?1)",
            [now],
        ).unwrap();
        conn.execute(
            "INSERT INTO invoices (id, workspace_id, created_by, account_id, date, due_date, status, tax_mode,
                                   subtotal, tax_amount, total, created_at, updated_at)
             VALUES ('inv-1','ws-1','u','acc-1','2026-01-01','2026-01-15','open','standard',1000,190,1190,?1,?1)",
            [now],
        ).unwrap();
        conn
    }

    fn payload(amount: f64) -> CreatePaymentPayload {
        CreatePaymentPayload {
            workspace_id: "ws-1".into(), invoice_id: "inv-1".into(),
            amount, paid_at: "2026-01-10".into(), method: Some("Überweisung".into()), note: None,
        }
    }

    #[test]
    fn create_and_total_paid() {
        let conn = setup();
        create(&conn, payload(500.0)).unwrap();
        create(&conn, payload(690.0)).unwrap();
        assert_eq!(total_paid(&conn, "inv-1").unwrap(), 1190.0);
        assert_eq!(get_by_invoice(&conn, "inv-1").unwrap().len(), 2);
        assert_eq!(get_by_workspace(&conn, "ws-1").unwrap().len(), 2);
    }

    #[test]
    fn delete_removes_payment() {
        let conn = setup();
        let p = create(&conn, payload(100.0)).unwrap();
        delete(&conn, &p.id).unwrap();
        assert_eq!(total_paid(&conn, "inv-1").unwrap(), 0.0);
    }

    #[test]
    fn deleting_invoice_cascades_payments() {
        let conn = setup();
        create(&conn, payload(100.0)).unwrap();
        conn.execute("DELETE FROM invoices WHERE id='inv-1'", []).unwrap();
        assert_eq!(get_by_invoice(&conn, "inv-1").unwrap().len(), 0);
    }
}
