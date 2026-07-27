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
    pub project_id: Option<String>,
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
    pub project_id: Option<String>,
    pub number: Option<String>,
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
        project_id:   r.get(22)?,
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
     is_suggestion, suggested_by, approved_by, pending_sync, created_at, updated_at, project_id";

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

const DEFAULT_INVOICE_FORMAT: &str = "{YYYY}-{NNNNN}";

/// Wendet eine Nummern-Vorlage an: {YYYY}=Jahr, {YY}=2-stellig, {MM}=Monat,
/// {N…N}=Zähler (Stellen = Anzahl N). Beispiel "{YY}-{NNNN}", n=1 → "26-0001".
fn apply_invoice_format(fmt: &str, now: &chrono::DateTime<chrono::Local>, n: i64) -> String {
    let mut s = fmt
        .replace("{YYYY}", &now.format("%Y").to_string())
        .replace("{YY}", &now.format("%y").to_string())
        .replace("{MM}", &now.format("%m").to_string());
    loop {
        let Some(start) = s.find("{N") else { break };
        let Some(rel_end) = s[start..].find('}') else { break };
        let token = &s[start + 1..start + rel_end];
        if token.is_empty() || !token.chars().all(|c| c == 'N') { break; }
        let width = token.len();
        s.replace_range(start..start + rel_end + 1, &format!("{n:0width$}"));
    }
    s
}

/// (zuletzt vergebene Nummer, Startnummer, Format, Jahr der laufenden Sequenz)
fn read_sequence(conn: &Connection, workspace_id: &str) -> (i64, i64, String, i64) {
    conn.query_row(
        "SELECT next_number, COALESCE(start_number, 1), \
                COALESCE(NULLIF(format, ''), '{YYYY}-{NNNNN}'), COALESCE(seq_year, 0) \
         FROM invoice_sequences WHERE workspace_id = ?1",
        [workspace_id],
        |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?, r.get::<_, String>(2)?, r.get::<_, i64>(3)?)),
    ).unwrap_or((0, 1, DEFAULT_INVOICE_FORMAT.to_string(), 0))
}

/// Nächste zu vergebende Zählernummer (mit Jahres-Reset, nur bei Jahres-Token im Format).
fn compute_next_counter(last: i64, start: i64, format: &str, seq_year: i64, cur_year: i64) -> i64 {
    let has_year_token = format.contains("{YYYY}") || format.contains("{YY}");
    if seq_year != 0 && seq_year != cur_year && has_year_token {
        start
    } else {
        last + 1
    }
}

fn next_invoice_number(conn: &Connection, workspace_id: &str) -> Result<String, AppError> {
    let now = chrono::Local::now();
    let cur_year: i64 = now.format("%Y").to_string().parse().unwrap_or(0);
    let (last, start, format, seq_year) = read_sequence(conn, workspace_id);
    let mut to_use = compute_next_counter(last, start, &format, seq_year, cur_year);
    // Skip numbers already assigned (e.g. cloud-mirrored invoices that share the local DB).
    // Only auto-allocation skips; manual entry is validated separately and still errors.
    loop {
        let candidate = apply_invoice_format(&format, &now, to_use);
        if !invoice_number_exists(conn, workspace_id, &candidate, None)? {
            break;
        }
        to_use += 1;
    }
    let number = apply_invoice_format(&format, &now, to_use);
    conn.execute(
        "INSERT INTO invoice_sequences (workspace_id, next_number, start_number, format, seq_year) \
         VALUES (?1, ?2, ?3, ?4, ?5) \
         ON CONFLICT(workspace_id) DO UPDATE SET next_number = ?2, seq_year = ?5",
        rusqlite::params![workspace_id, to_use, start, format, cur_year],
    )?;
    Ok(number)
}

/// Liest die nächste Nummer, ohne den Zähler zu erhöhen (Formular-Vorschlag).
/// Überspringt bereits vergebene Nummern genau wie next_invoice_number, aber ohne den Zähler zu persistieren.
pub fn peek_invoice_number(conn: &Connection, workspace_id: &str) -> String {
    let now = chrono::Local::now();
    let cur_year: i64 = now.format("%Y").to_string().parse().unwrap_or(0);
    let (last, start, format, seq_year) = read_sequence(conn, workspace_id);
    let mut to_use = compute_next_counter(last, start, &format, seq_year, cur_year);
    // Skip numbers already assigned — same logic as next_invoice_number.
    loop {
        let candidate = apply_invoice_format(&format, &now, to_use);
        if !invoice_number_exists(conn, workspace_id, &candidate, None).unwrap_or(false) {
            break;
        }
        to_use += 1;
    }
    apply_invoice_format(&format, &now, to_use)
}

/// (zuletzt vergebene Nummer, Startnummer, Format)
pub fn get_invoice_sequence(conn: &Connection, workspace_id: &str) -> rusqlite::Result<(i64, i64, String)> {
    let (last, start, format, _yr) = read_sequence(conn, workspace_id);
    Ok((last, start, format))
}

pub fn set_invoice_format(conn: &Connection, workspace_id: &str, format: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO invoice_sequences (workspace_id, next_number, start_number, format) \
         VALUES (?1, 0, 1, ?2) \
         ON CONFLICT(workspace_id) DO UPDATE SET format = ?2",
        rusqlite::params![workspace_id, format],
    )?;
    Ok(())
}

pub fn invoice_number_exists(
    conn: &Connection, workspace_id: &str, number: &str, exclude_id: Option<&str>,
) -> rusqlite::Result<bool> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM invoices WHERE workspace_id = ?1 AND number = ?2 AND id != COALESCE(?3, '')",
        rusqlite::params![workspace_id, number, exclude_id],
        |r| r.get(0),
    )?;
    Ok(count > 0)
}

pub fn set_invoice_start_number(conn: &Connection, workspace_id: &str, start: i64) -> rusqlite::Result<()> {
    // Absenken ist erlaubt: Die Vergabe (next_invoice_number/peek) überspringt
    // bereits vergebene Nummern, Duplikate sind damit ausgeschlossen. So lassen
    // sich nach dem Löschen von Test-Rechnungen freigewordene Nummern wiederverwenden.
    conn.execute(
        "INSERT INTO invoice_sequences (workspace_id, next_number, start_number) VALUES (?1, ?2, ?3)
         ON CONFLICT(workspace_id) DO UPDATE SET start_number = ?3, next_number = ?2",
        rusqlite::params![workspace_id, start - 1, start],
    )?;
    Ok(())
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
         VALUES (?1,?2,?3,?4,?5,NULL,?6,?7,?8,?9,?10,?11,?12,?13,?14,NULL,?15,?16,NULL,1,?17,?17,?18)"),
        rusqlite::params![
            id, payload.workspace_id, payload.created_by, payload.account_id, payload.deal_id,
            payload.date, payload.due_date, status, tax_mode,
            payload.subtotal, payload.tax_amount, payload.total, bank_info, payload.notes,
            is_suggestion as i32, payload.suggested_by, now, payload.project_id,
        ],
    )?;
    // Assign invoice number immediately when creating a published (non-draft) invoice
    if !is_suggestion && status == "open" {
        let number = match payload.number.as_deref().filter(|s| !s.trim().is_empty()) {
            Some(n) => {
                if invoice_number_exists(conn, &payload.workspace_id, n, None).unwrap_or(false) {
                    return Err(AppError::Validation(format!("Rechnungsnummer {n} ist bereits vergeben.")));
                }
                n.to_string()
            }
            None => next_invoice_number(conn, &payload.workspace_id)?,
        };
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
            let number = match payload.number.as_deref().filter(|s| !s.trim().is_empty()) {
                Some(n) => {
                    if invoice_number_exists(conn, &payload.workspace_id, n, Some(id)).unwrap_or(false) {
                        return Err(AppError::Validation(format!("Rechnungsnummer {n} ist bereits vergeben.")));
                    }
                    n.to_string()
                }
                None => next_invoice_number(conn, &payload.workspace_id)?,
            };
            conn.execute(
                "UPDATE invoices SET number=?1 WHERE id=?2",
                rusqlite::params![number, id],
            )?;
        }
    }

    let n = conn.execute(
        "UPDATE invoices SET account_id=?1, deal_id=?2, date=?3, due_date=?4,
         tax_mode=?5, subtotal=?6, tax_amount=?7, total=?8, bank_info=?9,
         notes=?10, status=?11, pending_sync=1, updated_at=?12, project_id=?13 WHERE id=?14",
        rusqlite::params![
            payload.account_id, payload.deal_id, payload.date, payload.due_date,
            payload.tax_mode.unwrap_or_else(|| "standard".into()),
            payload.subtotal, payload.tax_amount, payload.total, bank_info,
            payload.notes, new_status, now, payload.project_id, id,
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

pub fn get_by_project(conn: &Connection, project_id: &str) -> Result<Vec<Invoice>, AppError> {
    let mut stmt = conn.prepare(
        &format!("SELECT {INVOICE_COLS} FROM invoices WHERE project_id=?1 ORDER BY created_at DESC")
    )?;
    let rows = stmt.query_map([project_id], map_invoice)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// Setzt/entfernt die Projekt-Zuordnung einer bestehenden Rechnung. `None`
/// entfernt die Zuordnung (Rechnung bleibt gueltig, wie zuvor die Migration
/// es fuer alle Bestandsrechnungen tut). `Some(id)` erfordert ein existierendes
/// Projekt -- sonst AppError::NotFound (kein stiller Fehlgriff auf eine
/// nicht-existente Projekt-ID).
pub fn set_project(conn: &Connection, id: &str, project_id: Option<String>) -> Result<Invoice, AppError> {
    if let Some(ref pid) = project_id {
        let exists: i64 = conn.query_row(
            "SELECT COUNT(*) FROM projects WHERE id = ?1", [pid], |r| r.get(0),
        )?;
        if exists == 0 {
            return Err(AppError::NotFound(format!("Project {pid} not found")));
        }
    }
    let n = conn.execute(
        "UPDATE invoices SET project_id = ?1 WHERE id = ?2",
        rusqlite::params![project_id, id],
    )?;
    if n == 0 {
        return Err(AppError::NotFound(format!("Invoice {id} not found")));
    }
    conn.query_row(
        &format!("SELECT {INVOICE_COLS} FROM invoices WHERE id = ?1"),
        [id], map_invoice,
    ).map_err(AppError::from)
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

    // "Offen" = unbezahlt & noch nicht fällig; "Überfällig" = unbezahlt & über
    // Fälligkeit. Überfälligkeit wird aus due_date abgeleitet (Status wird nie auf
    // 'overdue' gesetzt). date('now','localtime') statt UTC, damit CET-Rechnungen
    // nicht einen Tag zu früh kippen.
    // Die Summen sind RESTBETRÄGE (total minus bereits erfasste Teilzahlungen),
    // damit Cockpit (clientseitig) und KPI-Karten denselben offenen Betrag zeigen.
    let (open_count, open_total): (i64, f64) = conn.query_row(
        "SELECT COUNT(*), COALESCE(SUM(i.total - COALESCE(
                    (SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.id), 0)), 0)
         FROM invoices i
         WHERE i.workspace_id=?1 AND i.status IN ('open','overdue') AND i.is_suggestion=0
           AND i.due_date >= date('now','localtime')",
        [workspace_id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;

    let (overdue_count, overdue_total): (i64, f64) = conn.query_row(
        "SELECT COUNT(*), COALESCE(SUM(i.total - COALESCE(
                    (SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.id), 0)), 0)
         FROM invoices i
         WHERE i.workspace_id=?1 AND i.status IN ('open','overdue') AND i.is_suggestion=0
           AND i.due_date < date('now','localtime')",
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

    #[test]
    fn start_number_can_be_lowered_to_reuse_freed_numbers() {
        let conn = setup();
        // Zähler steht hoch (als hätte es Rechnungen bis 9 gegeben) …
        set_invoice_start_number(&conn, "ws-1", 9).unwrap();
        // … die Rechnungen wurden gelöscht → Absenken auf 7 muss greifen.
        set_invoice_start_number(&conn, "ws-1", 7).unwrap();
        let peeked = peek_invoice_number(&conn, "ws-1");
        assert!(peeked.ends_with("00007"), "erwartet …00007, bekam {peeked}");
    }

    #[test]
    fn lowered_start_still_skips_existing_numbers() {
        let conn = setup();
        let now = chrono::Utc::now().to_rfc3339();
        // 00007 existiert noch → Absenken auf 7 darf KEIN Duplikat vorschlagen.
        conn.execute(
            "INSERT INTO invoices (id, workspace_id, created_by, account_id, number, date, due_date, status, tax_mode, subtotal, tax_amount, total, bank_info, created_at, updated_at)
             VALUES ('inv-7','ws-1','u-1','acc-1','2026-00007','2026-07-01','2026-07-15','open','standard',100,19,119,'{}',?1,?1)",
            [&now],
        ).unwrap();
        set_invoice_start_number(&conn, "ws-1", 7).unwrap();
        let peeked = peek_invoice_number(&conn, "ws-1");
        assert!(peeked.ends_with("00008"), "erwartet Überspringen auf …00008, bekam {peeked}");
    }

    #[test]
    fn apply_invoice_format_tokens() {
        use chrono::TimeZone;
        let d = chrono::Local.with_ymd_and_hms(2026, 6, 15, 0, 0, 0).unwrap();
        assert_eq!(apply_invoice_format("{YY}-{NNNN}", &d, 1), "26-0001");
        assert_eq!(apply_invoice_format("{YYYY}-{NNNNN}", &d, 42), "2026-00042");
        assert_eq!(apply_invoice_format("RE-{YY}{MM}-{NNN}", &d, 7), "RE-2606-007");
    }

    #[test]
    fn compute_next_counter_logic() {
        assert_eq!(compute_next_counter(5, 1, "{YYYY}-{NNNNN}", 2026, 2026), 6); // gleiches Jahr → weiter
        assert_eq!(compute_next_counter(5, 1, "{YYYY}-{NNNNN}", 2026, 2027), 1); // Jahreswechsel + Token → Reset
        assert_eq!(compute_next_counter(5, 1, "RE-{NNNNN}", 2026, 2027), 6);     // ohne Jahres-Token → weiter
        assert_eq!(compute_next_counter(5, 1, "{YYYY}-{NNNNN}", 0, 2026), 6);    // Legacy (seq_year 0) → weiter
        assert_eq!(compute_next_counter(0, 1, "{YYYY}-{NNNNN}", 0, 2026), 1);    // frisch → Start
    }

    #[test]
    fn custom_format_peek_and_increment() {
        let conn = setup();
        set_invoice_format(&conn, "ws-1", "{YY}-{NNNN}").unwrap();
        let yy = chrono::Local::now().format("%y").to_string();
        // peek erhöht den Zähler nicht
        assert_eq!(peek_invoice_number(&conn, "ws-1"), format!("{yy}-0001"));
        assert_eq!(peek_invoice_number(&conn, "ws-1"), format!("{yy}-0001"));
        // vergeben erhöht
        assert_eq!(next_invoice_number(&conn, "ws-1").unwrap(), format!("{yy}-0001"));
        assert_eq!(next_invoice_number(&conn, "ws-1").unwrap(), format!("{yy}-0002"));
        // peek zeigt jetzt die nächste
        assert_eq!(peek_invoice_number(&conn, "ws-1"), format!("{yy}-0003"));
    }

    #[test]
    fn invoice_number_exists_detects_duplicate() {
        let conn = setup();
        let mut p = sample_payload(vec![]);
        p.status = Some("open".into());
        p.number = Some("RE-2026-001".into());
        create(&conn, p).unwrap();
        assert!(invoice_number_exists(&conn, "ws-1", "RE-2026-001", None).unwrap());
        assert!(!invoice_number_exists(&conn, "ws-1", "RE-2026-999", None).unwrap());
    }

    #[test]
    fn create_stores_project_id_when_provided() {
        let conn = setup();
        conn.execute(
            "INSERT INTO projects (id, workspace_id, account_id, title, status, created_at, updated_at,
             retainer_monthly, retainer_hours, retainer_months)
             VALUES ('p1','ws-1','acc-1','Test-Projekt','active','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z',0,0,NULL)",
            [],
        ).unwrap();
        let mut p = sample_payload(vec![]);
        p.project_id = Some("p1".into());
        let result = create(&conn, p).unwrap();
        assert_eq!(result.invoice.project_id, Some("p1".to_string()));
    }

    #[test]
    fn get_by_project_filters_correctly() {
        let conn = setup();
        conn.execute(
            "INSERT INTO projects (id, workspace_id, account_id, title, status, created_at, updated_at,
             retainer_monthly, retainer_hours, retainer_months)
             VALUES ('p1','ws-1','acc-1','Test-Projekt','active','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z',0,0,NULL)",
            [],
        ).unwrap();
        let mut with_project = sample_payload(vec![]);
        with_project.project_id = Some("p1".into());
        create(&conn, with_project).unwrap();
        create(&conn, sample_payload(vec![])).unwrap(); // ohne Projekt
        let results = get_by_project(&conn, "p1").unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].project_id, Some("p1".to_string()));
    }

    #[test]
    fn set_project_assigns_and_removes() {
        let conn = setup();
        conn.execute(
            "INSERT INTO projects (id, workspace_id, account_id, title, status, created_at, updated_at,
             retainer_monthly, retainer_hours, retainer_months)
             VALUES ('p1','ws-1','acc-1','Test-Projekt','active','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z',0,0,NULL)",
            [],
        ).unwrap();
        let created = create(&conn, sample_payload(vec![])).unwrap();
        let assigned = set_project(&conn, &created.invoice.id, Some("p1".into())).unwrap();
        assert_eq!(assigned.project_id, Some("p1".to_string()));
        let removed = set_project(&conn, &created.invoice.id, None).unwrap();
        assert_eq!(removed.project_id, None);
    }

    #[test]
    fn set_project_rejects_unknown_project() {
        let conn = setup();
        let created = create(&conn, sample_payload(vec![])).unwrap();
        let result = set_project(&conn, &created.invoice.id, Some("missing-project".into()));
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }

    #[test]
    fn set_project_rejects_unknown_invoice() {
        let conn = setup();
        let result = set_project(&conn, "missing-invoice", None);
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }

    fn sample_payload(items: Vec<UpsertInvoiceItemPayload>) -> UpsertInvoicePayload {
        UpsertInvoicePayload {
            workspace_id: "ws-1".into(),
            created_by: "u-1".into(),
            account_id: "acc-1".into(),
            deal_id: None,
            project_id: None,
            date: "2026-06-11".into(),
            due_date: "2026-06-25".into(),
            status: None,
            tax_mode: None,
            subtotal: 100.0,
            tax_amount: 19.0,
            total: 119.0,
            bank_info: None,
            notes: None,
            is_suggestion: None,
            suggested_by: None,
            number: None,
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
            project_id: None,
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
            number: None,
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
        let today = chrono::Utc::now();
        // paid invoice — Datum in DIESEM Monat (month_revenue), robust gegen Datums-Drift
        let mut p1 = sample_payload(vec![]);
        p1.date = today.format("%Y-%m-05").to_string();
        let inv1 = create(&conn, p1).unwrap();
        update_status(&conn, &inv1.invoice.id, "paid").unwrap();
        // open invoice — Fälligkeit in der Zukunft (zählt als offen)
        let mut p2 = sample_payload(vec![]);
        p2.due_date = (today + chrono::Duration::days(20)).format("%Y-%m-%d").to_string();
        let inv2 = create(&conn, p2).unwrap();
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

    #[test]
    fn get_finance_kpis_open_total_subtracts_partial_payments() {
        let conn = setup();
        // Offene Rechnung über 119,00 — Fälligkeit in der Zukunft (robust gegen Datums-Drift)
        let mut p = sample_payload(vec![]);
        p.due_date = (chrono::Utc::now() + chrono::Duration::days(20)).format("%Y-%m-%d").to_string();
        let inv = create(&conn, p).unwrap();
        update_status(&conn, &inv.invoice.id, "open").unwrap();

        // Teilzahlung über 19,00 → Restbetrag 100,00
        conn.execute(
            "INSERT INTO payments (id, workspace_id, invoice_id, amount, paid_at, created_at)
             VALUES ('pay-1', 'ws-1', ?1, 19.0, '2026-06-15', '2026-06-15')",
            [&inv.invoice.id],
        ).unwrap();

        let kpis = get_finance_kpis(&conn, "ws-1").unwrap();
        assert_eq!(kpis.open_count, 1);          // Rechnung zählt weiterhin als offen
        assert_eq!(kpis.open_total, 100.0);      // aber nur der Restbetrag
    }

    // ── Nummernkreis-Skip-Tests (Bug: Vergabe blockierte statt zu überspringen) ──

    fn seed_taken_invoice(conn: &Connection, number: &str) {
        let ts = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO invoices \
             (id, workspace_id, created_by, account_id, deal_id, number, date, due_date, \
              status, tax_mode, subtotal, tax_amount, total, bank_info, notes, pdf_path, \
              is_suggestion, suggested_by, approved_by, pending_sync, created_at, updated_at) \
             VALUES ('inv-taken','ws-1','u-1','acc-1',NULL,?1,'2026-01-01','2026-01-31', \
                     'open','standard',100,19,119,'{}',NULL,NULL,0,NULL,NULL,0,?2,?2)",
            rusqlite::params![number, ts],
        ).unwrap();
    }

    fn seed_sequence(conn: &Connection, next_number: i64) {
        let cur_year: i64 = chrono::Local::now().format("%Y").to_string().parse().unwrap();
        conn.execute(
            "INSERT INTO invoice_sequences (workspace_id, next_number, start_number, format, seq_year) \
             VALUES ('ws-1', ?1, 1, '{YYYY}-{NNNNN}', ?2) \
             ON CONFLICT(workspace_id) DO UPDATE SET next_number=?1, seq_year=?2",
            rusqlite::params![next_number, cur_year],
        ).unwrap();
    }

    /// (1) Zähler bei 7, Rechnung 2026-00007 bereits vorhanden →
    ///     Vergabe liefert 2026-00008, Zähler ≥ 8.
    #[test]
    fn auto_allocate_skips_taken_number() {
        let conn = setup();
        let now = chrono::Local::now();
        let taken = apply_invoice_format("{YYYY}-{NNNNN}", &now, 7);
        seed_sequence(&conn, 7);
        seed_taken_invoice(&conn, &taken);

        let allocated = next_invoice_number(&conn, "ws-1").unwrap();
        let expected = apply_invoice_format("{YYYY}-{NNNNN}", &now, 8);
        assert_eq!(allocated, expected, "allocator must skip to 8 when 7 is taken");

        let (counter, _, _) = get_invoice_sequence(&conn, "ws-1").unwrap();
        assert!(counter >= 8, "sequence counter must be persisted ≥ 8, got {counter}");
    }

    /// (2) Manuell eingegebene Duplikatnummer muss weiterhin den deutschen Fehlertext liefern.
    #[test]
    fn manual_duplicate_still_errors_with_german_message() {
        let conn = setup();
        let mut p1 = sample_payload(vec![]);
        p1.status = Some("open".into());
        p1.number = Some("RE-2026-001".into());
        create(&conn, p1).unwrap();

        let mut p2 = sample_payload(vec![]);
        p2.status = Some("open".into());
        p2.number = Some("RE-2026-001".into());
        let err = create(&conn, p2).expect_err("duplicate manual number must error");
        match err {
            AppError::Validation(msg) => assert!(
                msg.contains("bereits vergeben"),
                "error must contain 'bereits vergeben', got: {msg}"
            ),
            other => panic!("expected Validation error, got: {other:?}"),
        }
    }

    /// (3) peek zeigt die übersprungene Nummer, ohne den Zähler zu konsumieren.
    #[test]
    fn peek_skips_taken_number_without_consuming_counter() {
        let conn = setup();
        let now = chrono::Local::now();
        let taken = apply_invoice_format("{YYYY}-{NNNNN}", &now, 7);
        seed_sequence(&conn, 7);
        seed_taken_invoice(&conn, &taken);

        let peeked = peek_invoice_number(&conn, "ws-1");
        let expected = apply_invoice_format("{YYYY}-{NNNNN}", &now, 8);
        assert_eq!(peeked, expected, "peek must return first free number (8)");

        // Counter must not have advanced
        let (counter, _, _) = get_invoice_sequence(&conn, "ws-1").unwrap();
        assert_eq!(counter, 7, "peek must not advance the persisted counter");
    }
}
