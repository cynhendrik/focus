use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::AppError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Invoice {
    pub id: String,
    pub workspace_id: String,
    pub created_by: String,
    pub account_id: String,
    pub deal_id: Option<String>,
    pub number: Option<String>,
    pub date: String,
    pub due_date: String,
    pub status: String,
    pub tax_mode: String,
    pub subtotal: f64,
    pub tax_amount: f64,
    pub total: f64,
    pub bank_info: String,
    pub notes: Option<String>,
    pub pdf_path: Option<String>,
    pub is_suggestion: bool,
    pub suggested_by: Option<String>,
    pub approved_by: Option<String>,
    pub pending_sync: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InvoiceItem {
    pub id: String,
    pub invoice_id: String,
    pub title: String,
    pub description: Option<String>,
    pub quantity: f64,
    pub unit_price: f64,
    pub tax_rate: f64,
    pub total: f64,
    pub sort_order: i64,
    pub item_date: Option<String>,
    pub unit:      Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InvoiceWithItems {
    pub invoice: Invoice,
    pub items: Vec<InvoiceItem>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertInvoicePayload {
    pub workspace_id: String,
    pub created_by: String,
    pub account_id: String,
    pub deal_id: Option<String>,
    pub date: String,
    pub due_date: String,
    pub status: Option<String>,
    pub tax_mode: Option<String>,
    pub subtotal: f64,
    pub tax_amount: f64,
    pub total: f64,
    pub bank_info: Option<String>,
    pub notes: Option<String>,
    pub is_suggestion: Option<bool>,
    pub suggested_by: Option<String>,
    pub items: Vec<UpsertInvoiceItemPayload>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertInvoiceItemPayload {
    pub id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub quantity: f64,
    pub unit_price: f64,
    pub tax_rate: f64,
    pub total: f64,
    pub sort_order: i64,
    pub item_date: Option<String>,
    pub unit:      Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ClientRevenue {
    pub account_id: String,
    pub name: String,
    pub total: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FinanceKpis {
    pub month_revenue: f64,
    pub year_revenue: f64,
    pub open_count: i64,
    pub open_total: f64,
    pub overdue_count: i64,
    pub overdue_total: f64,
    pub suggestion_count: i64,
    pub top_clients: Vec<ClientRevenue>,
}

fn map_invoice(r: &rusqlite::Row<'_>) -> rusqlite::Result<Invoice> {
    Ok(Invoice {
        id:           r.get(0)?,
        workspace_id: r.get(1)?,
        created_by:   r.get(2)?,
        account_id:   r.get(3)?,
        deal_id:      r.get(4)?,
        number:       r.get(5)?,
        date:         r.get(6)?,
        due_date:     r.get(7)?,
        status:       r.get(8)?,
        tax_mode:     r.get(9)?,
        subtotal:     r.get(10)?,
        tax_amount:   r.get(11)?,
        total:        r.get(12)?,
        bank_info:    r.get::<_, Option<String>>(13)?.unwrap_or_else(|| "{}".into()),
        notes:        r.get(14)?,
        pdf_path:     r.get(15)?,
        is_suggestion: r.get::<_, i32>(16)? != 0,
        suggested_by: r.get(17)?,
        approved_by:  r.get(18)?,
        pending_sync: r.get::<_, i32>(19)? != 0,
        created_at:   r.get(20)?,
        updated_at:   r.get(21)?,
    })
}

fn map_item(r: &rusqlite::Row<'_>) -> rusqlite::Result<InvoiceItem> {
    Ok(InvoiceItem {
        id:          r.get(0)?,
        invoice_id:  r.get(1)?,
        title:       r.get(2)?,
        description: r.get(3)?,
        quantity:    r.get(4)?,
        unit_price:  r.get(5)?,
        tax_rate:    r.get(6)?,
        total:       r.get(7)?,
        sort_order:  r.get(8)?,
        item_date:   r.get(9)?,
        unit:        r.get(10)?,
    })
}

const INVOICE_COLS: &str =
    "id, workspace_id, created_by, account_id, deal_id, number, date, due_date, \
     status, tax_mode, subtotal, tax_amount, total, bank_info, notes, pdf_path, \
     is_suggestion, suggested_by, approved_by, pending_sync, created_at, updated_at";

fn fetch_items(conn: &Connection, invoice_id: &str) -> Result<Vec<InvoiceItem>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, invoice_id, title, description, quantity, unit_price, tax_rate, total, sort_order, item_date, unit
         FROM invoice_items WHERE invoice_id = ?1 ORDER BY sort_order"
    )?;
    let rows = stmt.query_map([invoice_id], map_item)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

fn replace_items(conn: &Connection, invoice_id: &str, items: &[UpsertInvoiceItemPayload]) -> Result<(), AppError> {
    conn.execute("DELETE FROM invoice_items WHERE invoice_id = ?1", [invoice_id])?;
    for item in items {
        let id = item.id.clone().unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        conn.execute(
            "INSERT INTO invoice_items (id, invoice_id, title, description, quantity, unit_price, tax_rate, total, sort_order, item_date, unit)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
            rusqlite::params![
                id, invoice_id, item.title, item.description,
                item.quantity, item.unit_price, item.tax_rate, item.total, item.sort_order,
                item.item_date, item.unit,
            ],
        )?;
    }
    Ok(())
}

fn next_invoice_number(conn: &Connection, workspace_id: &str) -> Result<String, AppError> {
    conn.execute(
        "INSERT INTO invoice_sequences (workspace_id, next_number) VALUES (?1, 1)
         ON CONFLICT(workspace_id) DO UPDATE SET next_number = next_number + 1",
        [workspace_id],
    )?;
    let n: i64 = conn.query_row(
        "SELECT next_number FROM invoice_sequences WHERE workspace_id = ?1",
        [workspace_id],
        |r| r.get(0),
    )?;
    let year = chrono::Utc::now().format("%Y");
    Ok(format!("{year}-{n:05}"))
}

pub fn create(conn: &Connection, payload: UpsertInvoicePayload) -> Result<InvoiceWithItems, AppError> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let status = payload.status.unwrap_or_else(|| "draft".into());
    let tax_mode = payload.tax_mode.unwrap_or_else(|| "standard".into());
    let bank_info = payload.bank_info.unwrap_or_else(|| "{}".into());
    let is_suggestion = payload.is_suggestion.unwrap_or(false);
    conn.execute(
        &format!("INSERT INTO invoices ({INVOICE_COLS})
         VALUES (?1,?2,?3,?4,?5,NULL,?6,?7,?8,?9,?10,?11,?12,?13,?14,NULL,?15,?16,NULL,1,?17,?17)"),
        rusqlite::params![
            id, payload.workspace_id, payload.created_by, payload.account_id, payload.deal_id,
            payload.date, payload.due_date, status, tax_mode,
            payload.subtotal, payload.tax_amount, payload.total, bank_info, payload.notes,
            is_suggestion as i32, payload.suggested_by, now,
        ],
    )?;
    // Assign invoice number immediately when creating a published (non-draft) invoice
    if !is_suggestion && status == "open" {
        let number = next_invoice_number(conn, &payload.workspace_id)?;
        conn.execute(
            "UPDATE invoices SET number=?1 WHERE id=?2",
            rusqlite::params![number, id],
        )?;
    }
    replace_items(conn, &id, &payload.items)?;
    let invoice = conn.query_row(
        &format!("SELECT {INVOICE_COLS} FROM invoices WHERE id = ?1"),
        [&id], map_invoice,
    )?;
    let items = fetch_items(conn, &id)?;
    Ok(InvoiceWithItems { invoice, items })
}

pub fn update(conn: &Connection, id: &str, payload: UpsertInvoicePayload) -> Result<InvoiceWithItems, AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    let bank_info = payload.bank_info.unwrap_or_else(|| "{}".into());

    // Resolve the new status; fall back to the current DB value if not provided
    let new_status = match payload.status.as_deref() {
        Some(s) => s.to_string(),
        None => conn.query_row(
            "SELECT status FROM invoices WHERE id = ?1", [id],
            |r| r.get::<_, String>(0),
        ).map_err(|_| AppError::NotFound(format!("Invoice {id} not found")))?,
    };

    // Assign a number the first time an invoice is published
    if new_status == "open" {
        let current_number: Option<String> = conn.query_row(
            "SELECT number FROM invoices WHERE id = ?1", [id],
            |r| r.get(0),
        ).map_err(|_| AppError::NotFound(format!("Invoice {id} not found")))?;
        if current_number.is_none() {
            let number = next_invoice_number(conn, &payload.workspace_id)?;
            conn.execute(
                "UPDATE invoices SET number=?1 WHERE id=?2",
                rusqlite::params![number, id],
            )?;
        }
    }

    let n = conn.execute(
        "UPDATE invoices SET account_id=?1, deal_id=?2, date=?3, due_date=?4,
         tax_mode=?5, subtotal=?6, tax_amount=?7, total=?8, bank_info=?9,
         notes=?10, status=?11, pending_sync=1, updated_at=?12 WHERE id=?13",
        rusqlite::params![
            payload.account_id, payload.deal_id, payload.date, payload.due_date,
            payload.tax_mode.unwrap_or_else(|| "standard".into()),
            payload.subtotal, payload.tax_amount, payload.total, bank_info,
            payload.notes, new_status, now, id,
        ],
    )?;
    if n == 0 { return Err(AppError::NotFound(format!("Invoice {id} not found"))); }
    replace_items(conn, id, &payload.items)?;
    let invoice = conn.query_row(
        &format!("SELECT {INVOICE_COLS} FROM invoices WHERE id = ?1"),
        [id], map_invoice,
    )?;
    let items = fetch_items(conn, id)?;
    Ok(InvoiceWithItems { invoice, items })
}

pub fn get_by_id(conn: &Connection, id: &str) -> Result<InvoiceWithItems, AppError> {
    let invoice = conn.query_row(
        &format!("SELECT {INVOICE_COLS} FROM invoices WHERE id = ?1"),
        [id], map_invoice,
    ).map_err(|_| AppError::NotFound(format!("Invoice {id} not found")))?;
    let items = fetch_items(conn, id)?;
    Ok(InvoiceWithItems { invoice, items })
}

pub fn get_by_workspace(
    conn: &Connection,
    workspace_id: &str,
    status_filter: Option<&str>,
) -> Result<Vec<Invoice>, AppError> {
    let (sql, params): (String, Vec<String>) = match status_filter {
        Some(f) if f == "suggestions" => (
            format!("SELECT {INVOICE_COLS} FROM invoices WHERE workspace_id=?1 AND is_suggestion=1 ORDER BY created_at DESC"),
            vec![workspace_id.to_string()],
        ),
        Some(f) => (
            format!("SELECT {INVOICE_COLS} FROM invoices WHERE workspace_id=?1 AND status=?2 ORDER BY created_at DESC"),
            vec![workspace_id.to_string(), f.to_string()],
        ),
        None => (
            format!("SELECT {INVOICE_COLS} FROM invoices WHERE workspace_id=?1 ORDER BY created_at DESC"),
            vec![workspace_id.to_string()],
        ),
    };
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(params.iter()), map_invoice)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn get_by_account(conn: &Connection, account_id: &str) -> Result<Vec<Invoice>, AppError> {
    let mut stmt = conn.prepare(
        &format!("SELECT {INVOICE_COLS} FROM invoices WHERE account_id=?1 ORDER BY created_at DESC")
    )?;
    let rows = stmt.query_map([account_id], map_invoice)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn approve_suggestion(
    conn: &Connection,
    id: &str,
    approved_by: &str,
    workspace_id: &str,
) -> Result<Invoice, AppError> {
    let number = next_invoice_number(conn, workspace_id)?;
    let now = chrono::Utc::now().to_rfc3339();
    let n = conn.execute(
        "UPDATE invoices SET number=?1, status='open', is_suggestion=0, approved_by=?2, pending_sync=1, updated_at=?3
         WHERE id=?4 AND is_suggestion=1",
        rusqlite::params![number, approved_by, now, id],
    )?;
    if n == 0 { return Err(AppError::NotFound(format!("Suggestion {id} not found"))); }
    conn.query_row(
        &format!("SELECT {INVOICE_COLS} FROM invoices WHERE id = ?1"),
        [id], map_invoice,
    ).map_err(AppError::from)
}

pub fn update_status(conn: &Connection, id: &str, status: &str) -> Result<Invoice, AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    // Auto-assign invoice number when first transitioning to 'open'
    if status == "open" {
        if let Ok((ws_id, None::<String>)) = conn.query_row(
            "SELECT workspace_id, number FROM invoices WHERE id = ?1",
            [id],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?)),
        ) {
            let number = next_invoice_number(conn, &ws_id)?;
            conn.execute(
                "UPDATE invoices SET number=?1 WHERE id=?2",
                rusqlite::params![number, id],
            )?;
        }
    }
    let n = conn.execute(
        "UPDATE invoices SET status=?1, pending_sync=1, updated_at=?2 WHERE id=?3",
        rusqlite::params![status, now, id],
    )?;
    if n == 0 { return Err(AppError::NotFound(format!("Invoice {id} not found"))); }
    conn.query_row(
        &format!("SELECT {INVOICE_COLS} FROM invoices WHERE id = ?1"),
        [id], map_invoice,
    ).map_err(AppError::from)
}

pub fn delete(conn: &Connection, id: &str) -> Result<(), AppError> {
    let n = conn.execute("DELETE FROM invoices WHERE id = ?1", [id])?;
    if n == 0 { return Err(AppError::NotFound(format!("Invoice {id} not found"))); }
    Ok(())
}

pub fn create_suggestion_from_deal(conn: &Connection, deal: &crate::db::deal::Deal) -> Result<Invoice, AppError> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let due = (chrono::Utc::now() + chrono::Duration::days(14))
        .format("%Y-%m-%d")
        .to_string();
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let value = deal.value.unwrap_or(0.0);

    conn.execute(
        &format!("INSERT INTO invoices ({INVOICE_COLS})
         VALUES (?1,?2,?3,?4,?5,NULL,?6,?7,'draft','standard',?8,0,?8,'{{}}',NULL,NULL,1,NULL,NULL,1,?9,?9)"),
        rusqlite::params![
            id, deal.workspace_id, deal.created_by, deal.account_id, deal.id,
            today, due, value, now,
        ],
    )?;

    let item_id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO invoice_items (id, invoice_id, title, quantity, unit_price, tax_rate, total, sort_order)
         VALUES (?1,?2,?3,1,?4,19,?4,0)",
        rusqlite::params![item_id, id, deal.title, value],
    )?;

    conn.query_row(
        &format!("SELECT {INVOICE_COLS} FROM invoices WHERE id = ?1"),
        [&id], map_invoice,
    ).map_err(AppError::from)
}

pub fn get_finance_kpis(conn: &Connection, workspace_id: &str) -> Result<FinanceKpis, AppError> {
    let current_month = chrono::Utc::now().format("%Y-%m").to_string();
    let current_year  = chrono::Utc::now().format("%Y").to_string();

    let month_revenue: f64 = conn.query_row(
        "SELECT COALESCE(SUM(total),0) FROM invoices
         WHERE workspace_id=?1 AND status='paid' AND strftime('%Y-%m', date)=?2",
        rusqlite::params![workspace_id, current_month],
        |r| r.get(0),
    )?;

    let year_revenue: f64 = conn.query_row(
        "SELECT COALESCE(SUM(total),0) FROM invoices
         WHERE workspace_id=?1 AND status='paid' AND strftime('%Y', date)=?2",
        rusqlite::params![workspace_id, current_year],
        |r| r.get(0),
    )?;

    let (open_count, open_total): (i64, f64) = conn.query_row(
        "SELECT COUNT(*), COALESCE(SUM(total),0) FROM invoices
         WHERE workspace_id=?1 AND status='open' AND is_suggestion=0",
        [workspace_id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;

    let (overdue_count, overdue_total): (i64, f64) = conn.query_row(
        "SELECT COUNT(*), COALESCE(SUM(total),0) FROM invoices
         WHERE workspace_id=?1 AND status='overdue'",
        [workspace_id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;

    let suggestion_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM invoices WHERE workspace_id=?1 AND is_suggestion=1",
        [workspace_id],
        |r| r.get(0),
    )?;

    let mut top_stmt = conn.prepare(
        "SELECT i.account_id, a.name, SUM(i.total) as rev
         FROM invoices i JOIN accounts a ON a.id = i.account_id
         WHERE i.workspace_id=?1 AND i.status='paid'
         GROUP BY i.account_id ORDER BY rev DESC LIMIT 5"
    )?;
    let top_clients = top_stmt.query_map([workspace_id], |r| {
        Ok(ClientRevenue { account_id: r.get(0)?, name: r.get(1)?, total: r.get(2)? })
    })?.collect::<Result<Vec<_>, _>>()?;

    Ok(FinanceKpis {
        month_revenue,
        year_revenue,
        open_count,
        open_total,
        overdue_count,
        overdue_total,
        suggestion_count,
        top_clients,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{schema, migrations};

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        schema::create_tables(&conn).unwrap();
        migrations::run(&conn).unwrap();
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, created_at, updated_at)
             VALUES ('acc-1','ws-1','u-1','Test GmbH',?1,?1)",
            [&now],
        ).unwrap();
        conn
    }

    fn sample_payload(items: Vec<UpsertInvoiceItemPayload>) -> UpsertInvoicePayload {
        UpsertInvoicePayload {
            workspace_id: "ws-1".into(),
            created_by: "u-1".into(),
            account_id: "acc-1".into(),
            deal_id: None,
            date: "2026-05-20".into(),
            due_date: "2026-06-03".into(),
            status: None,
            tax_mode: None,
            subtotal: 100.0,
            tax_amount: 19.0,
            total: 119.0,
            bank_info: None,
            notes: None,
            is_suggestion: None,
            suggested_by: None,
            items,
        }
    }

    fn sample_item() -> UpsertInvoiceItemPayload {
        UpsertInvoiceItemPayload {
            id: None,
            title: "Beratung".into(),
            description: None,
            quantity: 1.0,
            unit_price: 100.0,
            tax_rate: 19.0,
            total: 119.0,
            sort_order: 0,
            item_date: None,
            unit: None,
        }
    }

    #[test]
    fn create_returns_invoice_with_items() {
        let conn = setup();
        let result = create(&conn, sample_payload(vec![sample_item()])).unwrap();
        assert_eq!(result.invoice.status, "draft");
        assert_eq!(result.invoice.workspace_id, "ws-1");
        assert_eq!(result.items.len(), 1);
        assert_eq!(result.items[0].title, "Beratung");
    }

    #[test]
    fn get_by_id_returns_invoice() {
        let conn = setup();
        let created = create(&conn, sample_payload(vec![sample_item()])).unwrap();
        let fetched = get_by_id(&conn, &created.invoice.id).unwrap();
        assert_eq!(fetched.invoice.id, created.invoice.id);
        assert_eq!(fetched.items.len(), 1);
    }

    #[test]
    fn get_by_id_not_found() {
        let conn = setup();
        let result = get_by_id(&conn, "nonexistent");
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }

    #[test]
    fn update_changes_total_and_replaces_items() {
        let conn = setup();
        let created = create(&conn, sample_payload(vec![sample_item()])).unwrap();
        let mut updated_payload = sample_payload(vec![
            sample_item(),
            UpsertInvoiceItemPayload {
                id: None,
                title: "Reisekosten".into(),
                description: None,
                quantity: 1.0,
                unit_price: 50.0,
                tax_rate: 19.0,
                total: 59.5,
                sort_order: 1,
                item_date: None,
                unit: None,
            },
        ]);
        updated_payload.total = 200.0;
        let result = update(&conn, &created.invoice.id, updated_payload).unwrap();
        assert_eq!(result.invoice.total, 200.0);
        assert_eq!(result.items.len(), 2);
    }

    #[test]
    fn update_not_found_returns_error() {
        let conn = setup();
        let result = update(&conn, "ghost", sample_payload(vec![]));
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }

    #[test]
    fn create_open_invoice_assigns_number() {
        let conn = setup();
        let mut p = sample_payload(vec![]);
        p.status = Some("open".into());
        let result = create(&conn, p).unwrap();
        assert!(result.invoice.number.is_some(), "open invoice must have a number");
        let n = result.invoice.number.unwrap();
        assert!(n.contains('-'), "number should be YYYY-NNNNN format");
        assert!(n.ends_with("-00001"), "first invoice should end with -00001, got {n}");
    }

    #[test]
    fn create_draft_invoice_has_no_number() {
        let conn = setup();
        // default status is draft
        let result = create(&conn, sample_payload(vec![])).unwrap();
        assert!(result.invoice.number.is_none(), "draft invoice must not have a number yet");
    }

    #[test]
    fn update_draft_to_open_assigns_number() {
        let conn = setup();
        // Create as draft (no number)
        let created = create(&conn, sample_payload(vec![])).unwrap();
        assert!(created.invoice.number.is_none());
        // Publish by updating status to open
        let mut p = sample_payload(vec![]);
        p.status = Some("open".into());
        let result = update(&conn, &created.invoice.id, p).unwrap();
        assert!(result.invoice.number.is_some(), "publishing a draft must assign a number");
        assert_eq!(result.invoice.status, "open");
    }

    #[test]
    fn update_open_invoice_does_not_change_number() {
        let conn = setup();
        let mut p = sample_payload(vec![]);
        p.status = Some("open".into());
        let created = create(&conn, p).unwrap();
        let original_number = created.invoice.number.clone().unwrap();
        // Edit the open invoice — number must stay the same
        let mut p2 = sample_payload(vec![]);
        p2.status = Some("open".into());
        p2.total = 999.0;
        let result = update(&conn, &created.invoice.id, p2).unwrap();
        assert_eq!(result.invoice.number.as_deref(), Some(original_number.as_str()),
            "editing an open invoice must not re-assign the number");
    }

    #[test]
    fn delete_removes_invoice_and_items() {
        let conn = setup();
        let created = create(&conn, sample_payload(vec![sample_item()])).unwrap();
        delete(&conn, &created.invoice.id).unwrap();
        assert!(matches!(get_by_id(&conn, &created.invoice.id), Err(AppError::NotFound(_))));
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM invoice_items WHERE invoice_id = ?1",
            [&created.invoice.id], |r| r.get(0),
        ).unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn delete_not_found_returns_error() {
        let conn = setup();
        assert!(matches!(delete(&conn, "x"), Err(AppError::NotFound(_))));
    }

    #[test]
    fn get_by_workspace_returns_all() {
        let conn = setup();
        create(&conn, sample_payload(vec![])).unwrap();
        create(&conn, sample_payload(vec![])).unwrap();
        let all = get_by_workspace(&conn, "ws-1", None).unwrap();
        assert_eq!(all.len(), 2);
    }

    #[test]
    fn get_by_workspace_filters_by_status() {
        let conn = setup();
        let inv = create(&conn, sample_payload(vec![])).unwrap();
        update_status(&conn, &inv.invoice.id, "open").unwrap();
        create(&conn, sample_payload(vec![])).unwrap(); // stays draft
        let open = get_by_workspace(&conn, "ws-1", Some("open")).unwrap();
        assert_eq!(open.len(), 1);
        assert_eq!(open[0].status, "open");
    }

    #[test]
    fn get_by_workspace_filters_suggestions() {
        let conn = setup();
        let mut p = sample_payload(vec![]);
        p.is_suggestion = Some(true);
        create(&conn, p).unwrap();
        create(&conn, sample_payload(vec![])).unwrap();
        let suggestions = get_by_workspace(&conn, "ws-1", Some("suggestions")).unwrap();
        assert_eq!(suggestions.len(), 1);
        assert!(suggestions[0].is_suggestion);
    }

    #[test]
    fn get_by_account_returns_invoices() {
        let conn = setup();
        create(&conn, sample_payload(vec![])).unwrap();
        let result = get_by_account(&conn, "acc-1").unwrap();
        assert_eq!(result.len(), 1);
    }

    #[test]
    fn update_status_changes_status() {
        let conn = setup();
        let inv = create(&conn, sample_payload(vec![])).unwrap();
        let updated = update_status(&conn, &inv.invoice.id, "open").unwrap();
        assert_eq!(updated.status, "open");
    }

    #[test]
    fn approve_suggestion_assigns_number_and_opens() {
        let conn = setup();
        let mut p = sample_payload(vec![]);
        p.is_suggestion = Some(true);
        let inv = create(&conn, p).unwrap();
        let approved = approve_suggestion(&conn, &inv.invoice.id, "u-1", "ws-1").unwrap();
        assert!(approved.number.is_some());
        assert!(approved.number.as_deref().unwrap().contains('-'));
        assert_eq!(approved.status, "open");
        assert!(!approved.is_suggestion);
    }

    #[test]
    fn approve_suggestion_sequence_increments() {
        let conn = setup();
        for _ in 0..3 {
            let mut p = sample_payload(vec![]);
            p.is_suggestion = Some(true);
            let inv = create(&conn, p).unwrap();
            approve_suggestion(&conn, &inv.invoice.id, "u-1", "ws-1").unwrap();
        }
        let invoices = get_by_workspace(&conn, "ws-1", Some("open")).unwrap();
        let numbers: Vec<_> = invoices.iter().filter_map(|i| i.number.as_deref()).collect();
        assert!(numbers.iter().any(|n| n.ends_with("-00003")));
    }

    #[test]
    fn item_date_and_unit_round_trip() {
        let conn = setup();
        let payload = UpsertInvoicePayload {
            workspace_id: "ws-1".into(),
            created_by: "u-1".into(),
            account_id: "acc-1".into(),
            deal_id: None,
            date: "2026-05-22".into(),
            due_date: "2026-05-29".into(),
            status: None,
            tax_mode: Some("kleinunternehmer".into()),
            subtotal: 120.0,
            tax_amount: 0.0,
            total: 120.0,
            bank_info: None,
            notes: None,
            is_suggestion: None,
            suggested_by: None,
            items: vec![UpsertInvoiceItemPayload {
                id: None,
                title: "Visitenkarten".into(),
                description: None,
                quantity: 1.0,
                unit_price: 120.0,
                tax_rate: 0.0,
                total: 120.0,
                sort_order: 0,
                item_date: Some("2026-05-21".into()),
                unit: Some("Stk.".into()),
            }],
        };
        let result = create(&conn, payload).unwrap();
        assert_eq!(result.items[0].item_date.as_deref(), Some("2026-05-21"));
        assert_eq!(result.items[0].unit.as_deref(), Some("Stk."));
        // round-trip via get_by_id
        let fetched = get_by_id(&conn, &result.invoice.id).unwrap();
        assert_eq!(fetched.items[0].item_date.as_deref(), Some("2026-05-21"));
        assert_eq!(fetched.items[0].unit.as_deref(), Some("Stk."));
    }

    #[test]
    fn get_finance_kpis_returns_correct_counts() {
        let conn = setup();
        // paid invoice
        let inv1 = create(&conn, sample_payload(vec![])).unwrap();
        update_status(&conn, &inv1.invoice.id, "paid").unwrap();
        // open invoice
        let inv2 = create(&conn, sample_payload(vec![])).unwrap();
        update_status(&conn, &inv2.invoice.id, "open").unwrap();
        // suggestion
        let mut p = sample_payload(vec![]);
        p.is_suggestion = Some(true);
        create(&conn, p).unwrap();

        let kpis = get_finance_kpis(&conn, "ws-1").unwrap();
        assert_eq!(kpis.open_count, 1);
        assert_eq!(kpis.suggestion_count, 1);
        assert_eq!(kpis.month_revenue, 119.0);
    }
}
