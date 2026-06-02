//! Routine runner — create run, dispatch session, evaluate, surface.
//!
//! Relocated from `app/src-tauri/src/routine_runner.rs`. The session-dispatch
//! step (spawning Claude/Codex) is delegated to a [`RoutineDispatcher`] trait
//! that the desktop adapter implements; the runner itself has no Tauri or
//! terminal-manager dependency. Activity creation is also delegated via
//! [`ActivitySurface`] since activity CRUD has not moved to engine-core yet.

use crate::error::{CoreError, CoreResult};
use crate::routines::runs as routine_runs;
use crate::routines::types::{Routine, RoutineRun, RoutineRunUpdate};
use crate::routines::{self, ensure_houston_dir};
use async_trait::async_trait;
use chrono::Utc;
use houston_ui_events::{DynEventSink, HoustonEvent};
use std::path::{Path, PathBuf};
use std::sync::Arc;

/// Token the model emits to signal "nothing to report".
pub const ROUTINE_OK_TOKEN: &str = "ROUTINE_OK";

/// Instruction appended to routine prompts when `suppress_when_silent` is true.
pub const SUPPRESSION_INSTRUCTION: &str = "\n\n---\n\
IMPORTANT: If nothing requires the user's attention or action, \
end your response with exactly \"ROUTINE_OK\" (on its own line). \
If something needs the user's attention, respond with your findings \
— do NOT include \"ROUTINE_OK\".";

/// Context passed to a dispatcher for a single routine run.
pub struct DispatchContext<'a> {
    pub agent_path: &'a str,
    pub working_dir: &'a Path,
    pub routine: &'a Routine,
    pub run: &'a RoutineRun,
    /// Prompt to send to the model — already has the suppression instruction
    /// appended when `routine.suppress_when_silent` is true.
    pub prompt: &'a str,
}

/// Outcome of a dispatcher run. `error` takes precedence over `response_text`.
#[derive(Debug, Default, Clone)]
pub struct DispatchOutcome {
    pub response_text: String,
    pub error: Option<String>,
}

/// Runs one routine session. Transport-neutral: engine-server provides a
/// real impl on top of `houston-agents-conversations::session_runner`; tests
/// provide canned replies.
#[async_trait]
pub trait RoutineDispatcher: Send + Sync {
    async fn dispatch(&self, ctx: DispatchContext<'_>) -> DispatchOutcome;
}

/// Surface for the chat that shows a routine's results when a run needs
/// attention. Implementations reuse one chat per routine — keyed by the
/// stable `session_key` — rather than creating a new one per run (#381), so
/// the engine impl is a find-or-create on `session_key`. Activity CRUD lives
/// in the agent store; this trait lets the runner stay decoupled from it.
pub trait ActivitySurface: Send + Sync {
    fn surface(
        &self,
        working_dir: &Path,
        title: &str,
        description: &str,
        session_key: &str,
        routine_id: &str,
        routine_run_id: &str,
    ) -> Result<String, String>;
}

/// Phase 1 output: the loaded routine and the freshly-created `running` row,
/// ready to hand to [`finish_run`].
pub struct BegunRun {
    pub working_dir: PathBuf,
    pub routine: Routine,
    pub run: RoutineRun,
    /// Prompt with the suppression instruction already appended when
    /// `routine.suppress_when_silent` is set.
    pub prompt: String,
}

/// Phase 1 of a routine run: load the routine, enforce the per-routine
/// in-flight gate, create the `running` row, and announce it.
///
/// Synchronous and fast — callers run it in the request path so `NotFound`
/// (routine gone) and `Conflict` (this routine already running) surface to the
/// user as an HTTP error, then hand the [`BegunRun`] to [`finish_run`] (inline
/// for the cron loop, or on a detached task for `run-now`).
///
/// The gate is per-routine, not per-agent: a *different* routine that happens
/// to be running on the same agent must NOT block this one (issue #362).
/// Repeated runs of the *same* routine are still rejected so spam-clicked
/// `run-now` (or a cron fire landing on a still-running previous run) doesn't
/// queue duplicate work. Serializing the sessions themselves — so two runs
/// don't write the same folder at once — is the dispatcher's job via the
/// workdir lock, which waits rather than failing. Orphan `running` rows from a
/// crashed engine are swept by `sweep_orphan_running` at agent-scheduler start.
pub fn begin_run(
    events: &DynEventSink,
    agent_path: &str,
    routine_id: &str,
) -> CoreResult<BegunRun> {
    let working_dir = expand_tilde(Path::new(agent_path));

    let routines = routines::list(&working_dir)?;
    let routine = routines
        .iter()
        .find(|r| r.id == routine_id)
        .ok_or_else(|| CoreError::NotFound(format!("routine {routine_id}")))?
        .clone();

    ensure_houston_dir(&working_dir)?;

    let run = routine_runs::create_if_routine_idle(&working_dir, routine_id)?;
    events.emit(HoustonEvent::RoutineRunsChanged {
        agent_path: agent_path.to_string(),
    });

    let prompt = if routine.suppress_when_silent {
        format!("{}{SUPPRESSION_INSTRUCTION}", routine.prompt)
    } else {
        routine.prompt.clone()
    };

    Ok(BegunRun {
        working_dir,
        routine,
        run,
        prompt,
    })
}

/// Phase 2 of a routine run: dispatch the session, then evaluate the outcome
/// (silent → update run; error → update run; surfaced → create activity, link
/// both sides, emit events).
///
/// Always drives the run to a terminal status before returning — a dispatch
/// error, a cancellation, or a failure to surface the result can never leave
/// the row stuck on `running`. Safe to run on a detached task: it owns its
/// inputs and reaches a terminal write regardless of the caller's lifetime.
pub async fn finish_run(
    events: DynEventSink,
    dispatcher: Arc<dyn RoutineDispatcher>,
    surface: Arc<dyn ActivitySurface>,
    agent_path: &str,
    begun: BegunRun,
) -> CoreResult<()> {
    let BegunRun {
        working_dir,
        routine,
        run,
        prompt,
    } = begun;

    let outcome = dispatcher
        .dispatch(DispatchContext {
            agent_path,
            working_dir: &working_dir,
            routine: &routine,
            run: &run,
            prompt: &prompt,
        })
        .await;

    let now = Utc::now().to_rfc3339();
    let response = outcome.response_text;
    let is_silent = routine.suppress_when_silent && response_is_silent(&response);

    // Cancellation race: the cancel handler may have written status="cancelled"
    // (and SIGTERM'd the PID) while we were awaiting dispatch — or while this
    // run sat queued on the workdir lock waiting for an earlier routine to
    // finish. In that case the disk record is already terminal — don't
    // overwrite it with `error`/`silent`/`surfaced`, and don't create an
    // activity for a cancelled run.
    //
    // A failed re-read must NOT bail with `?` here: that would skip every
    // terminal write below and strand the row on `running` forever — the very
    // failure this runner exists to prevent. Treat an unreadable record as
    // "not cancelled" and fall through to a terminal status update.
    let cancelled = match routine_runs::find_by_id(&working_dir, &run.id) {
        Ok(current) => current.status == "cancelled",
        Err(e) => {
            tracing::warn!(
                "[routines] failed to re-read run {} after dispatch: {e}; treating as live",
                run.id
            );
            false
        }
    };
    if cancelled {
        events.emit(HoustonEvent::RoutineRunsChanged {
            agent_path: agent_path.to_string(),
        });
        return Ok(());
    }

    if is_silent {
        routine_runs::update(
            &working_dir,
            &run.id,
            RoutineRunUpdate {
                status: Some("silent".into()),
                summary: Some(extract_summary(&response)),
                completed_at: Some(now),
                ..Default::default()
            },
        )?;
    } else if let Some(err) = outcome.error {
        routine_runs::update(
            &working_dir,
            &run.id,
            RoutineRunUpdate {
                status: Some("error".into()),
                summary: Some(err),
                completed_at: Some(now),
                ..Default::default()
            },
        )?;
    } else {
        // One chat per routine (#381): the chat is reused across runs, so its
        // title is the stable routine name rather than the latest finding's
        // first line. The finding itself lands in the conversation feed.
        let title = routine.name.clone();
        match surface.surface(
            &working_dir,
            &title,
            &routine.description,
            &run.session_key,
            &routine.id,
            &run.id,
        ) {
            Ok(activity_id) => {
                routine_runs::update(
                    &working_dir,
                    &run.id,
                    RoutineRunUpdate {
                        status: Some("surfaced".into()),
                        activity_id: Some(activity_id),
                        completed_at: Some(now),
                        ..Default::default()
                    },
                )?;
                events.emit(HoustonEvent::ActivityChanged {
                    agent_path: agent_path.to_string(),
                });
                events.emit(HoustonEvent::CompletionToast {
                    title: format!("{} found something", routine.name),
                    issue_id: None,
                });
            }
            Err(e) => {
                // Surfacing failed. Flip the run to `error` so it doesn't sit
                // on `running` forever, then propagate so the caller logs it.
                routine_runs::update(
                    &working_dir,
                    &run.id,
                    RoutineRunUpdate {
                        status: Some("error".into()),
                        summary: Some(format!("failed to surface result: {e}")),
                        completed_at: Some(now),
                        ..Default::default()
                    },
                )?;
                events.emit(HoustonEvent::RoutineRunsChanged {
                    agent_path: agent_path.to_string(),
                });
                return Err(CoreError::Internal(e));
            }
        }
    }

    events.emit(HoustonEvent::RoutineRunsChanged {
        agent_path: agent_path.to_string(),
    });

    Ok(())
}

/// Full execution of one routine: [`begin_run`] then [`finish_run`]. Used by
/// the cron scheduler, which already runs on its own task per routine.
///
/// 1. Load routine + create run (status=`running`)
/// 2. Dispatch session (via trait)
/// 3. Evaluate: silent → update run; error → update run; surfaced → create
///    activity, link both sides, emit events.
pub async fn run_routine(
    events: DynEventSink,
    dispatcher: Arc<dyn RoutineDispatcher>,
    surface: Arc<dyn ActivitySurface>,
    agent_path: &str,
    routine_id: &str,
) -> CoreResult<()> {
    let begun = begin_run(&events, agent_path, routine_id)?;
    finish_run(events, dispatcher, surface, agent_path, begun).await
}

/// Cancel an in-flight routine run end-to-end.
///
/// Writes `status="cancelled"` to disk FIRST so a concurrent dispatch
/// completion can't overwrite the terminal state (see `run_routine`'s
/// race-protection branch). Then SIGTERMs the provider subprocess via
/// `sessions::cancel`. Finally emits `RoutineRunsChanged` so clients
/// re-fetch.
///
/// Returns `Conflict` if the run is not in `running` status — the UI
/// shouldn't offer cancel on a terminal run, so this is treated as a
/// caller bug rather than a no-op.
pub async fn cancel_run(
    rt: &crate::sessions::SessionRuntime,
    events: &DynEventSink,
    root: &Path,
    agent_path: &str,
    run_id: &str,
) -> CoreResult<RoutineRun> {
    let run = routine_runs::find_by_id(root, run_id)?;
    if run.status != "running" {
        return Err(CoreError::Conflict(format!(
            "routine run {run_id} is not running (status={})",
            run.status
        )));
    }

    let now = Utc::now().to_rfc3339();
    let updated = routine_runs::update(
        root,
        run_id,
        RoutineRunUpdate {
            status: Some("cancelled".into()),
            completed_at: Some(now),
            summary: Some("Stopped by user".into()),
            ..Default::default()
        },
    )?;

    crate::sessions::cancel(rt, events, agent_path, &run.session_key).await;

    events.emit(HoustonEvent::RoutineRunsChanged {
        agent_path: agent_path.to_string(),
    });

    Ok(updated)
}

/// Expand a leading `~` to the user's home dir. Copy of
/// `houston_tauri::paths::expand_tilde` so the runner stays in the engine tree.
pub fn expand_tilde(path: &Path) -> PathBuf {
    let s = path.to_string_lossy();
    if let Some(rest) = s.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest);
        }
    }
    if s == "~" {
        return dirs::home_dir().unwrap_or_else(|| path.to_path_buf());
    }
    path.to_path_buf()
}

fn response_is_silent(response: &str) -> bool {
    let trimmed = response.trim();
    trimmed.ends_with(ROUTINE_OK_TOKEN) || trimmed.starts_with(ROUTINE_OK_TOKEN)
}

fn extract_summary(response: &str) -> String {
    let trimmed = response.trim();
    let without_token = trimmed.replace(ROUTINE_OK_TOKEN, "").trim().to_string();
    if without_token.is_empty() {
        "Nothing to report".to_string()
    } else {
        truncate(&without_token, 200)
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    let cut: String = s.chars().take(max.saturating_sub(1)).collect();
    format!("{cut}…")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::routines::{create, types::NewRoutine};
    use houston_ui_events::NoopEventSink;
    use std::sync::Mutex;
    use tempfile::TempDir;

    struct FakeDispatcher(DispatchOutcome);

    #[async_trait]
    impl RoutineDispatcher for FakeDispatcher {
        async fn dispatch(&self, _ctx: DispatchContext<'_>) -> DispatchOutcome {
            self.0.clone()
        }
    }

    #[derive(Default)]
    struct RecordingSurface {
        calls: Mutex<Vec<(String, String, String)>>,
    }

    impl ActivitySurface for RecordingSurface {
        fn surface(
            &self,
            _wd: &Path,
            title: &str,
            description: &str,
            _session_key: &str,
            _routine_id: &str,
            _routine_run_id: &str,
        ) -> Result<String, String> {
            self.calls
                .lock()
                .unwrap()
                .push((title.to_string(), description.to_string(), "act-1".into()));
            Ok("act-1".into())
        }
    }

    fn sample_routine() -> NewRoutine {
        NewRoutine {
            name: "Morning".into(),
            description: "desc".into(),
            prompt: "check".into(),
            schedule: "0 9 * * *".into(),
            enabled: true,
            suppress_when_silent: true,
            timezone: None,
            integrations: vec![],
        }
    }

    #[tokio::test]
    async fn silent_response_updates_run_to_silent_no_activity() {
        let d = TempDir::new().unwrap();
        let agent_path = d.path().to_string_lossy().to_string();
        let r = create(d.path(), sample_routine()).unwrap();

        let dispatcher = Arc::new(FakeDispatcher(DispatchOutcome {
            response_text: "all quiet\nROUTINE_OK".into(),
            error: None,
        }));
        let surface = Arc::new(RecordingSurface::default());

        run_routine(
            Arc::new(NoopEventSink),
            dispatcher,
            surface.clone(),
            &agent_path,
            &r.id,
        )
        .await
        .unwrap();

        let runs = routine_runs::list(d.path()).unwrap();
        assert_eq!(runs.len(), 1);
        assert_eq!(runs[0].status, "silent");
        assert!(runs[0].completed_at.is_some());
        assert!(surface.calls.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn error_response_updates_run_to_error() {
        let d = TempDir::new().unwrap();
        let agent_path = d.path().to_string_lossy().to_string();
        let r = create(d.path(), sample_routine()).unwrap();

        let dispatcher = Arc::new(FakeDispatcher(DispatchOutcome {
            response_text: "".into(),
            error: Some("boom".into()),
        }));
        let surface = Arc::new(RecordingSurface::default());

        run_routine(
            Arc::new(NoopEventSink),
            dispatcher,
            surface,
            &agent_path,
            &r.id,
        )
        .await
        .unwrap();

        let runs = routine_runs::list(d.path()).unwrap();
        assert_eq!(runs[0].status, "error");
        assert_eq!(runs[0].summary.as_deref(), Some("boom"));
    }

    #[tokio::test]
    async fn surfaced_response_creates_activity_links_run() {
        let d = TempDir::new().unwrap();
        let agent_path = d.path().to_string_lossy().to_string();
        let r = create(d.path(), sample_routine()).unwrap();

        let dispatcher = Arc::new(FakeDispatcher(DispatchOutcome {
            response_text: "Two PRs need review".into(),
            error: None,
        }));
        let surface = Arc::new(RecordingSurface::default());

        run_routine(
            Arc::new(NoopEventSink),
            dispatcher,
            surface.clone(),
            &agent_path,
            &r.id,
        )
        .await
        .unwrap();

        let calls = surface.calls.lock().unwrap();
        assert_eq!(calls.len(), 1);
        // Title is the stable routine name, not the finding (#381) — the
        // finding shows up in the conversation feed, not the chat title.
        assert_eq!(calls[0].0, "Morning");

        let runs = routine_runs::list(d.path()).unwrap();
        assert_eq!(runs[0].status, "surfaced");
        assert_eq!(runs[0].activity_id.as_deref(), Some("act-1"));
    }

    #[tokio::test]
    async fn run_routine_rejects_when_another_run_is_in_flight() {
        // Reproduces the original repro: user spam-clicks Run Now while a
        // previous run is still active. The second call must 409 (Conflict)
        // and must NOT create a new routine_run row — otherwise the history
        // fills with confusing "another mission is already running" error
        // rows and the UI loses track of which run is the real one.
        let d = TempDir::new().unwrap();
        let agent_path = d.path().to_string_lossy().to_string();
        let r = create(d.path(), sample_routine()).unwrap();

        // Seed an in-flight run on disk — what the previous click left.
        let in_flight = routine_runs::create(d.path(), &r.id).unwrap();
        assert_eq!(in_flight.status, "running");

        let dispatcher = Arc::new(FakeDispatcher(DispatchOutcome::default()));
        let surface = Arc::new(RecordingSurface::default());

        let err = run_routine(
            Arc::new(NoopEventSink),
            dispatcher,
            surface,
            &agent_path,
            &r.id,
        )
        .await
        .unwrap_err();
        assert!(matches!(err, CoreError::Conflict(_)));

        // Disk must still hold exactly one run — the original in-flight one.
        let runs = routine_runs::list(d.path()).unwrap();
        assert_eq!(runs.len(), 1);
        assert_eq!(runs[0].id, in_flight.id);
    }

    #[tokio::test]
    async fn two_different_routines_on_same_agent_both_run() {
        // Issue #362: two routines scheduled for the same time on the same
        // agent must BOTH run — the per-routine gate must not let one drop the
        // other. (The workdir lock that serializes the real sessions is
        // exercised separately in `sessions` + `workdir_locks` tests; the fake
        // dispatcher here doesn't take it, so this isolates the gate fix.)
        let d = TempDir::new().unwrap();
        let agent_path = d.path().to_string_lossy().to_string();
        let a = create(d.path(), sample_routine()).unwrap();
        let b = create(d.path(), sample_routine()).unwrap();

        let dispatcher = Arc::new(FakeDispatcher(DispatchOutcome {
            response_text: "all quiet\nROUTINE_OK".into(),
            error: None,
        }));
        let surface = Arc::new(RecordingSurface::default());
        let events: DynEventSink = Arc::new(NoopEventSink);

        let (ra, rb) = tokio::join!(
            run_routine(events.clone(), dispatcher.clone(), surface.clone(), &agent_path, &a.id),
            run_routine(events.clone(), dispatcher.clone(), surface.clone(), &agent_path, &b.id),
        );
        ra.unwrap();
        rb.unwrap();

        let runs = routine_runs::list(d.path()).unwrap();
        assert_eq!(runs.len(), 2, "both routines created a run");
        assert!(
            runs.iter().all(|r| r.status == "silent"),
            "both runs reached a terminal status: {:?}",
            runs.iter().map(|r| (&r.routine_id, &r.status)).collect::<Vec<_>>()
        );
        // One run per routine id.
        assert!(runs.iter().any(|r| r.routine_id == a.id));
        assert!(runs.iter().any(|r| r.routine_id == b.id));
    }

    #[tokio::test]
    async fn two_routines_same_folder_serialize_via_workdir_lock() {
        // Issue #362 end-to-end: two routines on the same agent both run, but
        // their sessions SERIALIZE on the shared folder (never overlap) — using
        // the real `SessionRuntime::acquire_workdir` the engine dispatcher uses.
        use std::sync::atomic::{AtomicUsize, Ordering};

        let d = TempDir::new().unwrap();
        let agent_path = d.path().to_string_lossy().to_string();
        let a = create(d.path(), sample_routine()).unwrap();
        let b = create(d.path(), sample_routine()).unwrap();

        struct SerializingDispatcher {
            rt: crate::sessions::SessionRuntime,
            active: Arc<AtomicUsize>,
            peak: Arc<AtomicUsize>,
        }
        #[async_trait]
        impl RoutineDispatcher for SerializingDispatcher {
            async fn dispatch(&self, ctx: DispatchContext<'_>) -> DispatchOutcome {
                let _guard = self.rt.acquire_workdir(ctx.working_dir).await;
                let n = self.active.fetch_add(1, Ordering::SeqCst) + 1;
                self.peak.fetch_max(n, Ordering::SeqCst);
                tokio::time::sleep(std::time::Duration::from_millis(30)).await;
                self.active.fetch_sub(1, Ordering::SeqCst);
                DispatchOutcome {
                    response_text: "all quiet\nROUTINE_OK".into(),
                    error: None,
                }
            }
        }

        let peak = Arc::new(AtomicUsize::new(0));
        let dispatcher = Arc::new(SerializingDispatcher {
            rt: crate::sessions::SessionRuntime::default(),
            active: Arc::new(AtomicUsize::new(0)),
            peak: peak.clone(),
        });
        let surface = Arc::new(RecordingSurface::default());
        let events: DynEventSink = Arc::new(NoopEventSink);

        let (ra, rb) = tokio::join!(
            run_routine(events.clone(), dispatcher.clone(), surface.clone(), &agent_path, &a.id),
            run_routine(events.clone(), dispatcher.clone(), surface.clone(), &agent_path, &b.id),
        );
        ra.unwrap();
        rb.unwrap();

        let runs = routine_runs::list(d.path()).unwrap();
        assert_eq!(runs.len(), 2, "both routines ran");
        assert!(runs.iter().all(|r| r.status == "silent"), "both reached terminal");
        assert_eq!(
            peak.load(Ordering::SeqCst),
            1,
            "the two sessions must serialize on the shared workdir lock"
        );
    }

    #[tokio::test]
    async fn finish_run_marks_error_when_surface_fails() {
        // A surfacing failure must not strand the run on `running`.
        let d = TempDir::new().unwrap();
        let agent_path = d.path().to_string_lossy().to_string();
        let r = create(d.path(), sample_routine()).unwrap();

        struct FailingSurface;
        impl ActivitySurface for FailingSurface {
            fn surface(
                &self,
                _wd: &Path,
                _t: &str,
                _d: &str,
                _s: &str,
                _r: &str,
                _rr: &str,
            ) -> Result<String, String> {
                Err("disk full".into())
            }
        }

        // Non-silent response → runner tries to surface → surface fails.
        let dispatcher = Arc::new(FakeDispatcher(DispatchOutcome {
            response_text: "Found something".into(),
            error: None,
        }));

        let err = run_routine(
            Arc::new(NoopEventSink),
            dispatcher,
            Arc::new(FailingSurface),
            &agent_path,
            &r.id,
        )
        .await
        .unwrap_err();
        assert!(matches!(err, CoreError::Internal(_)));

        let runs = routine_runs::list(d.path()).unwrap();
        assert_eq!(runs.len(), 1);
        assert_eq!(runs[0].status, "error");
        assert!(runs[0].completed_at.is_some());
        assert!(runs[0].summary.as_deref().unwrap().contains("disk full"));
    }

    #[tokio::test]
    async fn cancelled_status_on_disk_is_preserved_through_dispatch() {
        // Race: user cancels while the dispatcher is mid-flight. The cancel
        // handler writes "cancelled" + completed_at, then kills the PID, which
        // causes the dispatcher to return with an error. The runner must NOT
        // overwrite that terminal state, and must NOT create an activity.
        let d = TempDir::new().unwrap();
        let agent_path = d.path().to_string_lossy().to_string();
        let r = create(d.path(), sample_routine()).unwrap();

        // A dispatcher that flips the on-disk run to "cancelled" before
        // returning, simulating the cancel-then-dispatch-completes ordering.
        struct CancelDuringDispatch(PathBuf);
        #[async_trait]
        impl RoutineDispatcher for CancelDuringDispatch {
            async fn dispatch(&self, ctx: DispatchContext<'_>) -> DispatchOutcome {
                routine_runs::update(
                    &self.0,
                    &ctx.run.id,
                    RoutineRunUpdate {
                        status: Some("cancelled".into()),
                        completed_at: Some(Utc::now().to_rfc3339()),
                        ..Default::default()
                    },
                )
                .unwrap();
                DispatchOutcome {
                    response_text: String::new(),
                    error: Some("terminated by user".into()),
                }
            }
        }

        let dispatcher = Arc::new(CancelDuringDispatch(d.path().to_path_buf()));
        let surface = Arc::new(RecordingSurface::default());

        run_routine(
            Arc::new(NoopEventSink),
            dispatcher,
            surface.clone(),
            &agent_path,
            &r.id,
        )
        .await
        .unwrap();

        let runs = routine_runs::list(d.path()).unwrap();
        assert_eq!(runs.len(), 1);
        assert_eq!(runs[0].status, "cancelled");
        assert!(surface.calls.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn cancel_run_marks_cancelled_when_running() {
        let d = TempDir::new().unwrap();
        let agent_path = d.path().to_string_lossy().to_string();
        let r = create(d.path(), sample_routine()).unwrap();
        let run = routine_runs::create(d.path(), &r.id).unwrap();

        let rt = crate::sessions::SessionRuntime::default();
        let events: DynEventSink = Arc::new(NoopEventSink);

        let updated = cancel_run(&rt, &events, d.path(), &agent_path, &run.id)
            .await
            .unwrap();

        assert_eq!(updated.status, "cancelled");
        assert!(updated.completed_at.is_some());
        assert_eq!(updated.summary.as_deref(), Some("Stopped by user"));
    }

    #[tokio::test]
    async fn cancel_run_conflicts_when_already_terminal() {
        let d = TempDir::new().unwrap();
        let agent_path = d.path().to_string_lossy().to_string();
        let r = create(d.path(), sample_routine()).unwrap();
        let run = routine_runs::create(d.path(), &r.id).unwrap();
        routine_runs::update(
            d.path(),
            &run.id,
            RoutineRunUpdate {
                status: Some("silent".into()),
                ..Default::default()
            },
        )
        .unwrap();

        let rt = crate::sessions::SessionRuntime::default();
        let events: DynEventSink = Arc::new(NoopEventSink);

        let err = cancel_run(&rt, &events, d.path(), &agent_path, &run.id)
            .await
            .unwrap_err();
        assert!(matches!(err, CoreError::Conflict(_)));
    }

    #[tokio::test]
    async fn cancel_run_not_found_for_missing_run() {
        let d = TempDir::new().unwrap();
        let rt = crate::sessions::SessionRuntime::default();
        let events: DynEventSink = Arc::new(NoopEventSink);

        let err = cancel_run(&rt, &events, d.path(), "agent", "nope")
            .await
            .unwrap_err();
        assert!(matches!(err, CoreError::NotFound(_)));
    }

    #[tokio::test]
    async fn missing_routine_returns_not_found() {
        let d = TempDir::new().unwrap();
        let agent_path = d.path().to_string_lossy().to_string();

        let dispatcher = Arc::new(FakeDispatcher(DispatchOutcome::default()));
        let surface = Arc::new(RecordingSurface::default());

        let err = run_routine(
            Arc::new(NoopEventSink),
            dispatcher,
            surface,
            &agent_path,
            "nope",
        )
        .await
        .unwrap_err();
        assert!(matches!(err, CoreError::NotFound(_)));
    }
}
