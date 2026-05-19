use super::codex_parser;
use super::gemini_parser;
use super::parser;
use super::stderr_filter::{stderr_feed_item, StderrState};
use super::types::FeedItem;
use crate::auth_error::is_auth_error;
use crate::provider::detect_malformed_provider_json;
use crate::provider_error_kind::ProviderError;
use crate::session_update::SessionUpdate;
use crate::Provider;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::mpsc;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct StdoutReadReport {
    pub malformed_provider_json: bool,
    /// True when the provider CLI surfaced an auth failure on stdout (e.g.
    /// claude's `{"type":"result","is_error":true,"result":"... 401 ..."}`
    /// event). stderr is empty in that case, so without this flag the
    /// failed-exit path would emit a generic "no stderr output captured"
    /// ToolRuntimeError on top of the legitimate AuthRequired reconnect UI.
    pub saw_auth_error: bool,
    /// True when codex's `turn.failed` carried OpenAI's "model is not
    /// supported when using Codex with a ChatGPT account" 400. The parser
    /// already emitted a dedicated `ProviderModelUnsupported` runtime-error
    /// card, so `handle_failed_exit` must NOT also emit the generic
    /// `ProviderProcess` card on top of it.
    pub saw_model_unsupported_error: bool,
}

/// Read all stderr lines, emitting only user-actionable feed items.
/// Returns the collected lines so the caller can include them in error reports.
///
/// Each line is offered to (in order):
///   1. The provider's typed [`Provider::classify_stderr`] — first match
///      wins and is emitted as [`FeedItem::ProviderError`]. The runner
///      gets one typed card per session per stderr-classified pattern.
///   2. The legacy [`stderr_feed_item`] filter — local-tool runtime
///      errors and the auth-retry marker. These pre-date the typed
///      contract and stay because they cover non-provider failures
///      (codex_core router exec_command, etc.).
pub async fn read_stderr_lines(
    stderr: tokio::process::ChildStderr,
    tx: mpsc::UnboundedSender<SessionUpdate>,
    provider: Provider,
) -> Vec<String> {
    let mut lines = Vec::new();
    let mut state = StderrState::default();
    let mut emitted_provider_kinds: Vec<&'static str> = Vec::new();
    let reader = BufReader::new(stderr);
    let mut reader_lines = reader.lines();
    while let Ok(Some(line)) = reader_lines.next_line().await {
        tracing::debug!("cli stderr: {line}");

        if let Some(err) = provider.classify_stderr(&line) {
            // Dedupe by kind: a session that hits the same kind 10 times
            // (e.g. the Gemini exponential-backoff loop) should emit one
            // card, not ten. The terminal "Max attempts reached" line is
            // a different kind (QuotaExhausted vs RateLimited) and gets
            // its own emit.
            if !emitted_provider_kinds.contains(&err.kind()) {
                emitted_provider_kinds.push(err.kind());
                if tx
                    .send(SessionUpdate::Feed(FeedItem::ProviderError(err)))
                    .is_err()
                {
                    break;
                }
            }
            lines.push(line);
            continue;
        }

        if let Some(item) = stderr_feed_item(&line, &mut state) {
            if tx.send(SessionUpdate::Feed(item)).is_err() {
                break;
            }
        }
        lines.push(line);
    }
    lines
}

/// Read all stdout lines, parsing each as NDJSON and sending parsed feed items
/// (and session IDs) to the channel. Routes to the correct parser based on provider.
pub async fn read_stdout_events(
    stdout: tokio::process::ChildStdout,
    tx: mpsc::UnboundedSender<SessionUpdate>,
    provider: Provider,
) -> StdoutReadReport {
    // Same dispatch shape as `session_dispatch::dispatch`: each provider
    // owns a different NDJSON parser, so the switch lives here rather
    // than on the adapter trait. Adding a provider = one new arm.
    match provider.id() {
        "anthropic" => read_claude_stdout(stdout, tx).await,
        "openai" => read_codex_stdout(stdout, tx).await,
        "gemini" => {
            read_gemini_stdout(stdout, tx).await;
            StdoutReadReport::default()
        }
        unknown => {
            tracing::error!(
                "[houston:stdout] no parser registered for provider {unknown:?} — dropping output"
            );
            StdoutReadReport::default()
        }
    }
}

async fn read_claude_stdout(
    stdout: tokio::process::ChildStdout,
    tx: mpsc::UnboundedSender<SessionUpdate>,
) -> StdoutReadReport {
    let reader = BufReader::new(stdout);
    let mut lines = reader.lines();
    let mut acc = parser::StreamAccumulator::new();
    let mut line_count = 0u64;
    let mut item_count = 0u64;
    let mut report = StdoutReadReport::default();
    while let Ok(Some(line)) = lines.next_line().await {
        line_count += 1;
        let line_type = line.trim().chars().take(80).collect::<String>();
        tracing::debug!("[houston:stdout:claude] line {line_count}: {line_type}");

        if let Some(sid) = parser::extract_session_id(&line) {
            let _ = tx.send(SessionUpdate::SessionId(sid));
        }
        if detect_malformed_provider_json(&line) {
            report.malformed_provider_json = true;
            tracing::warn!("[houston:stdout:claude] suppressed malformed provider JSON error");
            continue;
        }
        let items = parser::parse_event(&line, &mut acc);
        mark_auth_error(&items, &mut report);
        item_count += log_and_send(&tx, items);
    }
    tracing::debug!(
        "[houston:stdout:claude] stream ended. {line_count} lines, {item_count} feed items"
    );
    report
}

async fn read_codex_stdout(
    stdout: tokio::process::ChildStdout,
    tx: mpsc::UnboundedSender<SessionUpdate>,
) -> StdoutReadReport {
    let reader = BufReader::new(stdout);
    let mut lines = reader.lines();
    let mut acc = codex_parser::CodexAccumulator::new();
    let mut line_count = 0u64;
    let mut item_count = 0u64;
    let mut report = StdoutReadReport::default();
    while let Ok(Some(line)) = lines.next_line().await {
        line_count += 1;
        let line_type = line.trim().chars().take(80).collect::<String>();
        tracing::debug!("[houston:stdout:codex] line {line_count}: {line_type}");

        if let Some(tid) = codex_parser::extract_thread_id(&line) {
            let _ = tx.send(SessionUpdate::SessionId(tid));
        }
        let items = codex_parser::parse_codex_event(&line, &mut acc);
        mark_auth_error(&items, &mut report);
        mark_model_unsupported(&items, &mut report);
        item_count += log_and_send(&tx, items);
    }
    tracing::debug!(
        "[houston:stdout:codex] stream ended. {line_count} lines, {item_count} feed items"
    );
    report
}

fn mark_auth_error(items: &[FeedItem], report: &mut StdoutReadReport) {
    if report.saw_auth_error {
        return;
    }
    for item in items {
        match item {
            FeedItem::SystemMessage(msg) if is_auth_error(msg) => {
                report.saw_auth_error = true;
                return;
            }
            // Post-classifier migration: claude's `result {is_error:true}`
            // events route through `anthropic_classify` and surface as a
            // typed `ProviderError::Unauthenticated` rather than a generic
            // `SystemMessage`. Pre-migration code only matched the latter.
            FeedItem::ProviderError(ProviderError::Unauthenticated { .. }) => {
                report.saw_auth_error = true;
                return;
            }
            _ => {}
        }
    }
}

fn mark_model_unsupported(items: &[FeedItem], report: &mut StdoutReadReport) {
    if report.saw_model_unsupported_error {
        return;
    }
    // Migrated from the legacy `ToolRuntimeErrorKind::ProviderModelUnsupported`
    // emission to the typed `ProviderError::ModelUnavailable` variant — the
    // codex parser now classifies the "is not supported when using Codex
    // with a ChatGPT account" pattern via `openai_classify::classify_stderr`.
    if items.iter().any(|item| {
        matches!(
            item,
            FeedItem::ProviderError(ProviderError::ModelUnavailable { .. })
        )
    }) {
        report.saw_model_unsupported_error = true;
    }
}

async fn read_gemini_stdout(
    stdout: tokio::process::ChildStdout,
    tx: mpsc::UnboundedSender<SessionUpdate>,
) {
    let reader = BufReader::new(stdout);
    let mut lines = reader.lines();
    let mut acc = gemini_parser::GeminiAccumulator::new();
    let mut line_count = 0u64;
    let mut item_count = 0u64;
    while let Ok(Some(line)) = lines.next_line().await {
        line_count += 1;
        let line_type = line.trim().chars().take(80).collect::<String>();
        tracing::debug!("[houston:stdout:gemini] line {line_count}: {line_type}");

        if let Some(sid) = gemini_parser::extract_session_id(&line) {
            let _ = tx.send(SessionUpdate::SessionId(sid));
        }
        let items = gemini_parser::parse_gemini_event(&line, &mut acc);
        item_count += log_and_send(&tx, items);
    }
    tracing::debug!(
        "[houston:stdout:gemini] stream ended. {line_count} lines, {item_count} feed items"
    );
}

fn log_and_send(tx: &mpsc::UnboundedSender<SessionUpdate>, items: Vec<FeedItem>) -> u64 {
    let mut count = 0u64;
    for item in &items {
        count += 1;
        match item {
            FeedItem::AssistantTextStreaming(t) => {
                tracing::debug!(
                    "[houston:stdout] -> FeedItem::AssistantTextStreaming ({} chars)",
                    t.len()
                );
            }
            FeedItem::AssistantText(t) => {
                tracing::debug!(
                    "[houston:stdout] -> FeedItem::AssistantText ({} chars)",
                    t.len()
                );
            }
            other => {
                tracing::debug!(
                    "[houston:stdout] -> FeedItem::{:?}",
                    std::mem::discriminant(other)
                );
            }
        }
    }
    for item in items {
        let _ = tx.send(SessionUpdate::Feed(item));
    }
    count
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mark_auth_error_flags_401_system_message() {
        let items = vec![FeedItem::SystemMessage(
            "Error: Failed to authenticate. API Error: 401 Invalid authentication credentials"
                .to_string(),
        )];
        let mut report = StdoutReadReport::default();
        mark_auth_error(&items, &mut report);
        assert!(report.saw_auth_error);
    }

    #[test]
    fn mark_auth_error_ignores_unrelated_messages() {
        let items = vec![
            FeedItem::AssistantText("hello".to_string()),
            FeedItem::SystemMessage("Some unrelated info".to_string()),
        ];
        let mut report = StdoutReadReport::default();
        mark_auth_error(&items, &mut report);
        assert!(!report.saw_auth_error);
    }

    #[test]
    fn mark_auth_error_flags_claude_result_error_via_parser() {
        let line = r#"{"type":"result","subtype":"error","is_error":true,"result":"Claude Code is not authenticated. Run claude auth login"}"#;
        let mut acc = parser::StreamAccumulator::new();
        let items = parser::parse_event(line, &mut acc);
        let mut report = StdoutReadReport::default();
        mark_auth_error(&items, &mut report);
        assert!(
            report.saw_auth_error,
            "claude 401 result event should set saw_auth_error"
        );
    }
}
