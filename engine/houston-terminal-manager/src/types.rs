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
        /// Cumulative-turn token usage on the terminal event. Used as a
        /// fallback when no assistant message carried per-request usage.
        usage: Option<ClaudeUsageRaw>,
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
    /// Per-request token usage Anthropic attaches to each assistant message.
    /// The final assistant message of a turn reports the full prompt size of
    /// the last API request — i.e. how much of the context window was used.
    pub usage: Option<ClaudeUsageRaw>,
    #[serde(flatten)]
    pub extra: serde_json::Value,
}

/// Raw Anthropic `usage` block, as it appears on `assistant` messages and
/// the terminal `result` event. Fields default to 0 when absent so an older
/// CLI that omits a key (e.g. no cache fields) still deserializes. Normalized
/// into the provider-agnostic [`TokenUsage`] before it reaches the feed.
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
pub struct ClaudeUsageRaw {
    #[serde(default)]
    pub input_tokens: u64,
    #[serde(default)]
    pub cache_creation_input_tokens: u64,
    #[serde(default)]
    pub cache_read_input_tokens: u64,
    #[serde(default)]
    pub output_tokens: u64,
}

impl ClaudeUsageRaw {
    /// Collapse Anthropic's four-way split into the shared [`TokenUsage`].
    ///
    /// Anthropic reports `input_tokens` as the NON-cached fresh input only;
    /// `cache_read_input_tokens` and `cache_creation_input_tokens` are the
    /// cached-reuse and cache-write portions. All three occupy the context
    /// window, so the prompt size = their sum. (Contrast Codex, whose
    /// `input_tokens` is already the cache-inclusive total.)
    pub fn normalize(&self) -> TokenUsage {
        TokenUsage {
            context_tokens: self.input_tokens
                + self.cache_creation_input_tokens
                + self.cache_read_input_tokens,
            output_tokens: self.output_tokens,
            cached_tokens: self.cache_read_input_tokens,
        }
    }
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

/// Provider-agnostic token usage for a completed turn, normalized from each
/// provider's native `usage` shape (Anthropic's four-way cache split, Codex's
/// cache-inclusive totals, ...). Drives the chat context-usage indicator.
///
/// `context_tokens` is the headline number: the size of the prompt on the
/// most recent model request, i.e. how much of the context window is in use.
/// `cached_tokens` (a subset of `context_tokens`) and `output_tokens` are
/// informational detail for the dialog.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct TokenUsage {
    pub context_tokens: u64,
    pub output_tokens: u64,
    pub cached_tokens: u64,
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
    /// Provider rejected the configured model for this account (e.g. OpenAI
    /// returns 400 "model is not supported when using Codex with a ChatGPT
    /// account" for `gpt-5.5-codex` on plans that don't include it). The
    /// UI renders a dedicated card with a "Switch to GPT-5.5" action.
    ProviderModelUnsupported,
}

/// Why a context-compaction boundary was recorded.
///
/// `Native` — the provider CLI compacted its own transcript on its own
/// schedule (Claude Code's `compact_boundary` system event as it nears the
/// context window). `Proactive` — Houston forced a summarize-and-reseed at the
/// user's configured threshold, before the CLI would have. In both cases the
/// user's visible `chat_feed` is untouched; only the agent's working context
/// shrinks.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CompactTrigger {
    Native,
    Proactive,
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
    /// A context-compaction boundary. The conversation's earlier turns were
    /// summarized to free context — either by the provider CLI itself
    /// (`Native`) or by Houston's proactive reseed (`Proactive`). Rendered as
    /// a subtle divider; the full chat history above and below stays visible.
    /// `pre_tokens` is how full the context was just before compaction, when
    /// the provider reports it.
    ContextCompacted {
        trigger: CompactTrigger,
        // Plain `Option` (serializes as `null` when absent), matching the
        // `FinalResult { usage }` convention so the live event and the
        // persisted `chat_feed` row share one shape. `default` keeps an older
        // row that predates the field deserializable.
        #[serde(default)]
        pre_tokens: Option<u64>,
    },
    /// Session completed — cost/duration summary.
    FinalResult {
        result: String,
        cost_usd: Option<f64>,
        duration_ms: Option<u64>,
        /// Normalized token usage for the turn, when the provider reported it.
        /// Feeds the chat context-usage indicator; `None` for providers that
        /// don't surface usage yet.
        usage: Option<TokenUsage>,
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
