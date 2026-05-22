//! Provider management — relocated from `app/src-tauri/src/commands/provider.rs`.
//!
//! CLI-installation + auth-status probes and the OAuth login launcher.
//! Default-provider persistence reuses `crate::preferences` (generic
//! key/value store), so `DEFAULT_PROVIDER_KEY` is exposed for callers
//! that want to `get`/`set` the preference directly.
//!
//! API-key providers (Gemini today) write the key to a provider-specific
//! dotfile from the engine, so the picker can flip to "Connected" on the
//! next status poll without asking the user to restart Houston. See
//! [`gemini_credentials`].

mod gemini_credentials;
mod gemini_disconnect;
mod gemini_login;
mod login_relay;

pub use gemini_credentials::set_gemini_api_key;
pub use gemini_disconnect::disconnect_gemini;
pub use login_relay::submit_login_code;

use crate::error::{CoreError, CoreResult};
use houston_terminal_manager::provider_auth::ProviderAuthState;
use houston_terminal_manager::{claude_path, InstallSource, Provider};
use houston_ui_events::DynEventSink;
use serde::{Deserialize, Serialize};
use std::ffi::OsString;
use std::path::PathBuf;
use std::time::Duration;

// `InstallSource` (imported above) lives in `houston-terminal-manager`
// now, next to the adapter trait that produces it.

pub const DEFAULT_PROVIDER_KEY: &str = "default_provider";

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
    let (install_source, cli_path) = provider.resolve();
    let cli_installed = !matches!(install_source, InstallSource::Missing);
    let auth_state = if let Some(path) = cli_path.as_deref() {
        provider.probe_auth(path).await
    } else {
        ProviderAuthState::Unauthenticated
    };
    Ok(ProviderStatus {
        provider: provider.id().to_string(),
        cli_installed,
        auth_state,
        cli_name: provider.cli_name().to_string(),
        install_source,
        cli_path: cli_path.map(|p| p.to_string_lossy().into_owned()),
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
/// stash its stdin handle in [`LOGIN_SESSIONS`] and spawn a background
/// task that reads stdout line-by-line. The first HTTPS URL we see
/// goes out as a [`HoustonEvent::ProviderLoginUrl`] so the frontend
/// can show it to the user. When the child eventually exits (after
/// the user pastes their verification code via [`submit_login_code`]),
/// we emit [`HoustonEvent::ProviderLoginComplete`] with the exit
/// status. This makes "click Connect → OAuth in browser → done" work
/// for remote/headless engines (containers, Always-On) where the CLI
/// can't open the user's browser itself.
pub async fn launch_login(provider: Provider, sink: DynEventSink) -> CoreResult<()> {
    // Gemini has no `gemini auth login` subcommand. Instead, gemini-cli
    // exposes an `authenticate` JSON-RPC method over its `--acp` mode
    // (Agent Communication Protocol) that triggers Google's OAuth flow
    // via the user's browser, using gemini-cli's own app identity. We
    // delegate there rather than spawning gemini with positional args.
    // See `gemini_login.rs` for the protocol details + rationale.
    if provider.id() == "gemini" {
        let (_, gemini_path) = provider.resolve();
        let path = gemini_path.ok_or_else(|| {
            CoreError::BadRequest(
                "Gemini CLI binary not found. Reinstall Houston to restore the bundled CLI."
                    .into(),
            )
        })?;
        return gemini_login::launch_login(path).await;
    }

    let ProviderCliCommand {
        cli_name,
        path,
        args,
        shell_path,
    } = login_command(provider)?;

    let mut cmd = tokio::process::Command::new(&path);
    cmd.args(&args)
        .env("PATH", shell_path)
        // Piped (was `null`) because remote/headless engines need to
        // write the user's OAuth verification code back into the CLI
        // after the user completes the browser flow. On desktop this
        // pipe is never used — claude finishes via its 127.0.0.1
        // callback before we'd ever write — but harmless either way.
        .stdin(std::process::Stdio::piped())
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
    if provider.id() == "anthropic" {
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
                     https://git-scm.com/downloads/win and Houston will auto-detect it on next launch."
                        .into(),
                ));
            }
        }
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| CoreError::Internal(format!("failed to spawn {cli_name} login: {e}")))?;

    // Take stdin BEFORE the probe. `tokio::process::Child::wait` calls
    // `drop(self.stdin.take())` internally to avoid the classic
    // deadlock where the parent waits for exit while the child is
    // blocked on stdin. If we don't lift the handle out first,
    // `child.stdin.take()` returns `None` after the probe and the
    // URL-relay branch can't write the user's verification code back.
    let stdin = child.stdin.take();

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
            // Still running after 3s — the OAuth flow is in progress.
            // Hand the stdin handle off to the session map and the
            // stdout/stderr handles off to the relay task. Insert is
            // exclusive: a duplicate Connect click on the same
            // provider while one is pending is rejected here, so the
            // first subprocess can't be orphaned by overwrite. The
            // relay task emits ProviderLoginUrl + ProviderLoginComplete
            // and removes the session on child exit.
            tracing::info!(
                "[houston:provider] {cli_name} login still running after 3s probe; relaying URL"
            );
            let provider_id = provider.id().to_string();
            let cli_name_owned = cli_name.to_string();

            let stdin = stdin.ok_or_else(|| {
                CoreError::Internal(format!(
                    "{cli_name} login: stdin handle missing (Stdio::piped wasn't applied?)"
                ))
            })?;
            let stdout = child.stdout.take().ok_or_else(|| {
                CoreError::Internal(format!(
                    "{cli_name} login: child stdout was unexpectedly None"
                ))
            })?;
            let stderr = child.stderr.take();

            login_relay::insert_session(&provider_id, cli_name, stdin).await?;
            login_relay::spawn_relay(
                provider_id,
                cli_name_owned,
                child,
                stdout,
                stderr,
                sink,
            );
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
    // Gemini has no CLI logout subcommand. The interactive `/auth logout`
    // slash command added in gemini-cli PR #13383 strips internal
    // "thoughts" from conversation history as a side effect, which
    // Houston must NOT do — sessions are user data. Clear the same
    // credential files that command clears, directly from the engine.
    // See `gemini_disconnect` for the full set of files touched (and
    // not touched).
    if provider.id() == "gemini" {
        return disconnect_gemini().await;
    }

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
    let resolved_path = provider.resolve().1;
    let args = provider
        .login_args()
        .ok_or_else(|| {
            CoreError::BadRequest(format!(
                "{} has no CLI login flow. Connect via settings instead.",
                provider.cli_name()
            ))
        })?
        .to_vec();
    build_cli_command(provider, args, resolved_path, claude_path::shell_path())
}

fn logout_command(provider: Provider) -> CoreResult<ProviderCliCommand> {
    let resolved_path = provider.resolve().1;
    let args = provider
        .logout_args()
        .ok_or_else(|| {
            CoreError::BadRequest(format!(
                "{} has no CLI logout flow. Disconnect via settings instead.",
                provider.cli_name()
            ))
        })?
        .to_vec();
    build_cli_command(provider, args, resolved_path, claude_path::shell_path())
}

fn build_cli_command(
    provider: Provider,
    args: Vec<&'static str>,
    resolved_path: Option<PathBuf>,
    shell_path: OsString,
) -> CoreResult<ProviderCliCommand> {
    let cli_name = provider.cli_name();
    let path = resolved_path
        .ok_or_else(|| CoreError::BadRequest(format!("{cli_name} CLI is not installed")))?;

    Ok(ProviderCliCommand {
        cli_name,
        path,
        args,
        shell_path,
    })
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
             set, so the CLI needs a native aarch64 build. On native x64 \
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
        assert!(parse("nonexistent-provider").is_err());
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

    // URL-relay tests live in `provider/login_relay.rs` alongside
    // the regex + session map they exercise.

    #[test]
    fn login_command_uses_resolved_cli_path() {
        let provider = parse("anthropic").unwrap();
        let path = PathBuf::from("/tmp/houston-test-claude");
        let command = build_cli_command(
            provider,
            provider.login_args().unwrap().to_vec(),
            Some(path.clone()),
            OsString::from("/not/on/path"),
        )
        .unwrap();
        assert_eq!(command.cli_name, "claude");
        assert_eq!(command.path, path);
        assert_eq!(command.args, vec!["auth", "login", "--claudeai"]);
    }

    #[test]
    fn login_command_codex_includes_reasoning_effort_override() {
        let provider = parse("openai").unwrap();
        let path = PathBuf::from("/tmp/houston-test-codex");
        let command = build_cli_command(
            provider,
            provider.login_args().unwrap().to_vec(),
            Some(path.clone()),
            OsString::from("/not/on/path"),
        )
        .unwrap();
        assert_eq!(command.cli_name, "codex");
        assert_eq!(command.path, path);
        assert_eq!(
            command.args,
            vec!["login", "-c", "model_reasoning_effort=high"]
        );
    }

    #[test]
    fn logout_command_claude_uses_auth_logout() {
        let provider = parse("anthropic").unwrap();
        let path = PathBuf::from("/tmp/houston-test-claude");
        let command = build_cli_command(
            provider,
            provider.logout_args().unwrap().to_vec(),
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
        let provider = parse("openai").unwrap();
        let path = PathBuf::from("/tmp/houston-test-codex");
        let command = build_cli_command(
            provider,
            provider.logout_args().unwrap().to_vec(),
            Some(path.clone()),
            OsString::from("/not/on/path"),
        )
        .unwrap();
        assert_eq!(command.cli_name, "codex");
        assert_eq!(command.path, path);
        assert_eq!(
            command.args,
            vec!["logout", "-c", "model_reasoning_effort=high"]
        );
    }

    #[test]
    fn logout_command_errors_when_cli_missing() {
        let provider = parse("openai").unwrap();
        let err = build_cli_command(
            provider,
            provider.logout_args().unwrap().to_vec(),
            None,
            OsString::from("/not/on/path"),
        )
        .unwrap_err();
        assert!(matches!(err, CoreError::BadRequest(_)));
    }
}
