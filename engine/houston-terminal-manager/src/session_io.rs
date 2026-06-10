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
    /// True when claude's very first stdout line is a `result` event with
    /// `subtype:"error_during_execution"` and `duration_ms == 0`. That
    /// combination is the runtime signature of a corrupted resume — the
    /// CLI tries to replay the on-disk transcript at
    /// `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`, finds an
    /// unrecoverable shape (dangling tool_use without tool_result,
    /// truncated trailing line, etc.) and bombs out before issuing any
    /// API call. The runner uses this flag to silently retry the spawn
    /// without `--resume` rather than surfacing a useless "claude hit a
    /// runtime error" status to the user. See the production logs for
    /// 2026-05-22 (Luisa Postres / Chef - Checho) where 11 successive
    /// turns hit this state for the same session_key with rotating
    /// resume_ids — each retry from the UI re-pinned the same broken
    /// transcript, and the user perceived it as the conversation being
    /// frozen and her history vanishing.
    pub saw_resume_corrupted: bool,
    /// True when the stdout parser already emitted a typed
    /// [`FeedItem::ProviderError`] for this stream (rate-limit, internal
    /// 5xx, quota, malformed, `Unknown`, …). `handle_failed_exit` reads
    /// this to avoid stacking its generic spawn-failure card on top of the
    /// already-shown typed card — claude reports API failures (e.g. a 429)
    /// as a `result` event on stdout with empty stderr, so without this the
    /// failed-exit path emitted a second `SpawnFailed` card next to the real
    /// `RateLimited` one. Auth + model-unsupported keep their own dedicated
    /// flags (they drive extra control flow); this is the catch-all.
    pub saw_provider_error: bool,
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
        // First-line `result` with `subtype:"error_during_execution"` +
        // `duration_ms == 0` is the corrupted-resume signature. Replace
        // the useless "Unknown error" parse result with a typed
        // `SessionResumeMissing` card so the user sees a clear "we had
        // to restart this session" message in the feed — then mark the
        // report so the runner can silently retry without `--resume`.
        // The card stays in the feed as historical context for why the
        // assistant's next response will not remember prior turns.
        if line_count == 1 && detect_claude_resume_corrupted(&line) {
            report.saw_resume_corrupted = true;
            tracing::warn!(
                "[houston:stdout:claude] corrupted-resume signature (line 1) — emitting SessionResumeMissing card + flagging for retry-fresh"
            );
            let session_id = parser::extract_session_id(&line).unwrap_or_default();
            let _ = tx.send(SessionUpdate::Feed(FeedItem::ProviderError(
                ProviderError::SessionResumeMissing {
                    provider: "anthropic".to_string(),
                    session_id,
                },
            )));
            continue;
        }
        let items = parser::parse_event(&line, &mut acc);
        mark_auth_error(&items, &mut report);
        mark_provider_error(&items, &mut report);
        item_count += log_and_send(&tx, items);
    }
    tracing::debug!(
        "[houston:stdout:claude] stream ended. {line_count} lines, {item_count} feed items"
    );
    report
}

/// Detect the on-the-wire shape of a claude `--resume` failure: the very
/// first stdout line is `{"type":"result","subtype":"error_during_execution","duration_ms":0,...}`.
///
/// `duration_ms == 0` plus `error_during_execution` on the first event
/// means the CLI failed before issuing any API call — in practice, the
/// `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl` transcript the
/// `--resume <id>` flag points to is unrecoverable (dangling tool_use,
/// truncated trailing line). Any non-zero duration would mean the API
/// was actually contacted, and any non-`result` first line (`system
/// init`, `assistant`, `stream_event`, etc.) means claude was already in
/// flight and the failure is mid-stream — neither case is a resume bug,
/// so we deliberately keep the matcher narrow.
fn detect_claude_resume_corrupted(line: &str) -> bool {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(line.trim()) else {
        return false;
    };
    let obj = match value.as_object() {
        Some(o) => o,
        None => return false,
    };
    let is_result = obj.get("type").and_then(|v| v.as_str()) == Some("result");
    let is_corrupt_subtype =
        obj.get("subtype").and_then(|v| v.as_str()) == Some("error_during_execution");
    let zero_duration = obj.get("duration_ms").and_then(|v| v.as_u64()) == Some(0);
    is_result && is_corrupt_subtype && zero_duration
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
    // Codex thread id (from `thread.started`) — used to locate the rollout for
    // accurate context usage once the stream ends.
    let mut thread_id: Option<String> = None;
    // The terminal FinalResult is held back until the stream ends: its accurate
    // context usage lives in the rollout, which codex only fully flushes when
    // it exits (stdout EOF → this loop breaks). codex exec emits exactly one
    // turn.completed, so keeping the last one is sufficient.
    let mut final_result: Option<FeedItem> = None;
    while let Ok(Some(line)) = lines.next_line().await {
        line_count += 1;
        let line_type = line.trim().chars().take(80).collect::<String>();
        tracing::debug!("[houston:stdout:codex] line {line_count}: {line_type}");

        if let Some(tid) = codex_parser::extract_thread_id(&line) {
            thread_id = Some(tid.clone());
            let _ = tx.send(SessionUpdate::SessionId(tid));
        }
        let mut items = codex_parser::parse_codex_event(&line, &mut acc);
        mark_auth_error(&items, &mut report);
        mark_model_unsupported(&items, &mut report);
        mark_provider_error(&items, &mut report);
        if let Some(pos) = items
            .iter()
            .position(|item| matches!(item, FeedItem::FinalResult { .. }))
        {
            final_result = Some(items.remove(pos));
        }
        item_count += log_and_send(&tx, items);
    }

    // Stream ended → codex has exited and flushed its rollout. Patch the held
    // FinalResult with the accurate last-request usage, then emit it. On any
    // failure the usage stays None (indicator shows no %, never a wrong summed
    // number). See `codex_rollout` for why the exec stream alone can't give us
    // this.
    if let Some(mut fr) = final_result {
        if let FeedItem::FinalResult { usage, .. } = &mut fr {
            if let Some(tid) = thread_id.as_deref() {
                if let Some(accurate) = crate::codex_rollout::latest_usage(tid).await {
                    *usage = Some(accurate);
                }
            }
        }
        item_count += log_and_send(&tx, vec![fr]);
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

/// Flag that the parser emitted a typed [`ProviderError`] card from the
/// stdout stream so [`crate::cli_process::handle_failed_exit`] does not stack
/// its generic spawn-failure card on top. `Cancelled` is excluded — it is a
/// user-stop marker, not a failure that the exit path would otherwise want to
/// explain.
fn mark_provider_error(items: &[FeedItem], report: &mut StdoutReadReport) {
    if report.saw_provider_error {
        return;
    }
    if items.iter().any(|item| {
        matches!(
            item,
            FeedItem::ProviderError(e) if !matches!(e, ProviderError::Cancelled { .. })
        )
    }) {
        report.saw_provider_error = true;
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

    #[test]
    fn mark_provider_error_flags_claude_429_result_via_parser() {
        // claude reports a 429 as a stdout `result` event with empty stderr.
        // The parser emits ProviderError::RateLimited; the flag must be set so
        // handle_failed_exit does not stack a second SpawnFailed card.
        let line = r#"{"type":"result","subtype":"success","is_error":true,"api_error_status":429,"result":"interrupted"}"#;
        let mut acc = parser::StreamAccumulator::new();
        let items = parser::parse_event(line, &mut acc);
        let mut report = StdoutReadReport::default();
        mark_provider_error(&items, &mut report);
        assert!(report.saw_provider_error);
    }

    #[test]
    fn mark_provider_error_ignores_cancelled_and_plain_items() {
        let mut report = StdoutReadReport::default();
        mark_provider_error(
            &[FeedItem::ProviderError(ProviderError::Cancelled {
                provider: "anthropic".to_string(),
            })],
            &mut report,
        );
        assert!(
            !report.saw_provider_error,
            "Cancelled is a user-stop marker, not a failure card"
        );
        mark_provider_error(&[FeedItem::AssistantText("hi".to_string())], &mut report);
        assert!(!report.saw_provider_error);
    }

    #[test]
    fn detect_resume_corrupted_matches_production_signature() {
        // Verbatim shape from backend.log.2026-05-22 line 856 (Luisa
        // Postres / Chef - Checho activity-409b0b45). The session was
        // pinned to a broken transcript; claude exited at duration_ms=0
        // after 11 successive turns.
        let line = r#"{"type":"result","subtype":"error_during_execution","duration_ms":0,"duration_api_ms":0,"is_error":true,"num_turns":0,"session_id":"5f394669-2db7-4be2-b939-ce92176f6002"}"#;
        assert!(detect_claude_resume_corrupted(line));
    }

    #[test]
    fn detect_resume_corrupted_rejects_post_api_error() {
        // Same subtype but the API was actually contacted (non-zero
        // duration_ms). That's a legitimate mid-flight failure, not a
        // resume bug — must NOT auto-retry, or we'd hide real issues.
        let line = r#"{"type":"result","subtype":"error_during_execution","duration_ms":4200,"is_error":true}"#;
        assert!(!detect_claude_resume_corrupted(line));
    }

    #[test]
    fn detect_resume_corrupted_rejects_other_subtypes() {
        // A zero-duration `result` with a different subtype (e.g.
        // `success`, `error_max_turns`, plain `error`) does not match
        // the corrupted-resume signature.
        let cases = [
            r#"{"type":"result","subtype":"success","duration_ms":0,"is_error":false}"#,
            r#"{"type":"result","subtype":"error","duration_ms":0,"is_error":true}"#,
            r#"{"type":"result","subtype":"error_max_turns","duration_ms":0,"is_error":true}"#,
        ];
        for line in cases {
            assert!(
                !detect_claude_resume_corrupted(line),
                "expected no match for: {line}"
            );
        }
    }

    #[test]
    fn detect_resume_corrupted_rejects_non_result_events() {
        // `system init`, `assistant`, `stream_event` all happen BEFORE a
        // legitimate result event. Matching them would be a category
        // error — they aren't end-of-stream signals.
        let cases = [
            r#"{"type":"system","subtype":"init","session_id":"abc","cwd":"/tmp"}"#,
            r#"{"type":"assistant","message":{"id":"m1","content":[]}}"#,
            r#"{"type":"stream_event","event":{"type":"message_start"}}"#,
        ];
        for line in cases {
            assert!(
                !detect_claude_resume_corrupted(line),
                "expected no match for: {line}"
            );
        }
    }

    #[test]
    fn detect_resume_corrupted_rejects_invalid_json() {
        // Truncated / partial lines must not match — claude's first
        // stdout event is always a complete NDJSON object, so a bad
        // parse means the line is corrupted on our end, not a resume
        // signature.
        assert!(!detect_claude_resume_corrupted(""));
        assert!(!detect_claude_resume_corrupted("not json"));
        assert!(!detect_claude_resume_corrupted(
            r#"{"type":"result","subtype":"error_during_execution","duration_ms":"#
        ));
    }
}
