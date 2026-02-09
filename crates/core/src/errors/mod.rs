//! Error types and Result alias for the Rugplay bot

use thiserror::Error;

/// Main error type for the Rugplay bot
#[derive(Error, Debug)]
pub enum Error {
    #[error("Authentication failed: {0}")]
    AuthenticationError(String),

    #[error("Session token expired")]
    TokenExpired,

    #[error("API request failed: {0}")]
    ApiError(String),

    #[error("Network error: {0}")]
    NetworkError(String),

    #[error("Database error: {0}")]
    DatabaseError(String),

    #[error("Encryption error: {0}")]
    EncryptionError(String),

    #[error("Invalid data: {0}")]
    InvalidData(String),

    #[error("Insufficient funds: required {required}, available {available}")]
    InsufficientFunds { required: f64, available: f64 },

    #[error("Trade failed: {0}")]
    TradeError(String),

    #[error("Profile not found: {0}")]
    ProfileNotFound(i64),

    #[error("Unknown error: {0}")]
    Unknown(String),
}

/// Result type alias using our Error
pub type Result<T> = std::result::Result<T, Error>;

impl From<reqwest::Error> for Error {
    fn from(err: reqwest::Error) -> Self {
        Error::NetworkError(err.to_string())
    }
}

impl From<serde_json::Error> for Error {
    fn from(err: serde_json::Error) -> Self {
        Error::InvalidData(err.to_string())
    }
}
