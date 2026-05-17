use rusqlite::Connection;
use crate::{AppError, db::automation_rule, engine::CrmEvent};

pub fn evaluate(conn: &Connection, event: CrmEvent) -> Result<(), AppError> {
    let (workspace_id, trigger_type) = match &event {
        CrmEvent::ActivityOutcome { workspace_id, .. } => (workspace_id.as_str(), "activity_outcome"),
        CrmEvent::DealStageChanged { workspace_id, .. } => (workspace_id.as_str(), "deal_stage_changed"),
    };

    let rules = automation_rule::get_active(conn, workspace_id, trigger_type)?;
    for rule in &rules {
        if matches_trigger(&rule.trigger_filter, &event) {
            execute_action(conn, &rule.action_type, &rule.action_params, &event)?;
        }
    }
    Ok(())
}

fn matches_trigger(filter_json: &str, event: &CrmEvent) -> bool {
    let Ok(filter) = serde_json::from_str::<serde_json::Value>(filter_json) else {
        return false;
    };
    match event {
        CrmEvent::ActivityOutcome { outcome, .. } => {
            filter.get("outcome").and_then(|v| v.as_str()) == Some(outcome.as_str())
        }
        CrmEvent::DealStageChanged { to_stage, .. } => {
            filter.get("to_stage").and_then(|v| v.as_str()) == Some(to_stage.as_str())
        }
    }
}

fn execute_action(
    conn: &Connection,
    action_type: &str,
    action_params: &str,
    event: &CrmEvent,
) -> Result<(), AppError> {
    let params: serde_json::Value =
        serde_json::from_str(action_params).unwrap_or(serde_json::Value::Object(Default::default()));

    let account_id = match event {
        CrmEvent::ActivityOutcome { account_id, .. } => account_id.as_str(),
        CrmEvent::DealStageChanged { account_id, .. } => account_id.as_str(),
    };

    match action_type {
        "update_lead_score" => {
            let delta = params["delta"].as_f64().unwrap_or(0.0);
            let factor = params["factor"].as_str().unwrap_or("unknown").to_string();
            update_lead_score(conn, account_id, &factor, delta)?;
        }
        "set_account_status" => {
            let status = params["status"].as_str().unwrap_or("aktiv").to_string();
            set_account_status(conn, account_id, &status)?;
        }
        "set_deal_stage" => {
            if let CrmEvent::DealStageChanged { deal_id, .. } = event {
                let stage = params["stage"].as_str().unwrap_or("").to_string();
                set_deal_stage(conn, deal_id, &stage)?;
            }
        }
        _ => {}
    }
    Ok(())
}

fn update_lead_score(
    conn: &Connection,
    account_id: &str,
    factor: &str,
    delta: f64,
) -> Result<(), AppError> {
    let current: String = conn
        .query_row(
            "SELECT COALESCE(score_factors, '{}') FROM accounts WHERE id = ?1",
            [account_id],
            |r| r.get(0),
        )
        .map_err(|e| AppError::Db(e.to_string()))?;

    let mut factors: serde_json::Map<String, serde_json::Value> =
        serde_json::from_str(&current).unwrap_or_default();

    let current_val = factors.get(factor).and_then(|v| v.as_f64()).unwrap_or(0.0);
    factors.insert(factor.to_string(), serde_json::json!(current_val + delta));

    let new_score: f64 = factors
        .values()
        .filter_map(|v| v.as_f64())
        .sum::<f64>()
        .clamp(0.0, 100.0);

    let factors_json = serde_json::to_string(&factors).unwrap_or_else(|_| "{}".to_string());
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE accounts SET score_factors = ?1, lead_score = ?2, updated_at = ?3 WHERE id = ?4",
        rusqlite::params![factors_json, new_score, now, account_id],
    )?;
    Ok(())
}

fn set_account_status(conn: &Connection, account_id: &str, status: &str) -> Result<(), AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE accounts SET status = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![status, now, account_id],
    )?;
    Ok(())
}

fn set_deal_stage(conn: &Connection, deal_id: &str, stage: &str) -> Result<(), AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE deals SET stage = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![stage, now, deal_id],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;
    use crate::db::{schema, migrations, automation_rule};
    use super::super::{CrmEvent, evaluate};

    fn setup_with_rules(workspace_id: &str) -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        schema::create_tables(&conn).unwrap();
        migrations::run(&conn).unwrap();
        let now = "2026-01-01T00:00:00Z";
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, kind, is_private, created_at, updated_at)
             VALUES ('acc-1', ?1, '', 'Test', 'company', 0, ?2, ?3)",
            rusqlite::params![workspace_id, now, now],
        ).unwrap();
        automation_rule::seed_defaults(&conn, workspace_id).unwrap();
        conn
    }

    #[test]
    fn activity_outcome_strong_interest_increases_score() {
        let conn = setup_with_rules("ws-1");
        evaluate(&conn, CrmEvent::ActivityOutcome {
            account_id: "acc-1".to_string(),
            workspace_id: "ws-1".to_string(),
            outcome: "strong_interest".to_string(),
        }).unwrap();
        let (score, factors): (f64, String) = conn.query_row(
            "SELECT lead_score, score_factors FROM accounts WHERE id = 'acc-1'",
            [], |r| Ok((r.get(0)?, r.get(1)?)),
        ).unwrap();
        assert_eq!(score, 25.0);
        assert!(factors.contains("strong_interest"));
    }

    #[test]
    fn deal_stage_won_updates_score_and_status() {
        let conn = setup_with_rules("ws-2");
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, kind, is_private, created_at, updated_at)
             VALUES ('acc-2', 'ws-2', '', 'Test2', 'company', 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO deals (id, workspace_id, account_id, title, stage, created_at, updated_at)
             VALUES ('deal-1', 'ws-2', 'acc-2', 'Deal', 'prospect', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        ).unwrap();
        evaluate(&conn, CrmEvent::DealStageChanged {
            account_id: "acc-2".to_string(),
            workspace_id: "ws-2".to_string(),
            deal_id: "deal-1".to_string(),
            from_stage: Some("prospect".to_string()),
            to_stage: "won".to_string(),
        }).unwrap();
        let (score, status): (f64, String) = conn.query_row(
            "SELECT lead_score, status FROM accounts WHERE id = 'acc-2'",
            [], |r| Ok((r.get(0)?, r.get(1)?)),
        ).unwrap();
        assert_eq!(score, 40.0);
        assert_eq!(status, "aktiv");
    }

    #[test]
    fn score_clamps_to_100() {
        let conn = setup_with_rules("ws-3");
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, kind, is_private, lead_score, score_factors, created_at, updated_at)
             VALUES ('acc-3', 'ws-3', '', 'Test3', 'company', 0, 90.0, '{\"existing\":90}', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        ).unwrap();
        evaluate(&conn, CrmEvent::ActivityOutcome {
            account_id: "acc-3".to_string(),
            workspace_id: "ws-3".to_string(),
            outcome: "deal_won".to_string(),
        }).unwrap();
        let score: f64 = conn.query_row(
            "SELECT lead_score FROM accounts WHERE id = 'acc-3'",
            [], |r| r.get(0),
        ).unwrap();
        assert_eq!(score, 100.0);
    }

    #[test]
    fn score_clamps_to_0() {
        let conn = setup_with_rules("ws-4");
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, kind, is_private, lead_score, score_factors, created_at, updated_at)
             VALUES ('acc-4', 'ws-4', '', 'Test4', 'company', 0, 5.0, '{\"existing\":5}', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        ).unwrap();
        evaluate(&conn, CrmEvent::ActivityOutcome {
            account_id: "acc-4".to_string(),
            workspace_id: "ws-4".to_string(),
            outcome: "deal_lost".to_string(),
        }).unwrap();
        let score: f64 = conn.query_row(
            "SELECT lead_score FROM accounts WHERE id = 'acc-4'",
            [], |r| r.get(0),
        ).unwrap();
        assert_eq!(score, 0.0);
    }

    #[test]
    fn disabled_rule_does_not_fire() {
        let conn = setup_with_rules("ws-5");
        conn.execute(
            "INSERT INTO accounts (id, workspace_id, created_by, name, kind, is_private, created_at, updated_at)
             VALUES ('acc-5', 'ws-5', '', 'Test5', 'company', 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        ).unwrap();
        conn.execute_batch(
            "UPDATE automation_rules SET is_active = 0 WHERE workspace_id = 'ws-5' AND trigger_type = 'activity_outcome'"
        ).unwrap();
        evaluate(&conn, CrmEvent::ActivityOutcome {
            account_id: "acc-5".to_string(),
            workspace_id: "ws-5".to_string(),
            outcome: "strong_interest".to_string(),
        }).unwrap();
        let score: f64 = conn.query_row(
            "SELECT lead_score FROM accounts WHERE id = 'acc-5'",
            [], |r| r.get(0),
        ).unwrap();
        assert_eq!(score, 0.0);
    }
}
