//! Houston Engine wire protocol.
//!
//! Single source of truth for REST DTOs, the WebSocket envelope, error
//! codes, and the protocol version. Every client (desktop, mobile, CLI,
//! third-party) speaks this protocol to talk to `houston-engine`.

use houston_ui_events::HoustonEvent;
use serde::{Deserialize, Serialize};

/// Re-export the typed [`ProviderError`] taxonomy so every protocol
/// consumer (engine-server, ui/engine-client, third-party clients) can
/// import the wire shape from one place. The enum lives in
/// `houston-terminal-manager` because the per-provider classifiers
/// construct it; serialising it is the same JSON either way.
pub use houston_terminal_manager::{
    AuthFailureCause, ModelUnavailableReason, ProviderError, QuotaScope,
};

/// Protocol major version. Incremented on breaking changes.
pub const PROTOCOL_VERSION: u8 = 1;

/// Engine version string (matches the server crate's package version).
pub const ENGINE_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Header name for engine version on every response.
pub const HEADER_ENGINE_VERSION: &str = "X-Houston-Engine-Version";

/// Envelope for every WebSocket frame.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineEnvelope {
    /// Protocol version (currently 1).
    pub v: u8,
    /// Correlation id (client-chosen or server-chosen). UUID.
    pub id: String,
    /// Kind of frame.
    pub kind: EnvelopeKind,
    /// Unix epoch milliseconds when the frame was produced.
    pub ts: i64,
    /// Inner payload. Shape depends on `kind`.
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum EnvelopeKind {
    /// Server-push event (payload = `HoustonEvent` or `LagMarker`).
    Event,
    /// Client → server request (payload = `ClientRequest`).
    Req,
    /// Server → client response (payload = operation-specific).
    Res,
    /// Keep-alive. Payload empty object.
    Ping,
    /// Keep-alive reply. Payload empty object.
    Pong,
}

/// Client → server WebSocket request operations.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum ClientRequest {
    /// Subscribe to a list of topics.
    Sub { topics: Vec<String> },
    /// Unsubscribe from a list of topics.
    Unsub { topics: Vec<String> },
}

/// Emitted on the WS when the server drops events due to backpressure.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LagMarker {
    pub dropped: u64,
}

/// REST error body.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorBody {
    pub error: ErrorDetail,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorDetail {
    pub code: ErrorCode,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    Unauthorized,
    Forbidden,
    NotFound,
    BadRequest,
    Conflict,
    Internal,
    Unavailable,
    VersionMismatch,
}

/// Response for `GET /v1/health`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthResponse {
    pub status: &'static str,
    pub version: &'static str,
    pub protocol: u8,
}

/// Response for `GET /v1/version`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionResponse {
    pub engine: &'static str,
    pub protocol: u8,
    pub build: Option<String>,
}

// ─── Tracker integration (V1: Linear only) ──────────────────────────
//
// Provider-tagged from day one (forward-compatible — adding Jira /
// GitHub / Asana later is a value added to `TrackerProvider` and a
// new concrete engine crate; no URL or DTO migration).
//
// Spec: docs/specs/2026-05-23-tracker-integration.html

/// Project-tracker provider id. Lower-case wire string. V1 has only
/// `linear`; adding a new value requires a corresponding concrete
/// `engine/houston-<provider>` crate + capability declaration.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TrackerProvider {
    Linear,
}

impl TrackerProvider {
    /// Parse the URL-path form (`"linear"` → [`TrackerProvider::Linear`]).
    pub fn from_path_str(s: &str) -> Option<Self> {
        match s {
            "linear" => Some(Self::Linear),
            _ => None,
        }
    }

    /// Wire string form.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Linear => "linear",
        }
    }
}

/// Request body for `POST /v1/trackers/:provider/connect`.
///
/// The engine pulls `LINEAR_CLIENT_ID` / `LINEAR_CLIENT_SECRET` from
/// the surrounding env, OR the caller supplies them here (dev flow —
/// useful when the OAuth-app credentials are not yet packaged into a
/// release build).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackerConnectRequest {
    /// Absolute path of the Houston workspace this connection binds to.
    pub workspace_path: String,
    /// OAuth client id (defaults to env `LINEAR_CLIENT_ID`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client_id: Option<String>,
    /// OAuth client secret (defaults to env `LINEAR_CLIENT_SECRET`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client_secret: Option<String>,
}

/// Response from `POST /v1/trackers/:provider/connect`. The caller
/// opens `authorize_url` in the user's default browser; the engine
/// listens for the OAuth callback on its fixed loopback port and
/// completes the dance asynchronously. Caller polls `status` (or
/// subscribes to `tracker:<provider>:<workspace>` events when those
/// land in a follow-up).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackerConnectResponse {
    pub provider: TrackerProvider,
    pub authorize_url: String,
    /// CSRF token echoed back from Linear's redirect — surfaced for
    /// diagnostics only; the engine validates it internally.
    pub state: String,
    /// Localhost port where the engine listens for the OAuth callback.
    /// The Linear OAuth-app config MUST include
    /// `http://localhost:<port>/callback` as an allowed redirect URI.
    pub callback_port: u16,
}

/// Response from `GET /v1/trackers/:provider/status`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TrackerStatusResponse {
    pub provider: TrackerProvider,
    pub connected: bool,
    pub state: TrackerConnectionState,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub org_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub org_name: Option<String>,
    #[serde(default)]
    pub capabilities: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub connected_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_sync_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
}

/// Lifecycle of a tracker connection. Surfaced to UI to drive the
/// Connect/Connecting/Connected visual states.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TrackerConnectionState {
    /// No connection attempt has been made (no connection.json on disk).
    NotConnected,
    /// OAuth flow in flight — engine is listening on the callback port.
    Connecting,
    /// Token exchange succeeded; mirror is operational.
    Connected,
    /// Last attempt produced an error; UI surfaces `last_error`.
    Error,
}

/// One issue projected from the tracker into Houston's on-disk mirror.
/// Mirrors `ui/agent-schemas/src/tracker_issue.schema.json`. Wire shape
/// used by both the engine route response AND the on-disk persistence
/// in `engine/houston-linear/src/models.rs`.
///
/// `Eq` intentionally omitted — `estimate: Option<f64>` makes Eq invalid
/// (NaN != NaN). PartialEq is enough for tests and dedupe.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub struct TrackerIssue {
    pub provider: String,
    pub provider_id: String,
    pub identifier: String,
    pub title: String,
    pub description: Option<String>,
    pub state: String,
    /// Provider-native state category (Linear's WorkflowStateType:
    /// triage/backlog/unstarted/started/completed/canceled). Null on
    /// providers without typed state categories.
    pub state_type: Option<String>,
    pub priority: Option<i64>,
    pub estimate: Option<f64>,
    pub team_id: String,
    pub project_id: Option<String>,
    pub project_milestone_id: Option<String>,
    pub cycle_id: Option<String>,
    pub parent_id: Option<String>,
    pub assignee_id: Option<String>,
    /// Houston-side overlay — which Houston agent path this issue is
    /// routed to per the workspace's routing.json policy. Not synced
    /// to the provider.
    pub assigned_houston_agent_id: Option<String>,
    #[serde(default)]
    pub label_ids: Vec<String>,
    pub url: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
}

/// Response from `POST /v1/trackers/:provider/sync` — outcome of a
/// reconcile invocation.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case", tag = "kind")]
pub enum TrackerReconcileResponse {
    Synced {
        issues_seen: usize,
        pages_fetched: usize,
        cursor_advanced_to: Option<String>,
    },
    Skipped {
        reason: String,
    },
}

/// Response from `POST /v1/trackers/:provider/webhook?workspacePath=...` —
/// outcome of a single Linear webhook delivery.
///
/// The HTTP status is always 200 (per Linear's webhook spec — even
/// duplicates and verification failures get a 200, with the verdict
/// surfaced in the body). Sig + replay failures are logged engine-side
/// and surface here so the relay can distinguish "accepted" from
/// "rejected at the wall" for its own metrics.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum TrackerWebhookResponse {
    /// First time seen — projected + dispatched (downstream layers).
    Accepted { event_type: String, action: String },
    /// Same `webhookId` already on disk — no side effects.
    Duplicate,
    /// HMAC signature verification failed (wrong secret or tampered
    /// body). Engine logs the rejection; Linear still gets 200.
    BadSignature,
    /// `Linear-Timestamp` outside the replay window. Engine drops.
    ReplayWindowExceeded,
}

/// Helper: build an event envelope from a HoustonEvent.
pub fn event_envelope(event: &HoustonEvent) -> EngineEnvelope {
    EngineEnvelope {
        v: PROTOCOL_VERSION,
        id: uuid::Uuid::new_v4().to_string(),
        kind: EnvelopeKind::Event,
        ts: chrono::Utc::now().timestamp_millis(),
        payload: serde_json::to_value(event).unwrap_or(serde_json::Value::Null),
    }
}

/// Map a `HoustonEvent` to its WS topic.
///
/// Topics are the routing key clients subscribe to via `ClientRequest::Sub`.
/// Naming convention: `{category}:{id}` for scoped events, bare `{category}`
/// for singleton categories.
///
/// Session events (`FeedItem`, `SessionStatus`) route to `session:{session_key}`.
/// All other categories get a fixed topic so clients can choose what to hear.
pub fn event_topic(event: &HoustonEvent) -> String {
    match event {
        HoustonEvent::FeedItem { session_key, .. }
        | HoustonEvent::SessionStatus { session_key, .. } => format!("session:{session_key}"),
        HoustonEvent::AuthRequired { .. } => "auth".into(),
        HoustonEvent::Toast { .. } | HoustonEvent::CompletionToast { .. } => "toast".into(),
        HoustonEvent::EventReceived { .. } | HoustonEvent::EventProcessed { .. } => "events".into(),
        HoustonEvent::HeartbeatFired { .. } | HoustonEvent::CronFired { .. } => "scheduler".into(),
        HoustonEvent::RoutinesChanged { agent_path }
        | HoustonEvent::RoutineRunsChanged { agent_path } => format!("routines:{agent_path}"),
        HoustonEvent::ActivityChanged { agent_path }
        | HoustonEvent::SkillsChanged { agent_path }
        | HoustonEvent::FilesChanged { agent_path }
        | HoustonEvent::ConfigChanged { agent_path }
        | HoustonEvent::ContextChanged { agent_path }
        | HoustonEvent::LearningsChanged { agent_path } => format!("agent:{agent_path}"),
        HoustonEvent::ConversationsChanged { agent_path, .. } => format!("agent:{agent_path}"),
        HoustonEvent::ComposioCliReady
        | HoustonEvent::ComposioCliFailed { .. }
        | HoustonEvent::ComposioConnectionAdded { .. } => "composio".into(),
        HoustonEvent::ClaudeCliInstalling { .. }
        | HoustonEvent::ClaudeCliReady
        | HoustonEvent::ClaudeCliFailed { .. } => "claude".into(),
        HoustonEvent::PreferenceChanged { .. } => "preferences".into(),
        HoustonEvent::ProviderLoginUrl { .. } | HoustonEvent::ProviderLoginComplete { .. } => {
            "providers".into()
        }
    }
}

/// Whether a feed item is "low severity" — i.e. streaming deltas that can be
/// dropped under backpressure without breaking the conversation (because the
/// final non-streaming variant will follow).
pub fn is_low_severity_feed(item: &houston_terminal_manager::FeedItem) -> bool {
    matches!(
        item,
        houston_terminal_manager::FeedItem::AssistantTextStreaming(_)
            | houston_terminal_manager::FeedItem::ThinkingStreaming(_)
    )
}

/// Build a `LagMarker` event envelope suitable for sending on the WS.
pub fn lag_marker_envelope(dropped: u64) -> EngineEnvelope {
    EngineEnvelope {
        v: PROTOCOL_VERSION,
        id: uuid::Uuid::new_v4().to_string(),
        kind: EnvelopeKind::Event,
        ts: chrono::Utc::now().timestamp_millis(),
        payload: serde_json::json!({ "type": "Lag", "dropped": dropped }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn envelope_round_trip() {
        let e = EngineEnvelope {
            v: 1,
            id: "abc".into(),
            kind: EnvelopeKind::Ping,
            ts: 123,
            payload: serde_json::json!({}),
        };
        let s = serde_json::to_string(&e).unwrap();
        let d: EngineEnvelope = serde_json::from_str(&s).unwrap();
        assert_eq!(d.kind, EnvelopeKind::Ping);
    }

    #[test]
    fn error_code_serializes_screaming_snake() {
        let s = serde_json::to_string(&ErrorCode::NotFound).unwrap();
        assert_eq!(s, "\"NOT_FOUND\"");
    }

    #[test]
    fn client_request_sub() {
        let r: ClientRequest = serde_json::from_str(r#"{"op":"sub","topics":["a","b"]}"#).unwrap();
        matches!(r, ClientRequest::Sub { .. });
    }

    #[test]
    fn event_topic_session_scoped() {
        let ev = HoustonEvent::FeedItem {
            agent_path: "/a".into(),
            session_key: "k1".into(),
            item: houston_terminal_manager::FeedItem::AssistantText("hi".into()),
        };
        assert_eq!(event_topic(&ev), "session:k1");

        let ev = HoustonEvent::SessionStatus {
            agent_path: "/a".into(),
            session_key: "k1".into(),
            status: "running".into(),
            error: None,
        };
        assert_eq!(event_topic(&ev), "session:k1");
    }

    #[test]
    fn event_topic_singletons() {
        let ev = HoustonEvent::Toast {
            message: "x".into(),
            variant: "info".into(),
        };
        assert_eq!(event_topic(&ev), "toast");
        assert_eq!(event_topic(&HoustonEvent::ComposioCliReady), "composio");
    }

    #[test]
    fn low_severity_feed_detection() {
        use houston_terminal_manager::FeedItem;
        assert!(is_low_severity_feed(&FeedItem::AssistantTextStreaming(
            "x".into()
        )));
        assert!(is_low_severity_feed(&FeedItem::ThinkingStreaming(
            "x".into()
        )));
        assert!(!is_low_severity_feed(&FeedItem::AssistantText("x".into())));
    }
}
