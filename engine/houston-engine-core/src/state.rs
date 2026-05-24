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
    /// Per-engine session state (Claude-session-ID tracker, pid map,
    /// MCP self-loopback identity).
    pub sessions: SessionRuntime,
    /// Product-layer prompt prefix supplied by the embedding app (e.g. the
    /// Houston desktop app) via env. Prepended to caller-less sessions.
    /// Empty string if unset.
    pub app_system_prompt: String,
    /// Product-layer onboarding suffix supplied by the embedding app.
    /// Appended on first-run sessions.
    pub app_onboarding_prompt: String,
}

/// Self-referential connection details for the in-engine MCP server.
/// Stored on [`SessionRuntime`] (not here) because it's only read during
/// session start; defining the type here keeps it grouped with `EngineState`.
#[derive(Clone)]
pub struct McpSelf {
    /// `http://127.0.0.1:<port>` — no trailing slash, no path.
    pub base_url: String,
    /// Bearer token clients send. Same value the rest of `/v1/*` checks.
    pub token: String,
}

impl EngineState {
    pub fn new(paths: EnginePaths, events: DynEventSink, db: Database) -> Self {
        Self {
            paths,
            events,
            db,
            sessions: SessionRuntime::default(),
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

    /// Chainable setter the server binary calls once it knows its own bind
    /// address and token. The MCP self-loopback identity lives on
    /// `SessionRuntime` (read during session start), not on this struct.
    pub fn with_mcp_self(mut self, base_url: String, token: String) -> Self {
        self.sessions.mcp_self = Some(McpSelf { base_url, token });
        self
    }
}

pub type SharedEngineState = Arc<EngineState>;
