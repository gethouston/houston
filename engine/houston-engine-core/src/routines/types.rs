//! Routine + RoutineRun DTOs — the wire shape for `.houston/routines/*`.

use serde::{Deserialize, Serialize};

fn default_true() -> bool {
    true
}

// -- Routine --

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Routine {
    pub id: String,
    pub name: String,
    pub description: String,
    /// Prompt sent to the agent when the routine fires.
    pub prompt: String,
    /// 5-field cron expression, e.g. `"0 9 * * 1-5"`.
    pub schedule: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// When true, runs ending in `ROUTINE_OK` auto-complete silently
    /// (no activity surfaces on the board).
    #[serde(default = "default_true")]
    pub suppress_when_silent: bool,
    /// IANA timezone override (e.g. `"America/Bogota"`). When `None`, the
    /// scheduler falls back to the user's `timezone` preference, then UTC.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timezone: Option<String>,
    /// Composio toolkit slugs this routine uses (e.g. `["gmail", "slack"]`).
    /// Mirrors the same field on Skills. Surfaced by the share/import flow so
    /// the recipient can see which integrations a routine needs before they
    /// install it. Defaults to empty for existing routines on disk.
    #[serde(default)]
    pub integrations: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

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
    pub timezone: Option<String>,
    #[serde(default)]
    pub integrations: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RoutineUpdate {
    pub name: Option<String>,
    pub description: Option<String>,
    pub prompt: Option<String>,
    pub schedule: Option<String>,
    pub enabled: Option<bool>,
    pub suppress_when_silent: Option<bool>,
    /// `Some(Some("..."))` sets a tz override, `Some(None)` clears it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timezone: Option<Option<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub integrations: Option<Vec<String>>,
}

// -- RoutineRun --

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoutineRun {
    pub id: String,
    pub routine_id: String,
    /// `"running" | "silent" | "surfaced" | "error"`.
    pub status: String,
    /// Session key for chat history lookup (`"routine-{rid}-run-{id}"`).
    pub session_key: String,
    /// If surfaced, the activity ID created on the board.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub activity_id: Option<String>,
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
