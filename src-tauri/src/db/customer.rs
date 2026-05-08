use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::AppError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Customer {
    pub id: String,
    pub name: String,
    pub company: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub status: String,
    pub priority: String,
    pub tags: Vec<String>,
    pub is_private: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertCustomerPayload {
    pub id: Option<String>,
    pub name: String,
    pub company: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub status: Option<String>,
    pub priority: Option<String>,
    pub tags: Option<Vec<String>>,
}

pub fn get_all(conn: &Connection) -> Result<Vec<Customer>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, name, company, email, phone, status, priority, tags, is_private, created_at, updated_at
         FROM customers WHERE is_private = 0 ORDER BY name ASC"
    )?;

    let customers = stmt.query_map([], |row| {
        let tags_json: String = row.get(7)?;
        Ok(Customer {
            id: row.get(0)?,
            name: row.get(1)?,
            company: row.get(2)?,
            email: row.get(3)?,
            phone: row.get(4)?,
            status: row.get(5)?,
            priority: row.get(6)?,
            tags: serde_json::from_str(&tags_json).unwrap_or_default(),
            is_private: row.get::<_, i32>(8)? != 0,
            created_at: row.get(9)?,
            updated_at: row.get(10)?,
        })
    })?
    .collect::<Result<Vec<_>, _>>()?;

    Ok(customers)
}

pub fn upsert(conn: &Connection, payload: UpsertCustomerPayload) -> Result<Customer, AppError> {
    let id = payload.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let now = chrono::Utc::now().to_rfc3339();
    let tags_json = serde_json::to_string(&payload.tags.unwrap_or_default())
        .map_err(|e| AppError::Validation(e.to_string()))?;

    conn.execute(
        "INSERT INTO customers (id, name, company, email, phone, status, priority, tags, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           company = excluded.company,
           email = excluded.email,
           phone = excluded.phone,
           status = excluded.status,
           priority = excluded.priority,
           tags = excluded.tags,
           updated_at = excluded.updated_at",
        rusqlite::params![
            id,
            payload.name,
            payload.company,
            payload.email,
            payload.phone,
            payload.status.unwrap_or_else(|| "aktiv".to_string()),
            payload.priority.unwrap_or_else(|| "normal".to_string()),
            tags_json,
            now,
        ],
    )?;

    let customer = conn.query_row(
        "SELECT id, name, company, email, phone, status, priority, tags, is_private, created_at, updated_at
         FROM customers WHERE id = ?1",
        [&id],
        |row| {
            let tags_json: String = row.get(7)?;
            Ok(Customer {
                id: row.get(0)?,
                name: row.get(1)?,
                company: row.get(2)?,
                email: row.get(3)?,
                phone: row.get(4)?,
                status: row.get(5)?,
                priority: row.get(6)?,
                tags: serde_json::from_str(&tags_json).unwrap_or_default(),
                is_private: row.get::<_, i32>(8)? != 0,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        },
    )?;

    Ok(customer)
}

pub fn delete(conn: &Connection, id: &str) -> Result<(), AppError> {
    let affected = conn.execute(
        "DELETE FROM customers WHERE id = ?1 AND is_private = 0",
        [id],
    )?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("Customer {id} not found")));
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
    fn upsert_creates_new_customer() {
        let conn = setup();
        let payload = UpsertCustomerPayload {
            id: None,
            name: "Max Mustermann".to_string(),
            company: Some("Muster GmbH".to_string()),
            email: Some("max@muster.de".to_string()),
            phone: None,
            status: None,
            priority: None,
            tags: Some(vec!["vip".to_string()]),
        };
        let customer = upsert(&conn, payload).unwrap();
        assert_eq!(customer.name, "Max Mustermann");
        assert_eq!(customer.company, Some("Muster GmbH".to_string()));
        assert_eq!(customer.status, "aktiv");
        assert!(customer.tags.contains(&"vip".to_string()));
        assert!(!customer.is_private);
    }

    #[test]
    fn upsert_updates_existing_customer() {
        let conn = setup();
        let payload = UpsertCustomerPayload {
            id: Some("test-id".to_string()),
            name: "Original".to_string(),
            company: None, email: None, phone: None,
            status: None, priority: None, tags: None,
        };
        upsert(&conn, payload).unwrap();

        let update = UpsertCustomerPayload {
            id: Some("test-id".to_string()),
            name: "Updated".to_string(),
            company: None, email: None, phone: None,
            status: None, priority: None, tags: None,
        };
        let updated = upsert(&conn, update).unwrap();
        assert_eq!(updated.name, "Updated");
        assert_eq!(updated.id, "test-id");
    }

    #[test]
    fn get_all_excludes_private_customer() {
        let conn = setup();
        let customers = get_all(&conn).unwrap();
        assert!(!customers.iter().any(|c| c.id == "__cynera_privat__"));
    }

    #[test]
    fn delete_removes_customer() {
        let conn = setup();
        let payload = UpsertCustomerPayload {
            id: Some("del-test".to_string()),
            name: "Zu löschen".to_string(),
            company: None, email: None, phone: None,
            status: None, priority: None, tags: None,
        };
        upsert(&conn, payload).unwrap();
        delete(&conn, "del-test").unwrap();
        let customers = get_all(&conn).unwrap();
        assert!(!customers.iter().any(|c| c.id == "del-test"));
    }

    #[test]
    fn delete_private_customer_fails() {
        let conn = setup();
        let result = delete(&conn, "__cynera_privat__");
        assert!(result.is_err());
    }
}
