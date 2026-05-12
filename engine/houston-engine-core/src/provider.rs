//! Provider management — relocated from `app/src-tauri/src/commands/provider.rs`.
//!
//! CLI-installation + auth-status probes and the OAuth login launcher.
//! Default-provider persistence reuses `crate::preferences` (generic
//! key/value store), so `DEFAULT_PROVIDER_KEY` is exposed for callers
//! that want to `get`/`set` the preference directly.

use crate::error::{CoreError, CoreResult};
use houston_terminal_manager::provider_auth::{
    probe_claude_auth_status, probe_codex_auth_status, ProviderAuthState,
};
use houston_terminal_manager::{claude_path, Provider};
use serde::{Deserialize, Serialize};
use std::ffi::OsString;
use std::path::PathBuf;
use std::time::Duration;

mod resolve;
use resolve::{resolve_claude, resolve_codex};

pub const DEFAULT_PROVIDER_KEY: &str = "default_provider";

/// Where the resolved CLI binary came from. Surfaced to the UI so users
/// understand which version of `claude` / `codex` is in play (matches
/// the "bundled by Houston vs. your existing install" UX clarification
/// users have asked for).
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

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProviderStatus {
    pub provider: String,
    pub cli_installed: bool,
    pub auth_state: ProviderAuthState,
    pub cli_name: String,
    /// Where Houston found the CLI binary. Used for UI labelling.
    pub install_source: InstallSource,
    /// Absolute path to the binary that will be spawned. `None` when
    /// `install_source == Missing`.
    pub cli_path: Option<String>,
}

/// Parse a provider name string, mapping errors onto `CoreError::BadRequest`.
pub fn parse(s: &str) -> CoreResult<Provider> {
    s.parse::<Provider>()
        .map_err(|e| CoreError::BadRequest(format!("invalid provider: {e}")))
}

pub async fn check_status(provider: Provider) -> CoreResult<ProviderStatus> {
    Ok(match provider {
        Provider::Anthropic => check_claude_status().await,
        Provider::OpenAI => check_codex_status().await,
    })
}

/// Launch the provider's login flow. Spawns the CLI as a subprocess
/// and waits up to 3 seconds for early failure: real OAuth flows take
/// minutes (the user has to complete sign-in in the browser), but
/// fast-failing CLIs (missing dependency, illegal instruction on
/// emulated platforms) crash in milliseconds. We surface those to the
/// caller as a real error containing the CLI's stderr — the frontend
/// then shows an actionable message instead of letting the user sit
/// forever on a "waiting" dialog.
///
/// If the CLI is still running after the 3-second probe window, we
/// detach it: the OAuth flow continues in the background and the
/// frontend polls `check_status` to observe completion, as before.
pub async fn launch_login(provider: Provider) -> CoreResult<()> {
    let ProviderCliCommand {
        cli_name,
        path,
        args,
        shell_path,
    } = login_command(provider)?;

    let mut cmd = tokio::process::Command::new(&path);
    cmd.args(&args)
        .env("PATH", shell_path)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(false);

    // Windows: Claude Code requires Git Bash and looks for it at
    // `CLAUDE_CODE_GIT_BASH_PATH` (env var) or hardcoded paths. We
    // probe well-known install locations + PATH and pass the env
    // var so the user doesn't have to set it themselves. If we
    // can't find bash.exe at all, we surface a single actionable
    // error instead of letting claude.exe exit code 1 with cryptic
    // stderr.
    #[cfg(target_os = "windows")]
    if matches!(provider, Provider::Anthropic) {
        match find_git_bash_windows() {
            Some(bash) => {
                tracing::info!(
                    "[houston:provider] claude: setting CLAUDE_CODE_GIT_BASH_PATH={}",
                    bash.display()
                );
                cmd.env("CLAUDE_CODE_GIT_BASH_PATH", bash);
            }
            None => {
                return Err(CoreError::BadRequest(
                    "Claude Code on Windows requires Git Bash. Install Git for Windows from \
                     https://git-scm.com/downloads/win — Houston will auto-detect it on next launch."
                        .into(),
                ));
            }
        }
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| CoreError::Internal(format!("failed to spawn {cli_name} login: {e}")))?;

    // Probe window: if the CLI exits within 3 seconds, the OAuth flow
    // couldn't have completed — that's a real failure to surface.
    let probe = tokio::time::timeout(Duration::from_secs(3), child.wait()).await;

    match probe {
        Ok(Ok(status)) if !status.success() => {
            let mut stderr_buf = String::new();
            let mut stdout_buf = String::new();
            if let Some(mut err) = child.stderr.take() {
                use tokio::io::AsyncReadExt;
                let _ = err.read_to_string(&mut stderr_buf).await;
            }
            if let Some(mut out) = child.stdout.take() {
                use tokio::io::AsyncReadExt;
                let _ = out.read_to_string(&mut stdout_buf).await;
            }
            let stderr = stderr_buf.trim();
            let stdout = stdout_buf.trim();
            tracing::warn!(
                "[houston:provider] {cli_name} login exited early: {status} stdout={stdout:?} stderr={stderr:?}"
            );
            let detail = if !stderr.is_empty() {
                stderr.to_string()
            } else if !stdout.is_empty() {
                stdout.to_string()
            } else {
                decorate_windows_exit(cli_name, &format!("{status}"), status.code())
            };
            Err(CoreError::Internal(format!("{cli_name} login: {detail}")))
        }
        Ok(Ok(status)) => {
            // Exited cleanly within 3s — unusual but possible if the CLI
            // already had a cached session or printed a "done" message.
            tracing::info!(
                "[houston:provider] {cli_name} login completed in <3s: {status}"
            );
            Ok(())
        }
        Ok(Err(e)) => {
            tracing::warn!(
                "[houston:provider] {cli_name} login wait failed at {}: {e}",
                path.display()
            );
            Err(CoreError::Internal(format!(
                "{cli_name} login wait: {e}"
            )))
        }
        Err(_) => {
            // Still running after 3s — detach and let the OAuth flow
            // continue. Frontend polls check_status to observe success.
            tracing::info!(
                "[houston:provider] {cli_name} login still running after 3s probe; detaching"
            );
            tokio::spawn(async move {
                let result =
                    tokio::time::timeout(Duration::from_secs(120), child.wait_with_output()).await;
                match result {
                    Ok(Ok(output)) => {
                        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                        if output.status.success() {
                            tracing::info!(
                                "[houston:provider] {cli_name} login exited: {}",
                                output.status
                            );
                        } else {
                            tracing::warn!(
                                "[houston:provider] {cli_name} login exited: {} stdout={stdout:?} stderr={stderr:?}",
                                output.status
                            );
                        }
                    }
                    Ok(Err(e)) => tracing::warn!(
                        "[houston:provider] {cli_name} login wait failed: {e}"
                    ),
                    Err(_) => tracing::warn!(
                        "[houston:provider] {cli_name} login timed out after 120s"
                    ),
                }
            });
            Ok(())
        }
    }
}

/// Run the provider's logout flow synchronously. Unlike login (which
/// spawns a browser and may take minutes), logout is non-interactive and
/// completes in seconds: it revokes the refresh token server-side
/// (Codex) or clears the OS Keychain entry (Claude Code on macOS) and
/// then deletes the local credential file. We await it so the UI can
/// flip the card to disconnected as soon as it's actually done.
pub async fn launch_logout(provider: Provider) -> CoreResult<()> {
    let ProviderCliCommand {
        cli_name,
        path,
        args,
        shell_path,
    } = logout_command(provider)?;

    let result = tokio::time::timeout(
        Duration::from_secs(10),
        tokio::process::Command::new(&path)
            .args(&args)
            .env("PATH", shell_path)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true)
            .output(),
    )
    .await;

    match result {
        Ok(Ok(output)) if output.status.success() => {
            tracing::info!("[houston:provider] {cli_name} logout succeeded");
            Ok(())
        }
        Ok(Ok(output)) => {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            tracing::warn!(
                "[houston:provider] {cli_name} logout exited with {}: {stderr}",
                output.status
            );
            Err(CoreError::Internal(format!(
                "{cli_name} logout failed: {}",
                if stderr.is_empty() { "no stderr".into() } else { stderr }
            )))
        }
        Ok(Err(e)) => {
            tracing::warn!(
                "[houston:provider] {cli_name} logout failed at {}: {e}",
                path.display()
            );
            Err(CoreError::Internal(format!("{cli_name} logout failed: {e}")))
        }
        Err(_) => {
            tracing::warn!("[houston:provider] {cli_name} logout timed out after 10s");
            Err(CoreError::Internal(format!(
                "{cli_name} logout timed out after 10s"
            )))
        }
    }
}

#[derive(Debug)]
struct ProviderCliCommand {
    cli_name: &'static str,
    path: PathBuf,
    args: Vec<&'static str>,
    shell_path: OsString,
}

fn login_command(provider: Provider) -> CoreResult<ProviderCliCommand> {
    let resolved_path = match provider {
        Provider::Anthropic => resolve_claude().1,
        Provider::OpenAI => resolve_codex().1,
    };
    build_login_command(provider, resolved_path, claude_path::shell_path())
}

fn logout_command(provider: Provider) -> CoreResult<ProviderCliCommand> {
    let resolved_path = match provider {
        Provider::Anthropic => resolve_claude().1,
        Provider::OpenAI => resolve_codex().1,
    };
    build_logout_command(provider, resolved_path, claude_path::shell_path())
}

fn build_login_command(
    provider: Provider,
    resolved_path: Option<PathBuf>,
    shell_path: OsString,
) -> CoreResult<ProviderCliCommand> {
    let (cli_name, args): (&'static str, Vec<&'static str>) = match provider {
        Provider::Anthropic => ("claude", vec!["auth", "login", "--claudeai"]),
        Provider::OpenAI => ("codex", vec!["login"]),
    };

    let path = resolved_path
        .ok_or_else(|| CoreError::BadRequest(format!("{cli_name} CLI is not installed")))?;

    Ok(ProviderCliCommand {
        cli_name,
        path,
        args,
        shell_path,
    })
}

fn build_logout_command(
    provider: Provider,
    resolved_path: Option<PathBuf>,
    shell_path: OsString,
) -> CoreResult<ProviderCliCommand> {
    // `claude auth logout` clears the macOS Keychain entry (service
    // `claude-code`) on Mac and `~/.claude/.credentials.json` on Linux.
    // `codex logout` revokes the ChatGPT refresh token server-side then
    // deletes `~/.codex/auth.json`. Both are documented top-level
    // commands — see knowledge-base/auth.md.
    let (cli_name, args): (&'static str, Vec<&'static str>) = match provider {
        Provider::Anthropic => ("claude", vec!["auth", "logout"]),
        Provider::OpenAI => ("codex", vec!["logout"]),
    };

    let path = resolved_path
        .ok_or_else(|| CoreError::BadRequest(format!("{cli_name} CLI is not installed")))?;

    Ok(ProviderCliCommand {
        cli_name,
        path,
        args,
        shell_path,
    })
}

async fn check_claude_status() -> ProviderStatus {
    let (install_source, cli_path) = resolve_claude();
    let cli_installed = !matches!(install_source, InstallSource::Missing);
    let auth_state = if let Some(path) = cli_path.as_deref() {
        probe_claude_auth_status(path).await
    } else {
        ProviderAuthState::Unauthenticated
    };
    ProviderStatus {
        provider: "anthropic".into(),
        cli_installed,
        auth_state,
        cli_name: "claude".into(),
        install_source,
        cli_path: cli_path.map(|p| p.to_string_lossy().into_owned()),
    }
}

async fn check_codex_status() -> ProviderStatus {
    let (install_source, cli_path) = resolve_codex();
    let cli_installed = !matches!(install_source, InstallSource::Missing);
    let auth_state = if let Some(path) = cli_path.as_deref() {
        let home = dirs::home_dir()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_default();
        probe_codex_auth_status(path, &home).await
    } else {
        ProviderAuthState::Unauthenticated
    };

    ProviderStatus {
        provider: "openai".into(),
        cli_installed,
        auth_state,
        cli_name: "codex".into(),
        install_source,
        cli_path: cli_path.map(|p| p.to_string_lossy().into_owned()),
    }
}

/// Locate Git for Windows' `bash.exe` so Claude Code can use it. Probes
/// the user override env var, the two standard Git for Windows install
/// locations, and PATH. Returns `None` if Git for Windows is not
/// installed. Windows-only by construction; the caller is gated on
/// `cfg(target_os = "windows")`.
#[cfg(target_os = "windows")]
fn find_git_bash_windows() -> Option<PathBuf> {
    // 1. Explicit user override always wins.
    if let Ok(p) = std::env::var("CLAUDE_CODE_GIT_BASH_PATH") {
        let pb = PathBuf::from(p);
        if pb.is_file() {
            return Some(pb);
        }
    }
    // 2. Houston-bundled PortableGit — first launch extracts the SFX
    //    into %LOCALAPPDATA%\Programs\Houston\runtime\git-bash-<arch>\.
    //    Preferring this over the user's system Git keeps Claude's
    //    bash version pinned across the Houston install base, which
    //    matches what Claude Code's QA tests against.
    if let Some(bundled) = crate::git_bash::ensure_bundled_bash() {
        return Some(bundled);
    }
    // 3. Standard Git for Windows install locations.
    for candidate in [
        "C:\\Program Files\\Git\\bin\\bash.exe",
        "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
    ] {
        let pb = PathBuf::from(candidate);
        if pb.is_file() {
            return Some(pb);
        }
    }
    // 4. Anywhere on PATH (covers chocolatey / scoop / portable installs).
    if let Ok(paths) = std::env::var("PATH") {
        for dir in std::env::split_paths(&paths) {
            let bash = dir.join("bash.exe");
            if bash.is_file() {
                return Some(bash);
            }
        }
    }
    None
}

/// Turn a cryptic Windows process exit (e.g. `0xc000001d`) into a
/// human-actionable error message. On non-Windows or unrecognized
/// codes we return the original status verbatim. Kept in sync with
/// the copy in `houston-composio::cli` — these two are the only
/// Houston modules that spawn third-party CLIs the user might see
/// crash with NT status codes.
fn decorate_windows_exit(command: &str, status_display: &str, exit_code: Option<i32>) -> String {
    let nt = exit_code.map(|c| c as u32);
    let hint = match nt {
        Some(0xC000_001D) => Some(
            "STATUS_ILLEGAL_INSTRUCTION (0xc000001d): the binary uses CPU \
             instructions not supported by this CPU. On Windows-on-ARM \
             laptops the x64 emulator does not implement every instruction \
             set — the CLI needs a native aarch64 build. On native x64 \
             hardware this usually means a corrupted install; reinstall \
             Houston.",
        ),
        Some(0xC000_0135) => Some(
            "STATUS_DLL_NOT_FOUND (0xc0000135): a runtime DLL is missing. \
             Reinstall Houston.",
        ),
        Some(0xC000_0139) => Some(
            "STATUS_ENTRYPOINT_NOT_FOUND (0xc0000139): a DLL is the wrong \
             version. Reinstall Houston.",
        ),
        _ => None,
    };
    match hint {
        Some(h) => format!("{command} exited with {status_display}. {h}"),
        None => format!("{command} exited with {status_display}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_rejects_unknown() {
        assert!(parse("gemini").is_err());
        assert!(parse("anthropic").is_ok());
        assert!(parse("openai").is_ok());
    }

    #[test]
    fn install_source_serializes_lowercase() {
        let s = serde_json::to_string(&InstallSource::Bundled).unwrap();
        assert_eq!(s, "\"bundled\"");
        let s = serde_json::to_string(&InstallSource::Managed).unwrap();
        assert_eq!(s, "\"managed\"");
        let s = serde_json::to_string(&InstallSource::Path).unwrap();
        assert_eq!(s, "\"path\"");
        let s = serde_json::to_string(&InstallSource::Missing).unwrap();
        assert_eq!(s, "\"missing\"");
    }

    #[test]
    fn login_command_uses_resolved_cli_path() {
        let path = PathBuf::from("/tmp/houston-test-claude");
        let command = build_login_command(
            Provider::Anthropic,
            Some(path.clone()),
            OsString::from("/not/on/path"),
        )
        .unwrap();
        assert_eq!(command.cli_name, "claude");
        assert_eq!(command.path, path);
        assert_eq!(command.args, vec!["auth", "login", "--claudeai"]);
    }

    #[test]
    fn logout_command_claude_uses_auth_logout() {
        let path = PathBuf::from("/tmp/houston-test-claude");
        let command = build_logout_command(
            Provider::Anthropic,
            Some(path.clone()),
            OsString::from("/not/on/path"),
        )
        .unwrap();
        assert_eq!(command.cli_name, "claude");
        assert_eq!(command.path, path);
        assert_eq!(command.args, vec!["auth", "logout"]);
    }

    #[test]
    fn logout_command_codex_uses_top_level_logout() {
        let path = PathBuf::from("/tmp/houston-test-codex");
        let command = build_logout_command(
            Provider::OpenAI,
            Some(path.clone()),
            OsString::from("/not/on/path"),
        )
        .unwrap();
        assert_eq!(command.cli_name, "codex");
        assert_eq!(command.path, path);
        assert_eq!(command.args, vec!["logout"]);
    }

    #[test]
    fn logout_command_errors_when_cli_missing() {
        let err = build_logout_command(
            Provider::OpenAI,
            None,
            OsString::from("/not/on/path"),
        )
        .unwrap_err();
        assert!(matches!(err, CoreError::BadRequest(_)));
    }
}
