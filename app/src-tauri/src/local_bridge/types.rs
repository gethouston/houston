//! Wire types for the local-bridge commands and the `local-bridge-status`
//! event. Kept in their own module so `mod.rs` stays focused on mechanics.

use serde::Serialize;

/// Bridge connection state. Serializes lowercase to match the pinned `status`
/// values (`online` | `offline` | `connecting` | `error`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum BridgeStatusKind {
    Online,
    Offline,
    Connecting,
    Error,
}

/// The last status we stored, used to de-dupe repeated event emissions.
#[derive(Clone, PartialEq)]
pub(super) struct StoredStatus {
    pub(super) kind: BridgeStatusKind,
    pub(super) detail: Option<String>,
}

/// `{ status, detail? }` — the `local_bridge_status` return AND the
/// `local-bridge-status` event payload.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeStatusPayload {
    pub status: BridgeStatusKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

/// `start`/`reconnect` result: `{ publicUrl, localProxyPort, proxyKey }`.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartBridgeResult {
    pub public_url: String,
    pub local_proxy_port: u16,
    pub proxy_key: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_serializes_lowercase_without_detail() {
        let json = serde_json::to_string(&BridgeStatusPayload {
            status: BridgeStatusKind::Online,
            detail: None,
        })
        .unwrap();
        assert_eq!(json, r#"{"status":"online"}"#);
    }

    #[test]
    fn start_result_serializes_camel_case() {
        let json = serde_json::to_string(&StartBridgeResult {
            public_url: "https://x.tunnels.gethouston.ai".to_string(),
            local_proxy_port: 5555,
            proxy_key: "deadbeef".to_string(),
        })
        .unwrap();
        assert!(json.contains("\"publicUrl\":\"https://x.tunnels.gethouston.ai\""));
        assert!(json.contains("\"localProxyPort\":5555"));
        assert!(json.contains("\"proxyKey\":\"deadbeef\""));
    }
}
