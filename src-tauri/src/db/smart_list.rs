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
    conn.execute("DELETE FROM smart_lists WHERE id = ?1 AND is_system = 0", [id])?;
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
