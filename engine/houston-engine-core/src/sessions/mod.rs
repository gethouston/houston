//! Session lifecycle — transport-neutral orchestration layer.
//!
//! Each Houston "session" is one running Claude/Codex CLI subprocess with a
//! stable `session_key` so follow-up turns can `--resume`. This module owns:
//!
//! - [`SessionRuntime`] — per-engine state (provider session-ID tracker,
//!   session-key → PID map). Held on `EngineState`, cloned per request.
//! - [`start`] — spawn + monitor a session via
//!   `houston-agents-conversations`, streaming updates to the engine's event
//!   sink (which WS clients subscribe to via `session:{key}` topics).
//! - [`cancel`] — SIGTERM the running CLI for a given session_key and emit
//!   a "Stopped by user" feed item + `completed` status.
//! - [`resolve_provider`] — agent-config → Anthropic default fallback.
//!
//! Callers (REST handlers, Tauri adapter) supply the already-resolved
//! `working_dir` and an optional pre-built `system_prompt`. Prompt assembly
//! lives in the adapter today; it will move into `engine-core` in a later
//! phase once `agent_store` is ported.

mod compaction;
mod control;
pub mod file_changes;
pub mod generate_instructions;
pub mod history;
mod provider_oneshot;
pub mod provider;
pub mod suggested_routine;
pub mod summarize;
mod summary_text;
mod workdir_locks;

use crate::agents::prompt as agent_prompt;
use crate::paths::EnginePaths;
use crate::CoreResult;
use control::{
    SessionControl, SessionIdentity, SessionTurnGuard, SessionTurnLocks, WorkdirActivity,
};
use houston_agents_conversations::session_id_tracker::SessionIdTracker;
use houston_agents_conversations::session_pids::SessionPidMap;
use houston_agents_conversations::session_runner::{self, PersistOptions};
use houston_db::Database;
use houston_terminal_manager::{CompactTrigger, FeedItem, Provider};
use houston_ui_events::{DynEventSink, HoustonEvent};
use std::path::{Path, PathBuf};
use workdir_locks::{WorkdirLocks, WorkdirSessionGuard};

pub use provider::{resolve_effort, resolve_provider, ResolvedProvider};

/// Engine-owned session state. Cheap to clone.
#[derive(Default, Clone)]
pub struct SessionRuntime {
    pub session_ids: SessionIdTracker,
    pub pid_map: SessionPidMap,
    workdir_locks: WorkdirLocks,
    control: SessionControl,
    turn_locks: SessionTurnLocks,
    workdir_activity: WorkdirActivity,
}

impl SessionRuntime {
    /// Acquire the per-folder session lock, waiting if another session is
    /// already running in that folder. Routines use this to serialize runs
    /// that share a working directory — two routines scheduled for the same
    /// time both run, one after the other, instead of the second being
    /// dropped (issue #362). The guard releases on drop.
    pub(crate) async fn acquire_workdir(&self, working_dir: &Path) -> WorkdirSessionGuard {
        self.workdir_locks.acquire(working_dir).await
    }

    async fn acquire_turn(&self, id: &SessionIdentity) -> SessionTurnGuard {
        self.turn_locks.acquire(id).await
    }
}

/// Parameters for [`start`]. Mirrors the shape of the old Tauri `send_message`
/// command but with every field transport-neutral.
#[derive(Debug, Clone)]
pub struct StartParams {
    /// Agent directory on disk (already `~`-expanded, absolute).
    pub agent_dir: PathBuf,
    /// Working directory the subprocess runs in. Usually same as `agent_dir`.
    pub working_dir: PathBuf,
    /// Stable key identifying this conversation slot.
    pub session_key: String,
    /// User-typed prompt for this turn.
    pub prompt: String,
    /// Pre-built system prompt (CLAUDE.md + seed + Composio guidance etc.).
    /// Engine does not assemble this today — caller supplies.
    pub system_prompt: Option<String>,
    /// Who sent the message. `"desktop"` by default.
    pub source: Option<String>,
    /// Resolved provider + model (caller either passes an override or calls
    /// [`resolve_provider`] first).
    pub provider: Provider,
    pub model: Option<String>,
    /// Reasoning effort override. For Codex, this becomes
    /// `-c model_reasoning_effort=<value>` (also overrides whatever the user
    /// has in their global `~/.codex/config.toml`). For Claude, it becomes
    /// `--effort <value>`. Accepted values vary per provider; the caller is
    /// responsible for passing something each CLI understands (e.g. "medium").
    pub effort: Option<String>,
    /// When `true`, the frontend has detected the context window is nearly
    /// full and wants this turn to run on a freshly-compacted session.
    /// Honored only when there's an existing session to compact; ignored on
    /// the first turn. See [`compaction`].
    pub compact: bool,
}

/// Start a session turn. The request is accepted immediately. Turns with the
/// same `session_key` queue so follow-up messages resume in order; different
/// session keys can run in the same folder at the same time.
pub async fn start(
    rt: &SessionRuntime,
    events: DynEventSink,
    db: Database,
    app_system_prompt: &str,
    params: StartParams,
) -> Result<String, crate::CoreError> {
    let session_key = params.session_key.clone();
    let agent_dir = params.agent_dir.clone();
    let agent_path = params.agent_dir.to_string_lossy().to_string();
    let identity = SessionIdentity::new(agent_path.clone(), session_key.clone());
    let generation = rt.control.register(&identity).await;
    let rt = rt.clone();
    let app_system_prompt = app_system_prompt.to_string();

    tokio::spawn({
        let events = events.clone();
        let identity = identity.clone();
        let session_key = session_key.clone();
        async move {
            if let Err(e) = run_start(
                &rt,
                events.clone(),
                db,
                &app_system_prompt,
                params,
                identity.clone(),
                generation,
            )
            .await
            {
                rt.control.finish(&identity).await;
                tracing::warn!("[sessions] queued start failed: {e}");
                // The optimistic UI flip already wrote `running` to the
                // activity row when the user pressed send. If `run_start`
                // bails before reaching its end-flip (e.g., `create_dir_all`
                // failed, `seed_agent` failed), the row would stay stuck on
                // `running` forever — visible as a permanently-spinning
                // mission. Flip to `error` here so the board reflects the
                // real terminal state.
                match crate::agents::activity::set_status_by_session_key(
                    &agent_dir,
                    &session_key,
                    "error",
                ) {
                    Ok(Some(_)) => {
                        events.emit(HoustonEvent::ActivityChanged {
                            agent_path: agent_path.clone(),
                        });
                    }
                    Ok(None) => { /* ad-hoc session, no board row to flip */ }
                    Err(activity_err) => {
                        tracing::warn!(
                            "[sessions] failed to flip activity on start failure: {activity_err} (session_key={session_key})"
                        );
                    }
                }
                events.emit(HoustonEvent::SessionStatus {
                    agent_path,
                    session_key,
                    status: "error".into(),
                    error: Some(e.to_string()),
                });
            }
        }
    });

    Ok(session_key)
}

async fn run_start(
    rt: &SessionRuntime,
    events: DynEventSink,
    db: Database,
    app_system_prompt: &str,
    params: StartParams,
    identity: SessionIdentity,
    generation: u64,
) -> Result<(), crate::CoreError> {
    let StartParams {
        agent_dir,
        working_dir,
        session_key,
        prompt,
        system_prompt,
        source,
        provider,
        model,
        effort,
        compact,
    } = params;

    if !agent_dir.exists() {
        std::fs::create_dir_all(&agent_dir)?;
    }

    let _turn_guard = rt.acquire_turn(&identity).await;
    if rt.control.is_stale(&identity, generation).await {
        tracing::info!("[sessions] skipping cancelled queued turn session_key={session_key}");
        // The desktop UI optimistically wrote `running` to the activity
        // row when the user pressed send (see the comment at the
        // `set_status_by_session_key("running")` call below). If we exit
        // here without resetting, the row stays stuck on `running`
        // forever — the kanban "running" column shows a permanently
        // spinning mission for work that never actually started, because
        // `cancel()` only kills the process / dequeues the turn and
        // doesn't touch the activity file. Flip to `needs_you` so the
        // user can retry, edit, or move to done.
        let agent_path = agent_dir.to_string_lossy().to_string();
        match crate::agents::activity::set_status_by_session_key(
            &agent_dir,
            &session_key,
            "needs_you",
        ) {
            Ok(Some(_)) => {
                events.emit(HoustonEvent::ActivityChanged { agent_path });
            }
            Ok(None) => { /* ad-hoc session, no board row to flip */ }
            Err(e) => {
                tracing::warn!(
                    "[sessions] failed to flip cancelled queued activity: {e} (session_key={session_key})"
                );
            }
        }
        rt.control.finish(&identity).await;
        return Ok(());
    }

    agent_prompt::seed_agent(&agent_dir).map_err(crate::CoreError::Internal)?;

    // Final system prompt is always `<product_prompt>\n\n---\n\n<agent_context>`.
    // - `product_prompt`: caller-supplied if present, otherwise whatever the
    //   embedding app (Houston desktop) passed in via `HOUSTON_APP_SYSTEM_PROMPT`.
    // - `agent_context`: assembled by the engine from disk (working-dir header,
    //   mode overlay, skills index, integrations list). Product-neutral.
    let agent_context =
        agent_prompt::build_agent_context(&agent_dir, Some(working_dir.as_path()), None);
    let product_prompt = system_prompt
        .as_deref()
        .filter(|s| !s.is_empty())
        .unwrap_or(app_system_prompt);
    let system_prompt = if product_prompt.is_empty() {
        Some(agent_context)
    } else {
        Some(format!("{product_prompt}\n\n---\n\n{agent_context}"))
    };

    let source = source.unwrap_or_else(|| "desktop".to_string());
    let activity_registration = rt.workdir_activity.register(&working_dir).await;
    let before_files = match file_changes::snapshot(&working_dir) {
        Ok(snapshot) => Some(snapshot),
        Err(e) => {
            tracing::warn!(
                "[sessions] failed to snapshot files before run: {e} (working_dir={})",
                working_dir.display()
            );
            None
        }
    };
    let agent_key = format!(
        "{}:{}:{}",
        working_dir.to_string_lossy(),
        provider,
        session_key
    );
    let sid_handle = rt
        .session_ids
        .get_for_session(&agent_key, &working_dir, &session_key, provider)
        .await;
    let agent_path = agent_dir.to_string_lossy().to_string();
    let mut resume_id = sid_handle.get().await;
    // What the CLI actually receives this turn. Normally the user's prompt;
    // for a forced compaction it becomes the summary-seeded prompt, while the
    // persisted/displayed user message stays the original (see `persist`).
    let mut cli_prompt = prompt.clone();

    // Forced autocompact (mechanism B): the frontend flagged this turn because
    // the context window is nearly full. Summarize the visible history,
    // abandon the current resume id (kept in `.history` so the chat stays
    // visible), and run this turn on a FRESH provider session seeded with the
    // summary. The user's chat_feed is never mutated.
    if compact {
        if let Some(old_id) = resume_id.clone() {
            match compaction::build_compaction_seed(
                &db,
                &working_dir,
                &agent_dir,
                &session_key,
                &prompt,
                provider,
                model.as_deref(),
            )
            .await
            {
                Ok(Some(seed)) => {
                    cli_prompt = seed.prompt;
                    // Emit the marker live so the divider appears immediately,
                    // and persist it under the OLD session id so it sits at the
                    // boundary between the prior turns and the fresh session.
                    events.emit(HoustonEvent::FeedItem {
                        agent_path: agent_path.clone(),
                        session_key: session_key.clone(),
                        item: FeedItem::ContextCompacted {
                            trigger: CompactTrigger::Proactive,
                            pre_tokens: seed.pre_tokens,
                        },
                    });
                    let data = serde_json::json!({
                        "trigger": "proactive",
                        "pre_tokens": seed.pre_tokens,
                    })
                    .to_string();
                    if let Err(e) = db
                        .add_chat_feed_item_by_session(&old_id, "context_compacted", &data, &source)
                        .await
                    {
                        tracing::warn!(
                            "[sessions] failed to persist compaction marker: {e} (session_key={session_key})"
                        );
                    }
                    sid_handle.clear_current_preserving_history().await;
                    resume_id = None;
                    tracing::info!(
                        "[sessions] proactively compacted context for session_key={session_key} (abandoned resume_id={old_id})"
                    );
                }
                Ok(None) => {
                    tracing::info!(
                        "[sessions] compaction requested but no visible history to summarize (session_key={session_key})"
                    );
                }
                Err(e) => {
                    // Non-fatal: fall back to a normal resume. The provider's
                    // own auto-compaction is the backstop, and the context
                    // indicator still shows the high fill so it stays visible.
                    tracing::warn!(
                        "[sessions] context compaction failed, continuing with normal resume: {e} (session_key={session_key})"
                    );
                }
            }
        }
    }

    let resume_recovery_prompt = if resume_id.is_some() {
        let activity_hint = match activity_hint_for_session_key(&agent_dir, &session_key) {
            Ok(hint) => hint,
            Err(e) => {
                tracing::warn!(
                    "[sessions] failed to load activity hint for resume recovery: {e} (session_key={session_key})"
                );
                None
            }
        };
        match history::resume_recovery_prompt(
            &db,
            &working_dir,
            Some(&agent_dir),
            &session_key,
            &prompt,
            activity_hint.as_deref(),
        )
        .await
        {
            Ok(prompt) => prompt,
            Err(e) => {
                tracing::warn!(
                    "[sessions] failed to build resume recovery prompt: {e} (session_key={session_key})"
                );
                None
            }
        }
    } else {
        None
    };

    tracing::info!(
        "[sessions] start agent_dir={} session_key={} resume_id={:?} provider={}",
        agent_dir.display(),
        session_key,
        resume_id,
        provider,
    );

    // Flip the matching board activity to "running" synchronously, before
    // the CLI subprocess spawns. Desktop UI pre-wrote this from the send
    // handler; moving it here means mobile (and any other client that
    // calls `startSession`) gets the same behavior without duplicating
    // logic. `ActivityChanged` fans out to every WS subscriber so every
    // mounted client invalidates its activity cache.
    match crate::agents::activity::set_status_by_session_key(&agent_dir, &session_key, "running") {
        Ok(Some(_)) => {
            events.emit(HoustonEvent::ActivityChanged {
                agent_path: agent_path.clone(),
            });
        }
        Ok(None) => { /* no matching activity — ad-hoc session, nothing to flip */ }
        Err(e) => {
            tracing::warn!(
                "[sessions] failed to flip activity to running: {e} (session_key={session_key})"
            );
        }
    }

    let db_for_file_changes = db.clone();
    let source_for_file_changes = source.clone();
    let persist = Some(PersistOptions {
        db,
        source,
        user_message: Some(prompt.clone()),
        claude_session_id: None,
        lifecycle: None,
    });

    let events_for_end = events.clone();
    let working_dir_for_end = working_dir.clone();
    let handle = session_runner::spawn_and_monitor(
        events,
        agent_path.clone(),
        session_key.clone(),
        cli_prompt,
        resume_id,
        resume_recovery_prompt,
        working_dir,
        system_prompt,
        Some(sid_handle),
        persist,
        Some(rt.pid_map.clone()),
        provider,
        model,
        effort,
        session_runner::SpawnOptions::default(),
    );

    // Own the end-of-session activity flip engine-side. Before this, the
    // desktop UI listened for SessionStatus::Completed and wrote
    // `needs_you` from the client — which meant phone-only users (or
    // anyone with the desktop unfocused) got stuck on "running" forever.
    // Doing it here makes every client identical: await the runner's
    // join handle, pick a terminal status, write the file, emit the
    // change event for live UI refresh.
    let agent_dir_for_end = agent_dir.clone();
    let session_key_for_end = session_key.clone();
    let agent_path_for_end = agent_path;
    let session_result = handle.await;
    let overlapped_workdir = rt.workdir_activity.finish(activity_registration).await;
    if let (Ok(result), Some(before)) = (&session_result, before_files.as_ref()) {
        if result.error.is_none() && !overlapped_workdir {
            match file_changes::snapshot(&working_dir_for_end) {
                Ok(after) => {
                    let changes = file_changes::diff(before, &after);
                    if !changes.is_empty() {
                        let item = FeedItem::FileChanges(changes.clone());
                        events_for_end.emit(HoustonEvent::FeedItem {
                            agent_path: agent_path_for_end.clone(),
                            session_key: session_key_for_end.clone(),
                            item,
                        });
                        events_for_end.emit(HoustonEvent::FilesChanged {
                            agent_path: agent_path_for_end.clone(),
                        });
                        if let Some(sid) = result.claude_session_id.as_ref() {
                            let db = db_for_file_changes.clone();
                            let sid = sid.clone();
                            let source = source_for_file_changes.clone();
                            let data = serde_json::json!({
                                "created": changes.created,
                                "modified": changes.modified,
                            })
                            .to_string();
                            tokio::spawn(async move {
                                if let Err(e) = db
                                    .add_chat_feed_item_by_session(
                                        &sid,
                                        "file_changes",
                                        &data,
                                        &source,
                                    )
                                    .await
                                {
                                    tracing::warn!(
                                        "[sessions] failed to persist file changes: {e}"
                                    );
                                }
                            });
                        }
                    }
                }
                Err(e) => tracing::warn!(
                    "[sessions] failed to snapshot files after run: {e} (working_dir={})",
                    working_dir_for_end.display()
                ),
            }
        }
        if result.error.is_none() && overlapped_workdir {
            tracing::info!(
                "[sessions] skipping file-change attribution for overlapping working_dir={}",
                working_dir_for_end.display()
            );
        }
    }

    let next_status = match session_result {
        Ok(result) if result.error.is_none() => "needs_you",
        Ok(_) => "error",
        Err(e) => {
            tracing::warn!(
                "[sessions] session runner panicked for session_key={session_key_for_end}: {e}"
            );
            "error"
        }
    };
    match crate::agents::activity::set_status_by_session_key(
        &agent_dir_for_end,
        &session_key_for_end,
        next_status,
    ) {
        Ok(Some(_)) => {
            tracing::info!(
                "[sessions] end flip: session_key={session_key_for_end} status={next_status}"
            );
            events_for_end.emit(HoustonEvent::ActivityChanged {
                agent_path: agent_path_for_end,
            });
        }
        Ok(None) => {
            tracing::info!(
                "[sessions] end flip: no matching activity for session_key={session_key_for_end} (ad-hoc session — skipped)"
            );
        }
        Err(e) => {
            tracing::warn!(
                "[sessions] failed to flip activity to {next_status}: {e} (session_key={session_key_for_end})"
            );
        }
    }
    rt.control.finish(&identity).await;

    Ok(())
}

fn activity_hint_for_session_key(
    agent_dir: &Path,
    session_key: &str,
) -> CoreResult<Option<String>> {
    let implied_id = session_key.strip_prefix("activity-");
    let activity = crate::agents::activity::list(agent_dir)?
        .into_iter()
        .find(|item| {
            item.session_key.as_deref() == Some(session_key)
                || implied_id.is_some_and(|id| item.id == id)
        });
    let Some(activity) = activity else {
        return Ok(None);
    };

    let title = activity.title.trim();
    let description = activity.description.trim();
    let hint = match (
        title.is_empty(),
        description.is_empty(),
        title == description,
    ) {
        (true, true, _) => None,
        (false, true, _) | (false, false, true) => Some(title.to_string()),
        (true, false, _) => Some(description.to_string()),
        (false, false, false) => Some(format!("{title}\n\n{description}")),
    };
    Ok(hint)
}

/// Cancel a running or queued session. On Unix sends `SIGTERM` to the
/// provider process group; on Windows issues `taskkill /PID <pid> /T /F`
/// (terminates the process tree). Emits a `Stopped by user` feed item +
/// `completed` session status so the UI can reconcile.
///
/// Returns `true` if a process or queued turn was found, `false` otherwise.
pub async fn cancel(
    rt: &SessionRuntime,
    events: &DynEventSink,
    agent_path: &str,
    session_key: &str,
) -> bool {
    let identity = SessionIdentity::new(agent_path.to_string(), session_key.to_string());
    let had_queued = rt.control.cancel(&identity).await;
    let pid = rt.pid_map.remove(session_key).await;

    if let Some(pid) = pid {
        tracing::info!("[sessions] cancel session_key={session_key} pid={pid}");
        use tokio::time::{timeout, Duration};
        match timeout(Duration::from_millis(750), terminate_process_tree(pid)).await {
            Ok(Ok(status)) if status.success() => {}
            Ok(Ok(status)) => {
                tracing::warn!(
                    "[sessions] terminate command exited with {status} for session_key={session_key} pid={pid}"
                );
            }
            Ok(Err(e)) => {
                tracing::warn!(
                    "[sessions] failed to run terminate command for session_key={session_key} pid={pid}: {e}"
                );
            }
            Err(_) => {
                tracing::warn!(
                    "[sessions] terminate command timed out for session_key={session_key} pid={pid}"
                );
            }
        }
    } else if !had_queued {
        match crate::agents::activity::clear_stale_running_by_session_key(
            Path::new(agent_path),
            session_key,
        ) {
            Ok(Some(_)) => {
                tracing::info!(
                    "[sessions] cleared stale running activity on cancel session_key={session_key}"
                );
                events.emit(HoustonEvent::ActivityChanged {
                    agent_path: agent_path.to_string(),
                });
            }
            Ok(None) => return false,
            Err(e) => {
                tracing::warn!(
                    "[sessions] failed to clear stale running activity on cancel: {e} (session_key={session_key})"
                );
                return false;
            }
        }
    }

    events.emit(HoustonEvent::FeedItem {
        agent_path: agent_path.to_string(),
        session_key: session_key.to_string(),
        item: FeedItem::SystemMessage("Stopped by user".into()),
    });
    events.emit(HoustonEvent::SessionStatus {
        agent_path: agent_path.to_string(),
        session_key: session_key.to_string(),
        status: "completed".into(),
        error: None,
    });
    true
}

#[cfg(unix)]
async fn terminate_process_tree(pid: u32) -> std::io::Result<std::process::ExitStatus> {
    let group_status = tokio::process::Command::new("kill")
        .arg("-TERM")
        .arg(format!("-{pid}"))
        .stderr(std::process::Stdio::null())
        .kill_on_drop(true)
        .status()
        .await?;
    if group_status.success() {
        return Ok(group_status);
    }
    tokio::process::Command::new("kill")
        .arg("-TERM")
        .arg(pid.to_string())
        .stderr(std::process::Stdio::null())
        .kill_on_drop(true)
        .status()
        .await
}

#[cfg(windows)]
async fn terminate_process_tree(pid: u32) -> std::io::Result<std::process::ExitStatus> {
    tokio::process::Command::new("taskkill")
        .arg("/PID")
        .arg(pid.to_string())
        .arg("/T")
        .arg("/F")
        .stderr(std::process::Stdio::null())
        .kill_on_drop(true)
        .status()
        .await
}

/// Start an onboarding session: seeds the agent and runs the first turn with
/// onboarding guidance baked into the system prompt.
///
/// Mirrors the former Tauri `start_onboarding_session` command. Uses the
/// agent/workspace-resolved provider (no override surface) because onboarding
/// runs before the user has tuned anything.
pub async fn start_onboarding(
    rt: &SessionRuntime,
    events: DynEventSink,
    db: Database,
    app_system_prompt: &str,
    app_onboarding_prompt: &str,
    agent_dir: PathBuf,
    session_key: String,
) -> Result<String, crate::CoreError> {
    agent_prompt::seed_agent(&agent_dir).map_err(crate::CoreError::Internal)?;

    // Onboarding system prompt = product prompt + onboarding suffix. Engine
    // appends its own agent context in `start()` below.
    let product_prompt = format!("{app_system_prompt}{app_onboarding_prompt}");

    let resolved = resolve_provider(&agent_dir);
    let effort = resolve_effort(&agent_dir, resolved.provider);

    start(
        rt,
        events,
        db,
        app_system_prompt,
        StartParams {
            agent_dir: agent_dir.clone(),
            working_dir: agent_dir,
            session_key,
            prompt: ".".to_string(),
            system_prompt: Some(product_prompt),
            source: Some("desktop".into()),
            provider: resolved.provider,
            model: resolved.model,
            effort,
            compact: false,
        },
    )
    .await
}

/// Expand a leading `~` to `$HOME`. Mirrors the one-liner the Tauri adapter
/// used so engine and adapter agree on path resolution.
pub fn expand_tilde(p: &std::path::Path) -> PathBuf {
    let s = p.to_string_lossy();
    if let Some(rest) = s.strip_prefix("~/") {
        if let Some(home) = dirs_next::home_dir() {
            return home.join(rest);
        }
    }
    p.to_path_buf()
}

/// Convenience: resolve an agent directory relative to an [`EnginePaths`]
/// docs root, returning an absolute path. If the caller passes an absolute
/// path, it's returned unchanged.
pub fn resolve_agent_dir(paths: &EnginePaths, agent_path: &str) -> PathBuf {
    let p = std::path::Path::new(agent_path);
    if p.is_absolute() {
        return expand_tilde(p);
    }
    if agent_path.starts_with("~/") {
        return expand_tilde(p);
    }
    paths.docs().join(agent_path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use houston_db::Database;
    use houston_ui_events::NoopEventSink;
    use std::sync::Arc;
    use tempfile::TempDir;
    use tokio::time::{timeout, Duration};

    #[tokio::test]
    async fn start_queues_same_session_turn_without_waiting() {
        let rt = SessionRuntime::default();
        let dir = TempDir::new().unwrap();
        let identity =
            SessionIdentity::new(dir.path().to_string_lossy().to_string(), "chat-test".into());
        let guard = rt.acquire_turn(&identity).await;
        let db = Database::connect_in_memory().await.unwrap();
        let events: DynEventSink = Arc::new(NoopEventSink);

        let accepted = timeout(
            Duration::from_millis(100),
            start(
                &rt,
                events.clone(),
                db,
                "",
                StartParams {
                    agent_dir: dir.path().to_path_buf(),
                    working_dir: dir.path().to_path_buf(),
                    session_key: "chat-test".to_string(),
                    prompt: "hello".to_string(),
                    system_prompt: None,
                    source: Some("test".to_string()),
                    provider: "openai".parse().unwrap(),
                    model: None,
                    effort: None,
                    compact: false,
                },
            ),
        )
        .await
        .expect("start should not wait for the busy workdir")
        .expect("queued start should be accepted");

        assert_eq!(accepted, "chat-test");
        assert!(cancel(&rt, &events, &dir.path().to_string_lossy(), "chat-test",).await);
        drop(guard);
    }

    #[tokio::test]
    async fn acquire_workdir_serializes_same_folder() {
        // The primitive behind serial routine execution (issue #362): two
        // acquisitions of the same folder queue — the second only proceeds
        // after the first guard drops.
        let rt = SessionRuntime::default();
        let dir = TempDir::new().unwrap();

        let first = rt.acquire_workdir(dir.path()).await;
        assert!(
            timeout(Duration::from_millis(20), rt.acquire_workdir(dir.path()))
                .await
                .is_err(),
            "second acquire on a busy folder must wait"
        );
        drop(first);
        assert!(
            timeout(Duration::from_millis(50), rt.acquire_workdir(dir.path()))
                .await
                .is_ok(),
            "second acquire proceeds once the folder frees"
        );
    }

    #[tokio::test]
    async fn acquire_workdir_allows_distinct_folders_concurrently() {
        let rt = SessionRuntime::default();
        let one = TempDir::new().unwrap();
        let two = TempDir::new().unwrap();

        let _a = rt.acquire_workdir(one.path()).await;
        // Different folder — no contention even while the first is held.
        assert!(
            timeout(Duration::from_millis(50), rt.acquire_workdir(two.path()))
                .await
                .is_ok()
        );
    }

    #[tokio::test]
    async fn cancel_clears_stale_running_activity_without_pid_or_queue() {
        let rt = SessionRuntime::default();
        let dir = TempDir::new().unwrap();
        let activity = crate::agents::activity::create(
            dir.path(),
            crate::agents::types::NewActivity {
                title: "stale".into(),
                description: String::new(),
                agent: None,
                worktree_path: None,
                provider: None,
                model: None,
            },
        )
        .unwrap();
        let session_key = activity.session_key.clone().expect("session key");
        let events: DynEventSink = Arc::new(NoopEventSink);

        assert!(cancel(&rt, &events, &dir.path().to_string_lossy(), &session_key).await);

        let persisted = crate::agents::activity::list(dir.path()).unwrap();
        assert_eq!(persisted[0].status, "needs_you");
    }

    #[test]
    fn activity_hint_for_recovery_uses_title_and_description() {
        let dir = TempDir::new().unwrap();
        let activity = crate::agents::activity::create(
            dir.path(),
            crate::agents::types::NewActivity {
                title: "Investigate stuck chat".into(),
                description: "Original prompt details".into(),
                agent: None,
                worktree_path: None,
                provider: None,
                model: None,
            },
        )
        .unwrap();
        let session_key = activity.session_key.expect("session key");

        let hint = activity_hint_for_session_key(dir.path(), &session_key)
            .expect("hint lookup")
            .expect("hint");

        assert_eq!(hint, "Investigate stuck chat\n\nOriginal prompt details");
    }
}
