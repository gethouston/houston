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
/// On Windows we check the standard `PATHEXT` extensions FIRST so
/// `codex.cmd` / `claude.exe` / etc. resolve before the bare name.
///
/// **Order matters on Windows.** npm-global (the dominant Windows
/// install path for `@google/gemini-cli`, `@anthropic-ai/claude-code`,
/// `@openai/codex`) ships both `<name>` (a Unix-style script with a
/// `#!/usr/bin/env node` shebang) AND `<name>.cmd` (a Windows batch
/// shim that invokes Node). Returning the bare script means
/// `Command::new(path)` later calls Windows `CreateProcess` on a
/// non-PE file and fails with os error 193 ("%1 is not a valid Win32
/// application"). Returning the `.cmd` shim makes Rust's spawn route
/// through `cmd.exe` (per the CVE-2024-24576 mitigation) and the
/// script runs as intended.
///
/// Returns `None` if nothing matches.
pub fn which_on_path(command: &str) -> Option<PathBuf> {
    let shell_path = claude_path::shell_path();
    which_in_dirs(command, std::env::split_paths(&shell_path))
}

/// Inner pure-function variant of [`which_on_path`] that takes the PATH
/// directories explicitly. Exists so tests can stage a real PATH with a
/// `TempDir` instead of mutating the process-global PATH cache that
/// `claude_path::shell_path` reads.
fn which_in_dirs<I>(command: &str, dirs: I) -> Option<PathBuf>
where
    I: IntoIterator<Item = PathBuf>,
{
    for dir in dirs {
        #[cfg(windows)]
        {
            for ext in ["exe", "cmd", "bat", "ps1"] {
                let candidate = dir.join(format!("{command}.{ext}"));
                if candidate.is_file() {
                    return Some(candidate);
                }
            }
        }
        let candidate = dir.join(command);
        if candidate.is_file() {
            return Some(candidate);
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

    #[test]
    fn which_in_dirs_returns_none_when_no_match() {
        let tmp = tempfile::TempDir::new().unwrap();
        let dirs = vec![tmp.path().to_path_buf()];
        assert!(which_in_dirs("absent-tool", dirs).is_none());
    }

    #[test]
    fn which_in_dirs_walks_dirs_in_order() {
        // First matching directory wins, even when later directories
        // also contain the binary. Regression guard for the resolved
        // path order.
        let tmp_a = tempfile::TempDir::new().unwrap();
        let tmp_b = tempfile::TempDir::new().unwrap();
        let name = bare_executable_name();
        std::fs::write(tmp_a.path().join(&name), "first").unwrap();
        std::fs::write(tmp_b.path().join(&name), "second").unwrap();
        let dirs = vec![tmp_a.path().to_path_buf(), tmp_b.path().to_path_buf()];
        let resolved = which_in_dirs(executable_lookup_name(), dirs).unwrap();
        assert_eq!(resolved, tmp_a.path().join(&name));
    }

    #[cfg(unix)]
    #[test]
    fn which_in_dirs_finds_bare_filename_on_unix() {
        // Unix CLIs are bare filenames with no extension. The bare-name
        // branch must keep finding them.
        let tmp = tempfile::TempDir::new().unwrap();
        let path = tmp.path().join("toolx");
        std::fs::write(&path, "").unwrap();
        let resolved = which_in_dirs("toolx", vec![tmp.path().to_path_buf()]).unwrap();
        assert_eq!(resolved, path);
    }

    #[cfg(windows)]
    #[test]
    fn which_in_dirs_prefers_cmd_over_bare_on_windows() {
        // npm-global ships both `gemini` (Unix script, not executable
        // on Windows) and `gemini.cmd` (Windows shim). The .cmd MUST
        // win — returning the bare script means the later spawn fails
        // with os error 193 ("%1 is not a valid Win32 application").
        // Regression guard for the per-dir extension priority.
        let tmp = tempfile::TempDir::new().unwrap();
        let bare = tmp.path().join("gemini");
        let cmd = tmp.path().join("gemini.cmd");
        std::fs::write(&bare, "#!/usr/bin/env node\n").unwrap();
        std::fs::write(&cmd, "@echo off\r\n").unwrap();
        let resolved = which_in_dirs("gemini", vec![tmp.path().to_path_buf()]).unwrap();
        assert_eq!(resolved, cmd);
    }

    #[cfg(windows)]
    #[test]
    fn which_in_dirs_prefers_exe_over_cmd_on_windows() {
        // When both .exe and .cmd exist, prefer the native PE — it
        // spawns directly via CreateProcess without going through
        // cmd.exe and so has lower overhead and a cleaner process tree.
        let tmp = tempfile::TempDir::new().unwrap();
        let exe = tmp.path().join("toolx.exe");
        let cmd = tmp.path().join("toolx.cmd");
        std::fs::write(&exe, b"").unwrap();
        std::fs::write(&cmd, b"@echo off\r\n").unwrap();
        let resolved = which_in_dirs("toolx", vec![tmp.path().to_path_buf()]).unwrap();
        assert_eq!(resolved, exe);
    }

    #[cfg(windows)]
    #[test]
    fn which_in_dirs_falls_back_to_bare_on_windows() {
        // Bare PE files (no `.exe` extension) are rare but legal on
        // Windows — Windows will execute them as long as the PE
        // signature is present. When no extensioned variant exists,
        // the bare filename must still resolve.
        let tmp = tempfile::TempDir::new().unwrap();
        let bare = tmp.path().join("toolx");
        std::fs::write(&bare, b"").unwrap();
        let resolved = which_in_dirs("toolx", vec![tmp.path().to_path_buf()]).unwrap();
        assert_eq!(resolved, bare);
    }

    fn bare_executable_name() -> String {
        if cfg!(windows) {
            "toolx.exe".to_string()
        } else {
            "toolx".to_string()
        }
    }

    fn executable_lookup_name() -> &'static str {
        "toolx"
    }
}
