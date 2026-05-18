//! Shared CLI resolution helpers used by adapter `resolve()` impls.

use crate::claude_path;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Where the resolved CLI binary came from. Surfaced to the UI so users
/// understand which version of `claude` / `codex` / etc. is in play
/// (matches the "bundled by Houston vs. your existing install" UX
/// clarification users have asked for).
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum InstallSource {
    /// Shipped inside the Houston `.app` (`Contents/Resources/bin/`).
    /// Codex falls in this bucket on production builds; composio too;
    /// claude-code never (proprietary license).
    Bundled,
    /// Downloaded by Houston at runtime to a Houston-managed location
    /// (`~/.local/bin/claude` etc.). Claude-code falls in this bucket
    /// after the first-launch installer completes.
    Managed,
    /// Found on the user's PATH outside Houston's control (homebrew,
    /// npm, manual install, …). Houston uses it as-is.
    Path,
    /// Not installed anywhere Houston knows about.
    Missing,
}

/// Walk the resolved shell PATH and return the first matching binary.
/// On Windows we additionally check the standard `PATHEXT` extensions so
/// `codex.cmd` / `claude.exe` / etc. all resolve from a bare command
/// name. Returns `None` if nothing matches.
pub fn which_on_path(command: &str) -> Option<PathBuf> {
    let shell_path = claude_path::shell_path();
    for dir in std::env::split_paths(&shell_path) {
        let candidate = dir.join(command);
        if candidate.is_file() {
            return Some(candidate);
        }
        #[cfg(windows)]
        {
            for ext in ["exe", "cmd", "bat", "ps1"] {
                let candidate = dir.join(format!("{command}.{ext}"));
                if candidate.is_file() {
                    return Some(candidate);
                }
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn install_source_serializes_lowercase() {
        let cases = [
            (InstallSource::Bundled, "\"bundled\""),
            (InstallSource::Managed, "\"managed\""),
            (InstallSource::Path, "\"path\""),
            (InstallSource::Missing, "\"missing\""),
        ];
        for (variant, expected) in cases {
            let s = serde_json::to_string(&variant).unwrap();
            assert_eq!(s, expected);
        }
    }

    #[test]
    fn which_on_path_returns_none_for_garbage() {
        assert!(which_on_path("definitely-not-a-real-binary-xyz-zzz-houston-test").is_none());
    }
}
