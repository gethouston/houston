use serde::Serialize;

/// Deliberately does not implement Debug: both credentials remain local secrets.
pub struct BridgeConfig {
    pub connect_url: String,
    pub ticket: String,
    pub target_base_url: String,
    pub model: String,
    pub local_api_key: Option<String>,
}
#[derive(Clone, Debug, Serialize, thiserror::Error, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BridgeError {
    #[error("Invalid local model address")]
    InvalidTarget,
    #[error("Invalid bridge configuration")]
    InvalidConfig,
    #[error("Bridge connection failed")]
    Connection,
    #[error("Invalid bridge protocol")]
    Protocol,
    #[error("Bridge operation timed out")]
    Timeout,
    #[error("Bridge session expired")]
    Expired,
    #[error("Bridge is disconnected")]
    Closed,
}
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum BridgeStatus {
    #[serde(rename_all = "camelCase")]
    Online {
        generation: u64,
        session_expires_at: String,
    },
    #[serde(rename_all = "camelCase")]
    Renewed {
        session_expires_at: String,
    },
    Draining,
    ModelUnavailable,
    Offline {
        error: Option<BridgeError>,
    },
}
