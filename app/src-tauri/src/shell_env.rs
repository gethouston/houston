//! Windows shell-environment hardening for children that run the bundled
//! Claude Code CLI — the `claude auth login` helper and the engine sidecar
//! (whose runtime spawns the same binary for chat turns).
//!
//! The CLI refuses to start on Windows unless it can find Git Bash or
//! PowerShell: it probes `pwsh` on PATH, three well-known pwsh install dirs,
//! and finally plain `powershell` on PATH, then exits 1 with an install-Git
//! message when all miss (HOUSTON-APP-4YP). Every Windows machine HAS
//! Windows PowerShell 5.1 at `%SystemRoot%\System32\WindowsPowerShell\v1.0`,
//! but that only helps if the dir is actually on the child's PATH — and
//! end-user PATHs are routinely mangled by installers. So before spawning:
//!
//! 1. If a Git for Windows `bash.exe` exists at a standard install location,
//!    point `CLAUDE_CODE_GIT_BASH_PATH` at it (the CLI's documented escape
//!    hatch; an inherited value that resolves is left alone).
//! 2. Append the built-in PowerShell dir (and `System32`, which `where`-style
//!    lookups need) to the child's PATH when missing, so the CLI's
//!    `powershell` fallback can never miss.
//!
//! On non-Windows this contributes nothing — the CLI has no shell gate there.

use std::ffi::OsString;

/// Env pairs to merge into a child that will execute the Claude Code CLI.
/// Empty on non-Windows and on Windows machines that need no repair.
pub fn claude_shell_env() -> Vec<(String, OsString)> {
    #[cfg(not(windows))]
    {
        Vec::new()
    }
    #[cfg(windows)]
    {
        windows::claude_shell_env()
    }
}

/// Append `dirs` (Windows `;`-separated PATH semantics) to `path` unless an
/// equivalent entry is already present — case-insensitive, ignoring trailing
/// separators. Returns `None` when nothing is missing. Pure string logic so
/// the behavior is unit-testable on every host platform.
fn append_missing_dirs(path: &str, dirs: &[String]) -> Option<String> {
    let normalize = |s: &str| s.trim_end_matches(['\\', '/']).to_ascii_lowercase();
    let present: Vec<String> = path
        .split(';')
        .filter(|p| !p.is_empty())
        .map(normalize)
        .collect();
    let missing: Vec<&String> = dirs
        .iter()
        .filter(|d| !present.contains(&normalize(d)))
        .collect();
    if missing.is_empty() {
        return None;
    }
    let mut out = path.trim_end_matches(';').to_string();
    for dir in missing {
        if !out.is_empty() {
            out.push(';');
        }
        out.push_str(dir);
    }
    Some(out)
}

#[cfg(windows)]
mod windows {
    use super::append_missing_dirs;
    use std::ffi::OsString;
    use std::path::PathBuf;

    /// The CLI's documented override for a bash that is not on PATH.
    const GIT_BASH_ENV: &str = "CLAUDE_CODE_GIT_BASH_PATH";

    pub(super) fn claude_shell_env() -> Vec<(String, OsString)> {
        let mut env = Vec::new();
        if let Some(bash) = resolve_git_bash() {
            env.push((GIT_BASH_ENV.to_string(), bash.into_os_string()));
        }
        if let Some(path) = hardened_path() {
            env.push(("PATH".to_string(), OsString::from(path)));
        }
        env
    }

    /// Find a Git for Windows `bash.exe`. An inherited `GIT_BASH_ENV` that
    /// points at a real file wins (respect the user's override — the child
    /// inherits it, nothing to add). A stale override, or none, falls through
    /// to the standard machine- and user-scope install locations. No PATH
    /// scan: `C:\Windows\System32\bash.exe` is WSL, not Git Bash, and would
    /// wedge the CLI.
    fn resolve_git_bash() -> Option<PathBuf> {
        if let Ok(existing) = std::env::var(GIT_BASH_ENV) {
            if PathBuf::from(&existing).is_file() {
                return None;
            }
        }
        let roots = [
            std::env::var("ProgramFiles").ok(),
            std::env::var("ProgramFiles(x86)").ok(),
            std::env::var("LOCALAPPDATA")
                .ok()
                .map(|l| format!("{l}\\Programs")),
        ];
        roots
            .into_iter()
            .flatten()
            .map(|root| PathBuf::from(root).join("Git").join("bin").join("bash.exe"))
            .find(|candidate| candidate.is_file())
    }

    /// The child's PATH with the built-in Windows PowerShell 5.1 dir (the
    /// CLI's last-resort shell) and `System32` guaranteed present.
    fn hardened_path() -> Option<String> {
        let system_root = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into());
        let required = [
            format!("{system_root}\\System32\\WindowsPowerShell\\v1.0"),
            format!("{system_root}\\System32"),
        ];
        let current = std::env::var("PATH").unwrap_or_default();
        append_missing_dirs(&current, &required)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn append_missing_dirs_appends_absent_entries() {
        let path = "C:\\Users\\u\\bin;D:\\tools";
        let dirs = vec![
            "C:\\Windows\\System32\\WindowsPowerShell\\v1.0".to_string(),
            "C:\\Windows\\System32".to_string(),
        ];
        assert_eq!(
            append_missing_dirs(path, &dirs).as_deref(),
            Some(
                "C:\\Users\\u\\bin;D:\\tools;C:\\Windows\\System32\\WindowsPowerShell\\v1.0;C:\\Windows\\System32"
            )
        );
    }

    #[test]
    fn append_missing_dirs_is_case_insensitive_and_ignores_trailing_slashes() {
        let path = "c:\\windows\\system32\\;C:\\WINDOWS\\System32\\WindowsPowerShell\\V1.0";
        let dirs = vec![
            "C:\\Windows\\System32\\WindowsPowerShell\\v1.0".to_string(),
            "C:\\Windows\\System32".to_string(),
        ];
        assert_eq!(append_missing_dirs(path, &dirs), None);
    }

    #[test]
    fn append_missing_dirs_handles_empty_and_trailing_separator_paths() {
        let dirs = vec!["C:\\Windows\\System32".to_string()];
        assert_eq!(
            append_missing_dirs("", &dirs).as_deref(),
            Some("C:\\Windows\\System32")
        );
        assert_eq!(
            append_missing_dirs("D:\\x;", &dirs).as_deref(),
            Some("D:\\x;C:\\Windows\\System32")
        );
    }

    #[cfg(not(windows))]
    #[test]
    fn claude_shell_env_is_inert_off_windows() {
        assert!(claude_shell_env().is_empty());
    }
}
