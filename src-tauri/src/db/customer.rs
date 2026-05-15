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
    pub workspace_id: String,
    pub industry: Option<String>,
    pub contact_person: Option<String>,
    pub goals: Vec<String>,
    pub social_links: String,
    pub internal_notes: Option<String>,
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
    pub workspace_id: String,
    pub created_by: String,
    pub industry: Option<String>,
    pub contact_person: Option<String>,
    pub goals: Option<Vec<String>>,
    pub social_links: Option<String>,
    pub internal_notes: Option<String>,
}

pub fn get_all(conn: &Connection, workspace_id: &str) -> Result<Vec<Customer>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, name, company, email, phone, status, priority, tags, is_private,
                workspace_id, industry, contact_person, goals, social_links, internal_notes,
                created_at, updated_at
         FROM customers
         WHERE is_private = 0 AND workspace_id = ?1
         ORDER BY name ASC"
    )?;

    let customers = stmt.query_map([workspace_id], |row| {
        let tags_json: String  = row.get(7)?;
        let goals_json: String = row.get(12)?;
        Ok(Customer {
            id:              row.get(0)?,
            name:            row.get(1)?,
            company:         row.get(2)?,
            email:           row.get(3)?,
            phone:           row.get(4)?,
            status:          row.get(5)?,
            priority:        row.get(6)?,
            tags:            serde_json::from_str(&tags_json).unwrap_or_default(),
            is_private:      row.get::<_, i32>(8)? != 0,
            workspace_id:    row.get(9)?,
            industry:        row.get(10)?,
            contact_person:  row.get(11)?,
            goals:           serde_json::from_str(&goals_json).unwrap_or_default(),
            social_links:    row.get::<_, Option<String>>(13)?.unwrap_or_else(|| "{}".to_string()),
            internal_notes:  row.get(14)?,
            created_at:      row.get(15)?,
            updated_at:      row.get(16)?,
        })
    })?.collect::<Result<Vec<_>, _>>()?;

    Ok(customers)
}

pub fn upsert(conn: &Connection, payload: UpsertCustomerPayload) -> Result<Customer, AppError> {
    let id = payload.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let now = chrono::Utc::now().to_rfc3339();
    let tags_json = serde_json::to_string(&payload.tags.unwrap_or_default())
        .map_err(|e| AppError::Validation(e.to_string()))?;
    let goals_json = serde_json::to_string(&payload.goals.unwrap_or_default())
        .map_err(|e| AppError::Validation(e.to_string()))?;

    conn.execute(
        "INSERT INTO customers (id, name, company, email, phone, status, priority, tags,
                                workspace_id, created_by, pending_sync,
                                industry, contact_person, goals, social_links, internal_notes,
                                created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,1,?11,?12,?13,?14,?15,?16,?16)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name, company=excluded.company, email=excluded.email,
           phone=excluded.phone, status=excluded.status, priority=excluded.priority,
           tags=excluded.tags, industry=excluded.industry, contact_person=excluded.contact_person,
           goals=excluded.goals, social_links=excluded.social_links,
           internal_notes=excluded.internal_notes, pending_sync=1, updated_at=excluded.updated_at",
        rusqlite::params![
            id, payload.name, payload.company, payload.email, payload.phone,
            payload.status.unwrap_or_else(|| "aktiv".to_string()),
            payload.priority.unwrap_or_else(|| "normal".to_string()),
            tags_json, payload.workspace_id, payload.created_by,
            payload.industry, payload.contact_person, goals_json,
            payload.social_links.unwrap_or_else(|| "{}".to_string()),
            payload.internal_notes, now,
        ],
    )?;

    let customer_json = serde_json::json!({
        "id": id,
        "name": payload.name,
        "workspace_id": payload.workspace_id,
        "updated_at": now,
    });
    crate::core::sync::enqueue(conn, "customers", &id, "INSERT", customer_json)?;

    let customer = conn.query_row(
        "SELECT id, name, company, email, phone, status, priority, tags, is_private,
                workspace_id, industry, contact_person, goals, social_links, internal_notes,
                created_at, updated_at
         FROM customers WHERE id = ?1",
        [&id],
        |row| {
            let tags_json: String  = row.get(7)?;
            let goals_json: String = row.get(12)?;
            Ok(Customer {
                id:             row.get(0)?,
                name:           row.get(1)?,
                company:        row.get(2)?,
                email:          row.get(3)?,
                phone:          row.get(4)?,
                status:         row.get(5)?,
                priority:       row.get(6)?,
                tags:           serde_json::from_str(&tags_json).unwrap_or_default(),
                is_private:     row.get::<_, i32>(8)? != 0,
                workspace_id:   row.get(9)?,
                industry:       row.get(10)?,
                contact_person: row.get(11)?,
                goals:          serde_json::from_str(&goals_json).unwrap_or_default(),
                social_links:   row.get::<_, Option<String>>(13)?.unwrap_or_else(|| "{}".to_string()),
                internal_notes: row.get(14)?,
                created_at:     row.get(15)?,
                updated_at:     row.get(16)?,
            })
        },
    )?;

    Ok(customer)
}

pub fn delete(conn: &Connection, id: &str, workspace_id: &str) -> Result<(), AppError> {
    crate::core::sync::enqueue(
        conn, "customers", id, "DELETE",
        serde_json::json!({"id": id, "workspace_id": workspace_id}),
    )?;
    let affected = conn.execute(
        "DELETE FROM customers WHERE id = ?1 AND is_private = 0 AND workspace_id = ?2",
        rusqlite::params![id, workspace_id],
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
            id: None, name: "Max Mustermann".to_string(),
            company: Some("Muster GmbH".to_string()), email: Some("max@muster.de".to_string()),
            phone: None, status: None, priority: None,
            tags: Some(vec!["vip".to_string()]),
            workspace_id: "ws-1".to_string(), created_by: "u-1".to_string(),
            industry: None, contact_person: None, goals: None,
            social_links: None, internal_notes: None,
        };
        let customer = upsert(&conn, payload).unwrap();
        assert_eq!(customer.name, "Max Mustermann");
        assert_eq!(customer.workspace_id, "ws-1");
        assert!(!customer.is_private);
        assert!(customer.goals.is_empty());
        assert_eq!(customer.social_links, "{}");
    }

    #[test]
    fn upsert_persists_profile_fields() {
        let conn = setup();
        let payload = UpsertCustomerPayload {
            id: None, name: "Profil Test".to_string(),
            company: None, email: None, phone: None, status: None, priority: None, tags: None,
            workspace_id: "ws-1".to_string(), created_by: "u-1".to_string(),
            industry: Some("Tech".to_string()),
            contact_person: Some("Anna".to_string()),
            goals: Some(vec!["Wachstum".to_string()]),
            social_links: Some(r#"{"instagram":"@test"}"#.to_string()),
            internal_notes: Some("Wichtig".to_string()),
        };
        let c = upsert(&conn, payload).unwrap();
        assert_eq!(c.industry, Some("Tech".to_string()));
        assert_eq!(c.contact_person, Some("Anna".to_string()));
        assert_eq!(c.goals, vec!["Wachstum"]);
        assert_eq!(c.internal_notes, Some("Wichtig".to_string()));
    }

    #[test]
    fn get_all_filters_by_workspace_id() {
        let conn = setup();
        for (name, ws) in [("A", "ws-a"), ("B", "ws-b")] {
            upsert(&conn, UpsertCustomerPayload {
                id: None, name: name.to_string(), company: None, email: None, phone: None,
                status: None, priority: None, tags: None,
                workspace_id: ws.to_string(), created_by: "u1".to_string(),
                industry: None, contact_person: None, goals: None,
                social_links: None, internal_notes: None,
            }).unwrap();
        }
        let result = get_all(&conn, "ws-a").unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].name, "A");
    }

    #[test]
    fn delete_removes_customer_in_workspace() {
        let conn = setup();
        let payload = UpsertCustomerPayload {
            id: Some("del-test".to_string()), name: "Zu löschen".to_string(),
            company: None, email: None, phone: None, status: None, priority: None, tags: None,
            workspace_id: "ws-del".to_string(), created_by: "u-1".to_string(),
            industry: None, contact_person: None, goals: None,
            social_links: None, internal_notes: None,
        };
        upsert(&conn, payload).unwrap();
        delete(&conn, "del-test", "ws-del").unwrap();
        assert!(!get_all(&conn, "ws-del").unwrap().iter().any(|c| c.id == "del-test"));
    }
}
