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
//!    hatch; an inherited value that names a usable bash is left alone). An
//!    inherited value that does NOT — the WSL app-execution alias under
//!    `WindowsApps`, a reparse-point stub, a missing file — is REMOVED from
//!    the child when no standard install replaces it: forwarding it makes the
//!    CLI refuse to start outright (HOUSTON-APP-4ZP), whereas without the var
//!    the CLI's own probe still finds PowerShell (see `git_bash`).
//! 2. Append the built-in PowerShell dir (and `System32`, which `where`-style
//!    lookups need) to the child's PATH when missing, so the CLI's
//!    `powershell` fallback can never miss.
//!
//! On non-Windows this contributes nothing — the CLI has no shell gate there.

use std::ffi::OsString;
use std::path::PathBuf;

/// Working directory for a child that will execute the Claude Code CLI.
///
/// The env repair below is not enough on its own: the CLI's Windows shell
/// gate resolves `pwsh`/`powershell` with a which()-style lookup that
/// DISCARDS any hit living under the child's current working directory (a
/// cwd-hijack guard inside the CLI). A Houston launch that inherits
/// `C:\Windows\System32` as cwd — the autostart Run key and `houston://`
/// deep-link activations do — therefore filters out the built-in PowerShell
/// 5.1 under `System32\WindowsPowerShell\v1.0`, and on a machine with no Git
/// Bash and no PowerShell 7 the CLI exits 1 even though the PATH repair made
/// `powershell` resolvable (HOUSTON-APP-4YP, still firing after the repair
/// shipped). Pin the child to the user's home directory instead: it always
/// exists and no shell binary lives under it. `None` (no resolvable home)
/// keeps the inherited cwd — never fail a spawn over this.
pub fn claude_spawn_cwd() -> Option<PathBuf> {
    let var = if cfg!(windows) { "USERPROFILE" } else { "HOME" };
    let home = PathBuf::from(std::env::var_os(var)?);
    home.is_dir().then_some(home)
}

/// One env repair for a child that will execute the Claude Code CLI. Only
/// the Windows module constructs these (hence allowed-unused elsewhere).
#[derive(Debug, PartialEq, Eq)]
#[cfg_attr(not(windows), allow(dead_code))]
pub enum EnvRepair {
    /// Set (or override) `key` to `value`.
    Set(&'static str, OsString),
    /// Strip an inherited `key` the child must not see.
    Unset(&'static str),
}

/// Env repairs for a child that will execute the Claude Code CLI. Empty on
/// non-Windows and on Windows machines that need no repair.
pub fn claude_shell_env() -> Vec<EnvRepair> {
    #[cfg(not(windows))]
    {
        Vec::new()
    }
    #[cfg(windows)]
    {
        windows::claude_shell_env()
    }
}

/// Apply [`claude_shell_env`] to a command. Callers that layer their own env
/// pairs on top apply this FIRST so an explicit value still wins.
pub fn apply_claude_shell_env(cmd: &mut std::process::Command) {
    for repair in claude_shell_env() {
        match repair {
            EnvRepair::Set(key, value) => {
                cmd.env(key, value);
            }
            EnvRepair::Unset(key) => {
                cmd.env_remove(key);
            }
        }
    }
}

/// Append `dirs` (Windows `;`-separated PATH semantics) to `path` unless an
/// equivalent entry is already present — case-insensitive, ignoring trailing
/// separators. Returns `None` when nothing is missing. Pure string logic so
/// the behavior is unit-testable on every host platform (hence compiled — but
/// unused outside tests — on non-Windows).
#[cfg_attr(not(windows), allow(dead_code))]
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
    use super::{append_missing_dirs, EnvRepair};
    use crate::git_bash::is_usable_git_bash_override;
    use std::ffi::OsString;
    use std::path::PathBuf;

    /// The CLI's documented override for a bash that is not on PATH.
    const GIT_BASH_ENV: &str = "CLAUDE_CODE_GIT_BASH_PATH";

    pub(super) fn claude_shell_env() -> Vec<EnvRepair> {
        let mut env = Vec::new();
        env.extend(git_bash_repair());
        if let Some(path) = hardened_path() {
            env.push(EnvRepair::Set("PATH", OsString::from(path)));
        }
        env
    }

    /// The `GIT_BASH_ENV` repair. An inherited value naming a usable bash wins
    /// (respect the user's override — the child inherits it, nothing to do).
    /// Otherwise a Git for Windows `bash.exe` at a standard machine- or
    /// user-scope install location is set; and when none exists, a STALE
    /// inherited value is stripped rather than forwarded — the CLI exits 1 on
    /// an override it cannot run, but auto-detects PowerShell without one
    /// (HOUSTON-APP-4ZP: the WSL alias under `WindowsApps`). No PATH scan:
    /// `System32\bash.exe` is WSL, not Git Bash, and would wedge the CLI.
    fn git_bash_repair() -> Option<EnvRepair> {
        let inherited = std::env::var(GIT_BASH_ENV).ok();
        if inherited.as_deref().is_some_and(is_usable_git_bash_override) {
            return None;
        }
        match standard_git_bash() {
            Some(bash) => Some(EnvRepair::Set(GIT_BASH_ENV, bash.into_os_string())),
            None => inherited.map(|stale| {
                tracing::warn!(
                    "[shell-env] ignoring inherited {GIT_BASH_ENV}={stale:?}: not a runnable Git Bash"
                );
                EnvRepair::Unset(GIT_BASH_ENV)
            }),
        }
    }

    fn standard_git_bash() -> Option<PathBuf> {
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
        let current = match std::env::var("PATH") {
            Ok(path) => path,
            Err(std::env::VarError::NotPresent) => String::new(),
            // A non-Unicode PATH must be left alone: emitting a repaired
            // value here would REPLACE the inherited PATH with only what we
            // could parse, dropping every real entry — strictly worse than
            // not repairing. The Git Bash override above still applies.
            Err(std::env::VarError::NotUnicode(_)) => return None,
        };
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
        let mut cmd = std::process::Command::new("true");
        apply_claude_shell_env(&mut cmd);
        assert_eq!(cmd.get_envs().count(), 0);
    }

    #[test]
    fn claude_spawn_cwd_is_an_existing_home_dir() {
        // Every CI/dev host has a resolvable home; the contract is "an
        // existing directory the CLI's cwd-filter can't collide with".
        let cwd = claude_spawn_cwd().expect("home dir resolves");
        assert!(cwd.is_dir());
    }
}
