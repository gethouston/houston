//! Data types for `.houston/` agent files.
//!
//! Relocated from `app/houston-tauri/src/agent_store/types.rs`. Wire-compatible
//! with existing on-disk JSON.
//!
//! Routine + routine-run types live in [`crate::routines::types`] — the single
//! canonical source the REST surface, scheduler, and dispatcher all share. This
//! module intentionally does not duplicate them.

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
