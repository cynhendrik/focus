use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::AppError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AutomationRule {
    pub id: String,
    pub workspace_id: String,
    pub name: String,
    pub is_system: bool,
    pub is_active: bool,
    pub trigger_type: String,
    pub trigger_filter: String,
    pub action_type: String,
    pub action_params: String,
    pub order_index: i32,
    pub created_at: String,
    pub updated_at: String,
}

fn map_row(row: &rusqlite::Row) -> rusqlite::Result<AutomationRule> {
    Ok(AutomationRule {
        id:             row.get(0)?,
        workspace_id:   row.get(1)?,
        name:           row.get(2)?,
        is_system:      row.get::<_, i32>(3)? != 0,
        is_active:      row.get::<_, i32>(4)? != 0,
        trigger_type:   row.get(5)?,
        trigger_filter: row.get(6)?,
        action_type:    row.get(7)?,
        action_params:  row.get(8)?,
        order_index:    row.get(9)?,
        created_at:     row.get(10)?,
        updated_at:     row.get(11)?,
    })
}

const SELECT_COLS: &str =
    "id, workspace_id, name, is_system, is_active, trigger_type, trigger_filter,
     action_type, action_params, order_index, created_at, updated_at";

pub fn get_all(conn: &Connection, workspace_id: &str) -> Result<Vec<AutomationRule>, AppError> {
    let sql = format!(
        "SELECT {SELECT_COLS} FROM automation_rules WHERE workspace_id = ?1 ORDER BY order_index ASC"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([workspace_id], map_row)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn get_active(
    conn: &Connection,
    workspace_id: &str,
    trigger_type: &str,
) -> Result<Vec<AutomationRule>, AppError> {
    let sql = format!(
        "SELECT {SELECT_COLS} FROM automation_rules
         WHERE workspace_id = ?1 AND is_active = 1 AND trigger_type = ?2
         ORDER BY order_index ASC"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt
        .query_map(rusqlite::params![workspace_id, trigger_type], map_row)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn set_active(
    conn: &Connection,
    id: &str,
    workspace_id: &str,
    active: bool,
) -> Result<(), AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE automation_rules SET is_active = ?1, updated_at = ?2 WHERE id = ?3 AND workspace_id = ?4",
        rusqlite::params![active as i32, now, id, workspace_id],
    )?;
    Ok(())
}

pub fn seed_defaults(conn: &Connection, workspace_id: &str) -> Result<(), AppError> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM automation_rules WHERE workspace_id = ?1 AND is_system = 1",
        [workspace_id],
        |r| r.get(0),
    )?;
    if count > 0 {
        return Ok(());
    }

    let now = chrono::Utc::now().to_rfc3339();

    #[rustfmt::skip]
    let rules: &[(&str, &str, &str, &str, &str, i32)] = &[
        // (name, trigger_type, trigger_filter, action_type, action_params, order_index)
        ("Score: Strong Interest",    "activity_outcome", r#"{"outcome":"strong_interest"}"#,    "update_lead_score", r#"{"delta":25,"factor":"strong_interest"}"#,    0),
        ("Score: Interest Follow-Up", "activity_outcome", r#"{"outcome":"interest_follow_up"}"#, "update_lead_score", r#"{"delta":15,"factor":"interest_follow_up"}"#, 1),
        ("Score: Proposal Requested", "activity_outcome", r#"{"outcome":"proposal_requested"}"#, "update_lead_score", r#"{"delta":30,"factor":"proposal_requested"}"#, 2),
        ("Score: Deal Won",           "activity_outcome", r#"{"outcome":"deal_won"}"#,           "update_lead_score", r#"{"delta":50,"factor":"deal_won"}"#,           3),
        ("Status: Deal Won",          "activity_outcome", r#"{"outcome":"deal_won"}"#,           "set_account_status",r#"{"status":"aktiv"}"#,                         4),
        ("Score: Deal Lost",          "activity_outcome", r#"{"outcome":"deal_lost"}"#,          "update_lead_score", r#"{"delta":-30,"factor":"deal_lost"}"#,         5),
        ("Score: No Interest Later",  "activity_outcome", r#"{"outcome":"no_interest_later"}"#,  "update_lead_score", r#"{"delta":-10,"factor":"no_interest_later"}"#, 6),
        ("Score: No Interest Lost",   "activity_outcome", r#"{"outcome":"no_interest_lost"}"#,   "update_lead_score", r#"{"delta":-25,"factor":"no_interest_lost"}"#,  7),
        ("Score: No Show",            "activity_outcome", r#"{"outcome":"no_show"}"#,            "update_lead_score", r#"{"delta":-5,"factor":"no_show"}"#,            8),
        ("Score: Reply Received",     "activity_outcome", r#"{"outcome":"reply_received"}"#,     "update_lead_score", r#"{"delta":10,"factor":"reply_received"}"#,     9),
        ("Score: No Reply",           "activity_outcome", r#"{"outcome":"no_reply"}"#,           "update_lead_score", r#"{"delta":-5,"factor":"no_reply"}"#,           10),
        ("Score: Stage Won",          "deal_stage_changed",r#"{"to_stage":"won"}"#,              "update_lead_score", r#"{"delta":40,"factor":"stage_won"}"#,          11),
        ("Status: Stage Won",         "deal_stage_changed",r#"{"to_stage":"won"}"#,              "set_account_status",r#"{"status":"aktiv"}"#,                         12),
        ("Score: Stage Lost",         "deal_stage_changed",r#"{"to_stage":"lost"}"#,             "update_lead_score", r#"{"delta":-20,"factor":"stage_lost"}"#,        13),
        ("Status: Stage Lost",        "deal_stage_changed",r#"{"to_stage":"lost"}"#,             "set_account_status",r#"{"status":"inaktiv"}"#,                       14),
    ];

    let tx = conn.unchecked_transaction()?;
    for (name, trigger_type, trigger_filter, action_type, action_params, order_index) in rules {
        let id = uuid::Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO automation_rules
             (id, workspace_id, name, is_system, is_active, trigger_type, trigger_filter,
              action_type, action_params, order_index, created_at, updated_at)
             VALUES (?1,?2,?3,1,1,?4,?5,?6,?7,?8,?9,?9)",
            rusqlite::params![
                id, workspace_id, name,
                trigger_type, trigger_filter, action_type, action_params,
                order_index, now,
            ],
        )?;
    }
    tx.commit()?;
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
    fn seed_defaults_is_idempotent() {
        let conn = setup();
        seed_defaults(&conn, "ws-1").unwrap();
        seed_defaults(&conn, "ws-1").unwrap();
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM automation_rules WHERE workspace_id = 'ws-1' AND is_system = 1",
            [], |r| r.get(0),
        ).unwrap();
        assert_eq!(count, 15);
    }

    #[test]
    fn get_active_returns_only_active_rules_for_trigger_type() {
        let conn = setup();
        seed_defaults(&conn, "ws-1").unwrap();
        let rules = get_active(&conn, "ws-1", "activity_outcome").unwrap();
        assert!(!rules.is_empty());
        assert!(rules.iter().all(|r| r.is_active && r.trigger_type == "activity_outcome"));
    }

    #[test]
    fn set_active_disables_rule() {
        let conn = setup();
        seed_defaults(&conn, "ws-1").unwrap();
        let all = get_all(&conn, "ws-1").unwrap();
        let first_id = all[0].id.clone();
        set_active(&conn, &first_id, "ws-1", false).unwrap();
        let updated = get_all(&conn, "ws-1").unwrap();
        let rule = updated.iter().find(|r| r.id == first_id).unwrap();
        assert!(!rule.is_active);
    }
}
