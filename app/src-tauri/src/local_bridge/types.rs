use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Identity {
    pub environment: String,
    pub user_id: String,
    pub org_id: String,
    pub agent_id: String,
}
impl Identity {
    pub fn key(&self, category: &str) -> Result<String, String> {
        let url =
            reqwest::Url::parse(&self.environment).map_err(|_| "Invalid bridge environment")?;
        if !matches!(url.scheme(), "https" | "http")
            || url.host_str().is_none()
            || !url.username().is_empty()
            || url.password().is_some()
            || url.query().is_some()
            || url.fragment().is_some()
            || [&self.user_id, &self.org_id, &self.agent_id]
                .iter()
                .any(|v| v.is_empty() || v.len() > 256)
        {
            return Err("Invalid bridge identity".into());
        }
        let scope = if category == "device" {
            serde_json::to_vec(&(&self.environment, &self.user_id, &self.org_id))
        } else {
            serde_json::to_vec(self)
        }
        .map_err(|_| "Invalid bridge identity")?;
        Ok(format!(
            "local-bridge-v1-{category}-{:x}",
            Sha256::digest(scope)
        ))
    }
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Device {
    pub device_id: uuid::Uuid,
    pub device_secret: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Journal {
    pub version: u8,
    pub identity: Identity,
    pub idempotency_key: uuid::Uuid,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub migration: Option<bool>,
    pub phase: Phase,
    pub input: Input,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub descriptor: Option<Descriptor>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    Prepared,
    Registered,
    Ready,
    Committed,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Input {
    pub target_base_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub app_name: Option<String>,
    pub model: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_window: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shared: Option<bool>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Descriptor {
    pub bridge_id: uuid::Uuid,
    pub device_id: uuid::Uuid,
    pub org_id: String,
    pub user_id: String,
    pub model: String,
    pub shared: bool,
    pub revision: u64,
    pub base_url: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StartArgs {
    pub identity: Identity,
    pub bridge_id: uuid::Uuid,
    pub connect_url: String,
    pub ticket: String,
    pub target_base_url: String,
    pub model: String,
    pub local_api_key: Option<String>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartResult {
    pub generation: u64,
    pub session_expires_at: String,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub bridge_id: uuid::Uuid,
    pub identity: Identity,
    pub generation: u64,
    pub status: StatusKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_expires_at: Option<String>,
}
#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum StatusKind {
    Disabled,
    Connecting,
    Online,
    Reconnecting,
    ModelUnavailable,
}
impl StartArgs {
    pub fn validate_connect_origin(&self) -> Result<(), String> {
        let environment = reqwest::Url::parse(&self.identity.environment)
            .map_err(|_| "Invalid bridge environment")?;
        let connect = reqwest::Url::parse(&self.connect_url)
            .map_err(|_| "Invalid bridge connection address")?;
        let scheme = if environment.scheme() == "https" {
            "wss"
        } else {
            "ws"
        };
        let path = format!(
            "{}/v1/local-model-bridges/{}/connect",
            environment.path().trim_end_matches('/'),
            self.bridge_id
        );
        if connect.scheme() != scheme
            || connect.host_str() != environment.host_str()
            || connect.port_or_known_default() != environment.port_or_known_default()
            || connect.path() != path
            || connect.query().is_some()
            || connect.fragment().is_some()
            || !connect.username().is_empty()
            || connect.password().is_some()
        {
            return Err(
                "Bridge connection address does not match the signed-in environment".into(),
            );
        }
        Ok(())
    }
}
