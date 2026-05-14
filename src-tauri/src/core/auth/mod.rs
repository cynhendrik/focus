use std::sync::{Arc, Mutex};

#[derive(Clone, Default)]
pub struct SyncState {
    pub token: Arc<Mutex<Option<String>>>,
    pub supabase_url: String,
    pub anon_key: String,
}

impl SyncState {
    pub fn new() -> Self {
        SyncState {
            token: Arc::new(Mutex::new(None)),
            supabase_url: option_env!("SUPABASE_URL").unwrap_or("").to_string(),
            anon_key: option_env!("SUPABASE_ANON_KEY").unwrap_or("").to_string(),
        }
    }

    pub fn set_token(&self, token: String) {
        *self.token.lock().unwrap() = Some(token);
    }

    pub fn get_token(&self) -> Option<String> {
        self.token.lock().unwrap().clone()
    }
}

#[tauri::command]
pub fn set_auth_token(
    token: String,
    state: tauri::State<'_, SyncState>,
) -> Result<(), String> {
    state.set_token(token);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sync_state_set_and_get_token() {
        let state = SyncState::new();
        assert!(state.get_token().is_none());
        state.set_token("test-jwt-123".to_string());
        assert_eq!(state.get_token(), Some("test-jwt-123".to_string()));
    }

    #[test]
    fn sync_state_clone_shares_token() {
        let state = SyncState::new();
        let clone = state.clone();
        state.set_token("shared-token".to_string());
        assert_eq!(clone.get_token(), Some("shared-token".to_string()));
    }
}
