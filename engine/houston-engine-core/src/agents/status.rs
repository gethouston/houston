//! Strongly-typed activity status.
//!
//! CLAUDE.md "Type safety over strings" — every domain enum must be a Rust
//! enum with `Display` / `FromStr` / serde so typos fail at compile time
//! instead of silently producing dead branches at runtime. Status used to
//! be `pub status: String` everywhere, which is what let `"cancelled"`
//! drift into the UI without ever appearing in the schema enum.
//!
//! Wire-compatible with existing on-disk JSON: serde uses snake_case so
//! `"running"`, `"needs_you"`, `"done"`, `"error"`, `"cancelled"`,
//! `"interrupted"` round-trip exactly as before. Older activity.json
//! files with unknown statuses fail loudly via `Deserialize` rather than
//! silently coercing — we WANT the bug report when we see one.

use serde::{Deserialize, Serialize};
use std::fmt;
use std::str::FromStr;

/// Lifecycle states a board activity can be in.
///
/// Transitions:
/// ```text
/// (new)        ──▶ Queued | Running
/// Queued       ──▶ Running | Cancelled
/// Running      ──▶ NeedsYou | Done | Error | Cancelled | Interrupted
/// Interrupted  ─▶ Running (via Resume) | Cancelled
/// NeedsYou     ──▶ Running (next user turn) | Cancelled
/// Done | Error | Cancelled = terminal (no outgoing edges)
/// ```
///
/// Wire format is `snake_case`. `Done` accepts `"completed"` as a read-only
/// alias so legacy on-disk activity.json rows (older builds wrote this)
/// keep loading; writes always emit `"done"`. Per CLAUDE.md user-data rule:
/// don't break existing users.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActivityStatus {
    /// Created but the CLI subprocess hasn't started yet.
    Queued,
    /// CLI subprocess is actively executing the turn.
    Running,
    /// CLI finished a turn; assistant is awaiting the next user message.
    NeedsYou,
    /// Terminal: user marked the mission complete (or routine ran silently).
    #[serde(alias = "completed")]
    Done,
    /// Terminal: provider returned an error or session runner panicked.
    Error,
    /// Terminal: user (or system) cancelled the mission.
    Cancelled,
    /// Mission was running but the engine / runner / app died before
    /// completion. The provider session_id is still on disk so the user
    /// can Resume. Non-terminal: a Resume click transitions back to
    /// `Running`, a Cancel click transitions to `Cancelled`.
    Interrupted,
}

impl ActivityStatus {
    /// `true` for states that can transition further. The reaper only
    /// touches non-terminal rows; the UI only shows Resume on interrupted.
    pub fn is_terminal(self) -> bool {
        matches!(self, Self::Done | Self::Error | Self::Cancelled)
    }

    /// `true` for states the reaper considers "in-flight" — a lease is
    /// expected. Used by the reaper to find expired/missing-lease rows.
    /// Queued doesn't count: no CLI is spawned yet, so no lease to expire.
    pub fn is_in_flight(self) -> bool {
        matches!(self, Self::Running)
    }

    /// String form used on the wire and on disk. Kept in sync with the
    /// `Serialize` impl via `snake_case`.
    pub fn as_wire_str(self) -> &'static str {
        match self {
            Self::Queued => "queued",
            Self::Running => "running",
            Self::NeedsYou => "needs_you",
            Self::Done => "done",
            Self::Error => "error",
            Self::Cancelled => "cancelled",
            Self::Interrupted => "interrupted",
        }
    }
}

impl fmt::Display for ActivityStatus {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_wire_str())
    }
}

impl FromStr for ActivityStatus {
    type Err = UnknownStatus;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "queued" => Ok(Self::Queued),
            "running" => Ok(Self::Running),
            "needs_you" => Ok(Self::NeedsYou),
            "done" | "completed" => Ok(Self::Done),
            "error" => Ok(Self::Error),
            "cancelled" => Ok(Self::Cancelled),
            "interrupted" => Ok(Self::Interrupted),
            other => Err(UnknownStatus(other.to_string())),
        }
    }
}

#[derive(Debug, Clone)]
pub struct UnknownStatus(pub String);

impl fmt::Display for UnknownStatus {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "unknown activity status: {:?}", self.0)
    }
}

impl std::error::Error for UnknownStatus {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_wire_str_for_every_variant() {
        let all = [
            ActivityStatus::Queued,
            ActivityStatus::Running,
            ActivityStatus::NeedsYou,
            ActivityStatus::Done,
            ActivityStatus::Error,
            ActivityStatus::Cancelled,
            ActivityStatus::Interrupted,
        ];
        for s in all {
            assert_eq!(s, ActivityStatus::from_str(s.as_wire_str()).unwrap());
            assert_eq!(s.to_string(), s.as_wire_str());
        }
    }

    #[test]
    fn round_trip_serde_snake_case() {
        let cases = [
            (ActivityStatus::Queued, "\"queued\""),
            (ActivityStatus::Running, "\"running\""),
            (ActivityStatus::NeedsYou, "\"needs_you\""),
            (ActivityStatus::Done, "\"done\""),
            (ActivityStatus::Error, "\"error\""),
            (ActivityStatus::Cancelled, "\"cancelled\""),
            (ActivityStatus::Interrupted, "\"interrupted\""),
        ];
        for (s, expected) in cases {
            let json = serde_json::to_string(&s).unwrap();
            assert_eq!(json, expected);
            let parsed: ActivityStatus = serde_json::from_str(expected).unwrap();
            assert_eq!(parsed, s);
        }
    }

    #[test]
    fn legacy_completed_alias_maps_to_done_on_read() {
        let parsed: ActivityStatus = serde_json::from_str("\"completed\"").unwrap();
        assert_eq!(parsed, ActivityStatus::Done);
        let from_str: ActivityStatus = "completed".parse().unwrap();
        assert_eq!(from_str, ActivityStatus::Done);
        // Writes always go out as "done", never as the legacy spelling.
        assert_eq!(
            serde_json::to_string(&ActivityStatus::Done).unwrap(),
            "\"done\""
        );
    }

    #[test]
    fn unknown_status_fails_loudly() {
        let r: Result<ActivityStatus, _> = serde_json::from_str("\"not_a_thing\"");
        assert!(r.is_err(), "must reject unknown status to surface bugs");
        assert!("not_a_status".parse::<ActivityStatus>().is_err());
    }

    #[test]
    fn is_terminal_matches_definition() {
        assert!(ActivityStatus::Done.is_terminal());
        assert!(ActivityStatus::Error.is_terminal());
        assert!(ActivityStatus::Cancelled.is_terminal());
        assert!(!ActivityStatus::Queued.is_terminal());
        assert!(!ActivityStatus::Running.is_terminal());
        assert!(!ActivityStatus::NeedsYou.is_terminal());
        assert!(!ActivityStatus::Interrupted.is_terminal());
    }

    #[test]
    fn is_in_flight_is_running_only() {
        assert!(ActivityStatus::Running.is_in_flight());
        assert!(!ActivityStatus::Queued.is_in_flight());
        assert!(!ActivityStatus::NeedsYou.is_in_flight());
        assert!(!ActivityStatus::Interrupted.is_in_flight());
        assert!(!ActivityStatus::Done.is_in_flight());
    }
}
