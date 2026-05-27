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

/// Surface for creating + linking activities when a routine run needs
/// attention. Activity CRUD currently lives in the desktop adapter; this
/// trait lets the runner stay engine-side without pulling it in.
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

/// Full execution of one routine. Mirrors the original behaviour of
/// `run_routine()` in the desktop adapter:
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
    let working_dir = expand_tilde(Path::new(agent_path));

    let routines = routines::list(&working_dir)?;
    let routine = routines
        .iter()
        .find(|r| r.id == routine_id)
        .ok_or_else(|| CoreError::NotFound(format!("routine {routine_id}")))?
        .clone();

    ensure_houston_dir(&working_dir)?;

    // Reject early if a run is already in flight for this agent. Without
    // this, repeated `run-now` clicks (a) pollute the on-disk history
    // with `status="error", summary="conflict: another mission..."` rows
    // from the workdir-lock failure inside the dispatcher, and (b) leave
    // the UI unable to pick out the "real" running run vs. the noise
    // since `lastRuns` keys by latest `started_at`. Fail fast at the
    // route level instead — frontend gets a 409 and surfaces a toast.
    //
    // We treat "in flight" as "status=running on disk". The workdir lock
    // would be a more precise signal, but it lives on `SessionRuntime`
    // and isn't reachable from this transport-neutral runner. Disk state
    // is reliable for the common case (one run completes, status flips
    // terminal); orphan `running` rows from a crashed engine are swept
    // by `sweep_orphan_running` at agent-scheduler start.
    let run = routine_runs::create_if_no_running(&working_dir, routine_id)?;
    events.emit(HoustonEvent::RoutineRunsChanged {
        agent_path: agent_path.to_string(),
    });

    let prompt = if routine.suppress_when_silent {
        format!("{}{SUPPRESSION_INSTRUCTION}", routine.prompt)
    } else {
        routine.prompt.clone()
    };

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
    // (and SIGTERM'd the PID) while we were awaiting dispatch. In that case the
    // disk record is already terminal — don't overwrite it with `error`/`silent`/
    // `surfaced`, and don't create an activity for a cancelled run.
    let current = routine_runs::find_by_id(&working_dir, &run.id)?;
    if current.status == "cancelled" {
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
        let title = format!(
            "{} — {}",
            routine.name,
            first_line(&response).unwrap_or("Needs attention")
        );
        let activity_id = surface
            .surface(
                &working_dir,
                &title,
                &routine.description,
                &run.session_key,
                &routine.id,
                &run.id,
            )
            .map_err(CoreError::Internal)?;

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

    events.emit(HoustonEvent::RoutineRunsChanged {
        agent_path: agent_path.to_string(),
    });

    Ok(())
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

fn first_line(text: &str) -> Option<&str> {
    text.lines().map(|l| l.trim()).find(|l| !l.is_empty())
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
        assert!(calls[0].0.contains("Morning"));
        assert!(calls[0].0.contains("Two PRs need review"));

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
