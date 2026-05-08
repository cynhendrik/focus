use thiserror::Error;

#[derive(Debug, Error, serde::Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum AppError {
    #[error("DB error: {0}")]
    Db(String),
    #[error("IO error: {0}")]
    Io(String),
    #[error("IMAP error: {0}")]
    Imap(String),
    #[error("Auth error: {0}")]
    Auth(String),
    #[error("Not found: {0}")]
    NotFound(String),
    #[error("Validation: {0}")]
    Validation(String),
    #[error("External API error: {0}")]
    ExternalApi(String),
}

impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self {
        AppError::Db(e.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Io(e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn error_serializes_with_kind_tag() {
        let err = AppError::Db("connection failed".to_string());
        let json = serde_json::to_value(&err).unwrap();
        assert_eq!(json["kind"], "Db");
        assert_eq!(json["message"], "connection failed");
    }

    #[test]
    fn rusqlite_error_converts_to_app_error() {
        let sqlite_err = rusqlite::Error::InvalidPath("test".into());
        let app_err: AppError = sqlite_err.into();
        assert!(matches!(app_err, AppError::Db(_)));
    }
}
