//! `EngineState` — the runtime container passed to every route handler.

use crate::paths::EnginePaths;
use crate::sessions::SessionRuntime;
use houston_db::Database;
use houston_ui_events::DynEventSink;
use std::sync::Arc;

#[derive(Clone)]
pub struct EngineState {
    pub paths: EnginePaths,
    pub events: DynEventSink,
    pub db: Database,
    /// Per-engine session state (Claude-session-ID tracker, pid map).
    pub sessions: SessionRuntime,
    /// Product-layer prompt prefix supplied by the embedding app (e.g. the
    /// Houston desktop app) via env. Prepended to caller-less sessions.
    /// Empty string if unset.
    pub app_system_prompt: String,
    /// Product-layer onboarding suffix supplied by the embedding app.
    /// Appended on first-run sessions.
    pub app_onboarding_prompt: String,
}

impl EngineState {
    pub fn new(paths: EnginePaths, events: DynEventSink, db: Database) -> Self {
        // Build a production SessionRuntime: home_dir set so lease ops
        // land in `~/.houston/runtime/leases.json`, plus the persistent
        // PID recorder so spawned CLI pids end up in
        // `~/.houston/runtime/cli_pids.json` for next-boot orphan
        // reaping. Tests using `SessionRuntime::default()` get None for
        // both and the session code skips those side-effects.
        let home_dir = paths.home().to_path_buf();
        let sessions = SessionRuntime::for_engine(
            home_dir.clone(),
            crate::runtime_pids::recorder(home_dir),
        );
        Self {
            paths,
            events,
            db,
            sessions,
            app_system_prompt: String::new(),
            app_onboarding_prompt: String::new(),
        }
    }

    /// Chainable setter for the app's product prompt.
    pub fn with_app_prompts(
        mut self,
        app_system_prompt: String,
        app_onboarding_prompt: String,
    ) -> Self {
        self.app_system_prompt = app_system_prompt;
        self.app_onboarding_prompt = app_onboarding_prompt;
        self
    }
}

pub type SharedEngineState = Arc<EngineState>;
