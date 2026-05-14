//! Engine-side implementations of [`RoutineDispatcher`] + [`ActivitySurface`].
//!
//! Used by the server to wire the engine-core routine scheduler onto the
//! live session runner (Claude/Codex CLI) + agent-store activity layer.
//! Replaces the former `app/src-tauri/src/routine_runner.rs` which wired
//! Tauri state + `AgentStore`.

use crate::agents::{
    self, prompt as agent_prompt,
    store::ensure_houston_dir,
    status::ActivityStatus,
    types::{ActivityUpdate, NewActivity},
};
use crate::routines::runner::{
    ActivitySurface, DispatchContext, DispatchOutcome, RoutineDispatcher,
};
use crate::sessions::{self, SessionRuntime};
use async_trait::async_trait;
use houston_agents_conversations::session_runner::{self, PersistOptions};
use houston_db::Database;
use houston_ui_events::DynEventSink;
use std::path::Path;

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
        let agent_context =
            agent_prompt::build_agent_context(ctx.working_dir, None, None);
        let system_prompt = if self.app_system_prompt.is_empty() {
            agent_context
        } else {
            format!("{}\n\n---\n\n{agent_context}", self.app_system_prompt)
        };

        let resolved = sessions::resolve_provider(&self.paths, ctx.working_dir);
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
            }),
            Some(self.rt.pid_map.clone()),
            self.rt.pid_recorder.clone(),
            resolved.provider,
            resolved.model,
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
                status: Some(ActivityStatus::NeedsYou),
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
