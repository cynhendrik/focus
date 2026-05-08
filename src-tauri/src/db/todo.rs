use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::AppError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Todo {
    pub id: String,
    pub customer_id: String,
    pub title: String,
    pub status: String,
    pub priority: String,
    pub due_date: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertTodoPayload {
    pub id: Option<String>,
    pub customer_id: String,
    pub title: String,
    pub status: Option<String>,
    pub priority: Option<String>,
    pub due_date: Option<String>,
}

pub fn get_by_customer(conn: &Connection, customer_id: &str) -> Result<Vec<Todo>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, customer_id, title, status, priority, due_date, created_at, updated_at
         FROM todos WHERE customer_id = ?1 ORDER BY created_at DESC",
    )?;
    let todos = stmt
        .query_map([customer_id], |row| {
            Ok(Todo {
                id: row.get(0)?,
                customer_id: row.get(1)?,
                title: row.get(2)?,
                status: row.get(3)?,
                priority: row.get(4)?,
                due_date: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(todos)
}

pub fn upsert(conn: &Connection, payload: UpsertTodoPayload) -> Result<Todo, AppError> {
    let id = payload.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO todos (id, customer_id, title, status, priority, due_date, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title, status = excluded.status,
           priority = excluded.priority, due_date = excluded.due_date,
           updated_at = excluded.updated_at",
        rusqlite::params![
            id, payload.customer_id, payload.title,
            payload.status.unwrap_or_else(|| "open".to_string()),
            payload.priority.unwrap_or_else(|| "normal".to_string()),
            payload.due_date, now,
        ],
    )?;
    let todo = conn.query_row(
        "SELECT id, customer_id, title, status, priority, due_date, created_at, updated_at
         FROM todos WHERE id = ?1",
        [&id],
        |row| Ok(Todo {
            id: row.get(0)?, customer_id: row.get(1)?, title: row.get(2)?,
            status: row.get(3)?, priority: row.get(4)?, due_date: row.get(5)?,
            created_at: row.get(6)?, updated_at: row.get(7)?,
        }),
    )?;
    Ok(todo)
}

pub fn delete(conn: &Connection, id: &str) -> Result<(), AppError> {
    let affected = conn.execute("DELETE FROM todos WHERE id = ?1", [id])?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("Todo {id} not found")));
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
    fn upsert_creates_todo() {
        let conn = setup();
        let todo = upsert(&conn, UpsertTodoPayload {
            id: None, customer_id: "__cynera_privat__".to_string(),
            title: "Test Todo".to_string(), status: None, priority: None, due_date: None,
        }).unwrap();
        assert_eq!(todo.title, "Test Todo");
        assert_eq!(todo.status, "open");
    }

    #[test]
    fn get_by_customer_filters_correctly() {
        let conn = setup();
        upsert(&conn, UpsertTodoPayload {
            id: None, customer_id: "__cynera_privat__".to_string(),
            title: "Todo A".to_string(), status: None, priority: None, due_date: None,
        }).unwrap();
        let todos = get_by_customer(&conn, "__cynera_privat__").unwrap();
        assert_eq!(todos.len(), 1);
        assert_eq!(get_by_customer(&conn, "other").unwrap().len(), 0);
    }

    #[test]
    fn delete_removes_todo() {
        let conn = setup();
        let todo = upsert(&conn, UpsertTodoPayload {
            id: None, customer_id: "__cynera_privat__".to_string(),
            title: "To delete".to_string(), status: None, priority: None, due_date: None,
        }).unwrap();
        delete(&conn, &todo.id).unwrap();
        assert_eq!(get_by_customer(&conn, "__cynera_privat__").unwrap().len(), 0);
    }
}
