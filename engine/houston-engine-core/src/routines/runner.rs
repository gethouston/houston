//! Routine runner — create run, dispatch session, evaluate, surface.
//!
//! Relocated from `app/src-tauri/src/routine_runner.rs`. The session-dispatch
//! step (spawning Claude/Codex) is delegated to a [`RoutineDispatcher`] trait
//! that the desktop adapter implements; the runner itself has no Tauri or
//! terminal-manager dependency. Activity creation is also delegated via
//! [`ActivitySurface`] since activity CRUD has not moved to engine-core yet.

use crate::error::{CoreError, CoreResult};
use crate::routines::runs as routine_runs;
use crate::agents::RoutineRunStatus;
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
    let run = routine_runs::create(&working_dir, routine_id)?;
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

    if is_silent {
        routine_runs::update(
            &working_dir,
            &run.id,
            RoutineRunUpdate {
                status: Some(RoutineRunStatus::Silent),
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
                status: Some(RoutineRunStatus::Error),
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
                status: Some(RoutineRunStatus::Surfaced),
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
        assert_eq!(runs[0].status, RoutineRunStatus::Silent);
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
        assert_eq!(runs[0].status, RoutineRunStatus::Error);
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
        assert_eq!(runs[0].status, RoutineRunStatus::Surfaced);
        assert_eq!(runs[0].activity_id.as_deref(), Some("act-1"));
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
