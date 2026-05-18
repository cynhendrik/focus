use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::Utc;
use crate::AppError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SmartList {
    pub id:          String,
    pub workspace_id: String,
    pub name:        String,
    pub icon:        String,
    pub filter:      String,
    pub order_index: i64,
    pub is_system:   bool,
    pub created_at:  String,
    pub updated_at:  String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertSmartListPayload {
    pub id:          Option<String>,
    pub workspace_id: String,
    pub name:        String,
    pub icon:        String,
    pub filter:      String,
    pub order_index: Option<i64>,
    pub is_system:   Option<bool>,
}

fn map_row(row: &rusqlite::Row) -> rusqlite::Result<SmartList> {
    Ok(SmartList {
        id:          row.get(0)?,
        workspace_id: row.get(1)?,
        name:        row.get(2)?,
        icon:        row.get(3)?,
        filter:      row.get(4)?,
        order_index: row.get(5)?,
        is_system:   row.get::<_, i64>(6)? != 0,
        created_at:  row.get(7)?,
        updated_at:  row.get(8)?,
    })
}

pub fn get_smart_lists(conn: &Connection, workspace_id: &str) -> Result<Vec<SmartList>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, name, icon, filter, order_index, is_system, created_at, updated_at
         FROM smart_lists WHERE workspace_id = ?1 ORDER BY order_index ASC"
    )?;
    let rows = stmt.query_map([workspace_id], map_row)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn upsert_smart_list(conn: &Connection, payload: &UpsertSmartListPayload) -> Result<SmartList, AppError> {
    let now = Utc::now().to_rfc3339();
    let id = payload.id.clone().unwrap_or_else(|| Uuid::new_v4().to_string());
    let order_index = payload.order_index.unwrap_or(0);
    let is_system = payload.is_system.unwrap_or(false) as i64;
    conn.execute(
        "INSERT INTO smart_lists (id, workspace_id, name, icon, filter, order_index, is_system, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, icon = excluded.icon,
           filter = excluded.filter, order_index = excluded.order_index,
           updated_at = excluded.updated_at",
        params![id, payload.workspace_id, payload.name, payload.icon,
                payload.filter, order_index, is_system, now, now],
    )?;
    let list = conn.query_row(
        "SELECT id, workspace_id, name, icon, filter, order_index, is_system, created_at, updated_at
         FROM smart_lists WHERE id = ?1",
        [&id], map_row,
    )?;
    Ok(list)
}

pub fn delete_smart_list(conn: &Connection, id: &str) -> Result<(), AppError> {
    let affected = conn.execute(
        "DELETE FROM smart_lists WHERE id = ?1 AND is_system = 0",
        [id],
    )?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("SmartList {id} not found or is a system list")));
    }
    Ok(())
}

pub fn seed_system_lists(conn: &Connection, workspace_id: &str) -> Result<(), AppError> {
    let now = Utc::now().to_rfc3339();
    let lists: &[(&str, &str, &str, &str, i64)] = &[
        ("hot-leads",  "🔥", "Hot Leads",               r#"{"status":["lead"],"scoreMin":50}"#,  0),
        ("needs-attn", "⚠️", "Brauchen Aufmerksamkeit", r#"{"priority":["high"]}"#,              1),
        ("inaktiv",    "💤", "Inaktiv",                  r#"{"status":["inaktiv"]}"#,             2),
        ("lost",       "☠️", "Lost",                     r#"{"status":["lost"]}"#,               3),
    ];
    for (suffix, icon, name, filter, order_index) in lists {
        let id = format!("{}-{}", workspace_id, suffix);
        conn.execute(
            "INSERT OR IGNORE INTO smart_lists
             (id, workspace_id, name, icon, filter, order_index, is_system, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?8)",
            params![id, workspace_id, name, icon, filter, order_index, now, now],
        )?;
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
    fn get_smart_lists_returns_only_rows_for_workspace() {
        let conn = setup();
        seed_system_lists(&conn, "ws-a").unwrap();
        seed_system_lists(&conn, "ws-b").unwrap();

        let ws_a = get_smart_lists(&conn, "ws-a").unwrap();
        let ws_b = get_smart_lists(&conn, "ws-b").unwrap();

        assert_eq!(ws_a.len(), 4);
        assert_eq!(ws_b.len(), 4);
        assert!(ws_a.iter().all(|l| l.workspace_id == "ws-a"));
        assert!(ws_b.iter().all(|l| l.workspace_id == "ws-b"));
    }

    #[test]
    fn upsert_smart_list_round_trips_insert_then_update() {
        let conn = setup();

        // Insert
        let payload = UpsertSmartListPayload {
            id: Some("list-1".to_string()),
            workspace_id: "ws-test".to_string(),
            name: "Original Name".to_string(),
            icon: "📋".to_string(),
            filter: "{}".to_string(),
            order_index: Some(0),
            is_system: Some(false),
        };
        let inserted = upsert_smart_list(&conn, &payload).unwrap();
        assert_eq!(inserted.id, "list-1");
        assert_eq!(inserted.name, "Original Name");
        assert!(!inserted.is_system);

        // Update name
        let update_payload = UpsertSmartListPayload {
            id: Some("list-1".to_string()),
            workspace_id: "ws-test".to_string(),
            name: "Updated Name".to_string(),
            icon: "📋".to_string(),
            filter: "{}".to_string(),
            order_index: Some(0),
            is_system: Some(false),
        };
        let updated = upsert_smart_list(&conn, &update_payload).unwrap();
        assert_eq!(updated.id, "list-1");
        assert_eq!(updated.name, "Updated Name");
    }

    #[test]
    fn delete_smart_list_removes_user_list() {
        let conn = setup();

        let payload = UpsertSmartListPayload {
            id: Some("user-list-1".to_string()),
            workspace_id: "ws-test".to_string(),
            name: "User List".to_string(),
            icon: "📋".to_string(),
            filter: "{}".to_string(),
            order_index: Some(0),
            is_system: Some(false),
        };
        upsert_smart_list(&conn, &payload).unwrap();

        let result = delete_smart_list(&conn, "user-list-1");
        assert!(result.is_ok());

        let remaining = get_smart_lists(&conn, "ws-test").unwrap();
        assert!(remaining.iter().all(|l| l.id != "user-list-1"));
    }

    #[test]
    fn delete_smart_list_returns_error_for_system_list() {
        let conn = setup();
        seed_system_lists(&conn, "ws-test").unwrap();

        // System list id is formatted as "{workspace_id}-{suffix}"
        let result = delete_smart_list(&conn, "ws-test-hot-leads");
        assert!(result.is_err());
        match result {
            Err(AppError::NotFound(msg)) => assert!(msg.contains("ws-test-hot-leads")),
            _ => panic!("Expected NotFound error for system list deletion"),
        }
    }

    #[test]
    fn delete_smart_list_returns_error_for_nonexistent_id() {
        let conn = setup();

        let result = delete_smart_list(&conn, "nonexistent-id");
        assert!(result.is_err());
        match result {
            Err(AppError::NotFound(_)) => {}
            _ => panic!("Expected NotFound error for nonexistent list"),
        }
    }

    #[test]
    fn seed_system_lists_is_idempotent() {
        let conn = setup();

        seed_system_lists(&conn, "ws-test").unwrap();
        seed_system_lists(&conn, "ws-test").unwrap();

        let lists = get_smart_lists(&conn, "ws-test").unwrap();
        assert_eq!(lists.len(), 4, "Expected exactly 4 system lists after double seed");
        assert!(lists.iter().all(|l| l.is_system));
    }
}
