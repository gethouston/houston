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
//! - [`resolve_provider`] — agent-config → workspace → default fallback.
//!
//! Callers (REST handlers, Tauri adapter) supply the already-resolved
//! `working_dir` and an optional pre-built `system_prompt`. Prompt assembly
//! lives in the adapter today; it will move into `engine-core` in a later
//! phase once `agent_store` is ported.

mod control;
pub mod file_changes;
pub mod history;
pub mod provider;
pub mod summarize;
mod summary_text;
mod workdir_locks;

use crate::agents::prompt as agent_prompt;
use crate::paths::EnginePaths;
use crate::{CoreError, CoreResult};
use control::{
    SessionControl, SessionIdentity, SessionTurnGuard, SessionTurnLocks, WorkdirActivity,
};
use houston_agents_conversations::session_id_tracker::SessionIdTracker;
use houston_agents_conversations::session_pids::SessionPidMap;
use houston_agents_conversations::session_runner::{self, DynPidRecorder, PersistOptions};
use houston_db::Database;
use houston_terminal_manager::{FeedItem, Provider};
use houston_ui_events::{DynEventSink, HoustonEvent};
use std::path::{Path, PathBuf};
use workdir_locks::{WorkdirLocks, WorkdirSessionGuard};

pub use provider::{resolve_provider, ResolvedProvider};

/// Engine-owned session state. Cheap to clone.
#[derive(Default, Clone)]
pub struct SessionRuntime {
    pub session_ids: SessionIdTracker,
    pub pid_map: SessionPidMap,
    /// Persistent record of spawned CLI PIDs. Populated by
    /// `EngineState::new`; `None` in tests / contexts that don't have
    /// a real home dir (the session runner treats `None` as "skip").
    pub pid_recorder: Option<DynPidRecorder>,
    /// `~/.houston/` root. Used to address `runtime/leases.json` (the
    /// engine-owned lease store) from session task code without
    /// plumbing through every call. `None` in tests that don't care
    /// about lease behavior; in production `EngineState::new` always
    /// sets this from `EnginePaths::home()`. When `None`, lease ops
    /// are skipped — the activity still flips to Running so the UI
    /// doesn't stick on Queued, but no lease is attached so the
    /// reaper will Interrupt on first sweep (fail-noisy for misconfig).
    pub home_dir: Option<PathBuf>,
    workdir_locks: WorkdirLocks,
    control: SessionControl,
    turn_locks: SessionTurnLocks,
    workdir_activity: WorkdirActivity,
}

impl SessionRuntime {
    /// Construct a production-ready runtime: home_dir set so lease ops
    /// land in the right runtime file, plus the pid recorder so orphan
    /// reap works on the next boot. Used by `EngineState::new`.
    pub fn for_engine(home_dir: PathBuf, recorder: DynPidRecorder) -> Self {
        let mut rt = Self::default();
        rt.home_dir = Some(home_dir);
        rt.pid_recorder = Some(recorder);
        rt
    }

    /// Back-compat constructor used by call sites that only set a pid
    /// recorder. Prefer [`for_engine`] when home_dir is available.
    pub fn with_pid_recorder(recorder: DynPidRecorder) -> Self {
        let mut rt = Self::default();
        rt.pid_recorder = Some(recorder);
        rt
    }

    pub(crate) async fn try_acquire_workdir(
        &self,
        working_dir: &Path,
    ) -> CoreResult<WorkdirSessionGuard> {
        self.workdir_locks
            .try_acquire(working_dir)
            .await
            .ok_or_else(|| {
                CoreError::Conflict("another mission is already running in this folder".to_string())
            })
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
    } = params;

    if !agent_dir.exists() {
        std::fs::create_dir_all(&agent_dir)?;
    }

    let _turn_guard = rt.acquire_turn(&identity).await;
    if rt.control.is_stale(&identity, generation).await {
        tracing::info!("[sessions] skipping cancelled queued turn session_key={session_key}");
        // The queued turn never started, so no lease was attached, but
        // the user explicitly cancelled — surface that on the board
        // instead of leaving the row in `Queued`. clear_lease_and_set_status
        // tolerates the no-lease case (it's a status-only mutation here).
        if let Some(home) = rt.home_dir.as_deref() {
            match crate::agents::lifecycle::clear_lease_and_set_status(
                home,
                &agent_dir,
                &session_key,
                crate::agents::ActivityStatus::Cancelled,
            ) {
                Ok(Some(_)) => {
                    events.emit(HoustonEvent::ActivityChanged {
                        agent_path: agent_dir.to_string_lossy().to_string(),
                    });
                }
                Ok(None) => {} // ad-hoc session — no board row to flip
                Err(e) => tracing::warn!(
                    "[sessions] failed to mark cancelled queued turn: {e} (session_key={session_key})"
                ),
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
    let resume_id = sid_handle.get().await;

    tracing::info!(
        "[sessions] start agent_dir={} session_key={} resume_id={:?} provider={}",
        agent_dir.display(),
        session_key,
        resume_id,
        provider,
    );

    let agent_path = agent_dir.to_string_lossy().to_string();

    // Flip the matching board activity to "running" synchronously, before
    // the CLI subprocess spawns. Desktop UI pre-wrote this from the send
    // handler; moving it here means mobile (and any other client that
    // calls `startSession`) gets the same behavior without duplicating
    // logic. `ActivityChanged` fans out to every WS subscriber so every
    // mounted client invalidates its activity cache.
    // Take ownership of the matching activity row: status → Running and
    // attach a fresh durability lease. We pass the lease to the
    // heartbeat task spawned below; when it sees a lease_id mismatch
    // (e.g. the reaper rotated us out, or a Resume click handed
    // ownership to a different runner) the heartbeat stops on its own.
    let attached = if let Some(home) = rt.home_dir.as_deref() {
        match crate::agents::lifecycle::attach_lease(home, &agent_dir, &session_key) {
            Ok(Some((_, lease))) => {
                events.emit(HoustonEvent::ActivityChanged {
                    agent_path: agent_path.clone(),
                });
                Some(lease)
            }
            Ok(None) => None, // ad-hoc session, no board row
            Err(e) => {
                tracing::warn!(
                    "[sessions] failed to attach lease: {e} (session_key={session_key})"
                );
                None
            }
        }
    } else {
        // Test or misconfigured runtime: no home_dir, so no engine-owned
        // lease store. Skip lease attach; the reaper will see a leaseless
        // Running row on next sweep and Interrupt it. This is the fail-
        // noisy mode — production paths always set home_dir.
        tracing::warn!(
            "[sessions] home_dir not configured; skipping lease attach (session_key={session_key})"
        );
        None
    };

    // Background heartbeat: every HEARTBEAT_INTERVAL while the session
    // is alive, push the lease's expires_at forward. The reaper's TTL
    // is 6× the heartbeat so a single dropped beat is harmless. End of
    // session signals stop via `hb_stop_tx`; the task observes via
    // `tokio::select!` and exits cleanly.
    //
    // If the heartbeat panics (unexpected disk error, mutex poison, etc),
    // tokio captures the panic in the `JoinHandle::await` result. The
    // end-of-session code below inspects that and, on panic, forces an
    // immediate `Interrupted` transition instead of waiting for the
    // 30s lease TTL to expire. Without this, a panicking heartbeat
    // would leave the user staring at "Running" for half a minute
    // while the reaper waited for TTL.
    let (heartbeat_task, hb_stop_tx): (
        Option<tokio::task::JoinHandle<()>>,
        Option<tokio::sync::oneshot::Sender<()>>,
    ) = if let (Some(lease), Some(home)) = (attached.clone(), rt.home_dir.clone()) {
        let agent_dir_hb = agent_dir.clone();
        let session_key_hb = session_key.clone();
        let lease_id = lease.lease_id.clone();
        let interval = crate::agents::lease::HEARTBEAT_INTERVAL
            .to_std()
            .unwrap_or(std::time::Duration::from_secs(5));
        let (tx, rx) = tokio::sync::oneshot::channel::<()>();
        let handle = tokio::spawn(async move {
            let mut ticker = tokio::time::interval(interval);
            ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
            // First tick fires immediately; skip it — we already wrote
            // a fresh lease in attach_lease above.
            ticker.tick().await;
            tokio::pin!(rx);
            loop {
                tokio::select! {
                    biased;
                    _ = &mut rx => break, // session ended, graceful stop
                    _ = ticker.tick() => {
                        match crate::agents::lifecycle::extend_lease(
                            &home,
                            &agent_dir_hb,
                            &session_key_hb,
                            &lease_id,
                        ) {
                            Ok(true) => continue,
                            Ok(false) => break, // ownership changed
                            Err(e) => {
                                tracing::warn!(
                                    "[sessions] lease heartbeat failed: {e} (session_key={session_key_hb})"
                                );
                                break;
                            }
                        }
                    }
                }
            }
        });
        (Some(handle), Some(tx))
    } else {
        (None, None)
    };

    let db_for_file_changes = db.clone();
    let source_for_file_changes = source.clone();
    let persist = Some(PersistOptions {
        db,
        source,
        user_message: Some(prompt.clone()),
        claude_session_id: None,
    });

    let events_for_end = events.clone();
    let working_dir_for_end = working_dir.clone();
    let handle = session_runner::spawn_and_monitor(
        events,
        agent_path.clone(),
        session_key.clone(),
        prompt,
        resume_id,
        working_dir,
        system_prompt,
        Some(sid_handle),
        persist,
        Some(rt.pid_map.clone()),
        rt.pid_recorder.clone(),
        provider,
        model,
        effort,
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

    // Signal the heartbeat to stop gracefully, then await its join
    // handle so we can detect a panic. If the heartbeat panicked during
    // the session, we transition the activity to `Interrupted`
    // immediately rather than letting the reaper wait 30s for the lease
    // TTL — and we skip the normal NeedsYou/Error end-flip below
    // because the row is already in a non-terminal recoverable state.
    let mut heartbeat_panicked = false;
    if let Some(tx) = hb_stop_tx {
        let _ = tx.send(());
    }
    if let Some(h) = heartbeat_task {
        match h.await {
            Ok(()) => {}
            Err(je) if je.is_cancelled() => {} // shouldn't happen, but harmless
            Err(je) if je.is_panic() => {
                heartbeat_panicked = true;
                tracing::error!(
                    "[sessions] heartbeat task panicked during session_key={session_key_for_end}; \
                     forcing Interrupted to avoid 30s lease-TTL wait"
                );
                if let Some(home) = rt.home_dir.as_deref() {
                    let _ = crate::agents::lifecycle::clear_lease_and_set_status(
                        home,
                        &agent_dir_for_end,
                        &session_key_for_end,
                        crate::agents::ActivityStatus::Interrupted,
                    );
                }
                events_for_end.emit(HoustonEvent::ActivityChanged {
                    agent_path: agent_path_for_end.clone(),
                });
            }
            Err(_) => {}
        }
    }
    // Generation check: if `sessions::cancel` bumped the generation while
    // this session was running, the user clicked Stop. The CLI was
    // SIGTERM'd; cli_process treats SIGTERM-exit as `Completed`, so
    // without this check the activity would flip to NeedsYou and look
    // like a normal turn ended. The "Stop" intent is to mark the
    // activity Cancelled, not NeedsYou.
    let cancelled_by_user = rt.control.is_stale(&identity, generation).await;
    let next_status = if cancelled_by_user {
        crate::agents::ActivityStatus::Cancelled
    } else {
        match session_result {
            Ok(result) if result.error.is_none() => crate::agents::ActivityStatus::NeedsYou,
            Ok(_) => crate::agents::ActivityStatus::Error,
            Err(e) => {
                tracing::warn!(
                    "[sessions] session runner panicked for session_key={session_key_for_end}: {e}"
                );
                crate::agents::ActivityStatus::Error
            }
        }
    };
    if heartbeat_panicked {
        // Already transitioned to Interrupted above; skip the normal flip.
        rt.control.finish(&identity).await;
        return Ok(());
    }
    if let Some(home) = rt.home_dir.as_deref() {
        match crate::agents::lifecycle::clear_lease_and_set_status(
            home,
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
    }
    rt.control.finish(&identity).await;

    Ok(())
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
        return false;
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
    paths: &EnginePaths,
    app_system_prompt: &str,
    app_onboarding_prompt: &str,
    agent_dir: PathBuf,
    session_key: String,
) -> Result<String, crate::CoreError> {
    agent_prompt::seed_agent(&agent_dir).map_err(crate::CoreError::Internal)?;

    // Onboarding system prompt = product prompt + onboarding suffix. Engine
    // appends its own agent context in `start()` below.
    let product_prompt = format!("{app_system_prompt}{app_onboarding_prompt}");

    let resolved = resolve_provider(paths, &agent_dir);

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
            effort: None,
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
                    provider: Provider::OpenAI,
                    model: None,
                    effort: None,
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
}
