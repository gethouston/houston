use crate::provider_error_kind::ProviderError;
use serde::{Deserialize, Serialize};

/// Events parsed from Claude's `--output-format stream-json` NDJSON output.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClaudeEvent {
    #[serde(rename = "system")]
    System {
        subtype: Option<String>,
        session_id: Option<String>,
        #[serde(flatten)]
        extra: serde_json::Value,
    },
    #[serde(rename = "assistant")]
    Assistant {
        subtype: Option<String>,
        message: Option<AssistantMessage>,
        #[serde(flatten)]
        extra: serde_json::Value,
    },
    #[serde(rename = "user")]
    User {
        subtype: Option<String>,
        message: Option<UserMessage>,
        #[serde(flatten)]
        extra: serde_json::Value,
    },
    #[serde(rename = "result")]
    Result {
        subtype: Option<String>,
        result: Option<String>,
        is_error: Option<bool>,
        cost_usd: Option<f64>,
        duration_ms: Option<u64>,
        session_id: Option<String>,
        #[serde(flatten)]
        extra: serde_json::Value,
    },
    /// Streaming wrapper — Claude CLI wraps granular API events in this.
    #[serde(rename = "stream_event")]
    StreamEvent {
        event: StreamEventInner,
        session_id: Option<String>,
        #[serde(flatten)]
        extra: serde_json::Value,
    },
    /// Rate limit info — silently ignored.
    #[serde(rename = "rate_limit_event")]
    RateLimitEvent {
        #[serde(flatten)]
        extra: serde_json::Value,
    },
}

/// Inner event from a stream_event wrapper.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamEventInner {
    #[serde(rename = "type")]
    pub event_type: String,
    pub delta: Option<StreamDelta>,
    pub content_block: Option<ContentBlock>,
    #[serde(flatten)]
    pub extra: serde_json::Value,
}

/// Delta payload inside a content_block_delta stream event.
/// Note: `message_delta` events also have a `delta` but without a `type` field,
/// so `delta_type` must be optional.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamDelta {
    #[serde(rename = "type")]
    pub delta_type: Option<String>,
    pub text: Option<String>,
    pub partial_json: Option<String>,
    pub thinking: Option<String>,
    #[serde(flatten)]
    pub extra: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssistantMessage {
    pub content: Option<Vec<ContentBlock>>,
    #[serde(flatten)]
    pub extra: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserMessage {
    pub content: Option<serde_json::Value>,
    #[serde(flatten)]
    pub extra: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ContentBlock {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "thinking")]
    Thinking { thinking: Option<String> },
    #[serde(rename = "tool_use")]
    ToolUse {
        id: Option<String>,
        name: Option<String>,
        input: Option<serde_json::Value>,
    },
    #[serde(rename = "tool_result")]
    ToolResult {
        tool_use_id: Option<String>,
        content: Option<serde_json::Value>,
        is_error: Option<bool>,
    },
    #[serde(other)]
    Unknown,
}

/// Visible files created or modified during a session.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct FileChanges {
    pub created: Vec<String>,
    pub modified: Vec<String>,
}

impl FileChanges {
    pub fn is_empty(&self) -> bool {
        self.created.is_empty() && self.modified.is_empty()
    }
}

/// Runtime failure surfaced as an actionable, user-facing card.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolRuntimeErrorKind {
    LocalTool,
    ProviderProcess,
}

/// Processed feed items for rendering in the UI.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "feed_type", content = "data", rename_all = "snake_case")]
pub enum FeedItem {
    /// Text message from the assistant.
    AssistantText(String),
    /// Partial streaming text — replaces the last AssistantText in the feed.
    AssistantTextStreaming(String),
    /// Extended thinking — final content.
    Thinking(String),
    /// Extended thinking — streaming (accumulates progressively).
    ThinkingStreaming(String),
    /// Message from the user (follow-up prompt).
    UserMessage(String),
    /// A local/provider runtime failure. Details are diagnostic-only.
    ///
    /// Kept for LOCAL TOOL failures only (the codex_core exec_command
    /// path that fires for missing tools on the user's machine). For
    /// upstream provider failures, prefer the typed
    /// [`Self::ProviderError`] variant which carries actionable metadata.
    ToolRuntimeError {
        kind: ToolRuntimeErrorKind,
        details: String,
    },
    /// Typed provider failure (rate-limited, quota-exhausted, auth
    /// expired, ...). Replaces the historical
    /// `ToolRuntimeError { kind: ProviderProcess, ... }` blob with a
    /// discriminated union so the UI can render variant-specific cards
    /// and CTAs.
    ProviderError(ProviderError),
    /// Tool call made by the assistant.
    ToolCall {
        name: String,
        input: serde_json::Value,
    },
    /// Result of a tool call.
    ToolResult { content: String, is_error: bool },
    /// System message (session start, etc.).
    SystemMessage(String),
    /// Session completed — cost/duration summary.
    FinalResult {
        result: String,
        cost_usd: Option<f64>,
        duration_ms: Option<u64>,
    },
    /// Visible files created or changed during the session.
    FileChanges(FileChanges),
}

/// In-memory buffer for a live session's feed items.
/// Tracks how many items were trimmed from the front to enforce the cap.
#[derive(Default, Clone, PartialEq)]
pub struct SessionFeedBuffer {
    pub items: Vec<FeedItem>,
    /// Number of events dropped from the front of `items` to stay within FEED_CAP.
    pub dropped_count: usize,
}

/// Status of a Claude session.
#[derive(Debug, Clone, PartialEq)]
pub enum SessionStatus {
    Starting,
    Running,
    Completed,
    Error(String),
}
