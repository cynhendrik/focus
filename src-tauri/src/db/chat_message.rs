use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::AppError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub id: String,
    pub customer_id: String,
    pub content: String,
    pub sender: String,
    pub read: bool,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddChatMessagePayload {
    pub customer_id: String,
    pub content: String,
    pub sender: String,
}

pub fn get_by_customer(conn: &Connection, customer_id: &str) -> Result<Vec<ChatMessage>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, customer_id, content, sender, read, created_at
         FROM chat_messages WHERE customer_id = ?1 ORDER BY created_at ASC",
    )?;
    let messages = stmt
        .query_map([customer_id], |row| {
            Ok(ChatMessage {
                id: row.get(0)?,
                customer_id: row.get(1)?,
                content: row.get(2)?,
                sender: row.get(3)?,
                read: row.get::<_, i32>(4)? != 0,
                created_at: row.get(5)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(messages)
}

pub fn add(conn: &Connection, payload: AddChatMessagePayload) -> Result<ChatMessage, AppError> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO chat_messages (id, customer_id, content, sender, read, created_at)
         VALUES (?1, ?2, ?3, ?4, 0, ?5)",
        rusqlite::params![id, payload.customer_id, payload.content, payload.sender, now],
    )?;
    Ok(ChatMessage {
        id, customer_id: payload.customer_id,
        content: payload.content, sender: payload.sender,
        read: false, created_at: now,
    })
}

pub fn mark_read(conn: &Connection, id: &str) -> Result<(), AppError> {
    conn.execute("UPDATE chat_messages SET read = 1 WHERE id = ?1", [id])?;
    Ok(())
}

pub fn delete(conn: &Connection, id: &str) -> Result<(), AppError> {
    let affected = conn.execute("DELETE FROM chat_messages WHERE id = ?1", [id])?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("ChatMessage {id} not found")));
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
    fn add_creates_message() {
        let conn = setup();
        let msg = add(&conn, AddChatMessagePayload {
            customer_id: "__cynera_privat__".to_string(),
            content: "Hallo".to_string(),
            sender: "user".to_string(),
        }).unwrap();
        assert_eq!(msg.content, "Hallo");
        assert!(!msg.read);
    }

    #[test]
    fn mark_read_updates_flag() {
        let conn = setup();
        let msg = add(&conn, AddChatMessagePayload {
            customer_id: "__cynera_privat__".to_string(),
            content: "X".to_string(), sender: "customer".to_string(),
        }).unwrap();
        mark_read(&conn, &msg.id).unwrap();
        let messages = get_by_customer(&conn, "__cynera_privat__").unwrap();
        assert!(messages[0].read);
    }

    #[test]
    fn get_by_customer_ordered_asc() {
        let conn = setup();
        add(&conn, AddChatMessagePayload {
            customer_id: "__cynera_privat__".to_string(),
            content: "First".to_string(), sender: "user".to_string(),
        }).unwrap();
        add(&conn, AddChatMessagePayload {
            customer_id: "__cynera_privat__".to_string(),
            content: "Second".to_string(), sender: "customer".to_string(),
        }).unwrap();
        let messages = get_by_customer(&conn, "__cynera_privat__").unwrap();
        assert_eq!(messages[0].content, "First");
        assert_eq!(messages[1].content, "Second");
    }
}
