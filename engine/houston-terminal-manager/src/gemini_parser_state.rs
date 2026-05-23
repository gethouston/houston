//! Stateful translator: [`GeminiEvent`] line → [`FeedItem`] vector.
//!
//! Wire types stay in `gemini_parser.rs`; this file owns the per-line
//! state machine and the two public entry points consumed by
//! `session_io::read_gemini_stdout`. Split out so each file stays under
//! the 200-line-per-file project rule.

use super::gemini_parser::{
    GeminiErrorPayload, GeminiEvent, GeminiMessageRole, GeminiStatus, GeminiStreamStats,
};
use super::provider::Provider;
use super::provider_error_kind::{truncate_excerpt, ProviderError};
use super::types::FeedItem;
use std::collections::HashMap;
use std::str::FromStr;

/// Per-session state kept across NDJSON lines.
///
/// `assistant_buffer` accumulates the repeated `message {role:
/// "assistant", delta:true}` chunks Gemini emits per token; there is no
/// terminal "complete message" marker, so we flush to a final
/// [`FeedItem::AssistantText`] on the next non-message event.
/// `tool_names_by_id` correlates `tool_use.tool_id` → `tool_name` for
/// the (rare) case where a `tool_result` needs the original tool name
/// for display. The parser does NOT depend on strict ordering between
/// `tool_use` and `tool_result`.
#[derive(Debug, Default)]
pub struct GeminiAccumulator {
    pub session_id: Option<String>,
    pub model: Option<String>,
    assistant_buffer: String,
    tool_names_by_id: HashMap<String, String>,
}

impl GeminiAccumulator {
    pub fn new() -> Self {
        Self::default()
    }
}

/// Extract the session_id from any line (only `init` carries it).
/// Returns `None` for every other event type.
pub fn extract_session_id(line: &str) -> Option<String> {
    let event: GeminiEvent = serde_json::from_str(line.trim()).ok()?;
    match event {
        GeminiEvent::Init { session_id, .. } => Some(session_id),
        _ => None,
    }
}

/// Parse one NDJSON line into 0..N [`FeedItem`]s. Empty / blank /
/// unparseable lines return an empty vector — never panic. Parse
/// errors are logged so they reach engine logs.
pub fn parse_gemini_event(line: &str, acc: &mut GeminiAccumulator) -> Vec<FeedItem> {
    let line = line.trim();
    if line.is_empty() {
        return vec![];
    }
    let event: GeminiEvent = match serde_json::from_str(line) {
        Ok(e) => e,
        Err(e) => {
            tracing::error!("Failed to parse Gemini event: {e}\nLine: {line}");
            return vec![];
        }
    };
    handle_event(event, acc)
}

fn handle_event(event: GeminiEvent, acc: &mut GeminiAccumulator) -> Vec<FeedItem> {
    match event {
        GeminiEvent::Init { session_id, model, .. } => {
            acc.session_id = Some(session_id);
            if !model.is_empty() {
                acc.model = Some(model);
            }
            vec![]
        }
        GeminiEvent::Message { role, content, delta, .. } => {
            handle_message(role, content, delta, acc)
        }
        GeminiEvent::ToolUse { tool_name, tool_id, parameters, .. } => {
            let mut items = flush_assistant_buffer(acc);
            acc.tool_names_by_id.insert(tool_id.clone(), tool_name.clone());
            let input =
                serde_json::to_value(&parameters).unwrap_or(serde_json::Value::Null);
            items.push(FeedItem::ToolCall {
                name: tool_name,
                input,
                tool_use_id: Some(tool_id),
            });
            items
        }
        GeminiEvent::ToolResult { tool_id, status, output, error, .. } => {
            let mut items = flush_assistant_buffer(acc);
            acc.tool_names_by_id.remove(&tool_id);
            items.push(tool_result_item(status, output, error, Some(tool_id)));
            items
        }
        GeminiEvent::Error { message, .. } => {
            // Informational only — the session continues. A terminal
            // `result {status:"error"}` follows if the issue is fatal.
            let mut items = flush_assistant_buffer(acc);
            items.push(FeedItem::SystemMessage(message));
            items
        }
        GeminiEvent::Result { status, error, stats, .. } => {
            handle_result(status, error, stats, acc)
        }
        GeminiEvent::Unknown => {
            tracing::debug!("[gemini] unknown event variant — ignoring");
            vec![]
        }
    }
}

fn handle_message(
    role: GeminiMessageRole,
    content: String,
    delta: bool,
    acc: &mut GeminiAccumulator,
) -> Vec<FeedItem> {
    match role {
        // Houston already added the user's outbound prompt before
        // spawning; dropping the echo avoids a duplicate in the feed.
        GeminiMessageRole::User => vec![],
        GeminiMessageRole::Assistant if content.is_empty() => vec![],
        GeminiMessageRole::Assistant if delta => {
            acc.assistant_buffer.push_str(&content);
            vec![FeedItem::AssistantTextStreaming(acc.assistant_buffer.clone())]
        }
        GeminiMessageRole::Assistant => {
            // Non-delta assistant message — treat as a final block.
            let mut items = flush_assistant_buffer(acc);
            items.push(FeedItem::AssistantText(content));
            items
        }
    }
}

fn handle_result(
    status: GeminiStatus,
    error: Option<GeminiErrorPayload>,
    stats: Option<GeminiStreamStats>,
    acc: &mut GeminiAccumulator,
) -> Vec<FeedItem> {
    let mut items = flush_assistant_buffer(acc);
    let duration_ms = stats.as_ref().map(|s| s.duration_ms);
    if status == GeminiStatus::Error {
        items.push(classify_result_error(error.as_ref()));
    }
    items.push(FeedItem::FinalResult {
        result: result_summary(stats.as_ref()),
        // Gemini emits no cost field — see schema findings §3.
        cost_usd: None,
        duration_ms,
    });
    items
}

/// Map a Gemini `result.error` payload to a typed
/// [`FeedItem::ProviderError`]. Falls back to
/// [`ProviderError::Unknown`] when the upstream class isn't recognised
/// — that's the signal to add a new variant or extend the classifier.
fn classify_result_error(error: Option<&GeminiErrorPayload>) -> FeedItem {
    let provider = Provider::from_str("gemini").expect("gemini is a registered provider");
    let (kind, message) = match error {
        Some(e) => (e.kind.as_str(), e.message.as_str()),
        None => ("", "gemini reported an error with no detail"),
    };
    let typed = provider.classify_result_error(kind, message).unwrap_or_else(|| {
        let raw = if kind.is_empty() {
            message.to_string()
        } else {
            format!("{kind}: {message}")
        };
        ProviderError::Unknown {
            provider: "gemini".into(),
            raw_excerpt: truncate_excerpt(&raw),
        }
    });
    FeedItem::ProviderError(typed)
}

fn result_summary(stats: Option<&GeminiStreamStats>) -> String {
    match stats {
        Some(s) if s.total_tokens > 0 => format!("{} tokens used", s.total_tokens),
        _ => String::new(),
    }
}

fn tool_result_item(
    status: GeminiStatus,
    output: Option<String>,
    error: Option<GeminiErrorPayload>,
    tool_use_id: Option<String>,
) -> FeedItem {
    match status {
        GeminiStatus::Success => FeedItem::ToolResult {
            content: output.unwrap_or_else(|| "(non-text result)".to_string()),
            is_error: false,
            tool_use_id,
        },
        GeminiStatus::Error => {
            let msg = error
                .map(|e| {
                    if e.kind.is_empty() {
                        e.message
                    } else {
                        format!("{}: {}", e.kind, e.message)
                    }
                })
                .or(output)
                .unwrap_or_else(|| "tool failed".to_string());
            FeedItem::ToolResult {
                content: msg,
                is_error: true,
                tool_use_id,
            }
        }
    }
}

fn flush_assistant_buffer(acc: &mut GeminiAccumulator) -> Vec<FeedItem> {
    if acc.assistant_buffer.is_empty() {
        return vec![];
    }
    vec![FeedItem::AssistantText(std::mem::take(&mut acc.assistant_buffer))]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn acc() -> GeminiAccumulator {
        GeminiAccumulator::new()
    }

    /// Fixture lifted from upstream `stream-json-formatter.test.ts` (v0.42.0
    /// shape, identical to v0.32.1 for non-stats events).
    const INIT_LINE: &str = r#"{"type":"init","timestamp":"2025-10-10T12:00:00.000Z","session_id":"test-session-123","model":"gemini-2.0-flash-exp"}"#;
    const USER_MSG_LINE: &str = r#"{"type":"message","timestamp":"2025-10-10T12:00:00.000Z","role":"user","content":"What is 2+2?"}"#;
    const ASSISTANT_DELTA_1: &str = r#"{"type":"message","timestamp":"2025-10-10T12:00:00.000Z","role":"assistant","content":"4","delta":true}"#;
    const ASSISTANT_DELTA_2: &str = r#"{"type":"message","timestamp":"2025-10-10T12:00:01.000Z","role":"assistant","content":"!","delta":true}"#;
    const TOOL_USE_LINE: &str = r#"{"type":"tool_use","timestamp":"2025-10-10T12:00:00.000Z","tool_name":"Read","tool_id":"read-123","parameters":{"file_path":"/path/to/file.txt"}}"#;
    const TOOL_RESULT_OK: &str = r#"{"type":"tool_result","timestamp":"2025-10-10T12:00:00.000Z","tool_id":"read-123","status":"success","output":"File contents here"}"#;
    const TOOL_RESULT_ERR: &str = r#"{"type":"tool_result","timestamp":"2025-10-10T12:00:00.000Z","tool_id":"read-123","status":"error","error":{"type":"FILE_NOT_FOUND","message":"File not found"}}"#;
    const ERROR_LINE: &str = r#"{"type":"error","timestamp":"2025-10-10T12:00:00.000Z","severity":"warning","message":"Loop detected, stopping execution"}"#;
    const RESULT_OK: &str = r#"{"type":"result","timestamp":"2025-10-10T12:00:00.000Z","status":"success","stats":{"total_tokens":100,"input_tokens":50,"output_tokens":50,"cached":0,"input":50,"duration_ms":1200,"tool_calls":2}}"#;
    const RESULT_ERR: &str = r#"{"type":"result","timestamp":"2025-10-10T12:00:00.000Z","status":"error","error":{"type":"MaxSessionTurnsError","message":"Maximum session turns exceeded"},"stats":{"total_tokens":100,"input_tokens":50,"output_tokens":50,"cached":0,"input":50,"duration_ms":1200,"tool_calls":0}}"#;

    #[test]
    fn init_captures_session_id_and_emits_nothing() {
        let mut a = acc();
        let items = parse_gemini_event(INIT_LINE, &mut a);
        assert!(items.is_empty());
        assert_eq!(a.session_id.as_deref(), Some("test-session-123"));
        assert_eq!(a.model.as_deref(), Some("gemini-2.0-flash-exp"));
        assert_eq!(extract_session_id(INIT_LINE).as_deref(), Some("test-session-123"));
    }

    #[test]
    fn extract_session_id_returns_none_for_non_init() {
        assert_eq!(extract_session_id(USER_MSG_LINE), None);
        assert_eq!(extract_session_id(RESULT_OK), None);
    }

    #[test]
    fn user_message_is_dropped() {
        let mut a = acc();
        let items = parse_gemini_event(USER_MSG_LINE, &mut a);
        assert!(items.is_empty(), "user echo dropped to avoid dup with prompt");
    }

    #[test]
    fn assistant_deltas_accumulate_into_streaming_then_flush() {
        let mut a = acc();
        let items1 = parse_gemini_event(ASSISTANT_DELTA_1, &mut a);
        assert_eq!(items1.len(), 1);
        assert!(matches!(&items1[0], FeedItem::AssistantTextStreaming(t) if t == "4"));

        let items2 = parse_gemini_event(ASSISTANT_DELTA_2, &mut a);
        assert_eq!(items2.len(), 1);
        assert!(matches!(&items2[0], FeedItem::AssistantTextStreaming(t) if t == "4!"));

        // Result line should flush the buffer to a final AssistantText.
        let items3 = parse_gemini_event(RESULT_OK, &mut a);
        assert!(matches!(&items3[0], FeedItem::AssistantText(t) if t == "4!"));
        assert!(matches!(items3.last().unwrap(), FeedItem::FinalResult { .. }));
    }

    #[test]
    fn tool_use_then_tool_result_correlates_by_id() {
        let mut a = acc();
        let use_items = parse_gemini_event(TOOL_USE_LINE, &mut a);
        assert_eq!(use_items.len(), 1);
        match &use_items[0] {
            FeedItem::ToolCall {
                name,
                input,
                tool_use_id,
            } => {
                assert_eq!(name, "Read");
                assert_eq!(input["file_path"], "/path/to/file.txt");
                assert_eq!(tool_use_id.as_deref(), Some("read-123"));
            }
            other => panic!("expected ToolCall, got {other:?}"),
        }
        assert_eq!(a.tool_names_by_id.get("read-123").map(|s| s.as_str()), Some("Read"));

        let res_items = parse_gemini_event(TOOL_RESULT_OK, &mut a);
        assert_eq!(res_items.len(), 1);
        match &res_items[0] {
            FeedItem::ToolResult {
                content,
                is_error,
                tool_use_id,
            } => {
                assert_eq!(content, "File contents here");
                assert!(!is_error);
                assert_eq!(tool_use_id.as_deref(), Some("read-123"));
            }
            other => panic!("expected ToolResult, got {other:?}"),
        }
        // Map cleared after the result is consumed.
        assert!(a.tool_names_by_id.get("read-123").is_none());
    }

    #[test]
    fn tool_result_error_renders_error_payload() {
        let items = parse_gemini_event(TOOL_RESULT_ERR, &mut acc());
        assert_eq!(items.len(), 1);
        match &items[0] {
            FeedItem::ToolResult {
                content,
                is_error,
                ..
            } => {
                assert!(*is_error);
                assert!(content.contains("FILE_NOT_FOUND"));
                assert!(content.contains("File not found"));
            }
            other => panic!("expected ToolResult, got {other:?}"),
        }
    }

    #[test]
    fn tool_use_flushes_pending_assistant_buffer_before_emit() {
        // Order paranoia: a tool_use that arrives before the buffer is
        // flushed must produce the AssistantText FIRST so the UI doesn't
        // paint the tool call ahead of the streaming text.
        let mut a = acc();
        parse_gemini_event(ASSISTANT_DELTA_1, &mut a);
        let items = parse_gemini_event(TOOL_USE_LINE, &mut a);
        assert_eq!(items.len(), 2);
        assert!(matches!(&items[0], FeedItem::AssistantText(t) if t == "4"));
        assert!(matches!(&items[1], FeedItem::ToolCall { .. }));
    }

    #[test]
    fn error_event_emits_system_message() {
        let items = parse_gemini_event(ERROR_LINE, &mut acc());
        assert_eq!(items.len(), 1);
        assert!(matches!(&items[0], FeedItem::SystemMessage(m) if m.contains("Loop detected")));
    }

    #[test]
    fn result_success_emits_final_result_with_duration() {
        let items = parse_gemini_event(RESULT_OK, &mut acc());
        assert_eq!(items.len(), 1);
        match &items[0] {
            FeedItem::FinalResult { result, cost_usd, duration_ms } => {
                assert_eq!(*duration_ms, Some(1200));
                assert!(cost_usd.is_none(), "gemini emits no cost field");
                assert!(result.contains("100 tokens"));
            }
            other => panic!("expected FinalResult, got {other:?}"),
        }
    }

    #[test]
    fn result_error_emits_typed_provider_error_then_final_result() {
        let items = parse_gemini_event(RESULT_ERR, &mut acc());
        assert_eq!(items.len(), 2);
        match &items[0] {
            FeedItem::ProviderError(ProviderError::ProviderInternal { message, .. }) => {
                assert!(message.contains("Maximum session turns exceeded"));
            }
            other => panic!("expected ProviderError::ProviderInternal first, got {other:?}"),
        }
        assert!(matches!(items[1], FeedItem::FinalResult { .. }));
    }

    #[test]
    fn result_error_unknown_class_falls_back_to_unknown_variant() {
        // Synthetic: an upstream class name we haven't classified yet
        // must surface as Unknown (the catch-all) rather than crash.
        let line = r#"{"type":"result","timestamp":"t","status":"error","error":{"type":"BrandNewError","message":"surprise"}}"#;
        let items = parse_gemini_event(line, &mut acc());
        match &items[0] {
            FeedItem::ProviderError(ProviderError::Unknown { raw_excerpt, .. }) => {
                assert!(raw_excerpt.contains("BrandNewError"));
                assert!(raw_excerpt.contains("surprise"));
            }
            other => panic!("expected ProviderError::Unknown, got {other:?}"),
        }
    }

    #[test]
    fn unknown_variant_is_ignored_without_panic() {
        // Forward-compat: a future event type (e.g. `thought`) must not
        // crash the parser. v0.42.0 doesn't emit any but a later release
        // might.
        let line = r#"{"type":"thought","timestamp":"t","text":"hmm"}"#;
        let items = parse_gemini_event(line, &mut acc());
        assert!(items.is_empty());
    }

    #[test]
    fn empty_and_invalid_lines_return_empty() {
        assert!(parse_gemini_event("", &mut acc()).is_empty());
        assert!(parse_gemini_event("   ", &mut acc()).is_empty());
        assert!(parse_gemini_event("not json", &mut acc()).is_empty());
    }

    #[test]
    fn out_of_order_tool_result_does_not_crash() {
        // Defensive: if a tool_result arrives without a matching tool_use
        // (shouldn't happen in practice, but the parser must not require
        // strict ordering), it still produces a sensible FeedItem.
        let items = parse_gemini_event(TOOL_RESULT_OK, &mut acc());
        assert_eq!(items.len(), 1);
        assert!(matches!(&items[0], FeedItem::ToolResult { is_error: false, .. }));
    }
}
