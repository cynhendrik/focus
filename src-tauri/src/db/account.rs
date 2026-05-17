use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::AppError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    pub workspace_id: String,
    pub created_by: String,
    pub name: String,
    pub kind: String,
    pub industry: Option<String>,
    pub website: Option<String>,
    pub status: String,
    pub priority: String,
    pub tags: Vec<String>,
    pub goals: Vec<String>,
    pub health_score: Option<f64>,
    pub internal_notes: Option<String>,
    pub is_private: bool,
    pub social_links: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertAccountPayload {
    pub id: Option<String>,
    pub workspace_id: String,
    pub created_by: String,
    pub name: String,
    pub kind: Option<String>,
    pub industry: Option<String>,
    pub website: Option<String>,
    pub status: Option<String>,
    pub priority: Option<String>,
    pub tags: Option<Vec<String>>,
    pub goals: Option<Vec<String>>,
    pub internal_notes: Option<String>,
    pub social_links: Option<String>,
}

pub fn get_all(conn: &Connection, workspace_id: &str) -> Result<Vec<Account>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, created_by, name, kind, industry, website, status, priority,
                tags, goals, health_score, internal_notes, is_private, social_links,
                created_at, updated_at
         FROM accounts
         WHERE is_private = 0 AND workspace_id = ?1
         ORDER BY name ASC"
    )?;

    let accounts = stmt.query_map([workspace_id], |row| {
        let tags_json: String = row.get(9)?;
        let goals_json: String = row.get(10)?;
        Ok(Account {
            id:              row.get(0)?,
            workspace_id:    row.get(1)?,
            created_by:      row.get(2)?,
            name:            row.get(3)?,
            kind:            row.get(4)?,
            industry:        row.get(5)?,
            website:         row.get(6)?,
            status:          row.get(7)?,
            priority:        row.get(8)?,
            tags:            serde_json::from_str(&tags_json).unwrap_or_default(),
            goals:           serde_json::from_str(&goals_json).unwrap_or_default(),
            health_score:    row.get(11)?,
            internal_notes:  row.get(12)?,
            is_private:      row.get::<_, i32>(13)? != 0,
            social_links:    row.get::<_, Option<String>>(14)?.unwrap_or_else(|| "{}".to_string()),
            created_at:      row.get(15)?,
            updated_at:      row.get(16)?,
        })
    })?.collect::<Result<Vec<_>, _>>()?;

    Ok(accounts)
}

pub fn upsert(conn: &Connection, payload: UpsertAccountPayload) -> Result<Account, AppError> {
    let id = payload.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let now = chrono::Utc::now().to_rfc3339();
    let tags_json = serde_json::to_string(&payload.tags.unwrap_or_default())
        .map_err(|e| AppError::Validation(e.to_string()))?;
    let goals_json = serde_json::to_string(&payload.goals.unwrap_or_default())
        .map_err(|e| AppError::Validation(e.to_string()))?;

    conn.execute(
        "INSERT INTO accounts (id, workspace_id, created_by, name, kind, industry, website,
                               status, priority, tags, goals, internal_notes,
                               pending_sync, social_links, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,1,?13,?14,?14)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name, kind=excluded.kind, industry=excluded.industry,
           website=excluded.website, status=excluded.status, priority=excluded.priority,
           tags=excluded.tags, goals=excluded.goals, internal_notes=excluded.internal_notes,
           social_links=excluded.social_links, pending_sync=1, updated_at=excluded.updated_at",
        rusqlite::params![
            id, payload.workspace_id, payload.created_by, payload.name,
            payload.kind.unwrap_or_else(|| "company".to_string()),
            payload.industry, payload.website,
            payload.status.unwrap_or_else(|| "aktiv".to_string()),
            payload.priority.unwrap_or_else(|| "normal".to_string()),
            tags_json, goals_json, payload.internal_notes,
            payload.social_links.unwrap_or_else(|| "{}".to_string()), now,
        ],
    )?;

    let account_json = serde_json::json!({
        "id": id,
        "name": payload.name,
        "workspace_id": payload.workspace_id,
        "updated_at": now,
    });
    crate::core::sync::enqueue(conn, "accounts", &id, "INSERT", account_json)?;

    let account = conn.query_row(
        "SELECT id, workspace_id, created_by, name, kind, industry, website, status, priority,
                tags, goals, health_score, internal_notes, is_private, social_links,
                created_at, updated_at
         FROM accounts WHERE id = ?1",
        [&id],
        |row| {
            let tags_json: String = row.get(9)?;
            let goals_json: String = row.get(10)?;
            Ok(Account {
                id:              row.get(0)?,
                workspace_id:    row.get(1)?,
                created_by:      row.get(2)?,
                name:            row.get(3)?,
                kind:            row.get(4)?,
                industry:        row.get(5)?,
                website:         row.get(6)?,
                status:          row.get(7)?,
                priority:        row.get(8)?,
                tags:            serde_json::from_str(&tags_json).unwrap_or_default(),
                goals:           serde_json::from_str(&goals_json).unwrap_or_default(),
                health_score:    row.get(11)?,
                internal_notes:  row.get(12)?,
                is_private:      row.get::<_, i32>(13)? != 0,
                social_links:    row.get::<_, Option<String>>(14)?.unwrap_or_else(|| "{}".to_string()),
                created_at:      row.get(15)?,
                updated_at:      row.get(16)?,
            })
        },
    )?;

    Ok(account)
}

pub fn delete(conn: &Connection, id: &str, workspace_id: &str) -> Result<(), AppError> {
    crate::core::sync::enqueue(
        conn, "accounts", id, "DELETE",
        serde_json::json!({"id": id, "workspace_id": workspace_id}),
    )?;
    let affected = conn.execute(
        "DELETE FROM accounts WHERE id = ?1 AND is_private = 0 AND workspace_id = ?2",
        rusqlite::params![id, workspace_id],
    )?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("Account {id} not found")));
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
    fn upsert_creates_account() {
        let conn = setup();
        let acc = upsert(&conn, UpsertAccountPayload {
            id: None,
            workspace_id: "ws-1".into(),
            created_by: "u-1".into(),
            name: "Muster GmbH".into(),
            kind: Some("company".into()),
            industry: Some("Tech".into()),
            website: None,
            status: None,
            priority: None,
            tags: None,
            goals: None,
            internal_notes: None,
            social_links: None,
        }).unwrap();
        assert_eq!(acc.name, "Muster GmbH");
        assert_eq!(acc.kind, "company");
        assert_eq!(acc.workspace_id, "ws-1");
        assert!(!acc.is_private);
    }

    #[test]
    fn get_all_filters_private_and_workspace() {
        let conn = setup();
        upsert(&conn, UpsertAccountPayload {
            id: None,
            workspace_id: "ws-1".into(),
            created_by: "u-1".into(),
            name: "Visible".into(),
            kind: None,
            industry: None,
            website: None,
            status: None,
            priority: None,
            tags: None,
            goals: None,
            internal_notes: None,
            social_links: None,
        }).unwrap();
        upsert(&conn, UpsertAccountPayload {
            id: None,
            workspace_id: "ws-2".into(),
            created_by: "u-1".into(),
            name: "Other WS".into(),
            kind: None,
            industry: None,
            website: None,
            status: None,
            priority: None,
            tags: None,
            goals: None,
            internal_notes: None,
            social_links: None,
        }).unwrap();
        let result = get_all(&conn, "ws-1").unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].name, "Visible");
    }

    #[test]
    fn delete_removes_account() {
        let conn = setup();
        let acc = upsert(&conn, UpsertAccountPayload {
            id: Some("del-1".into()),
            workspace_id: "ws-1".into(),
            created_by: "u-1".into(),
            name: "To Delete".into(),
            kind: None,
            industry: None,
            website: None,
            status: None,
            priority: None,
            tags: None,
            goals: None,
            internal_notes: None,
            social_links: None,
        }).unwrap();
        delete(&conn, &acc.id, "ws-1").unwrap();
        assert!(get_all(&conn, "ws-1").unwrap().is_empty());
    }
}
