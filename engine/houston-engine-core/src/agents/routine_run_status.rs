//! Strongly-typed routine-run status.
//!
//! Mirrors the pattern in [`super::status::ActivityStatus`]. Per CLAUDE.md
//! "Type safety over strings", domain-level enums must be enums — a routine
//! run is in exactly one of these states, and strings let typos drift.
//!
//! Wire-compatible with existing on-disk `routine_runs.json` rows: serde
//! emits snake_case, matching the schema enum.

use serde::{Deserialize, Serialize};
use std::fmt;
use std::str::FromStr;

/// States a single routine run can be in.
///
/// Transitions:
/// ```text
/// (new) ─▶ Running
/// Running ─▶ Silent  | Surfaced | Error
/// Silent, Surfaced, Error = terminal
/// ```
///
/// - `Silent`: run completed and the assistant responded with `ROUTINE_OK`
///   so no board activity was surfaced.
/// - `Surfaced`: run completed and a board activity was created/updated.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RoutineRunStatus {
    Running,
    Silent,
    Surfaced,
    Error,
}

impl RoutineRunStatus {
    pub fn is_terminal(self) -> bool {
        !matches!(self, Self::Running)
    }

    pub fn as_wire_str(self) -> &'static str {
        match self {
            Self::Running => "running",
            Self::Silent => "silent",
            Self::Surfaced => "surfaced",
            Self::Error => "error",
        }
    }
}

impl fmt::Display for RoutineRunStatus {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_wire_str())
    }
}

impl FromStr for RoutineRunStatus {
    type Err = UnknownRunStatus;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "running" => Ok(Self::Running),
            "silent" => Ok(Self::Silent),
            "surfaced" => Ok(Self::Surfaced),
            "error" => Ok(Self::Error),
            other => Err(UnknownRunStatus(other.to_string())),
        }
    }
}

#[derive(Debug, Clone)]
pub struct UnknownRunStatus(pub String);

impl fmt::Display for UnknownRunStatus {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "unknown routine run status: {:?}", self.0)
    }
}

impl std::error::Error for UnknownRunStatus {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_serde_every_variant() {
        let cases = [
            (RoutineRunStatus::Running, "\"running\""),
            (RoutineRunStatus::Silent, "\"silent\""),
            (RoutineRunStatus::Surfaced, "\"surfaced\""),
            (RoutineRunStatus::Error, "\"error\""),
        ];
        for (s, expected) in cases {
            assert_eq!(serde_json::to_string(&s).unwrap(), expected);
            assert_eq!(
                serde_json::from_str::<RoutineRunStatus>(expected).unwrap(),
                s
            );
            assert_eq!(s.to_string(), s.as_wire_str());
            assert_eq!(s, s.as_wire_str().parse().unwrap());
        }
    }

    #[test]
    fn unknown_status_fails_loudly() {
        let r: Result<RoutineRunStatus, _> = serde_json::from_str("\"completed\"");
        assert!(r.is_err());
        assert!("not_a_status".parse::<RoutineRunStatus>().is_err());
    }

    #[test]
    fn terminality_matches_definition() {
        assert!(!RoutineRunStatus::Running.is_terminal());
        assert!(RoutineRunStatus::Silent.is_terminal());
        assert!(RoutineRunStatus::Surfaced.is_terminal());
        assert!(RoutineRunStatus::Error.is_terminal());
    }
}
