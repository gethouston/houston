//! Generic session lifecycle: spawn → monitor → emit events → persist → collect response.
//!
//! Replaces the duplicated "spawn + tokio::spawn + match update" pattern
//! that apps previously implemented manually.

use crate::session_id_tracker::SessionIdHandle;
use crate::session_pids::{PidInsert, SessionPidMap};
use houston_db::Database;
use houston_terminal_manager::auth_error::{is_auth_error, is_auth_retry_marker};
use houston_terminal_manager::provider_auth::ProviderAuthState;
use houston_terminal_manager::provider_error_kind::ProviderError;
use houston_terminal_manager::{FeedItem, Provider, SessionManager, SessionStatus, SessionUpdate};
use houston_ui_events::{DynEventSink, HoustonEvent};
use std::path::PathBuf;
use std::sync::Arc;

/// Hook into provider-emitted lifecycle signals the generic session loop
/// can't act on directly. Today fires on `UsageLimitPaused` (the CLI
/// went to sleep waiting for its plan-window reset) and again when
/// output resumes — so the embedder can persist run-specific state
/// (e.g. `routine_run.paused_until`) without `agents-conversations`
/// needing to know about routines.
pub trait SessionLifecycle: Send + Sync {
    fn on_paused(&self, resets_at: Option<String>, message: String);
    fn on_resumed(&self);
}

/// Result of a completed session.
pub struct SessionResult {
    pub response_text: Option<String>,
    pub claude_session_id: Option<String>,
    pub error: Option<String>,
}

/// Options for feed persistence.
#[derive(Clone)]
pub struct PersistOptions {
    pub db: Database,
    pub source: String,
    /// The user message that started this turn. Persisted once the provider
    /// session ID is known. Runner consumes this on SessionUpdate::SessionId.
    pub user_message: Option<String>,
    /// Set automatically once the session reports its ID via
    /// SessionUpdate::SessionId. Do not set manually.
    pub claude_session_id: Option<String>,
    /// Optional lifecycle hook for pause/resume signals. Currently used by
    /// the routine dispatcher to flip a `routine_run.paused_until` field on
    /// disk when the Anthropic CLI sleeps on a plan-window usage limit.
    #[allow(clippy::type_complexity)]
    pub lifecycle: Option<Arc<dyn SessionLifecycle>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum AuthFeedAction {
    None,
    DeferUntilExit,
    VerifyProviderStatus,
    RequireNow,
}

fn classify_auth_feed_message(provider: Provider, message: &str) -> AuthFeedAction {
    if is_auth_retry_marker(message) {
        AuthFeedAction::DeferUntilExit
    } else if is_auth_error(message) {
        AuthFeedAction::RequireNow
    } else if is_opaque_claude_auth_error(provider, message) {
        AuthFeedAction::VerifyProviderStatus
    } else {
        AuthFeedAction::None
    }
}

async fn provider_auth_state(provider: Provider) -> ProviderAuthState {
    // Probe via the resolved CLI path so each provider's auth check is
    // colocated with its adapter. Providers without a resolvable CLI
    // return `Unknown`, matching the pre-refactor codex behavior.
    let (_, cli_path) = provider.resolve();
    match cli_path {
        Some(path) => provider.probe_auth(&path).await,
        None => ProviderAuthState::Unknown,
    }
}

/// Spawn a provider session, emit events, optionally persist feed items, and return
/// a JoinHandle that resolves to the final response.
///
/// Automatically calls `claude_path::init()` (idempotent via `OnceLock`)
/// so apps don't need to remember to initialize PATH resolution.
pub fn spawn_and_monitor(
    sink: DynEventSink,
    agent_path: String,
    session_key: String,
    prompt: String,
    resume_id: Option<String>,
    resume_fallback_prompt: Option<String>,
    working_dir: PathBuf,
    system_prompt: Option<String>,
    session_id_handle: Option<SessionIdHandle>,
    persist: Option<PersistOptions>,
    pid_map: Option<SessionPidMap>,
    provider: Provider,
    model: Option<String>,
    effort: Option<String>,
) -> tokio::task::JoinHandle<SessionResult> {
    // Ensure the user's shell PATH is resolved before spawning.
    // OnceLock inside init() makes this a no-op after the first call.
    houston_terminal_manager::claude_path::init();

    let provider_kind = provider;
    let provider_str = provider.to_string();

    // Keep a copy of the resolved model name for DB persistence. The value
    // moves into spawn_session below and is not accessible inside the async
    // block otherwise.
    let model_for_persist = model.clone();

    let (mut rx, _handle) = SessionManager::spawn_session(
        provider,
        prompt,
        resume_id,
        resume_fallback_prompt,
        Some(working_dir),
        model,
        effort,
        system_prompt,
        None,  // mcp_config
        false, // disable_builtin_tools
        false, // disable_all_tools
    );

    let sink = sink;
    let key = session_key;
    let agent_path_for_events = agent_path;
    let mut persist = persist;
    let original_user_message = persist.as_ref().and_then(|opts| opts.user_message.clone());
    tokio::spawn(async move {
        let mut response_text: Option<String> = None;
        let mut claude_session_id: Option<String> = None;
        let mut error: Option<String> = None;
        let mut saw_auth_error = false;
        let mut sent_auth_checking = false;
        let mut sent_auth_required = false;
        let mut paused_signaled = false;

        while let Some(update) = rx.recv().await {
            match update {
                SessionUpdate::ProcessPid(pid) => {
                    if let Some(ref pm) = pid_map {
                        if pm.insert(key.clone(), pid).await == PidInsert::AlreadyCancelled {
                            // Stop was pressed before this PID existed
                            // (slow prep or a provider retry respawn).
                            // Kill it now or it runs to completion behind
                            // the "Stopped by user" message (issue #469).
                            tracing::info!(
                                "[session_runner] pid {pid} arrived for cancelled session {key} — terminating"
                            );
                            if !crate::process_kill::terminate_process_tree(pid).await {
                                tracing::error!(
                                    "[session_runner] could not confirm late-spawn kill for cancelled session {key} (pid {pid})"
                                );
                            }
                        }
                    }
                    continue;
                }
                SessionUpdate::Feed(ref item) => {
                    if let FeedItem::AssistantText(text) = item {
                        response_text = Some(text.clone());
                    }

                    // Lifecycle hook: usage-limit pause/resume. The CLI
                    // sleeps internally until its reset window, so the
                    // stream stays open but goes quiet. Notify the
                    // embedder so it can flip persisted state (e.g.
                    // `routine_run.paused_until`). Any subsequent
                    // assistant/tool output is treated as the resume.
                    let lifecycle_ref =
                        persist.as_ref().and_then(|p| p.lifecycle.as_deref());
                    notify_lifecycle(item, lifecycle_ref, &mut paused_signaled);
                    // Collapse ALL auth-flavored system messages into a single
                    // "Checking connection..." banner. Covers three shapes we've
                    // seen in the wild:
                    //   1. `__auth_retry__` — synthetic marker from codex_parser
                    //      when the Codex retry banner ("Reconnecting... N/5 ...")
                    //      is detected.
                    //   2. Bare `Error: unexpected status 401 Unauthorized ...` —
                    //      what Codex emits on the initial failure, before its
                    //      retry loop prints "Reconnecting...".
                    //   3. `not authenticated` / stderr-dumped auth errors.
                    //
                    // All three are auth noise, not user-visible content.
                    // Retry markers are provisional: Codex may refresh and
                    // recover, so only remember them and wait for session
                    // exit. Terminal auth messages emit AuthRequired once
                    // and emit "Checking connection..." exactly once.
                    if let FeedItem::SystemMessage(msg) = item {
                        match classify_auth_feed_message(provider_kind, msg) {
                            AuthFeedAction::None => {}
                            AuthFeedAction::DeferUntilExit => {
                                saw_auth_error = true;
                                tracing::info!(
                                    "[session_runner] auth retry marker detected — deferring AuthRequired until session exit"
                                );
                                continue;
                            }
                            AuthFeedAction::VerifyProviderStatus => {
                                let auth_state = provider_auth_state(provider_kind).await;
                                if auth_state != ProviderAuthState::Unauthenticated {
                                    tracing::info!(
                                        "[session_runner] opaque provider error was not confirmed as logout: provider={provider_str}, auth_state={auth_state:?}"
                                    );
                                } else {
                                    saw_auth_error = true;
                                    if !sent_auth_required {
                                        sent_auth_required = true;
                                        tracing::info!(
                                            "[session_runner] emitting AuthRequired for provider={provider_str} after status verification"
                                        );
                                        sink.emit(HoustonEvent::AuthRequired {
                                            provider: provider_str.clone(),
                                            message: msg.clone(),
                                        });
                                    }
                                    if !sent_auth_checking {
                                        sent_auth_checking = true;
                                        tracing::info!(
                                            "[session_runner] auth issue detected ({msg:?}) — emitting Checking connection..."
                                        );
                                        sink.emit(HoustonEvent::FeedItem {
                                            agent_path: agent_path_for_events.clone(),
                                            session_key: key.clone(),
                                            item: FeedItem::SystemMessage(
                                                "Checking connection...".to_string(),
                                            ),
                                        });
                                    }
                                    continue;
                                }
                            }
                            AuthFeedAction::RequireNow => {
                                saw_auth_error = true;
                                if !sent_auth_required {
                                    sent_auth_required = true;
                                    tracing::info!(
                                        "[session_runner] emitting AuthRequired for provider={provider_str} from feed"
                                    );
                                    sink.emit(HoustonEvent::AuthRequired {
                                        provider: provider_str.clone(),
                                        message: msg.clone(),
                                    });
                                }
                                if !sent_auth_checking {
                                    sent_auth_checking = true;
                                    tracing::info!(
                                        "[session_runner] auth issue detected ({msg:?}) — emitting Checking connection..."
                                    );
                                    sink.emit(HoustonEvent::FeedItem {
                                        agent_path: agent_path_for_events.clone(),
                                        session_key: key.clone(),
                                        item: FeedItem::SystemMessage(
                                            "Checking connection...".to_string(),
                                        ),
                                    });
                                } else {
                                    tracing::debug!(
                                        "[session_runner] additional auth noise suppressed: {msg:?}"
                                    );
                                }
                                // Skip persisting and emitting the raw message.
                                continue;
                            }
                        }
                    }
                    sink.emit(HoustonEvent::FeedItem {
                        agent_path: agent_path_for_events.clone(),
                        session_key: key.clone(),
                        item: item.clone(),
                    });
                    // Persist non-streaming items once the provider session id is known.
                    if let Some(ref opts) = persist {
                        if let (Some(sid), Some((ft, dj))) =
                            (opts.claude_session_id.as_ref(), serialize_for_persist(item, model_for_persist.as_deref()))
                        {
                            let db = opts.db.clone();
                            let src = opts.source.clone();
                            let sid = sid.clone();
                            tokio::spawn(async move {
                                if let Err(e) =
                                    db.add_chat_feed_item_by_session(&sid, &ft, &dj, &src).await
                                {
                                    tracing::warn!(
                                        "[session_runner] failed to persist feed item: {e}"
                                    );
                                }
                            });
                        }
                    }
                }
                SessionUpdate::ResumeInvalid => {
                    if let Some(ref h) = session_id_handle {
                        h.clear_current_preserving_history().await;
                    }
                    claude_session_id = None;
                    if let Some(ref mut opts) = persist {
                        opts.claude_session_id = None;
                        restore_pending_user_message(
                            &mut opts.user_message,
                            &original_user_message,
                        );
                    }
                    continue;
                }
                SessionUpdate::SessionId(sid) => {
                    claude_session_id = Some(sid.clone());
                    // SessionIdHandle owns disk persistence — .sid file is written
                    // here so --resume survives app restarts.
                    if let Some(ref h) = session_id_handle {
                        h.set(sid.clone()).await;
                    }
                    // Track the session ID and persist the pending user message.
                    if let Some(ref mut opts) = persist {
                        opts.claude_session_id = Some(sid.clone());
                        if let Some(user_msg) = opts.user_message.take() {
                            // Emit a FeedItem event for the user message so
                            // other connected clients (mobile → desktop
                            // echo, multi-window) pick it up over the
                            // session:{key} WS topic immediately. Without
                            // this, cross-client echo only happens after a
                            // full history reload.
                            sink.emit(HoustonEvent::FeedItem {
                                agent_path: agent_path_for_events.clone(),
                                session_key: key.clone(),
                                item: FeedItem::UserMessage(user_msg.clone()),
                            });
                            let db = opts.db.clone();
                            let src = opts.source.clone();
                            let sid_clone = sid.clone();
                            let data = serde_json::Value::String(user_msg).to_string();
                            tokio::spawn(async move {
                                if let Err(e) = db
                                    .add_chat_feed_item_by_session(
                                        &sid_clone,
                                        "user_message",
                                        &data,
                                        &src,
                                    )
                                    .await
                                {
                                    tracing::warn!(
                                        "[session_runner] failed to persist user message: {e}"
                                    );
                                }
                            });
                        }
                    }
                }
                SessionUpdate::Status(ref status) => {
                    let (status_str, err) = match status {
                        SessionStatus::Starting => ("starting".into(), None),
                        SessionStatus::Running => ("running".into(), None),
                        SessionStatus::Completed => ("completed".into(), None),
                        SessionStatus::Error(e) => {
                            error = Some(e.clone());
                            ("error".into(), Some(e.clone()))
                        }
                    };

                    // Detect auth failures and emit AuthRequired so the frontend
                    // knows to render the inline reconnect card (which reads
                    // authRequired from the UI store and renders itself at the
                    // end of the message list via ChatPanel's `afterMessages`
                    // slot). No feed marker needed — the card is anchored to
                    // store state, not to a specific FeedItem.
                    if let SessionStatus::Error(ref e) = status {
                        let auth_error = if saw_auth_error || is_auth_error(e) {
                            true
                        } else if is_opaque_claude_auth_error(provider_kind, e) {
                            provider_auth_state(provider_kind).await
                                == ProviderAuthState::Unauthenticated
                        } else {
                            false
                        };
                        tracing::info!(
                            "[session_runner] session error: {e:?} | saw_auth_error={saw_auth_error} | is_auth_error={auth_error} | provider={provider_str}"
                        );
                        if auth_error && !sent_auth_required {
                            sent_auth_required = true;
                            tracing::info!(
                                "[session_runner] emitting AuthRequired for provider={provider_str}"
                            );
                            sink.emit(HoustonEvent::AuthRequired {
                                provider: provider_str.clone(),
                                message: e.clone(),
                            });
                        }
                    }

                    sink.emit(HoustonEvent::SessionStatus {
                        agent_path: agent_path_for_events.clone(),
                        session_key: key.clone(),
                        status: status_str,
                        error: err,
                    });
                }
            }
        }

        // Clean up PID tracking on completion
        if let Some(ref pm) = pid_map {
            pm.remove(&key).await;
        }

        SessionResult {
            response_text,
            claude_session_id,
            error,
        }
    })
}

/// Serialize a FeedItem for DB persistence. Returns None for streaming items
/// (they get replaced by their final versions).
///
/// `model` is injected into `final_result` rows so the analytics layer can
/// compute cost for providers (e.g. Codex) that don't report `cost_usd`
/// themselves. Absent on rows persisted before this field was added.
fn serialize_for_persist(item: &FeedItem, model: Option<&str>) -> Option<(String, String)> {
    match item {
        FeedItem::AssistantText(t) => Some(("assistant_text".into(), json_str(t))),
        FeedItem::UserMessage(t) => Some(("user_message".into(), json_str(t))),
        FeedItem::ToolRuntimeError { kind, details } => {
            let data = serde_json::json!({ "kind": kind, "details": details });
            Some(("tool_runtime_error".into(), data.to_string()))
        }
        FeedItem::ToolCall { name, input } => {
            let data = serde_json::json!({ "name": name, "input": input });
            Some(("tool_call".into(), data.to_string()))
        }
        FeedItem::ToolResult { content, is_error } => {
            let data = serde_json::json!({ "content": content, "is_error": is_error });
            Some(("tool_result".into(), data.to_string()))
        }
        FeedItem::SystemMessage(t) => Some(("system_message".into(), json_str(t))),
        FeedItem::FinalResult {
            result,
            cost_usd,
            duration_ms,
            usage,
        } => {
            // `usage` serializes to its TokenUsage object (or null) so the
            // context-usage indicator survives a history reload, same as the
            // live FeedItem event. `model` is persisted so the analytics layer
            // can compute cost for providers (e.g. Codex) that don't report
            // `cost_usd` themselves.
            let data = serde_json::json!({
                "result": result,
                "cost_usd": cost_usd,
                "duration_ms": duration_ms,
                "usage": usage,
                "model": model,
            });
            Some(("final_result".into(), data.to_string()))
        }
        FeedItem::FileChanges(changes) => {
            let data = serde_json::json!({
                "created": changes.created,
                "modified": changes.modified
            });
            Some(("file_changes".into(), data.to_string()))
        }
        FeedItem::Thinking(t) => Some(("thinking".into(), json_str(t))),
        FeedItem::ProviderError(err) => {
            // Persist the typed wire shape so resumed conversations
            // re-render the same card.
            let data = serde_json::to_string(err).unwrap_or_else(|_| "null".into());
            Some(("provider_error".into(), data))
        }
        FeedItem::ContextCompacted {
            trigger,
            pre_tokens,
        } => {
            // Persist the compaction divider so it survives a history reload,
            // matching the live FeedItem wire shape (`data` = the variant
            // fields). `trigger` serializes to "native"/"proactive".
            let data = serde_json::json!({ "trigger": trigger, "pre_tokens": pre_tokens });
            Some(("context_compacted".into(), data.to_string()))
        }
        FeedItem::ProviderSwitched {
            provider,
            summarized,
            pre_tokens,
        } => {
            // Persist the provider-switch divider so it survives a history
            // reload, matching the live FeedItem wire shape (`data` = the
            // variant fields). Engine-core emits + persists this directly at the
            // switch boundary (see `sessions::run_start`); this arm keeps the
            // FeedItem → feed_type mapping total for any future emitter.
            let data = serde_json::json!({
                "provider": provider,
                "summarized": summarized,
                "pre_tokens": pre_tokens,
            });
            Some(("provider_switched".into(), data.to_string()))
        }
        // Skip streaming items — they get replaced by finals.
        FeedItem::AssistantTextStreaming(_) | FeedItem::ThinkingStreaming(_) => None,
    }
}

fn json_str(s: &str) -> String {
    serde_json::Value::String(s.to_string()).to_string()
}

fn is_opaque_claude_auth_error(provider: Provider, message: &str) -> bool {
    provider.id() == "anthropic" && message.trim() == "Error: Unknown error"
}

/// Dispatch a feed item to the optional `SessionLifecycle` hook.
///
/// Two transitions are interesting:
/// - `UsageLimitPaused` → call `on_paused` and remember the paused state.
/// - When `paused_signaled` is set and any assistant/tool/thinking item
///   arrives, the CLI has resumed → call `on_resumed` and clear the flag.
///
/// Everything else is a no-op. Extracted as a free function so the
/// transition table is testable without driving a real subprocess.
fn notify_lifecycle(
    item: &FeedItem,
    lifecycle: Option<&dyn SessionLifecycle>,
    paused_signaled: &mut bool,
) {
    if let FeedItem::ProviderError(ProviderError::UsageLimitPaused {
        resets_at, message, ..
    }) = item
    {
        if let Some(lc) = lifecycle {
            lc.on_paused(resets_at.clone(), message.clone());
        }
        *paused_signaled = true;
        return;
    }

    let is_progress = matches!(
        item,
        FeedItem::AssistantText(_)
            | FeedItem::AssistantTextStreaming(_)
            | FeedItem::ToolCall { .. }
            | FeedItem::Thinking(_)
            | FeedItem::ThinkingStreaming(_)
    );
    if *paused_signaled && is_progress {
        if let Some(lc) = lifecycle {
            lc.on_resumed();
        }
        *paused_signaled = false;
    }
}

fn restore_pending_user_message(current: &mut Option<String>, original: &Option<String>) {
    if current.is_none() {
        *current = original.clone();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn anthropic() -> Provider {
        "anthropic".parse().unwrap()
    }
    fn openai() -> Provider {
        "openai".parse().unwrap()
    }

    #[test]
    fn opaque_claude_result_error_requires_status_verification() {
        assert_eq!(
            classify_auth_feed_message(anthropic(), "Error: Unknown error"),
            AuthFeedAction::VerifyProviderStatus
        );
    }

    #[test]
    fn identifies_opaque_claude_auth_error_shape() {
        assert!(is_opaque_claude_auth_error(
            anthropic(),
            "Error: Unknown error"
        ));
    }

    #[test]
    fn does_not_treat_codex_unknown_error_as_auth() {
        assert!(!is_opaque_claude_auth_error(
            openai(),
            "Error: Unknown error"
        ));
    }

    #[test]
    fn codex_retry_marker_defers_auth_required_until_exit() {
        assert_eq!(
            classify_auth_feed_message(openai(), "__auth_retry__"),
            AuthFeedAction::DeferUntilExit
        );
    }

    #[test]
    fn codex_terminal_auth_message_requires_auth_now() {
        assert_eq!(
            classify_auth_feed_message(
                openai(),
                "Error: unexpected status 401 Unauthorized: Missing bearer"
            ),
            AuthFeedAction::RequireNow
        );
    }

    #[test]
    fn resume_invalid_restores_consumed_user_message() {
        let original = Some("retry this".to_string());
        let mut current = None;

        restore_pending_user_message(&mut current, &original);

        assert_eq!(current, original);
    }

    #[test]
    fn resume_invalid_keeps_existing_user_message() {
        let original = Some("first".to_string());
        let mut current = Some("current".to_string());

        restore_pending_user_message(&mut current, &original);

        assert_eq!(current.as_deref(), Some("current"));
    }

    #[derive(Default)]
    struct RecordingLifecycle {
        paused_calls: std::sync::Mutex<Vec<(Option<String>, String)>>,
        resume_calls: std::sync::Mutex<u32>,
    }

    impl SessionLifecycle for RecordingLifecycle {
        fn on_paused(&self, resets_at: Option<String>, message: String) {
            self.paused_calls.lock().unwrap().push((resets_at, message));
        }
        fn on_resumed(&self) {
            *self.resume_calls.lock().unwrap() += 1;
        }
    }

    #[test]
    fn notify_lifecycle_fires_on_usage_limit_paused() {
        let lc = RecordingLifecycle::default();
        let mut paused = false;
        let item = FeedItem::ProviderError(ProviderError::UsageLimitPaused {
            provider: "anthropic".into(),
            resets_at: Some("5pm".into()),
            message: "banner".into(),
        });
        notify_lifecycle(&item, Some(&lc), &mut paused);
        assert!(paused);
        assert_eq!(lc.paused_calls.lock().unwrap().len(), 1);
        assert_eq!(*lc.resume_calls.lock().unwrap(), 0);
    }

    #[test]
    fn notify_lifecycle_fires_resumed_only_after_pause() {
        let lc = RecordingLifecycle::default();
        let mut paused = false;
        // Plain content before any pause → no resume call.
        notify_lifecycle(
            &FeedItem::AssistantText("hi".into()),
            Some(&lc),
            &mut paused,
        );
        assert!(!paused);
        assert_eq!(*lc.resume_calls.lock().unwrap(), 0);

        // Pause.
        notify_lifecycle(
            &FeedItem::ProviderError(ProviderError::UsageLimitPaused {
                provider: "anthropic".into(),
                resets_at: None,
                message: "b".into(),
            }),
            Some(&lc),
            &mut paused,
        );
        assert!(paused);

        // Content after pause → resume fires once.
        notify_lifecycle(
            &FeedItem::AssistantText("hello again".into()),
            Some(&lc),
            &mut paused,
        );
        assert!(!paused);
        assert_eq!(*lc.resume_calls.lock().unwrap(), 1);
    }

    #[test]
    fn notify_lifecycle_ignored_when_no_handler() {
        let mut paused = false;
        notify_lifecycle(
            &FeedItem::ProviderError(ProviderError::UsageLimitPaused {
                provider: "anthropic".into(),
                resets_at: None,
                message: "b".into(),
            }),
            None,
            &mut paused,
        );
        // Without a handler we still track the paused flag so the next
        // resume signal doesn't fire spuriously when one is installed.
        assert!(paused);
    }

    #[test]
    fn serializes_tool_runtime_error_for_history() {
        let item = FeedItem::ToolRuntimeError {
            kind: houston_terminal_manager::ToolRuntimeErrorKind::LocalTool,
            details: "exec failed".to_string(),
        };

        let (feed_type, data) = serialize_for_persist(&item, None).expect("serializes");

        assert_eq!(feed_type, "tool_runtime_error");
        assert_eq!(data, r#"{"details":"exec failed","kind":"local_tool"}"#);
    }

    #[test]
    fn final_result_persists_token_usage_for_history() {
        // The context-usage indicator reads usage back from history on reload,
        // so the persisted JSON must carry the TokenUsage object.
        let item = FeedItem::FinalResult {
            result: "Done".to_string(),
            cost_usd: Some(0.01),
            duration_ms: Some(1200),
            usage: Some(houston_terminal_manager::TokenUsage {
                context_tokens: 151_500,
                output_tokens: 420,
                cached_tokens: 150_000,
            }),
        };

        let (feed_type, data) = serialize_for_persist(&item, Some("claude-sonnet-4-6")).expect("serializes");

        assert_eq!(feed_type, "final_result");
        let parsed: serde_json::Value = serde_json::from_str(&data).unwrap();
        assert_eq!(parsed["usage"]["context_tokens"], 151_500);
        assert_eq!(parsed["usage"]["cached_tokens"], 150_000);
        assert_eq!(parsed["usage"]["output_tokens"], 420);
        assert_eq!(parsed["model"], "claude-sonnet-4-6");
    }

    #[test]
    fn final_result_persists_model_for_cost_analytics() {
        // The analytics layer needs the model to compute cost for providers
        // (e.g. Codex) that don't report cost_usd. `gpt-5.5` is the OpenAI id
        // Houston's picker produces.
        let item = FeedItem::FinalResult {
            result: "Done".to_string(),
            cost_usd: None,
            duration_ms: Some(3000),
            usage: Some(houston_terminal_manager::TokenUsage {
                context_tokens: 10_000,
                output_tokens: 500,
                cached_tokens: 8_000,
            }),
        };

        let (_, data) = serialize_for_persist(&item, Some("gpt-5.5")).expect("serializes");
        let parsed: serde_json::Value = serde_json::from_str(&data).unwrap();
        assert_eq!(parsed["model"], "gpt-5.5");
        assert!(parsed["cost_usd"].is_null());
    }

    #[test]
    fn final_result_model_null_when_not_provided() {
        // Rows persisted before the model field was added (or sessions where
        // the model is unknown) must not fail deserialization.
        let item = FeedItem::FinalResult {
            result: "Done".to_string(),
            cost_usd: Some(0.05),
            duration_ms: None,
            usage: None,
        };

        let (_, data) = serialize_for_persist(&item, None).expect("serializes");
        let parsed: serde_json::Value = serde_json::from_str(&data).unwrap();
        assert!(parsed["model"].is_null());
    }

    #[test]
    fn context_compacted_persists_for_history() {
        // The compaction divider must survive a history reload, so it
        // serializes to its wire shape (`trigger` + `pre_tokens`).
        let item = FeedItem::ContextCompacted {
            trigger: houston_terminal_manager::CompactTrigger::Proactive,
            pre_tokens: Some(185_000),
        };

        let (feed_type, data) = serialize_for_persist(&item, None).expect("serializes");

        assert_eq!(feed_type, "context_compacted");
        let parsed: serde_json::Value = serde_json::from_str(&data).unwrap();
        assert_eq!(parsed["trigger"], "proactive");
        assert_eq!(parsed["pre_tokens"], 185_000);
    }

    #[test]
    fn context_compacted_native_without_pre_tokens_persists_null() {
        let item = FeedItem::ContextCompacted {
            trigger: houston_terminal_manager::CompactTrigger::Native,
            pre_tokens: None,
        };

        let (feed_type, data) = serialize_for_persist(&item, None).expect("serializes");

        assert_eq!(feed_type, "context_compacted");
        let parsed: serde_json::Value = serde_json::from_str(&data).unwrap();
        assert_eq!(parsed["trigger"], "native");
        assert!(parsed["pre_tokens"].is_null());
    }

    #[test]
    fn final_result_without_usage_persists_null() {
        let item = FeedItem::FinalResult {
            result: "Done".to_string(),
            cost_usd: None,
            duration_ms: None,
            usage: None,
        };

        let (_, data) = serialize_for_persist(&item, None).expect("serializes");
        let parsed: serde_json::Value = serde_json::from_str(&data).unwrap();
        assert!(parsed["usage"].is_null());
    }
}
