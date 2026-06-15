use std::collections::HashMap;

use super::provider::anthropic_classify;
use super::provider_error_kind::{truncate_excerpt, ProviderError};
use super::types::{
    AssistantMessage, ClaudeEvent, CompactTrigger, ContentBlock, FeedItem, TokenUsage, UserMessage,
};

const ANTHROPIC: &str = "anthropic";

/// Accumulates stream_event fragments across multiple lines.
/// Text deltas are accumulated into a running buffer and emitted progressively.
/// Tool inputs are accumulated and emitted on content_block_stop.
#[derive(Debug, Default)]
pub struct StreamAccumulator {
    /// In-progress tool_use blocks keyed by content block index.
    tools: HashMap<u64, InProgressTool>,
    /// Accumulated text across all text content blocks.
    text_buffer: String,
    /// Accumulated thinking across all thinking content blocks.
    thinking_buffer: String,
    /// Token usage from the most recent (non-partial) assistant message.
    /// The last assistant message of a turn carries the full prompt size of
    /// the final API request, so this is the authoritative context-window
    /// reading. Attached to `FinalResult` when the turn's `result` arrives.
    ///
    /// A `StreamAccumulator` is recreated per subprocess (see
    /// `session_io::read_claude_stdout`), and Claude runs one process per
    /// turn, so this never carries a stale reading into a later turn — the
    /// success path also `.take()`s it for hygiene.
    last_usage: Option<TokenUsage>,
}

#[derive(Debug)]
struct InProgressTool {
    name: String,
    json_parts: Vec<String>,
}

impl StreamAccumulator {
    pub fn new() -> Self {
        Self::default()
    }

    /// Handle a stream event, returning any completed FeedItems.
    fn handle(&mut self, inner: super::types::StreamEventInner) -> Vec<FeedItem> {
        let index = inner
            .extra
            .get("index")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);

        match inner.event_type.as_str() {
            "content_block_start" => {
                if let Some(ContentBlock::ToolUse {
                    name: Some(name), ..
                }) = inner.content_block
                {
                    // Emit an immediate ToolCall so the UI shows activity right away.
                    // A second ToolCall with full input comes on content_block_stop.
                    let item = FeedItem::ToolCall {
                        name: name.clone(),
                        input: serde_json::Value::Null,
                    };
                    self.tools.insert(
                        index,
                        InProgressTool {
                            name,
                            json_parts: Vec::new(),
                        },
                    );
                    return vec![item];
                }
                vec![]
            }
            "content_block_delta" => {
                if let Some(delta) = inner.delta {
                    match delta.delta_type.as_deref() {
                        Some("text_delta") => {
                            if let Some(text) = delta.text {
                                if !text.is_empty() {
                                    self.text_buffer.push_str(&text);
                                    return vec![FeedItem::AssistantTextStreaming(
                                        self.text_buffer.clone(),
                                    )];
                                }
                            }
                        }
                        Some("thinking_delta") => {
                            if let Some(thinking) = delta.thinking {
                                if !thinking.is_empty() {
                                    self.thinking_buffer.push_str(&thinking);
                                    return vec![FeedItem::ThinkingStreaming(
                                        self.thinking_buffer.clone(),
                                    )];
                                }
                            }
                        }
                        Some("input_json_delta") => {
                            if let Some(partial) = delta.partial_json {
                                if let Some(tool) = self.tools.get_mut(&index) {
                                    tool.json_parts.push(partial);
                                }
                            }
                        }
                        Some("signature_delta") => {
                            // Signature verification — internal, ignore.
                        }
                        Some(other) => {
                            tracing::warn!("[houston:parser] unhandled delta type: {other}");
                        }
                        None => {
                            // message_delta events have no type — expected, ignore.
                        }
                    }
                }
                vec![]
            }
            "content_block_stop" => {
                // Finalize a tool_use block.
                if let Some(tool) = self.tools.remove(&index) {
                    let json_str: String = tool.json_parts.concat();
                    let input = serde_json::from_str(&json_str).unwrap_or(serde_json::Value::Null);
                    return vec![FeedItem::ToolCall {
                        name: tool.name,
                        input,
                    }];
                }
                // Finalize a thinking block.
                if !self.thinking_buffer.is_empty() {
                    let thinking = std::mem::take(&mut self.thinking_buffer);
                    return vec![FeedItem::Thinking(thinking)];
                }
                vec![]
            }
            // message_start, message_stop, message_delta — internal.
            _ => vec![],
        }
    }
}

/// Parse a single line of NDJSON from Claude's stream-json output into FeedItems.
/// Pass a StreamAccumulator to reassemble tool inputs from stream_event fragments.
pub fn parse_event(line: &str, acc: &mut StreamAccumulator) -> Vec<FeedItem> {
    let line = line.trim();
    if line.is_empty() {
        return vec![];
    }

    let event: ClaudeEvent = match serde_json::from_str(line) {
        Ok(e) => e,
        Err(e) => {
            tracing::error!("Failed to parse Claude event: {e}\nLine: {line}");
            return vec![];
        }
    };

    match event {
        ClaudeEvent::System { subtype, extra, .. } => {
            parse_system_event(subtype.as_deref(), &extra)
        }
        ClaudeEvent::Assistant {
            subtype, message, ..
        } => {
            // Clear buffers when a final assistant message arrives —
            // the message contains the complete content, and any subsequent
            // streaming turn should start fresh.
            if subtype.as_deref() != Some("partial") {
                acc.text_buffer.clear();
                acc.thinking_buffer.clear();
                // Capture this request's usage. Later assistant messages in
                // the same turn overwrite it, so the final one wins —
                // exactly the context-window size we want to report.
                if let Some(usage) = message.as_ref().and_then(|m| m.usage) {
                    acc.last_usage = Some(usage.normalize());
                }
            }
            parse_assistant_event(subtype.as_deref(), message)
        }
        ClaudeEvent::User { message, .. } => parse_user_event(message),
        ClaudeEvent::Result {
            subtype,
            result,
            is_error,
            api_error_status,
            cost_usd,
            duration_ms,
            usage: result_usage,
            ..
        } => {
            if subtype.as_deref() == Some("error") || is_error == Some(true) {
                // Route through the typed classifier so the frontend
                // gets a real `ProviderError` card instead of a generic
                // `SystemMessage("Error: ...")` toast. The classifier
                // can promote known patterns (auth, quota, internal) to
                // dedicated variants; everything else falls through to
                // `Unknown` so the user gets a "Report bug" CTA rather
                // than a dead-end string.
                let message = result.unwrap_or_else(|| "Unknown error".to_string());
                let subtype_str = subtype.as_deref().unwrap_or("error");
                // Prefer the authoritative `api_error_status` HTTP code
                // (e.g. 429) over the human `result` text. claude-code sets
                // `is_error:true` with `api_error_status:429` but `subtype`
                // can still be `"success"` and the `result` string often
                // omits the word "rate limit" — so text matching alone
                // misfiles a throttle as `Unknown`. Fall back to text
                // classification when the code is absent/unrecognised, then
                // to `Unknown` (always a Report-bug CTA, never a dead end).
                let typed = api_error_status
                    .and_then(|status| {
                        anthropic_classify::classify_api_error_status(status, &message)
                    })
                    .or_else(|| anthropic_classify::classify_result_error(subtype_str, &message))
                    .unwrap_or_else(|| ProviderError::Unknown {
                        provider: ANTHROPIC.into(),
                        raw_excerpt: truncate_excerpt(&message),
                    });
                return vec![FeedItem::ProviderError(typed)];
            }
            // Prefer the per-request usage captured from the last assistant
            // message (the true context-window size); fall back to the
            // terminal event's own usage block when no assistant message
            // carried one.
            let usage = acc
                .last_usage
                .take()
                .or_else(|| result_usage.map(|u| u.normalize()));
            vec![FeedItem::FinalResult {
                result: result.unwrap_or_default(),
                cost_usd,
                duration_ms,
                usage,
            }]
        }
        ClaudeEvent::StreamEvent { event: inner, .. } => acc.handle(inner),
        ClaudeEvent::RateLimitEvent { extra } => parse_rate_limit_event(extra),
    }
}

/// Parse Claude's `rate_limit_event` into a typed [`ProviderError`].
///
/// Replaces the historical silent drop. The CLI emits these events when
/// the Anthropic API throttles the request — `rate_limit_info.status` is
/// `"allowed"` for routine heartbeat events (no UI needed) and one of
/// `"rate_limited"` / `"throttled"` / `"queued"` when the user should be
/// told to wait. We only emit a feed item for the throttled cases so a
/// healthy stream stays quiet.
fn parse_rate_limit_event(extra: serde_json::Value) -> Vec<FeedItem> {
    let info = extra.get("rate_limit_info").unwrap_or(&extra);
    let status = info.get("status").and_then(|v| v.as_str()).unwrap_or("");
    if status.is_empty() || status == "allowed" {
        return vec![];
    }
    let retry_after_seconds = info
        .get("reset_in_seconds")
        .or_else(|| info.get("retry_after_seconds"))
        .or_else(|| info.get("retry_after"))
        .and_then(|v| v.as_u64())
        .and_then(|n| u32::try_from(n).ok());
    let message = info
        .get("message")
        .and_then(|v| v.as_str())
        .map(truncate_excerpt)
        .unwrap_or_else(|| {
            format!("Anthropic rate-limit signal: {status}")
        });
    vec![FeedItem::ProviderError(ProviderError::RateLimited {
        provider: ANTHROPIC.into(),
        model: None,
        retry_after_seconds,
        message,
    })]
}

/// Parse Claude's `system` events. Most are internal (`init`, `api_retry`,
/// `plugin_install`) and produce nothing. The one we surface is
/// `compact_boundary`: Claude Code auto-compacts its own transcript as it
/// nears the context window and emits this marker. We lift it to a
/// [`FeedItem::ContextCompacted`] (trigger `Native`) so the UI can show a
/// subtle divider — the user's visible chat is untouched; only the agent's
/// working context shrank.
///
/// Verified against Claude Code 2.1.160: the wire line is a top-level
/// `{"type":"system","subtype":"compact_boundary","session_id":...,"uuid":...,
/// "compact_metadata":{"trigger":"auto"|"manual","pre_tokens":N,...}}`.
/// `compact_metadata` lands in the flattened `extra`. We read leniently
/// (number-or-string `pre_tokens`) so a casing/format shift doesn't crash.
fn parse_system_event(subtype: Option<&str>, extra: &serde_json::Value) -> Vec<FeedItem> {
    if subtype != Some("compact_boundary") {
        return vec![];
    }
    let pre_tokens = extra
        .get("compact_metadata")
        .and_then(|m| m.get("pre_tokens").or_else(|| m.get("preTokens")))
        .and_then(json_u64)
        .or_else(|| {
            extra
                .get("pre_tokens")
                .or_else(|| extra.get("preTokens"))
                .and_then(json_u64)
        });
    vec![FeedItem::ContextCompacted {
        trigger: CompactTrigger::Native,
        pre_tokens,
    }]
}

/// Read a JSON value as a `u64`, tolerating a numeric string (some Claude
/// telemetry paths stringify token counts).
fn json_u64(v: &serde_json::Value) -> Option<u64> {
    v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))
}

fn parse_assistant_event(
    subtype: Option<&str>,
    message: Option<AssistantMessage>,
) -> Vec<FeedItem> {
    let is_partial = subtype == Some("partial");
    let Some(msg) = message else {
        return vec![];
    };
    let Some(content) = msg.content else {
        return vec![];
    };

    let mut items = Vec::new();
    for block in content {
        match block {
            ContentBlock::Text { text } => {
                if !text.is_empty() {
                    if is_partial {
                        items.push(FeedItem::AssistantTextStreaming(text));
                    } else {
                        items.push(FeedItem::AssistantText(text));
                    }
                }
            }
            // Thinking and tool_use are already delivered live by the streaming
            // path (`StreamAccumulator::handle`): with `--include-partial-messages`
            // always on (see `claude_command.rs`), every tool_use streams as a
            // content_block_start (null input) + content_block_stop (full input)
            // pair, and every thinking block is finalized at content_block_stop.
            // This non-partial `assistant` event is a COMPLETE SNAPSHOT of the
            // turn, so re-emitting those blocks here duplicated every tool call
            // (and would duplicate every thinking block) in the feed — HOU-472.
            // The committed final text (handled above) is the one thing the
            // streaming path never emits, so it stays. tool_result keeps its own
            // arm below: it is not a streamed content_block — Anthropic delivers
            // tool results as separate user-role events (`parse_user_event`).
            ContentBlock::Thinking { .. } | ContentBlock::ToolUse { .. } => {}
            ContentBlock::ToolResult {
                content, is_error, ..
            } => {
                let text = match content {
                    Some(serde_json::Value::String(s)) => s,
                    Some(v) => serde_json::to_string_pretty(&v).unwrap_or_default(),
                    None => String::new(),
                };
                items.push(FeedItem::ToolResult {
                    content: text,
                    is_error: is_error.unwrap_or(false),
                });
            }
            ContentBlock::Unknown => {}
        }
    }
    items
}

/// Parse tool_result blocks from User events.
///
/// In the Anthropic API, tool results are user-role messages. Claude CLI's
/// stream-json format emits these as `{"type":"user","message":{...}}`.
/// We extract ToolResult items so consumers can detect MCP tool completions.
fn parse_user_event(message: Option<UserMessage>) -> Vec<FeedItem> {
    let Some(msg) = message else {
        return vec![];
    };
    let Some(content_val) = msg.content else {
        return vec![];
    };

    // content is serde_json::Value — try to deserialize as Vec<ContentBlock>.
    let blocks: Vec<ContentBlock> = match serde_json::from_value(content_val) {
        Ok(b) => b,
        Err(_) => return vec![],
    };

    let mut items = Vec::new();
    for block in blocks {
        if let ContentBlock::ToolResult {
            content, is_error, ..
        } = block
        {
            let text = match content {
                Some(serde_json::Value::String(s)) => s,
                Some(v) => serde_json::to_string_pretty(&v).unwrap_or_default(),
                None => String::new(),
            };
            items.push(FeedItem::ToolResult {
                content: text,
                is_error: is_error.unwrap_or(false),
            });
        }
    }
    items
}

/// Extract the session ID from any event line.
pub fn extract_session_id(line: &str) -> Option<String> {
    let event: ClaudeEvent = serde_json::from_str(line.trim()).ok()?;
    match event {
        ClaudeEvent::System { session_id, .. } => session_id,
        ClaudeEvent::Result { session_id, .. } => session_id,
        ClaudeEvent::StreamEvent { session_id, .. } => session_id,
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn acc() -> StreamAccumulator {
        StreamAccumulator::new()
    }

    #[test]
    fn parse_system_event() {
        let line = r#"{"type":"system","subtype":"init","session_id":"abc-123"}"#;
        let items = parse_event(line, &mut acc());
        assert!(items.is_empty(), "system events produce no feed items");
        assert_eq!(extract_session_id(line), Some("abc-123".to_string()));
    }

    #[test]
    fn parse_result_error_routes_auth_through_typed_classifier() {
        // Pre-fix: this emitted FeedItem::SystemMessage("Error: Claude
        // Code is not authenticated...") which the user couldn't act on.
        // Post-fix: classify_result_error sees the auth phrasing in the
        // result body and promotes it to ProviderError::Unauthenticated,
        // so the frontend renders the reconnect card.
        let line = r#"{"type":"result","subtype":"error","is_error":true,"result":"Claude Code is not authenticated. Run claude auth login"}"#;
        let items = parse_event(line, &mut acc());
        assert_eq!(items.len(), 1);
        match &items[0] {
            FeedItem::ProviderError(ProviderError::Unauthenticated { provider, .. }) => {
                assert_eq!(provider, "anthropic");
            }
            other => panic!("expected Unauthenticated, got {other:?}"),
        }
    }

    #[test]
    fn parse_compact_boundary_emits_context_compacted() {
        // Verbatim shape from Claude Code 2.1.160's stream-json output: a
        // top-level `system` event whose `compact_metadata` carries the
        // pre-compaction token count. We surface it as a Native marker.
        let line = r#"{"type":"system","subtype":"compact_boundary","session_id":"s1","uuid":"u1","compact_metadata":{"trigger":"auto","pre_tokens":185000,"post_tokens":42000,"duration_ms":1200}}"#;
        let items = parse_event(line, &mut acc());
        assert_eq!(items.len(), 1);
        match &items[0] {
            FeedItem::ContextCompacted {
                trigger,
                pre_tokens,
            } => {
                assert_eq!(*trigger, CompactTrigger::Native);
                assert_eq!(*pre_tokens, Some(185_000));
            }
            other => panic!("expected ContextCompacted, got {other:?}"),
        }
    }

    #[test]
    fn parse_compact_boundary_tolerates_missing_metadata() {
        // A future/variant shape without compact_metadata still produces the
        // marker (pre_tokens unknown) rather than crashing or going silent.
        let line = r#"{"type":"system","subtype":"compact_boundary","session_id":"s1","uuid":"u1"}"#;
        let items = parse_event(line, &mut acc());
        assert_eq!(items.len(), 1);
        assert!(matches!(
            &items[0],
            FeedItem::ContextCompacted {
                trigger: CompactTrigger::Native,
                pre_tokens: None,
            }
        ));
    }

    #[test]
    fn parse_assistant_text() {
        let line =
            r#"{"type":"assistant","message":{"content":[{"type":"text","text":"Hello world"}]}}"#;
        let items = parse_event(line, &mut acc());
        assert_eq!(items.len(), 1);
        assert!(matches!(&items[0], FeedItem::AssistantText(t) if t == "Hello world"));
    }

    #[test]
    fn parse_assistant_streaming() {
        let line = r#"{"type":"assistant","subtype":"partial","message":{"content":[{"type":"text","text":"Hel"}]}}"#;
        let items = parse_event(line, &mut acc());
        assert_eq!(items.len(), 1);
        assert!(matches!(&items[0], FeedItem::AssistantTextStreaming(t) if t == "Hel"));
    }

    #[test]
    fn assistant_snapshot_does_not_re_emit_tool_use() {
        // A non-partial `assistant` message is a complete snapshot of a turn
        // whose tool calls already streamed as content_block_start/stop pairs.
        // It must NOT re-emit the tool_use, or every tool call doubles in the
        // feed (HOU-472). Text in the same snapshot is still committed.
        let line = r#"{"type":"assistant","message":{"content":[{"type":"text","text":"reading"},{"type":"tool_use","id":"t1","name":"Read","input":{"path":"/foo"}}]}}"#;
        let items = parse_event(line, &mut acc());
        assert_eq!(
            items.len(),
            1,
            "snapshot should emit only its text, not the tool_use"
        );
        assert!(matches!(&items[0], FeedItem::AssistantText(t) if t == "reading"));
    }

    #[test]
    fn streamed_tool_then_snapshot_yields_single_tool_call() {
        // Regression for HOU-472: claude-code (`--include-partial-messages`)
        // emits each tool use THREE times — content_block_start (null input),
        // content_block_stop (full input), and again inside the final non-partial
        // `assistant` snapshot. The snapshot copy must be dropped so the feed
        // carries exactly the start(null) + stop(real) pair the frontend dedups
        // into one row (instead of a third tool_call that renders a duplicate).
        let mut a = acc();
        let mut tool_calls = 0;
        let lines = [
            r#"{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"t1","name":"Read","input":{}}},"session_id":"s1","uuid":"u1"}"#,
            r#"{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\"file_path\":\"/foo\"}"}},"session_id":"s1","uuid":"u2"}"#,
            r#"{"type":"stream_event","event":{"type":"content_block_stop","index":0},"session_id":"s1","uuid":"u3"}"#,
            r#"{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Read","input":{"file_path":"/foo"}}]}}"#,
        ];
        for line in lines {
            for item in parse_event(line, &mut a) {
                if matches!(item, FeedItem::ToolCall { .. }) {
                    tool_calls += 1;
                }
            }
        }
        // start(null) + stop(real) = 2; the snapshot must add nothing.
        assert_eq!(tool_calls, 2, "snapshot re-emit must not add a third tool_call");
    }

    #[test]
    fn streamed_thinking_then_snapshot_yields_single_thinking() {
        // Same snapshot redundancy as tool calls: a thinking block streams via
        // thinking_delta and is finalized at content_block_stop, then reappears
        // in the non-partial `assistant` snapshot. The snapshot copy is dropped
        // so reasoning is not duplicated in the mission log (HOU-472).
        let mut a = acc();
        let mut thinking = 0;
        let lines = [
            r#"{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}},"session_id":"s1","uuid":"u1"}"#,
            r#"{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"hmm"}},"session_id":"s1","uuid":"u2"}"#,
            r#"{"type":"stream_event","event":{"type":"content_block_stop","index":0},"session_id":"s1","uuid":"u3"}"#,
            r#"{"type":"assistant","message":{"content":[{"type":"thinking","thinking":"hmm"}]}}"#,
        ];
        for line in lines {
            for item in parse_event(line, &mut a) {
                if matches!(item, FeedItem::Thinking(_)) {
                    thinking += 1;
                }
            }
        }
        assert_eq!(
            thinking, 1,
            "snapshot re-emit must not add a second thinking block"
        );
    }

    #[test]
    fn parse_tool_result() {
        let line = r#"{"type":"assistant","message":{"content":[{"type":"tool_result","tool_use_id":"t1","content":"file contents","is_error":false}]}}"#;
        let items = parse_event(line, &mut acc());
        assert_eq!(items.len(), 1);
        match &items[0] {
            FeedItem::ToolResult { content, is_error } => {
                assert_eq!(content, "file contents");
                assert!(!is_error);
            }
            other => panic!("expected ToolResult, got {other:?}"),
        }
    }

    #[test]
    fn parse_user_tool_result() {
        let line = r#"{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","content":"Task created: Fix bug (id: abc-123). Running now.","is_error":false}]}}"#;
        let items = parse_event(line, &mut acc());
        assert_eq!(items.len(), 1);
        match &items[0] {
            FeedItem::ToolResult { content, is_error } => {
                assert!(content.contains("(id: abc-123)"));
                assert!(!is_error);
            }
            other => panic!("expected ToolResult, got {other:?}"),
        }
    }

    #[test]
    fn parse_user_event_without_tool_result_is_empty() {
        let line = r#"{"type":"user","message":{"content":"hi"}}"#;
        assert!(parse_event(line, &mut acc()).is_empty());
    }

    #[test]
    fn parse_result_event() {
        let line = r#"{"type":"result","result":"Done","cost_usd":0.05,"duration_ms":1234,"session_id":"s1"}"#;
        let items = parse_event(line, &mut acc());
        assert_eq!(items.len(), 1);
        match &items[0] {
            FeedItem::FinalResult {
                cost_usd,
                duration_ms,
                ..
            } => {
                assert_eq!(*cost_usd, Some(0.05));
                assert_eq!(*duration_ms, Some(1234));
            }
            other => panic!("expected FinalResult, got {other:?}"),
        }
        assert_eq!(extract_session_id(line), Some("s1".to_string()));
    }

    #[test]
    fn parse_empty_line() {
        assert!(parse_event("", &mut acc()).is_empty());
        assert!(parse_event("  ", &mut acc()).is_empty());
    }

    #[test]
    fn parse_invalid_json() {
        assert!(parse_event("not json", &mut acc()).is_empty());
    }

    #[test]
    fn parse_user_event_ignored() {
        let line = r#"{"type":"user","message":{"content":"hi"}}"#;
        assert!(parse_event(line, &mut acc()).is_empty());
    }

    #[test]
    fn extract_session_id_from_non_system() {
        let line = r#"{"type":"assistant","message":{"content":[{"type":"text","text":"hi"}]}}"#;
        assert_eq!(extract_session_id(line), None);
    }

    #[test]
    fn parse_stream_event_text_delta_accumulates() {
        let mut a = acc();
        // First delta
        let line1 = r#"{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}},"session_id":"s1","uuid":"u1"}"#;
        let items1 = parse_event(line1, &mut a);
        assert_eq!(items1.len(), 1);
        assert!(matches!(&items1[0], FeedItem::AssistantTextStreaming(t) if t == "Hello"));

        // Second delta — should accumulate
        let line2 = r#"{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}},"session_id":"s1","uuid":"u2"}"#;
        let items2 = parse_event(line2, &mut a);
        assert_eq!(items2.len(), 1);
        assert!(matches!(&items2[0], FeedItem::AssistantTextStreaming(t) if t == "Hello world"));

        assert_eq!(extract_session_id(line1), Some("s1".to_string()));
    }

    #[test]
    fn stream_tool_accumulates_input() {
        let mut a = acc();
        // 1. Tool starts — emits an immediate ToolCall with null input
        let start = r#"{"type":"stream_event","event":{"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"t1","name":"complete_job","input":{}}},"session_id":"s1","uuid":"u1"}"#;
        let start_items = parse_event(start, &mut a);
        assert_eq!(start_items.len(), 1);
        match &start_items[0] {
            FeedItem::ToolCall { name, input } => {
                assert_eq!(name, "complete_job");
                assert!(input.is_null());
            }
            other => panic!("expected ToolCall, got {other:?}"),
        }

        // 2. Input deltas — accumulate
        let d1 = r#"{"type":"stream_event","event":{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"summary\""}},"session_id":"s1","uuid":"u2"}"#;
        assert!(parse_event(d1, &mut a).is_empty());
        let d2 = r#"{"type":"stream_event","event":{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":": \"Done!\"}"}},"session_id":"s1","uuid":"u3"}"#;
        assert!(parse_event(d2, &mut a).is_empty());

        // 3. Block stop — emit complete ToolCall with full input
        let stop = r#"{"type":"stream_event","event":{"type":"content_block_stop","index":1},"session_id":"s1","uuid":"u4"}"#;
        let items = parse_event(stop, &mut a);
        assert_eq!(items.len(), 1);
        match &items[0] {
            FeedItem::ToolCall { name, input } => {
                assert_eq!(name, "complete_job");
                assert_eq!(input.get("summary").unwrap().as_str().unwrap(), "Done!");
            }
            other => panic!("expected ToolCall, got {other:?}"),
        }
    }

    #[test]
    fn parse_stream_event_message_stop_ignored() {
        let line = r#"{"type":"stream_event","event":{"type":"message_stop"},"session_id":"s1","uuid":"u1"}"#;
        assert!(parse_event(line, &mut acc()).is_empty());
    }

    #[test]
    fn rate_limit_event_with_allowed_status_is_silent() {
        // Heartbeat-style "you're not throttled" event — must NOT raise
        // a card or the user sees noise on healthy streams.
        let line = r#"{"type":"rate_limit_event","rate_limit_info":{"status":"allowed"},"uuid":"u1","session_id":"s1"}"#;
        assert!(parse_event(line, &mut acc()).is_empty());
    }

    #[test]
    fn rate_limit_event_with_throttled_status_emits_typed_error() {
        // Throttled event — historically silently dropped. Now lifted to
        // a typed `ProviderError::RateLimited` feed item so the UI can
        // render the countdown card.
        let line = r#"{"type":"rate_limit_event","rate_limit_info":{"status":"rate_limited","reset_in_seconds":42,"message":"slow down"},"uuid":"u1","session_id":"s1"}"#;
        let items = parse_event(line, &mut acc());
        assert_eq!(items.len(), 1);
        match &items[0] {
            FeedItem::ProviderError(ProviderError::RateLimited {
                provider,
                retry_after_seconds,
                message,
                ..
            }) => {
                assert_eq!(provider, "anthropic");
                assert_eq!(*retry_after_seconds, Some(42));
                assert!(message.contains("slow down"));
            }
            other => panic!("expected RateLimited, got {other:?}"),
        }
    }

    #[test]
    fn result_with_is_error_emits_typed_provider_error() {
        // Pre-fix: emitted FeedItem::SystemMessage("Error: ..."); the
        // user got a generic, untyped string. Post-fix: typed card with
        // a Report-bug CTA via Unknown variant when no specific match.
        let line = r#"{"type":"result","subtype":"error_during_execution","is_error":true,"result":"unanticipated failure"}"#;
        let items = parse_event(line, &mut acc());
        assert_eq!(items.len(), 1);
        match &items[0] {
            FeedItem::ProviderError(_) => {}
            other => panic!("expected ProviderError, got {other:?}"),
        }
    }

    #[test]
    fn result_api_error_status_429_classifies_as_rate_limited() {
        // Production case (Luis, 2026-06-09): `subtype:"success"` yet
        // `is_error:true` with `api_error_status:429`, and a `result` string
        // that never says "rate limit". The numeric status must drive the
        // card to RateLimited instead of the misleading Unknown/Report-bug.
        let line = r#"{"type":"result","subtype":"success","is_error":true,"api_error_status":429,"result":"Claude's response was interrupted"}"#;
        let items = parse_event(line, &mut acc());
        assert_eq!(items.len(), 1);
        match &items[0] {
            FeedItem::ProviderError(ProviderError::RateLimited { provider, .. }) => {
                assert_eq!(provider, "anthropic");
            }
            other => panic!("expected RateLimited, got {other:?}"),
        }
    }

    #[test]
    fn result_api_error_status_5xx_classifies_as_provider_internal() {
        let line = r#"{"type":"result","subtype":"success","is_error":true,"api_error_status":529,"result":"overloaded"}"#;
        let items = parse_event(line, &mut acc());
        assert_eq!(items.len(), 1);
        assert!(matches!(
            &items[0],
            FeedItem::ProviderError(ProviderError::ProviderInternal {
                http_status: Some(529),
                ..
            })
        ));
    }

    #[test]
    fn result_without_api_error_status_falls_back_to_text_classification() {
        // No numeric code → the existing text classifier still promotes the
        // auth phrasing to a typed Unauthenticated card.
        let line = r#"{"type":"result","subtype":"error","is_error":true,"result":"Claude Code is not authenticated. Run claude auth login"}"#;
        let items = parse_event(line, &mut acc());
        assert_eq!(items.len(), 1);
        assert!(matches!(
            &items[0],
            FeedItem::ProviderError(ProviderError::Unauthenticated { .. })
        ));
    }

    #[test]
    fn result_with_unremarkable_api_error_status_falls_back_to_unknown() {
        // A 400 has no dedicated card and the message carries no known
        // phrasing → Unknown (still a Report-bug CTA, never a dead end).
        let line = r#"{"type":"result","subtype":"success","is_error":true,"api_error_status":400,"result":"weird unmatched failure"}"#;
        let items = parse_event(line, &mut acc());
        assert_eq!(items.len(), 1);
        assert!(matches!(
            &items[0],
            FeedItem::ProviderError(ProviderError::Unknown { .. })
        ));
    }

    fn final_result_usage(items: &[FeedItem]) -> Option<TokenUsage> {
        items.iter().find_map(|i| match i {
            FeedItem::FinalResult { usage, .. } => *usage,
            _ => None,
        })
    }

    #[test]
    fn assistant_usage_is_attached_to_final_result() {
        let mut a = acc();
        // Final assistant message carrying Anthropic's four-way usage block.
        let assistant = r#"{"type":"assistant","message":{"content":[{"type":"text","text":"hi"}],"usage":{"input_tokens":1200,"cache_creation_input_tokens":300,"cache_read_input_tokens":150000,"output_tokens":420}}}"#;
        let _ = parse_event(assistant, &mut a);
        let result = r#"{"type":"result","result":"Done","session_id":"s1"}"#;
        let usage =
            final_result_usage(&parse_event(result, &mut a)).expect("final result carries usage");
        // context = input + cache_creation + cache_read (all occupy the window).
        assert_eq!(usage.context_tokens, 1200 + 300 + 150_000);
        assert_eq!(usage.cached_tokens, 150_000);
        assert_eq!(usage.output_tokens, 420);
    }

    #[test]
    fn last_assistant_usage_wins_within_a_turn() {
        let mut a = acc();
        // Two assistant messages (e.g. a tool round-trip): the second has the
        // larger, more complete context and must be the one reported.
        let first = r#"{"type":"assistant","message":{"content":[{"type":"text","text":"step"}],"usage":{"input_tokens":1000,"cache_read_input_tokens":0,"output_tokens":10}}}"#;
        let second = r#"{"type":"assistant","message":{"content":[{"type":"text","text":"done"}],"usage":{"input_tokens":50,"cache_read_input_tokens":2000,"output_tokens":80}}}"#;
        let _ = parse_event(first, &mut a);
        let _ = parse_event(second, &mut a);
        let usage = final_result_usage(&parse_event(
            r#"{"type":"result","result":"Done"}"#,
            &mut a,
        ))
        .expect("usage present");
        assert_eq!(usage.context_tokens, 50 + 2000);
    }

    #[test]
    fn result_usage_used_when_no_assistant_usage() {
        // No assistant message this turn — fall back to the terminal event's
        // own usage block so the indicator still updates.
        let line = r#"{"type":"result","result":"Done","usage":{"input_tokens":10,"cache_read_input_tokens":90000,"output_tokens":50}}"#;
        let usage = final_result_usage(&parse_event(line, &mut acc()))
            .expect("usage from result event");
        assert_eq!(usage.context_tokens, 10 + 90_000);
        assert_eq!(usage.cached_tokens, 90_000);
        assert_eq!(usage.output_tokens, 50);
    }

    #[test]
    fn final_result_without_any_usage_is_none() {
        let line = r#"{"type":"result","result":"Done","session_id":"s1"}"#;
        assert!(final_result_usage(&parse_event(line, &mut acc())).is_none());
    }
}
