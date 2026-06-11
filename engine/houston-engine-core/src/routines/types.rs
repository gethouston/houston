//! Routine + RoutineRun DTOs — the wire shape for `.houston/routines/*`.

use serde::{Deserialize, Serialize};

fn default_true() -> bool {
    true
}

// -- Chat mode --

/// Whether a routine's runs share one chat or each surface in a fresh one.
///
/// The single lever behind the run's `session_key`: the activity surface +
/// session history both find-or-create on that key, so the key shape is what
/// decides how many chats a routine's runs collapse into.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum RoutineChatMode {
    /// Every run streams into one persistent chat (`routine-{id}`). The
    /// behavior shipped in #381 and the default for every routine that
    /// predates this option, so existing routines keep one chat untouched.
    #[default]
    Shared,
    /// Each run surfaces in its own fresh chat (`routine-{id}-run-{run_id}`) —
    /// the pre-#381 per-run keying, now opt-in (#423).
    PerRun,
}

impl RoutineChatMode {
    /// Build the run's `session_key` for this mode. Shared collapses every run
    /// into one chat; per-run gives each run a unique key so the surface +
    /// session history create a new chat for it.
    pub fn session_key(self, routine_id: &str, run_id: &str) -> String {
        match self {
            RoutineChatMode::Shared => format!("routine-{routine_id}"),
            RoutineChatMode::PerRun => format!("routine-{routine_id}-run-{run_id}"),
        }
    }
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
    /// Whether each run reuses one chat or starts a fresh one. Defaults to
    /// `Shared` so every existing routine keeps the one-chat-per-routine
    /// behavior (#381) until the user opts into a new chat per run (#423).
    #[serde(default)]
    pub chat_mode: RoutineChatMode,
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
    /// Provider id override for this routine's runs (e.g. `"anthropic"`,
    /// `"openai"`). When `None`, runs fall back to the agent's configured
    /// provider — the behavior every routine had before this option.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    /// Model override (e.g. `"claude-opus-4-8"`, `"gpt-5.5"`). Provider-specific.
    /// When `None`, runs fall back to the agent's configured model.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// Reasoning-effort override (e.g. `"high"`, `"max"`). Validated against the
    /// resolved provider's accepted levels at dispatch — an unsupported value is
    /// dropped. When `None`, runs fall back to the agent's configured effort.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub effort: Option<String>,
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
    pub chat_mode: RoutineChatMode,
    #[serde(default)]
    pub timezone: Option<String>,
    #[serde(default)]
    pub integrations: Vec<String>,
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub effort: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RoutineUpdate {
    pub name: Option<String>,
    pub description: Option<String>,
    pub prompt: Option<String>,
    pub schedule: Option<String>,
    pub enabled: Option<bool>,
    pub suppress_when_silent: Option<bool>,
    pub chat_mode: Option<RoutineChatMode>,
    /// `Some(Some("..."))` sets a tz override, `Some(None)` clears it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timezone: Option<Option<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub integrations: Option<Vec<String>>,
    /// Provider id to pin for this routine (e.g. `"openai"`); `None` leaves it
    /// unchanged. The picker always sends a concrete provider + model together,
    /// so there is no "clear back to inherit" wire op — legacy routines with no
    /// override already inherit the agent's provider at dispatch time.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    /// Model to pin for this routine; `None` leaves it unchanged.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// Reasoning effort to pin (e.g. `"high"`); `None` leaves it unchanged.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub effort: Option<String>,
}

// -- RoutineRun --

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoutineRun {
    pub id: String,
    pub routine_id: String,
    /// `"running" | "silent" | "surfaced" | "error" | "cancelled"`.
    /// `cancelled` is set when the user stops an in-flight run via
    /// `POST /v1/routines/:id/runs/:run_id:cancel` or when the parent
    /// routine is deleted while a run is still in flight.
    pub status: String,
    /// Session key for chat history lookup. Stable per routine
    /// (`"routine-{rid}"`), shared by every run so they aggregate into one
    /// chat — one chat per routine, not per run (#381).
    pub session_key: String,
    /// If surfaced, the activity ID created on the board.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub activity_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    pub started_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<String>,
    /// Human-readable reset hint captured from the provider CLI's
    /// usage-limit-paused banner (e.g. `"5pm (America/Los_Angeles)"`).
    /// Set while `status == "running"` to indicate the subprocess is
    /// sleeping until the reset window. Irrelevant once the run reaches
    /// a terminal state; consumers should treat it as a hint only.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub paused_until: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RoutineRunUpdate {
    pub status: Option<String>,
    pub activity_id: Option<String>,
    pub summary: Option<String>,
    pub completed_at: Option<String>,
    /// `Some(Some("..."))` sets the hint; `Some(None)` clears it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub paused_until: Option<Option<String>>,
}
