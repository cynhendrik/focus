use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::AppError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Offer {
    pub id: String,
    pub workspace_id: String,
    pub created_by: String,
    pub account_id: String,
    pub number: Option<String>,
    pub title: String,
    pub status: String,
    pub valid_until: String,
    pub tax_mode: String,
    pub subtotal: f64,
    pub tax_amount: f64,
    pub total: f64,
    pub notes: Option<String>,
    pub pdf_path: Option<String>,
    pub converted_invoice_id: Option<String>,
    pub pending_sync: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OfferItem {
    pub id: String,
    pub offer_id: String,
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
pub struct OfferWithItems {
    pub offer: Offer,
    pub items: Vec<OfferItem>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertOfferPayload {
    pub id: Option<String>,
    pub workspace_id: String,
    pub created_by: String,
    pub account_id: String,
    pub title: String,
    pub status: Option<String>,
    pub valid_until: String,
    pub tax_mode: Option<String>,
    pub subtotal: f64,
    pub tax_amount: f64,
    pub total: f64,
    pub notes: Option<String>,
    pub items: Vec<UpsertOfferItemPayload>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertOfferItemPayload {
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

fn map_offer(r: &rusqlite::Row<'_>) -> rusqlite::Result<Offer> {
    Ok(Offer {
        id:                   r.get(0)?,
        workspace_id:         r.get(1)?,
        created_by:           r.get(2)?,
        account_id:           r.get(3)?,
        number:               r.get(4)?,
        title:                r.get(5)?,
        status:               r.get(6)?,
        valid_until:          r.get(7)?,
        tax_mode:             r.get(8)?,
        subtotal:             r.get(9)?,
        tax_amount:           r.get(10)?,
        total:                r.get(11)?,
        notes:                r.get(12)?,
        pdf_path:             r.get(13)?,
        converted_invoice_id: r.get(14)?,
        pending_sync:         r.get::<_, i32>(15)? != 0,
        created_at:           r.get(16)?,
        updated_at:           r.get(17)?,
    })
}

fn map_item(r: &rusqlite::Row<'_>) -> rusqlite::Result<OfferItem> {
    Ok(OfferItem {
        id:          r.get(0)?,
        offer_id:    r.get(1)?,
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

const OFFER_COLS: &str =
    "id, workspace_id, created_by, account_id, number, title, status, valid_until, \
     tax_mode, subtotal, tax_amount, total, notes, pdf_path, converted_invoice_id, \
     pending_sync, created_at, updated_at";

fn fetch_items(conn: &Connection, offer_id: &str) -> Result<Vec<OfferItem>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, offer_id, title, description, quantity, unit_price, tax_rate, total, sort_order, item_date, unit
         FROM offer_items WHERE offer_id = ?1 ORDER BY sort_order"
    )?;
    let rows = stmt.query_map([offer_id], map_item)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

fn replace_items(conn: &Connection, offer_id: &str, items: &[UpsertOfferItemPayload]) -> Result<(), AppError> {
    conn.execute("DELETE FROM offer_items WHERE offer_id = ?1", [offer_id])?;
    for item in items {
        let id = item.id.clone().unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        conn.execute(
            "INSERT INTO offer_items (id, offer_id, title, description, quantity, unit_price, tax_rate, total, sort_order, item_date, unit)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
            rusqlite::params![
                id, offer_id, item.title, item.description,
                item.quantity, item.unit_price, item.tax_rate, item.total, item.sort_order,
                item.item_date, item.unit,
            ],
        )?;
    }
    Ok(())
}

fn next_offer_number(conn: &Connection, workspace_id: &str) -> Result<String, AppError> {
    conn.execute(
        "INSERT INTO offer_sequences (workspace_id, next_number) VALUES (?1, 1)
         ON CONFLICT(workspace_id) DO UPDATE SET next_number = next_number + 1",
        [workspace_id],
    )?;
    let n: i64 = conn.query_row(
        "SELECT next_number FROM offer_sequences WHERE workspace_id = ?1",
        [workspace_id],
        |r| r.get(0),
    )?;
    let year = chrono::Utc::now().format("%Y");
    Ok(format!("ANG-{year}-{n:03}"))
}

pub fn create(conn: &Connection, payload: UpsertOfferPayload) -> Result<OfferWithItems, AppError> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let status = payload.status.unwrap_or_else(|| "draft".into());
    let tax_mode = payload.tax_mode.unwrap_or_else(|| "standard".into());
    let number = next_offer_number(conn, &payload.workspace_id)?;
    conn.execute(
        &format!("INSERT INTO offers ({OFFER_COLS})
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,NULL,NULL,1,?14,?14)"),
        rusqlite::params![
            id, payload.workspace_id, payload.created_by, payload.account_id,
            number, payload.title, status, payload.valid_until, tax_mode,
            payload.subtotal, payload.tax_amount, payload.total, payload.notes, now,
        ],
    )?;
    replace_items(conn, &id, &payload.items)?;
    let offer = conn.query_row(
        &format!("SELECT {OFFER_COLS} FROM offers WHERE id = ?1"),
        [&id], map_offer,
    )?;
    let items = fetch_items(conn, &id)?;
    Ok(OfferWithItems { offer, items })
}

pub fn update(conn: &Connection, id: &str, payload: UpsertOfferPayload) -> Result<OfferWithItems, AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    let n = conn.execute(
        "UPDATE offers SET account_id=?1, title=?2, valid_until=?3,
         tax_mode=?4, subtotal=?5, tax_amount=?6, total=?7,
         notes=?8, pending_sync=1, updated_at=?9 WHERE id=?10",
        rusqlite::params![
            payload.account_id, payload.title, payload.valid_until,
            payload.tax_mode.unwrap_or_else(|| "standard".into()),
            payload.subtotal, payload.tax_amount, payload.total,
            payload.notes, now, id,
        ],
    )?;
    if n == 0 { return Err(AppError::NotFound(format!("Offer {id} not found"))); }
    replace_items(conn, id, &payload.items)?;
    let offer = conn.query_row(
        &format!("SELECT {OFFER_COLS} FROM offers WHERE id = ?1"),
        [id], map_offer,
    )?;
    let items = fetch_items(conn, id)?;
    Ok(OfferWithItems { offer, items })
}

pub fn get_by_id(conn: &Connection, id: &str) -> Result<OfferWithItems, AppError> {
    let offer = conn.query_row(
        &format!("SELECT {OFFER_COLS} FROM offers WHERE id = ?1"),
        [id], map_offer,
    ).map_err(|_| AppError::NotFound(format!("Offer {id} not found")))?;
    let items = fetch_items(conn, id)?;
    Ok(OfferWithItems { offer, items })
}

pub fn get_by_workspace(conn: &Connection, workspace_id: &str) -> Result<Vec<Offer>, AppError> {
    let mut stmt = conn.prepare(
        &format!("SELECT {OFFER_COLS} FROM offers WHERE workspace_id=?1 ORDER BY created_at DESC")
    )?;
    let rows = stmt.query_map([workspace_id], map_offer)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn get_by_account(conn: &Connection, account_id: &str) -> Result<Vec<Offer>, AppError> {
    let mut stmt = conn.prepare(
        &format!("SELECT {OFFER_COLS} FROM offers WHERE account_id=?1 ORDER BY created_at DESC")
    )?;
    let rows = stmt.query_map([account_id], map_offer)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn update_status(conn: &Connection, id: &str, status: &str) -> Result<Offer, AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    let n = conn.execute(
        "UPDATE offers SET status=?1, pending_sync=1, updated_at=?2 WHERE id=?3",
        rusqlite::params![status, now, id],
    )?;
    if n == 0 { return Err(AppError::NotFound(format!("Offer {id} not found"))); }
    conn.query_row(
        &format!("SELECT {OFFER_COLS} FROM offers WHERE id = ?1"),
        [id], map_offer,
    ).map_err(AppError::from)
}

pub fn delete(conn: &Connection, id: &str) -> Result<(), AppError> {
    let n = conn.execute("DELETE FROM offers WHERE id = ?1", [id])?;
    if n == 0 { return Err(AppError::NotFound(format!("Offer {id} not found"))); }
    Ok(())
}

pub fn convert_to_invoice(
    conn: &Connection,
    offer_id: &str,
    workspace_id: &str,
    created_by: &str,
) -> Result<crate::db::invoice::InvoiceWithItems, AppError> {
    let OfferWithItems { offer, items } = get_by_id(conn, offer_id)?;

    let invoice_items: Vec<crate::db::invoice::UpsertInvoiceItemPayload> = items
        .iter()
        .map(|i| crate::db::invoice::UpsertInvoiceItemPayload {
            id: None,
            title: i.title.clone(),
            description: i.description.clone(),
            quantity: i.quantity,
            unit_price: i.unit_price,
            tax_rate: i.tax_rate,
            total: i.total,
            sort_order: i.sort_order,
            item_date: None,
            unit: None,
        })
        .collect();

    let invoice_payload = crate::db::invoice::UpsertInvoicePayload {
        id: None,
        workspace_id: workspace_id.to_string(),
        created_by: created_by.to_string(),
        account_id: offer.account_id.clone(),
        deal_id: None,
        date: chrono::Utc::now().format("%Y-%m-%d").to_string(),
        due_date: (chrono::Utc::now() + chrono::Duration::days(14))
            .format("%Y-%m-%d")
            .to_string(),
        status: Some("draft".into()),
        tax_mode: Some(offer.tax_mode.clone()),
        subtotal: offer.subtotal,
        tax_amount: offer.tax_amount,
        total: offer.total,
        bank_info: None,
        notes: offer.notes.clone(),
        is_suggestion: Some(false),
        suggested_by: None,
        items: invoice_items,
    };

    let result = crate::db::invoice::create(conn, invoice_payload)?;

    // Mark offer as accepted and link to the new invoice
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE offers SET status='accepted', converted_invoice_id=?1, pending_sync=1, updated_at=?2
         WHERE id=?3",
        rusqlite::params![result.invoice.id, now, offer_id],
    )?;

    Ok(result)
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

    fn sample_payload(items: Vec<UpsertOfferItemPayload>) -> UpsertOfferPayload {
        UpsertOfferPayload {
            id: None,
            workspace_id: "ws-1".into(),
            created_by: "u-1".into(),
            account_id: "acc-1".into(),
            title: "Angebot Webauftritt".into(),
            status: None,
            valid_until: "2026-06-20".into(),
            tax_mode: None,
            subtotal: 2000.0,
            tax_amount: 380.0,
            total: 2380.0,
            notes: None,
            items,
        }
    }

    fn sample_item() -> UpsertOfferItemPayload {
        UpsertOfferItemPayload {
            id: None,
            title: "Webdesign".into(),
            description: None,
            quantity: 1.0,
            unit_price: 2000.0,
            tax_rate: 19.0,
            total: 2380.0,
            sort_order: 0,
            item_date: None,
            unit: None,
        }
    }

    #[test]
    fn create_assigns_number_and_returns_offer() {
        let conn = setup();
        let result = create(&conn, sample_payload(vec![sample_item()])).unwrap();
        assert!(result.offer.number.as_deref().unwrap().starts_with("ANG-"));
        assert_eq!(result.offer.status, "draft");
        assert_eq!(result.items.len(), 1);
    }

    #[test]
    fn create_increments_offer_sequence() {
        let conn = setup();
        let o1 = create(&conn, sample_payload(vec![])).unwrap();
        let o2 = create(&conn, sample_payload(vec![])).unwrap();
        let n1 = o1.offer.number.unwrap();
        let n2 = o2.offer.number.unwrap();
        assert!(n1.ends_with("-001"), "erwartet -001, bekam {n1}");
        assert!(n2.ends_with("-002"), "erwartet -002, bekam {n2}");
    }

    #[test]
    fn get_by_id_returns_offer_with_items() {
        let conn = setup();
        let created = create(&conn, sample_payload(vec![sample_item()])).unwrap();
        let fetched = get_by_id(&conn, &created.offer.id).unwrap();
        assert_eq!(fetched.offer.id, created.offer.id);
        assert_eq!(fetched.items.len(), 1);
    }

    #[test]
    fn get_by_id_not_found() {
        let conn = setup();
        assert!(matches!(get_by_id(&conn, "x"), Err(AppError::NotFound(_))));
    }

    #[test]
    fn update_changes_title_and_replaces_items() {
        let conn = setup();
        let created = create(&conn, sample_payload(vec![sample_item()])).unwrap();
        let mut p = sample_payload(vec![sample_item(), UpsertOfferItemPayload {
            id: None,
            title: "Hosting".into(),
            description: None,
            quantity: 12.0,
            unit_price: 10.0,
            tax_rate: 19.0,
            total: 142.8,
            sort_order: 1,
            item_date: None,
            unit: None,
        }]);
        p.title = "Angebot Updated".into();
        let updated = update(&conn, &created.offer.id, p).unwrap();
        assert_eq!(updated.offer.title, "Angebot Updated");
        assert_eq!(updated.items.len(), 2);
    }

    #[test]
    fn update_not_found_returns_error() {
        let conn = setup();
        assert!(matches!(update(&conn, "x", sample_payload(vec![])), Err(AppError::NotFound(_))));
    }

    #[test]
    fn delete_removes_offer_and_items() {
        let conn = setup();
        let created = create(&conn, sample_payload(vec![sample_item()])).unwrap();
        delete(&conn, &created.offer.id).unwrap();
        assert!(matches!(get_by_id(&conn, &created.offer.id), Err(AppError::NotFound(_))));
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM offer_items WHERE offer_id = ?1",
            [&created.offer.id], |r| r.get(0),
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
        let all = get_by_workspace(&conn, "ws-1").unwrap();
        assert_eq!(all.len(), 2);
    }

    #[test]
    fn get_by_account_returns_offers() {
        let conn = setup();
        create(&conn, sample_payload(vec![])).unwrap();
        let result = get_by_account(&conn, "acc-1").unwrap();
        assert_eq!(result.len(), 1);
    }

    #[test]
    fn update_status_changes_status() {
        let conn = setup();
        let offer = create(&conn, sample_payload(vec![])).unwrap();
        let updated = update_status(&conn, &offer.offer.id, "sent").unwrap();
        assert_eq!(updated.status, "sent");
    }

    #[test]
    fn update_status_not_found_returns_error() {
        let conn = setup();
        assert!(matches!(update_status(&conn, "x", "sent"), Err(AppError::NotFound(_))));
    }

    #[test]
    fn offer_item_date_and_unit_round_trip() {
        let conn = setup();
        let payload = UpsertOfferPayload {
            id: None,
            workspace_id: "ws-1".into(),
            created_by: "u-1".into(),
            account_id: "acc-1".into(),
            title: "Angebot Test".into(),
            status: None,
            valid_until: "2026-06-22".into(),
            tax_mode: Some("kleinunternehmer".into()),
            subtotal: 200.0,
            tax_amount: 0.0,
            total: 200.0,
            notes: None,
            items: vec![UpsertOfferItemPayload {
                id: None,
                title: "Beratung".into(),
                description: None,
                quantity: 2.0,
                unit_price: 100.0,
                tax_rate: 0.0,
                total: 200.0,
                sort_order: 0,
                item_date: Some("2026-05-22".into()),
                unit: Some("Std.".into()),
            }],
        };
        let result = create(&conn, payload).unwrap();
        assert_eq!(result.items[0].item_date.as_deref(), Some("2026-05-22"));
        assert_eq!(result.items[0].unit.as_deref(), Some("Std."));
    }

    #[test]
    fn convert_to_invoice_creates_invoice_and_marks_offer_accepted() {
        let conn = setup();
        let offer = create(&conn, sample_payload(vec![sample_item()])).unwrap();
        let invoice_result = convert_to_invoice(&conn, &offer.offer.id, "ws-1", "u-1").unwrap();
        assert_eq!(invoice_result.invoice.account_id, "acc-1");
        assert_eq!(invoice_result.invoice.tax_mode, "standard");
        assert_eq!(invoice_result.items.len(), 1);
        assert_eq!(invoice_result.items[0].title, "Webdesign");

        // Offer should now be accepted and linked
        let updated_offer = get_by_id(&conn, &offer.offer.id).unwrap();
        assert_eq!(updated_offer.offer.status, "accepted");
        assert_eq!(
            updated_offer.offer.converted_invoice_id.as_deref(),
            Some(invoice_result.invoice.id.as_str())
        );
    }
}
