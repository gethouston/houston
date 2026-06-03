//! Data types for `.houston/` agent files.
//!
//! Relocated from `app/houston-tauri/src/agent_store/types.rs`. Wire-compatible
//! with existing on-disk JSON.

use serde::{Deserialize, Serialize};

// -- Activity --

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Activity {
    pub id: String,
    pub title: String,
    pub description: String,
    pub status: String,
    pub claude_session_id: Option<String>,
    /// Optional override for the session key used to address this conversation.
    /// When set (e.g. by a routine run), the board uses this instead of "activity-{id}".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_key: Option<String>,
    /// Which agent mode created this activity (e.g. "execution", "planning").
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent: Option<String>,
    /// Absolute path to the git worktree for this activity, if worktree mode was used.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub worktree_path: Option<String>,
    /// If this activity was created by a routine run, the source routine ID.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub routine_id: Option<String>,
    /// If this activity was created by a routine run, the source run ID.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub routine_run_id: Option<String>,
    /// ISO-8601 timestamp — set on create and every update.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ActivityUpdate {
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<String>,
    pub claude_session_id: Option<Option<String>>,
    pub session_key: Option<String>,
    pub agent: Option<String>,
    pub worktree_path: Option<Option<String>>,
    pub routine_id: Option<String>,
    pub routine_run_id: Option<String>,
    pub provider: Option<String>,
    pub model: Option<String>,
}

/// Fields for creating a new activity (no id — generated).
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct NewActivity {
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub worktree_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

// -- Routines --

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Routine {
    pub id: String,
    pub name: String,
    pub description: String,
    /// The prompt sent to Claude when this routine fires.
    pub prompt: String,
    /// Cron expression (e.g. "0 9 * * 1-5").
    pub schedule: String,
    /// Whether the routine is active.
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// When true, runs where Claude responds with ROUTINE_OK are auto-completed
    /// silently (no activity created on the board).
    #[serde(default = "default_true")]
    pub suppress_when_silent: bool,
    /// Composio toolkit slugs this routine uses (e.g. `["gmail", "slack"]`).
    /// Mirrors the same field on Skills; surfaced by the share/import flow so
    /// the recipient can wire up the integrations before enabling the routine.
    #[serde(default)]
    pub integrations: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RoutineUpdate {
    pub name: Option<String>,
    pub description: Option<String>,
    pub prompt: Option<String>,
    pub schedule: Option<String>,
    pub enabled: Option<bool>,
    pub suppress_when_silent: Option<bool>,
    pub integrations: Option<Vec<String>>,
}

/// Fields for creating a new routine (no id — generated server-side).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewRoutine {
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub prompt: String,
    pub schedule: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default = "default_true")]
    pub suppress_when_silent: bool,
    #[serde(default)]
    pub integrations: Vec<String>,
}

// -- Routine Runs --

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoutineRun {
    pub id: String,
    pub routine_id: String,
    /// "running" | "silent" | "surfaced" | "error"
    pub status: String,
    /// Session key for chat history lookup. Stable per routine
    /// ("routine-{routine_id}"), shared by every run — one chat per routine,
    /// not per run (#381).
    pub session_key: String,
    /// If surfaced, the activity ID created on the board.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub activity_id: Option<String>,
    /// Brief summary of the run output.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    pub started_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RoutineRunUpdate {
    pub status: Option<String>,
    pub activity_id: Option<String>,
    pub summary: Option<String>,
    pub completed_at: Option<String>,
}

// -- Config --

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProjectConfig {
    #[serde(default)]
    pub name: String,
    /// AI provider for this agent ("anthropic" or "openai"). Defaults to global preference.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    /// Model override (e.g. "sonnet", "gpt-5.5"). Provider-specific.
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "claude_model")]
    pub model: Option<String>,
    /// Effort level override (e.g. "low", "medium", "high"). Provider-specific.
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "claude_effort")]
    pub effort: Option<String>,
    /// Extra fields from the frontend (worktreeMode, devCommand, etc.)
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}
