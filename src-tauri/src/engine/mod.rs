pub mod rules;

use rusqlite::Connection;
use crate::AppError;

pub enum CrmEvent {
    ActivityOutcome {
        account_id:   String,
        workspace_id: String,
        outcome:      String,
    },
    DealStageChanged {
        account_id:   String,
        workspace_id: String,
        deal_id:      String,
        to_stage:     String,
    },
}

pub fn evaluate(conn: &Connection, event: CrmEvent) -> Result<(), AppError> {
    rules::evaluate(conn, event)
}
