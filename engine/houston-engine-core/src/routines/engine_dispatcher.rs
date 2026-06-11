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
        // Serialize sessions that share a working directory: wait for any
        // earlier routine run in this folder to finish before starting ours.
        // Two routines scheduled for the same time both run, one after the
        // other (issue #362), instead of the second failing on a busy folder.
        let _workdir_guard = self.rt.acquire_workdir(ctx.working_dir).await;

        // We may have waited on the lock. If the user cancelled this run while
        // it sat queued, the row is already terminal — skip spawning a session
        // (and burning provider tokens) for work that's been called off.
        // `finish_run` sees the `cancelled` status and discards this outcome.
        if cancelled_while_queued(ctx.working_dir, &ctx.run.id) {
            return DispatchOutcome::default();
        }

        if let Err(e) = agent_prompt::seed_agent(ctx.working_dir) {
            return DispatchOutcome {
                response_text: String::new(),
                error: Some(format!("seed failed: {e}")),
            };
        }
        let agent_context = agent_prompt::build_agent_context(ctx.working_dir, None, None, None);
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
        // One chat per routine (#381): all runs share a stable session_key, so
        // resuming here would carry the PREVIOUS run's full context into this
        // one — unbounded growth and drift that would change what a routine
        // does. Force a fresh session every run. The handle is still passed
        // below so the new provider session id is appended to the shared key's
        // `.history`, and THAT is what merges every run into the single chat.
        let resume_id: Option<String> = None;

        let join_handle = session_runner::spawn_and_monitor(
            self.events.clone(),
            ctx.agent_path.to_string(),
            ctx.run.session_key.clone(),
            ctx.prompt.to_string(),
            resume_id,
            None,
            ctx.working_dir.to_path_buf(),
            Some(system_prompt),
            Some(sid_handle),
            Some(PersistOptions {
                db: self.db.clone(),
                source: "routine".into(),
                // Persist + echo the routine's own prompt as the per-run user
                // message, NOT `ctx.prompt` — the latter has the internal
                // "end with ROUTINE_OK" suppression instruction appended, which
                // is scaffolding the user should never see (#381). The model
                // still receives the full `ctx.prompt` above; only the
                // displayed/saved message is the clean one.
                user_message: Some(ctx.routine.prompt.clone()),
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
            sessions::resolve_effort(ctx.working_dir, resolved.provider),
            session_runner::SpawnOptions::default(),
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

/// After acquiring the workdir lock, a run that sat queued behind another
/// routine may have been cancelled. Returns `true` if the on-disk row is
/// already terminal (`cancelled`) and the dispatcher should skip spawning a
/// session for it.
///
/// A failed re-read is treated as "not cancelled" (proceed): `finish_run`
/// still drives the run to a terminal status from the dispatch outcome, so
/// proceeding can't strand the row, whereas wrongly skipping on a transient
/// read error would.
fn cancelled_while_queued(working_dir: &Path, run_id: &str) -> bool {
    match routine_runs::find_by_id(working_dir, run_id) {
        Ok(run) => run.status == "cancelled",
        Err(e) => {
            tracing::warn!(
                "[routines] failed to re-read run {run_id} after acquiring workdir lock: {e}"
            );
            false
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
    use crate::routines::{
        create,
        types::{NewRoutine, RoutineChatMode},
    };
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
            chat_mode: RoutineChatMode::Shared,
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

    #[test]
    fn cancelled_while_queued_detects_terminal_cancel_and_tolerates_missing() {
        let d = TempDir::new().unwrap();
        let r = create(d.path(), mk_routine()).unwrap();
        let run = routine_runs::create(d.path(), &r.id).unwrap();

        // Freshly created run is still `running` → not cancelled → proceed.
        assert!(!cancelled_while_queued(d.path(), &run.id));

        // Cancelled while queued → skip dispatch.
        routine_runs::update(
            d.path(),
            &run.id,
            RoutineRunUpdate {
                status: Some("cancelled".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert!(cancelled_while_queued(d.path(), &run.id));

        // Unreadable / missing row → treat as live (proceed); finish_run still
        // drives a terminal status, so this must never strand the run.
        assert!(!cancelled_while_queued(d.path(), "nonexistent-run-id"));
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

        // One chat per routine (#381): reuse the activity already bound to this
        // routine's stable session_key instead of spawning a fresh chat for
        // every surfaced run. The match is on the exact session_key, so older
        // per-run routine chats (which carry the legacy `routine-{id}-run-{run}`
        // key) are left untouched as history while new runs collapse into one.
        let existing = agents::activity::list(working_dir)
            .map_err(|e| e.to_string())?
            .into_iter()
            .find(|a| a.session_key.as_deref() == Some(session_key));

        let activity_id = match existing {
            Some(activity) => activity.id,
            None => {
                agents::activity::create(
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
                .map_err(|e| e.to_string())?
                .id
            }
        };

        // Flip the chat back to "needs you" and re-link the latest run. Title +
        // description are deliberately set only on create (above), so a user's
        // rename of the routine chat survives later surfaces.
        agents::activity::update(
            working_dir,
            &activity_id,
            ActivityUpdate {
                status: Some("needs_you".into()),
                session_key: Some(session_key.to_string()),
                routine_id: Some(routine_id.to_string()),
                routine_run_id: Some(routine_run_id.to_string()),
                ..Default::default()
            },
        )
        .map_err(|e| e.to_string())?;
        Ok(activity_id)
    }
}

#[cfg(test)]
mod surface_tests {
    use super::*;
    use crate::agents::activity;
    use tempfile::TempDir;

    #[test]
    fn reuses_one_activity_per_routine_session_key() {
        // Two surfaced runs of the same routine collapse into one chat (#381).
        let d = TempDir::new().unwrap();
        let surface = EngineActivitySurface;
        let key = "routine-abc";

        let id1 = surface
            .surface(d.path(), "Morning", "desc", key, "abc", "run-1")
            .unwrap();
        let id2 = surface
            .surface(d.path(), "Morning", "desc", key, "abc", "run-2")
            .unwrap();

        assert_eq!(id1, id2, "second surface reuses the same activity");
        let acts = activity::list(d.path()).unwrap();
        assert_eq!(acts.len(), 1, "only one activity for the routine");
        let a = &acts[0];
        assert_eq!(a.status, "needs_you");
        assert_eq!(a.session_key.as_deref(), Some(key));
        assert_eq!(a.routine_id.as_deref(), Some("abc"));
        assert_eq!(
            a.routine_run_id.as_deref(),
            Some("run-2"),
            "the reused chat links the latest run"
        );
    }

    #[test]
    fn distinct_routines_get_distinct_chats() {
        let d = TempDir::new().unwrap();
        let surface = EngineActivitySurface;

        let id_a = surface
            .surface(d.path(), "A", "", "routine-a", "a", "run-1")
            .unwrap();
        let id_b = surface
            .surface(d.path(), "B", "", "routine-b", "b", "run-1")
            .unwrap();

        assert_ne!(id_a, id_b);
        assert_eq!(activity::list(d.path()).unwrap().len(), 2);
    }

    #[test]
    fn reuse_preserves_a_user_renamed_chat_title() {
        let d = TempDir::new().unwrap();
        let surface = EngineActivitySurface;
        let key = "routine-abc";

        let id = surface
            .surface(d.path(), "Morning", "desc", key, "abc", "run-1")
            .unwrap();
        activity::update(
            d.path(),
            &id,
            ActivityUpdate {
                title: Some("My renamed chat".into()),
                ..Default::default()
            },
        )
        .unwrap();

        surface
            .surface(d.path(), "Morning", "desc", key, "abc", "run-2")
            .unwrap();

        let acts = activity::list(d.path()).unwrap();
        assert_eq!(acts.len(), 1);
        assert_eq!(
            acts[0].title, "My renamed chat",
            "a later surface must not clobber the user's rename"
        );
    }

    #[test]
    fn legacy_per_run_chats_are_left_intact() {
        // A pre-#381 routine chat carries the old per-run key. A new surface on
        // the stable key must create a fresh canonical chat, not adopt the old
        // one (whose feed lives under a different key).
        let d = TempDir::new().unwrap();
        let surface = EngineActivitySurface;

        let legacy = surface
            .surface(d.path(), "Old", "", "routine-abc-run-xyz", "abc", "run-xyz")
            .unwrap();
        let canonical = surface
            .surface(d.path(), "Morning", "", "routine-abc", "abc", "run-1")
            .unwrap();

        assert_ne!(legacy, canonical);
        assert_eq!(activity::list(d.path()).unwrap().len(), 2);
    }
}
