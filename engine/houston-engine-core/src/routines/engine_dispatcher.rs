//! Engine-side implementations of [`RoutineDispatcher`] + [`ActivitySurface`].
//!
//! Used by the server to wire the engine-core routine scheduler onto the
//! live session runner (Claude/Codex CLI) + agent-store activity layer.
//! Replaces the former `app/src-tauri/src/routine_runner.rs` which wired
//! Tauri state + `AgentStore`.

use crate::agents::{
    self, prompt as agent_prompt,
    store::ensure_houston_dir,
    types::{ActivityUpdate, NewActivity},
};
use crate::routines::runner::{
    ActivitySurface, DispatchContext, DispatchOutcome, RoutineDispatcher,
};
use crate::routines::runs as routine_runs;
use crate::routines::types::RoutineRunUpdate;
use crate::sessions::{self, SessionRuntime};
use async_trait::async_trait;
use houston_agents_conversations::session_runner::{self, PersistOptions, SessionLifecycle};
use houston_db::Database;
use houston_ui_events::{DynEventSink, HoustonEvent};
use std::path::{Path, PathBuf};
use std::sync::Arc;

/// Dispatcher that spawns a real session via `houston-agents-conversations`
/// and waits for completion.
pub struct EngineRoutineDispatcher {
    pub rt: SessionRuntime,
    pub events: DynEventSink,
    pub db: Database,
    pub paths: crate::paths::EnginePaths,
    /// Product-layer prompt injected at the top of every routine run.
    /// Supplied by the embedding app (see `EngineState::app_system_prompt`).
    pub app_system_prompt: String,
}

#[async_trait]
impl RoutineDispatcher for EngineRoutineDispatcher {
    async fn dispatch(&self, ctx: DispatchContext<'_>) -> DispatchOutcome {
        let _workdir_guard = match self.rt.try_acquire_workdir(ctx.working_dir).await {
            Ok(guard) => guard,
            Err(e) => {
                return DispatchOutcome {
                    response_text: String::new(),
                    error: Some(e.to_string()),
                };
            }
        };

        if let Err(e) = agent_prompt::seed_agent(ctx.working_dir) {
            return DispatchOutcome {
                response_text: String::new(),
                error: Some(format!("seed failed: {e}")),
            };
        }
        let agent_context = agent_prompt::build_agent_context(ctx.working_dir, None, None);
        let system_prompt = if self.app_system_prompt.is_empty() {
            agent_context
        } else {
            format!("{}\n\n---\n\n{agent_context}", self.app_system_prompt)
        };

        let resolved = sessions::resolve_provider(ctx.working_dir);
        let agent_key = format!(
            "{}:{}:{}",
            ctx.working_dir.to_string_lossy(),
            resolved.provider,
            ctx.run.session_key
        );
        let sid_handle = self
            .rt
            .session_ids
            .get_for_session(
                &agent_key,
                ctx.working_dir,
                &ctx.run.session_key,
                resolved.provider,
            )
            .await;
        let resume_id = sid_handle.get().await;

        let join_handle = session_runner::spawn_and_monitor(
            self.events.clone(),
            ctx.agent_path.to_string(),
            ctx.run.session_key.clone(),
            ctx.prompt.to_string(),
            resume_id,
            ctx.working_dir.to_path_buf(),
            Some(system_prompt),
            Some(sid_handle),
            Some(PersistOptions {
                db: self.db.clone(),
                source: "routine".into(),
                user_message: Some(ctx.prompt.to_string()),
                claude_session_id: None,
                lifecycle: Some(Arc::new(RoutineRunLifecycle {
                    root: ctx.working_dir.to_path_buf(),
                    run_id: ctx.run.id.clone(),
                    agent_path: ctx.agent_path.to_string(),
                    events: self.events.clone(),
                })),
            }),
            Some(self.rt.pid_map.clone()),
            resolved.provider,
            resolved.model,
            None,
            // Routines don't open an MCP-ask-user round-trip (no human is
            // sitting in front of the screen waiting to answer). Always None.
            None,
        );

        match join_handle.await {
            Ok(result) => DispatchOutcome {
                response_text: result.response_text.unwrap_or_default(),
                error: result.error,
            },
            Err(e) => DispatchOutcome {
                response_text: String::new(),
                error: Some(format!("session task failed: {e}")),
            },
        }
    }
}

/// Persist `routine_run.paused_until` when the underlying CLI sleeps on a
/// usage-limit window, and clear it when output resumes. `tracing::error!`
/// is the right surface on failure here: this hook runs inside the event
/// loop with no UI thread to toast on (the documented carve-out to the
/// otherwise-banned silent-failure pattern). The persisted state is a
/// hint; a missed write degrades to "we'll just show Running" rather
/// than corrupting anything.
struct RoutineRunLifecycle {
    root: PathBuf,
    run_id: String,
    agent_path: String,
    events: DynEventSink,
}

impl RoutineRunLifecycle {
    fn write(&self, paused: Option<Option<String>>) {
        if let Err(e) = routine_runs::update(
            &self.root,
            &self.run_id,
            RoutineRunUpdate {
                paused_until: paused,
                ..Default::default()
            },
        ) {
            tracing::error!(
                "[routines] failed to persist paused_until for run {}: {e}",
                self.run_id
            );
            return;
        }
        self.events.emit(HoustonEvent::RoutineRunsChanged {
            agent_path: self.agent_path.clone(),
        });
    }
}

impl SessionLifecycle for RoutineRunLifecycle {
    fn on_paused(&self, resets_at: Option<String>, _message: String) {
        self.write(Some(Some(resets_at.unwrap_or_else(|| "soon".into()))));
    }

    fn on_resumed(&self) {
        self.write(Some(None));
    }
}

#[cfg(test)]
mod lifecycle_tests {
    use super::*;
    use crate::routines::{create, types::NewRoutine};
    use houston_ui_events::NoopEventSink;
    use tempfile::TempDir;

    fn mk_routine() -> NewRoutine {
        NewRoutine {
            name: "n".into(),
            description: "d".into(),
            prompt: "p".into(),
            schedule: "0 9 * * *".into(),
            enabled: true,
            suppress_when_silent: true,
            timezone: None,
            integrations: vec![],
        }
    }

    #[test]
    fn on_paused_writes_hint_then_on_resumed_clears() {
        let d = TempDir::new().unwrap();
        let r = create(d.path(), mk_routine()).unwrap();
        let run = routine_runs::create(d.path(), &r.id).unwrap();
        assert!(run.paused_until.is_none());

        let lc = RoutineRunLifecycle {
            root: d.path().to_path_buf(),
            run_id: run.id.clone(),
            agent_path: d.path().to_string_lossy().to_string(),
            events: Arc::new(NoopEventSink),
        };

        lc.on_paused(Some("5pm (America/Los_Angeles)".into()), "banner".into());
        let after_pause = routine_runs::find_by_id(d.path(), &run.id).unwrap();
        assert_eq!(
            after_pause.paused_until.as_deref(),
            Some("5pm (America/Los_Angeles)")
        );

        lc.on_resumed();
        let after_resume = routine_runs::find_by_id(d.path(), &run.id).unwrap();
        assert!(after_resume.paused_until.is_none());
    }

    #[test]
    fn on_paused_falls_back_when_banner_has_no_hint() {
        // Defensive: if the classifier couldn't extract a hint we still
        // surface *something* so the UI can show "Paused" rather than
        // pretending the run is making progress.
        let d = TempDir::new().unwrap();
        let r = create(d.path(), mk_routine()).unwrap();
        let run = routine_runs::create(d.path(), &r.id).unwrap();

        let lc = RoutineRunLifecycle {
            root: d.path().to_path_buf(),
            run_id: run.id.clone(),
            agent_path: d.path().to_string_lossy().to_string(),
            events: Arc::new(NoopEventSink),
        };
        lc.on_paused(None, "raw banner".into());

        let after = routine_runs::find_by_id(d.path(), &run.id).unwrap();
        assert_eq!(after.paused_until.as_deref(), Some("soon"));
    }
}

/// Routine activity surface backed by the on-disk `AgentStore`.
pub struct EngineActivitySurface;

impl ActivitySurface for EngineActivitySurface {
    fn surface(
        &self,
        working_dir: &Path,
        title: &str,
        description: &str,
        session_key: &str,
        routine_id: &str,
        routine_run_id: &str,
    ) -> Result<String, String> {
        ensure_houston_dir(working_dir).map_err(|e| e.to_string())?;
        let activity = agents::activity::create(
            working_dir,
            NewActivity {
                title: title.to_string(),
                description: description.to_string(),
                agent: None,
                worktree_path: None,
                provider: None,
                model: None,
            },
        )
        .map_err(|e| e.to_string())?;
        agents::activity::update(
            working_dir,
            &activity.id,
            ActivityUpdate {
                status: Some("needs_you".into()),
                session_key: Some(session_key.to_string()),
                routine_id: Some(routine_id.to_string()),
                routine_run_id: Some(routine_run_id.to_string()),
                ..Default::default()
            },
        )
        .map_err(|e| e.to_string())?;
        Ok(activity.id)
    }
}
