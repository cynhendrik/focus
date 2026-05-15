use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::AppError;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChecklistItem {
    pub id: String,
    pub text: String,
    pub done: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Todo {
    pub id: String,
    pub customer_id: String,
    pub title: String,
    pub status: String,
    pub priority: String,
    pub due_date: Option<String>,
    pub checklist: Vec<ChecklistItem>,
    pub tags: Vec<String>,
    pub assignee: Option<String>,
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
    pub checklist: Option<Vec<ChecklistItem>>,
    pub tags: Option<Vec<String>>,
    pub assignee: Option<String>,
}

pub fn get_by_customer(conn: &Connection, customer_id: &str) -> Result<Vec<Todo>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, customer_id, title, status, priority, due_date,
                checklist, tags, assignee, created_at, updated_at
         FROM todos WHERE customer_id = ?1 ORDER BY created_at DESC",
    )?;
    let todos = stmt.query_map([customer_id], |row| {
        let checklist_json: String = row.get(6)?;
        let tags_json: String = row.get(7)?;
        Ok(Todo {
            id:          row.get(0)?,
            customer_id: row.get(1)?,
            title:       row.get(2)?,
            status:      row.get(3)?,
            priority:    row.get(4)?,
            due_date:    row.get(5)?,
            checklist:   serde_json::from_str(&checklist_json).unwrap_or_default(),
            tags:        serde_json::from_str(&tags_json).unwrap_or_default(),
            assignee:    row.get(8)?,
            created_at:  row.get(9)?,
            updated_at:  row.get(10)?,
        })
    })?.collect::<Result<Vec<_>, _>>()?;
    Ok(todos)
}

pub fn upsert(conn: &Connection, payload: UpsertTodoPayload) -> Result<Todo, AppError> {
    let id = payload.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let now = chrono::Utc::now().to_rfc3339();
    let checklist_json = serde_json::to_string(&payload.checklist.unwrap_or_default())
        .map_err(|e| AppError::Validation(e.to_string()))?;
    let tags_json = serde_json::to_string(&payload.tags.unwrap_or_default())
        .map_err(|e| AppError::Validation(e.to_string()))?;

    conn.execute(
        "INSERT INTO todos (id, customer_id, title, status, priority, due_date,
                            checklist, tags, assignee, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?10)
         ON CONFLICT(id) DO UPDATE SET
           title=excluded.title, status=excluded.status, priority=excluded.priority,
           due_date=excluded.due_date, checklist=excluded.checklist,
           tags=excluded.tags, assignee=excluded.assignee, updated_at=excluded.updated_at",
        rusqlite::params![
            id, payload.customer_id, payload.title,
            payload.status.unwrap_or_else(|| "open".to_string()),
            payload.priority.unwrap_or_else(|| "normal".to_string()),
            payload.due_date, checklist_json, tags_json, payload.assignee, now,
        ],
    )?;

    let todo = conn.query_row(
        "SELECT id, customer_id, title, status, priority, due_date,
                checklist, tags, assignee, created_at, updated_at
         FROM todos WHERE id = ?1",
        [&id],
        |row| {
            let checklist_json: String = row.get(6)?;
            let tags_json: String = row.get(7)?;
            Ok(Todo {
                id: row.get(0)?, customer_id: row.get(1)?, title: row.get(2)?,
                status: row.get(3)?, priority: row.get(4)?, due_date: row.get(5)?,
                checklist: serde_json::from_str(&checklist_json).unwrap_or_default(),
                tags: serde_json::from_str(&tags_json).unwrap_or_default(),
                assignee: row.get(8)?, created_at: row.get(9)?, updated_at: row.get(10)?,
            })
        },
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
            checklist: None, tags: None, assignee: None,
        }).unwrap();
        assert_eq!(todo.title, "Test Todo");
        assert_eq!(todo.status, "open");
        assert!(todo.checklist.is_empty());
        assert!(todo.tags.is_empty());
    }

    #[test]
    fn upsert_persists_checklist_and_tags() {
        let conn = setup();
        let checklist = vec![ChecklistItem {
            id: "c1".to_string(), text: "Schritt 1".to_string(), done: false,
        }];
        let todo = upsert(&conn, UpsertTodoPayload {
            id: None, customer_id: "__cynera_privat__".to_string(),
            title: "Mit Checkliste".to_string(), status: None, priority: None, due_date: None,
            checklist: Some(checklist),
            tags: Some(vec!["design".to_string()]),
            assignee: Some("Max".to_string()),
        }).unwrap();
        assert_eq!(todo.checklist.len(), 1);
        assert_eq!(todo.checklist[0].text, "Schritt 1");
        assert_eq!(todo.tags, vec!["design"]);
        assert_eq!(todo.assignee, Some("Max".to_string()));
    }

    #[test]
    fn get_by_customer_filters_correctly() {
        let conn = setup();
        upsert(&conn, UpsertTodoPayload {
            id: None, customer_id: "__cynera_privat__".to_string(),
            title: "Todo A".to_string(), status: None, priority: None, due_date: None,
            checklist: None, tags: None, assignee: None,
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
            checklist: None, tags: None, assignee: None,
        }).unwrap();
        delete(&conn, &todo.id).unwrap();
        assert_eq!(get_by_customer(&conn, "__cynera_privat__").unwrap().len(), 0);
    }
}
