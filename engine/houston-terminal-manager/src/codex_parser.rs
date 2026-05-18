//! Parser for Codex CLI `--json` NDJSON output.
//!
//! Maps Codex events to the same `FeedItem` variants used by the Claude parser,
//! so the rest of the stack (session_runner, frontend) is provider-agnostic.

use super::auth_error::{is_auth_retry_noise, AUTH_RETRY_MARKER};
use super::provider::Provider;
use super::provider_error_kind::ProviderError;
use super::types::FeedItem;
use serde::Deserialize;
use std::str::FromStr;

/// Run the OpenAI / Codex stderr classifier against a Codex
/// `turn.failed.error.message` payload. The message shape mirrors what
/// the CLI prints to stderr (e.g. `unexpected status 401 Unauthorized`),
/// so the same patterns apply.
fn classify_codex_error_message(message: &str) -> Option<ProviderError> {
    Provider::from_str("openai")
        .ok()
        .and_then(|p| p.classify_stderr(message))
}

/// Top-level Codex NDJSON event envelope.
#[derive(Debug, Clone, Deserialize)]
pub struct CodexEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    /// Present on `thread.started`.
    pub thread_id: Option<String>,
    /// Present on `item.*` events.
    pub item: Option<CodexItem>,
    /// Present on `turn.completed`.
    pub usage: Option<CodexUsage>,
    /// Present on `error` / `turn.failed`.
    pub message: Option<String>,
    pub error: Option<CodexError>,
}

/// An item payload inside `item.started`, `item.updated`, `item.completed`.
#[derive(Debug, Clone, Deserialize)]
pub struct CodexItem {
    pub id: Option<String>,
    #[serde(rename = "type")]
    pub item_type: String,
    /// Agent text response.
    pub text: Option<String>,
    /// Shell command (command_execution).
    pub command: Option<String>,
    /// Command output (command_execution, on completed).
    pub aggregated_output: Option<String>,
    /// Exit code (command_execution, on completed).
    pub exit_code: Option<i32>,
    /// Item status: "in_progress", "completed", "failed".
    pub status: Option<String>,
    /// File changes (file_change items).
    pub changes: Option<Vec<CodexFileChange>>,
    /// MCP server name (mcp_tool_call).
    pub server: Option<String>,
    /// MCP tool name (mcp_tool_call).
    pub tool: Option<String>,
    /// Web search query (web_search).
    pub query: Option<String>,
    /// Error message (error items).
    pub message: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CodexFileChange {
    pub path: Option<String>,
    pub kind: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CodexUsage {
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub cached_input_tokens: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CodexError {
    pub message: Option<String>,
}

/// Accumulates streaming state for Codex events.
#[derive(Debug, Default)]
pub struct CodexAccumulator {
    text_buffer: String,
    thinking_buffer: String,
    /// True between `turn.started` and the first event that takes over the
    /// reasoning slot (real reasoning item, agent_message, command_execution,
    /// etc.). Codex 0.130's `--json` output emits NO events during the
    /// 5-10 seconds the model spends reasoning, so we seed an empty
    /// `ThinkingStreaming` placeholder on `turn.started` to give the UI a
    /// signal to render "Mission in progress…" immediately. When any
    /// content-bearing event arrives — or when the turn completes without
    /// any reasoning — we emit a final `Thinking("")` so the reasoning
    /// block transitions out of its streaming state and doesn't strand a
    /// permanent shimmer in the chat.
    thinking_placeholder_open: bool,
}

impl CodexAccumulator {
    pub fn new() -> Self {
        Self::default()
    }
}

/// Extract the thread ID (Codex's equivalent of Claude's session ID).
pub fn extract_thread_id(line: &str) -> Option<String> {
    let event: CodexEvent = serde_json::from_str(line.trim()).ok()?;
    if event.event_type == "thread.started" {
        event.thread_id
    } else {
        None
    }
}

/// Parse a single NDJSON line from Codex's `--json` output into FeedItems.
pub fn parse_codex_event(line: &str, acc: &mut CodexAccumulator) -> Vec<FeedItem> {
    let line = line.trim();
    if line.is_empty() {
        return vec![];
    }

    let event: CodexEvent = match serde_json::from_str(line) {
        Ok(e) => e,
        Err(e) => {
            tracing::error!("Failed to parse Codex event: {e}\nLine: {line}");
            return vec![];
        }
    };

    match event.event_type.as_str() {
        "thread.started" => vec![],

        // Seed an empty streaming-thinking placeholder so the chat panel
        // can render "Mission in progress…" without waiting 5-10 seconds
        // for the first real `item.*` event. Codex 0.130's `--json` mode
        // does not stream reasoning, so without this the UI looks frozen
        // after the user hits send.
        "turn.started" => {
            acc.thinking_placeholder_open = true;
            vec![FeedItem::ThinkingStreaming(String::new())]
        }

        "item.started" | "item.updated" => {
            let mut items = close_thinking_placeholder_if_open(acc, &event);
            items.extend(parse_item_streaming(&event, acc));
            items
        }

        "item.completed" => {
            let mut items = close_thinking_placeholder_if_open(acc, &event);
            items.extend(parse_item_completed(&event, acc));
            items
        }

        "turn.completed" => {
            let mut items = vec![];
            // Flush any accumulated text as final
            if !acc.text_buffer.is_empty() {
                items.push(FeedItem::AssistantText(std::mem::take(
                    &mut acc.text_buffer,
                )));
            }
            if !acc.thinking_buffer.is_empty() {
                items.push(FeedItem::Thinking(std::mem::take(&mut acc.thinking_buffer)));
            } else if acc.thinking_placeholder_open {
                // The turn finished without codex ever emitting a reasoning
                // item. Finalize the placeholder so the chat UI exits its
                // streaming state instead of leaving a permanent shimmer.
                items.push(FeedItem::Thinking(String::new()));
            }
            acc.thinking_placeholder_open = false;
            // Emit usage as FinalResult
            if let Some(usage) = &event.usage {
                let total = usage.input_tokens.unwrap_or(0) + usage.output_tokens.unwrap_or(0);
                items.push(FeedItem::FinalResult {
                    result: format!("{total} tokens used"),
                    cost_usd: None,
                    duration_ms: None,
                });
            }
            items
        }

        "turn.failed" | "error" => {
            let msg = event
                .message
                .clone()
                .or_else(|| event.error.clone().and_then(|e| e.message))
                .unwrap_or_else(|| "Unknown error".into());
            tracing::info!("[codex] error/turn.failed: {msg}");
            // Close any pending reasoning placeholder so the UI doesn't
            // strand a shimmer next to the error message.
            let mut items = vec![];
            if acc.thinking_placeholder_open {
                acc.thinking_placeholder_open = false;
                items.push(FeedItem::Thinking(std::mem::take(&mut acc.thinking_buffer)));
            }
            // Auth retry noise (e.g. "Reconnecting... 1/5 (unexpected status 401 Unauthorized...)")
            // Show a single friendly "Checking connection..." instead of raw retries.
            if is_auth_retry_noise(&msg) {
                tracing::info!("[codex] auth retry detected — suppressing raw error");
                // Return a marker so session_runner can track it, but don't show raw noise.
                items.push(FeedItem::SystemMessage(AUTH_RETRY_MARKER.to_string()));
            } else {
                // Try the typed classifier first — Codex's
                // `turn.failed.error.message` is the same shape its
                // stderr produces, so the OpenAI stderr classifier
                // covers it.
                if let Some(typed) = classify_codex_error_message(&msg) {
                    items.push(FeedItem::ProviderError(typed));
                } else {
                    items.push(FeedItem::SystemMessage(format!("Error: {msg}")));
                }
            }
            items
        }

        _ => {
            tracing::debug!("[codex] unhandled event type: {}", event.event_type);
            vec![]
        }
    }
}

/// If a `turn.started` placeholder is open and the next item is NOT a
/// reasoning item (which would naturally take over the buffer), emit a
/// finalizing `Thinking("")` so the chat UI's reasoning block exits its
/// streaming state. Returns the events to prepend in front of whatever the
/// real `item.*` handler emits.
fn close_thinking_placeholder_if_open(
    acc: &mut CodexAccumulator,
    event: &CodexEvent,
) -> Vec<FeedItem> {
    if !acc.thinking_placeholder_open {
        return vec![];
    }
    // Real reasoning items take over the buffer naturally — let the existing
    // parser logic populate it instead of pre-finalizing with "".
    let is_reasoning = event
        .item
        .as_ref()
        .map(|i| i.item_type == "reasoning")
        .unwrap_or(false);
    if is_reasoning {
        return vec![];
    }
    acc.thinking_placeholder_open = false;
    if acc.thinking_buffer.is_empty() {
        vec![FeedItem::Thinking(String::new())]
    } else {
        vec![FeedItem::Thinking(std::mem::take(&mut acc.thinking_buffer))]
    }
}

/// Handle `item.started` and `item.updated` — streaming/in-progress items.
fn parse_item_streaming(event: &CodexEvent, acc: &mut CodexAccumulator) -> Vec<FeedItem> {
    let Some(item) = &event.item else {
        return vec![];
    };

    match item.item_type.as_str() {
        "agent_message" => {
            if let Some(text) = &item.text {
                if !text.is_empty() {
                    acc.text_buffer = text.clone();
                    return vec![FeedItem::AssistantTextStreaming(acc.text_buffer.clone())];
                }
            }
            vec![]
        }
        "reasoning" => {
            if let Some(text) = &item.text {
                if !text.is_empty() {
                    acc.thinking_buffer = text.clone();
                    return vec![FeedItem::ThinkingStreaming(acc.thinking_buffer.clone())];
                }
            }
            vec![]
        }
        "command_execution" => {
            if let Some(cmd) = &item.command {
                return vec![FeedItem::ToolCall {
                    name: "Bash".into(),
                    input: serde_json::json!({ "command": cmd }),
                }];
            }
            vec![]
        }
        "file_change" => {
            let desc = describe_file_changes(item);
            vec![FeedItem::ToolCall {
                name: "Edit".into(),
                input: serde_json::json!({ "description": desc }),
            }]
        }
        "mcp_tool_call" => {
            let name = format!(
                "{}::{}",
                item.server.as_deref().unwrap_or("mcp"),
                item.tool.as_deref().unwrap_or("unknown")
            );
            vec![FeedItem::ToolCall {
                name,
                input: serde_json::Value::Null,
            }]
        }
        "web_search" => {
            let query = item.query.as_deref().unwrap_or("");
            vec![FeedItem::ToolCall {
                name: "WebSearch".into(),
                input: serde_json::json!({ "query": query }),
            }]
        }
        _ => vec![],
    }
}

/// Handle `item.completed` — finalized items.
fn parse_item_completed(event: &CodexEvent, acc: &mut CodexAccumulator) -> Vec<FeedItem> {
    let Some(item) = &event.item else {
        return vec![];
    };

    match item.item_type.as_str() {
        "agent_message" => {
            if let Some(text) = &item.text {
                if !text.is_empty() {
                    acc.text_buffer.clear();
                    return vec![FeedItem::AssistantText(text.clone())];
                }
            }
            vec![]
        }
        "reasoning" => {
            if let Some(text) = &item.text {
                if !text.is_empty() {
                    acc.thinking_buffer.clear();
                    return vec![FeedItem::Thinking(text.clone())];
                }
            }
            vec![]
        }
        "command_execution" => {
            let output = item.aggregated_output.as_deref().unwrap_or("");
            let exit_code = item.exit_code.unwrap_or(-1);
            let is_error = exit_code != 0;
            let content = if is_error {
                format!("Exit code {exit_code}\n{output}")
            } else {
                output.to_string()
            };
            vec![FeedItem::ToolResult { content, is_error }]
        }
        "file_change" => {
            let desc = describe_file_changes(item);
            let is_error = item.status.as_deref() == Some("failed");
            vec![FeedItem::ToolResult {
                content: desc,
                is_error,
            }]
        }
        "mcp_tool_call" => {
            let is_error = item.status.as_deref() == Some("failed");
            let name = format!(
                "{}::{}",
                item.server.as_deref().unwrap_or("mcp"),
                item.tool.as_deref().unwrap_or("unknown")
            );
            vec![FeedItem::ToolResult {
                content: format!("{name} completed"),
                is_error,
            }]
        }
        "error" => {
            let msg = item
                .message
                .as_deref()
                .or(item.text.as_deref())
                .unwrap_or("Unknown error");
            // Codex emits a transient error when the model changes mid-session
            // (e.g. "This session was created with model X"). The session
            // recovers and continues, so suppress the noise.
            if msg.starts_with("This session") {
                tracing::debug!("[codex] suppressed model-change error: {msg}");
                vec![]
            } else {
                vec![FeedItem::SystemMessage(msg.to_string())]
            }
        }
        _ => vec![],
    }
}

fn describe_file_changes(item: &CodexItem) -> String {
    let Some(changes) = &item.changes else {
        return "File changes".into();
    };
    changes
        .iter()
        .map(|c| {
            let kind = c.kind.as_deref().unwrap_or("update");
            let path = c.path.as_deref().unwrap_or("?");
            format!("{kind}: {path}")
        })
        .collect::<Vec<_>>()
        .join(", ")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn acc() -> CodexAccumulator {
        CodexAccumulator::new()
    }

    #[test]
    fn turn_started_emits_empty_thinking_placeholder() {
        // Codex 0.130 stays silent between `turn.started` and the first
        // real item for several seconds. The parser must surface a
        // `ThinkingStreaming("")` so the chat UI can render
        // "Mission in progress…" without waiting on the model.
        let mut a = acc();
        let items = parse_codex_event(r#"{"type":"turn.started"}"#, &mut a);
        assert_eq!(items.len(), 1);
        assert!(matches!(&items[0], FeedItem::ThinkingStreaming(t) if t.is_empty()));
    }

    #[test]
    fn first_non_reasoning_item_finalizes_placeholder() {
        // When the model returns text without any reasoning items, the
        // placeholder must be finalized as `Thinking("")` so the chat
        // reasoning block exits its streaming state. The finalizer is
        // emitted BEFORE the real item, so the UI sees a complete
        // reasoning block followed by the assistant text.
        let mut a = acc();
        let _ = parse_codex_event(r#"{"type":"turn.started"}"#, &mut a);
        let items = parse_codex_event(
            r#"{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"Hi"}}"#,
            &mut a,
        );
        assert_eq!(items.len(), 2);
        assert!(matches!(&items[0], FeedItem::Thinking(t) if t.is_empty()));
        assert!(matches!(&items[1], FeedItem::AssistantText(t) if t == "Hi"));
    }

    #[test]
    fn real_reasoning_takes_over_placeholder() {
        // If codex does emit a reasoning item (older protocol / fallback),
        // the parser must NOT pre-finalize with `Thinking("")` — the real
        // reasoning content owns the buffer instead.
        let mut a = acc();
        let _ = parse_codex_event(r#"{"type":"turn.started"}"#, &mut a);
        let items = parse_codex_event(
            r#"{"type":"item.updated","item":{"id":"item_0","type":"reasoning","text":"Let me think"}}"#,
            &mut a,
        );
        assert_eq!(items.len(), 1);
        assert!(matches!(&items[0], FeedItem::ThinkingStreaming(t) if t == "Let me think"));
    }

    #[test]
    fn turn_completed_without_items_finalizes_placeholder() {
        // Edge case: turn ends with no items at all (e.g. cancelled before
        // any output). Placeholder must still be closed out.
        let mut a = acc();
        let _ = parse_codex_event(r#"{"type":"turn.started"}"#, &mut a);
        let items = parse_codex_event(r#"{"type":"turn.completed"}"#, &mut a);
        assert!(
            items.iter().any(|i| matches!(i, FeedItem::Thinking(t) if t.is_empty())),
            "expected an empty Thinking() to close the placeholder, got {items:?}"
        );
    }

    #[test]
    fn parse_thread_started() {
        let line =
            r#"{"type":"thread.started","thread_id":"0199a213-81c0-7800-8aa1-bbab2a035a53"}"#;
        let items = parse_codex_event(line, &mut acc());
        assert!(items.is_empty());
        assert_eq!(
            extract_thread_id(line),
            Some("0199a213-81c0-7800-8aa1-bbab2a035a53".into())
        );
    }

    #[test]
    fn parse_agent_message_streaming() {
        let line = r#"{"type":"item.updated","item":{"id":"item_1","type":"agent_message","text":"Hello world"}}"#;
        let items = parse_codex_event(line, &mut acc());
        assert_eq!(items.len(), 1);
        assert!(matches!(&items[0], FeedItem::AssistantTextStreaming(t) if t == "Hello world"));
    }

    #[test]
    fn parse_agent_message_completed() {
        let line = r#"{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"Final response"}}"#;
        let items = parse_codex_event(line, &mut acc());
        assert_eq!(items.len(), 1);
        assert!(matches!(&items[0], FeedItem::AssistantText(t) if t == "Final response"));
    }

    #[test]
    fn parse_reasoning() {
        let mut a = acc();
        let streaming = r#"{"type":"item.started","item":{"id":"item_2","type":"reasoning","text":"Let me think..."}}"#;
        let items = parse_codex_event(streaming, &mut a);
        assert_eq!(items.len(), 1);
        assert!(matches!(&items[0], FeedItem::ThinkingStreaming(t) if t == "Let me think..."));

        let completed = r#"{"type":"item.completed","item":{"id":"item_2","type":"reasoning","text":"Full reasoning here"}}"#;
        let items = parse_codex_event(completed, &mut a);
        assert_eq!(items.len(), 1);
        assert!(matches!(&items[0], FeedItem::Thinking(t) if t == "Full reasoning here"));
    }

    #[test]
    fn parse_command_execution() {
        let mut a = acc();
        let started = r#"{"type":"item.started","item":{"id":"item_3","type":"command_execution","command":"bash -lc ls","status":"in_progress"}}"#;
        let items = parse_codex_event(started, &mut a);
        assert_eq!(items.len(), 1);
        match &items[0] {
            FeedItem::ToolCall { name, input } => {
                assert_eq!(name, "Bash");
                assert_eq!(input["command"], "bash -lc ls");
            }
            other => panic!("expected ToolCall, got {other:?}"),
        }

        let completed = r#"{"type":"item.completed","item":{"id":"item_3","type":"command_execution","command":"bash -lc ls","aggregated_output":"src/\npackage.json\n","exit_code":0,"status":"completed"}}"#;
        let items = parse_codex_event(completed, &mut a);
        assert_eq!(items.len(), 1);
        match &items[0] {
            FeedItem::ToolResult { content, is_error } => {
                assert!(content.contains("src/"));
                assert!(!is_error);
            }
            other => panic!("expected ToolResult, got {other:?}"),
        }
    }

    #[test]
    fn parse_command_execution_failure() {
        let line = r#"{"type":"item.completed","item":{"id":"item_3","type":"command_execution","command":"bash -lc false","aggregated_output":"","exit_code":1,"status":"failed"}}"#;
        let items = parse_codex_event(line, &mut acc());
        assert_eq!(items.len(), 1);
        match &items[0] {
            FeedItem::ToolResult { is_error, .. } => assert!(is_error),
            other => panic!("expected ToolResult, got {other:?}"),
        }
    }

    #[test]
    fn parse_file_change() {
        let line = r#"{"type":"item.completed","item":{"id":"item_4","type":"file_change","changes":[{"path":"src/main.rs","kind":"update"}],"status":"completed"}}"#;
        let items = parse_codex_event(line, &mut acc());
        assert_eq!(items.len(), 1);
        match &items[0] {
            FeedItem::ToolResult { content, is_error } => {
                assert!(content.contains("update: src/main.rs"));
                assert!(!is_error);
            }
            other => panic!("expected ToolResult, got {other:?}"),
        }
    }

    #[test]
    fn parse_turn_completed() {
        let line = r#"{"type":"turn.completed","usage":{"input_tokens":24763,"cached_input_tokens":24448,"output_tokens":122}}"#;
        let items = parse_codex_event(line, &mut acc());
        assert_eq!(items.len(), 1);
        match &items[0] {
            FeedItem::FinalResult { result, .. } => {
                assert!(result.contains("24885"));
            }
            other => panic!("expected FinalResult, got {other:?}"),
        }
    }

    #[test]
    fn parse_error_event_classifies_to_typed_provider_error() {
        // Rate-limit phrasing now flows through the typed classifier;
        // the SystemMessage branch only fires when no classifier matches.
        let line = r#"{"type":"error","message":"Rate limit exceeded"}"#;
        let items = parse_codex_event(line, &mut acc());
        assert_eq!(items.len(), 1);
        assert!(matches!(
            &items[0],
            FeedItem::ProviderError(ProviderError::RateLimited { .. })
        ));
    }

    #[test]
    fn parse_error_event_unrecognised_falls_back_to_system_message() {
        let line = r#"{"type":"error","message":"Context window exceeded for model"}"#;
        let items = parse_codex_event(line, &mut acc());
        assert_eq!(items.len(), 1);
        assert!(matches!(&items[0], FeedItem::SystemMessage(m) if m.contains("Context window")));
    }

    #[test]
    fn parse_auth_retry_returns_marker() {
        let line = r#"{"type":"error","message":"Reconnecting... 1/5 (unexpected status 401 Unauthorized: Missing bearer)"}"#;
        let items = parse_codex_event(line, &mut acc());
        assert_eq!(items.len(), 1);
        assert!(matches!(&items[0], FeedItem::SystemMessage(m) if m == "__auth_retry__"));
    }

    #[test]
    fn parse_codex_auth_failure_classifies_as_typed_unauthenticated() {
        let line = r#"{"type":"turn.failed","error":{"message":"unexpected status 401 Unauthorized: Missing bearer"}}"#;
        let items = parse_codex_event(line, &mut acc());
        assert_eq!(items.len(), 1);
        assert!(matches!(
            &items[0],
            FeedItem::ProviderError(ProviderError::Unauthenticated { .. })
        ));
    }

    #[test]
    fn parse_turn_failed() {
        let line = r#"{"type":"turn.failed","error":{"message":"Context window exceeded"}}"#;
        let items = parse_codex_event(line, &mut acc());
        assert_eq!(items.len(), 1);
        assert!(matches!(&items[0], FeedItem::SystemMessage(m) if m.contains("Context window")));
    }

    #[test]
    fn parse_mcp_tool_call() {
        let line = r#"{"type":"item.started","item":{"id":"item_5","type":"mcp_tool_call","server":"github","tool":"list_issues","status":"in_progress"}}"#;
        let items = parse_codex_event(line, &mut acc());
        assert_eq!(items.len(), 1);
        match &items[0] {
            FeedItem::ToolCall { name, .. } => assert_eq!(name, "github::list_issues"),
            other => panic!("expected ToolCall, got {other:?}"),
        }
    }

    #[test]
    fn parse_empty_and_invalid() {
        assert!(parse_codex_event("", &mut acc()).is_empty());
        assert!(parse_codex_event("  ", &mut acc()).is_empty());
        assert!(parse_codex_event("not json", &mut acc()).is_empty());
    }

    #[test]
    fn text_buffer_flushed_on_turn_completed() {
        let mut a = acc();
        // Stream some text
        let line = r#"{"type":"item.updated","item":{"id":"item_1","type":"agent_message","text":"partial"}}"#;
        parse_codex_event(line, &mut a);

        // Turn completes without item.completed for the message
        let done = r#"{"type":"turn.completed","usage":{"input_tokens":100,"output_tokens":50}}"#;
        let items = parse_codex_event(done, &mut a);
        // Should flush the text buffer as AssistantText + FinalResult
        assert_eq!(items.len(), 2);
        assert!(matches!(&items[0], FeedItem::AssistantText(t) if t == "partial"));
        assert!(matches!(&items[1], FeedItem::FinalResult { .. }));
    }

    #[test]
    fn extract_thread_id_returns_none_for_non_thread() {
        let line = r#"{"type":"turn.started"}"#;
        assert_eq!(extract_thread_id(line), None);
    }
}
