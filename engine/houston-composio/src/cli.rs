//! Composio backend powered by the `composio` CLI binary.
//!
//! This replaces the previous MCP-based flow in `composio.rs` and
//! `composio_auth.rs`. Everything Houston needs — auth, linking apps,
//! agent tool access — is a shell-out to the CLI.
//!
//! State ownership:
//! - The CLI owns all its own state under `~/.composio/`. Houston does
//!   not touch the macOS keychain, does not do OAuth dance, does not
//!   manage tokens, does not touch `~/.claude.json`.
//! - Houston's only job is: detect install state, surface the right UX
//!   to the user, and dispatch shell commands.
//!
//! Agents spawned by Houston (`claude` subprocesses) pick up the CLI
//! automatically because `engine/houston-terminal-manager/src/claude_path.rs`
//! appends `~/.composio` to the PATH it sets on those subprocesses.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Stdio;
use tokio::process::Command;

use crate::install;

// -- Public types (shared shape with the legacy `composio.rs` to keep
//    the frontend types stable while the backend is swapped). --

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "status")]
pub enum ComposioStatus {
    /// The CLI is not installed on this machine. UI should offer to
    /// install it.
    #[serde(rename = "not_installed")]
    NotInstalled,
    /// The CLI is installed but the user has not signed in to Composio.
    #[serde(rename = "needs_auth")]
    NeedsAuth,
    /// The user is signed in. The frontend can show the app browse
    /// grid and link buttons.
    #[serde(rename = "ok")]
    Ok {
        email: Option<String>,
        org_name: Option<String>,
    },
    /// Something went wrong talking to the CLI.
    #[serde(rename = "error")]
    Error { message: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StartLoginResponse {
    /// URL the user should open in their browser to approve the login.
    pub login_url: String,
    /// CLI key that uniquely identifies this pending login session.
    /// Pass it back via `complete_login(cli_key)` once the user has
    /// approved in the browser.
    pub cli_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StartLinkResponse {
    /// URL the user should open in their browser to authorize the app.
    pub redirect_url: String,
    /// Composio's identifier for the pending connection.
    pub connected_account_id: String,
    /// The toolkit slug that was linked (e.g. "gmail").
    pub toolkit: String,
}

// -- Public API --

/// Report Houston's current composio state.
pub async fn status() -> ComposioStatus {
    if !install::is_installed() {
        return ComposioStatus::NotInstalled;
    }

    match whoami().await {
        Ok(Some(info)) => ComposioStatus::Ok {
            email: info.email,
            org_name: info.default_org_name,
        },
        Ok(None) => ComposioStatus::NeedsAuth,
        Err(e) => ComposioStatus::Error { message: e },
    }
}

/// Begin the login flow. Returns a URL for the user to open in their
/// browser and a `cli_key` that `complete_login` will use to finalize.
///
/// Implementation note: uses `std::process::Command` (synchronous) via
/// `tokio::task::spawn_blocking`, with stdout redirected to a temp file
/// instead of piped. This bypasses the `tokio::process::Command::output()`
/// hang we observed on macOS inside Tauri's `.app` bundle — the same
/// command returned in ~500 ms from a plain shell but hung indefinitely
/// through tokio's async pipe handling. The sync+file approach has zero
/// tokio pipe involvement.
pub async fn start_login() -> Result<StartLoginResponse, String> {
    let bin = cli_binary()?;
    let home = crate::install::home_dir().to_string_lossy().to_string();
    let path = std::env::var("PATH").unwrap_or_default();

    let result = tokio::time::timeout(
        std::time::Duration::from_secs(30),
        tokio::task::spawn_blocking(move || {
            let tmp = std::env::temp_dir().join("houston-composio-login.json");

            let stdout_file = std::fs::File::create(&tmp)
                .map_err(|e| format!("Failed to create temp file: {e}"))?;

            let mut cmd = std::process::Command::new(&bin);
            cmd.args(["login", "--no-wait", "--no-skill-install", "-y"])
                .env("CI", "1")
                .env("TERM", "dumb")
                .env("NO_COLOR", "1")
                .env("PATH", &path)
                .stdin(std::process::Stdio::null())
                .stdout(stdout_file)
                .stderr(std::process::Stdio::null());
            crate::install::set_home_env(&mut cmd, &home);
            let status = cmd
                .status()
                .map_err(|e| format!("Failed to spawn composio login: {e}"))?;

            if !status.success() {
                return Err(decorate_windows_exit(
                    "composio login --no-wait",
                    &format!("{status}"),
                    status.code(),
                ));
            }

            let stdout = std::fs::read_to_string(&tmp)
                .map_err(|e| format!("Failed to read login output: {e}"))?;
            let _ = std::fs::remove_file(&tmp);

            tracing::info!("[composio:cli] start_login stdout: {}", stdout.trim());
            Ok(stdout)
        }),
    )
    .await
    .map_err(|_| "composio login --no-wait timed out after 30s".to_string())?
    .map_err(|e| format!("spawn_blocking failed: {e}"))??;

    #[derive(Deserialize)]
    struct Payload {
        login_url: String,
        cli_key: String,
    }

    let payload: Payload = serde_json::from_str(result.trim()).map_err(|e| {
        format!(
            "Unexpected composio login --no-wait output: {e}\nstdout: {}",
            result.trim()
        )
    })?;

    Ok(StartLoginResponse {
        login_url: payload.login_url,
        cli_key: payload.cli_key,
    })
}

/// Complete the login flow started by `start_login`. Shells out to
/// `composio login --key <cli_key>` which internally polls Composio's
/// backend for the user's approval and exits once the credentials are
/// written to `~/.composio/user_data.json`.
///
/// Wrapped in a 330s timeout so a stuck subprocess can't hang the
/// Houston UI forever — the CLI's own session expiry is 5 minutes, so
/// 330s gives it ~30s of slack before Houston gives up and returns an
/// error. `kill_on_drop` on the Command ensures the subprocess is
/// terminated if we time out.
pub async fn complete_login(cli_key: &str) -> Result<(), String> {
    let args = ["login", "--key", cli_key, "--no-skill-install", "-y"];
    let result = run_cli_with_timeout(&args, std::time::Duration::from_secs(330)).await;

    match result {
        Ok(output) if output.status.success() => {
            tracing::info!("[composio:cli] login completed via cli_key");
            Ok(())
        }
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            Err(format!(
                "composio login --key failed (exit {}): {}",
                output.status, stderr
            ))
        }
        Err(e) => Err(e),
    }
}

/// Log out of Composio. Best-effort; silently ignores CLI errors.
pub async fn logout() -> Result<(), String> {
    let _ = run_cli(&["logout", "-y"]).await?;
    Ok(())
}

/// Start linking an external toolkit (e.g. "gmail") to the signed-in
/// Composio account. Returns a browser URL for the user to approve the
/// app-specific OAuth. Houston should open this URL with
/// `tauriSystem.openUrl(...)` from the frontend.
pub async fn start_link(toolkit: &str) -> Result<StartLinkResponse, String> {
    if toolkit.is_empty() {
        return Err("toolkit must not be empty".into());
    }
    // Top-level `composio link` (consumer / "Composio for You" namespace).
    // NOT `composio dev connected-accounts link` — that's the developer/
    // platform namespace, and accounts created there are invisible to
    // `composio execute` / `composio search` which agents use at runtime.
    let output = run_cli(&["link", toolkit, "--no-wait"]).await?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        return Err(format!(
            "composio link --no-wait failed (exit {}): {}{}",
            output.status,
            stderr,
            if stdout.is_empty() { String::new() } else { format!("\nstdout: {stdout}") }
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stdout_trimmed = stdout.trim();

    // The CLI returns empty stdout when the toolkit is already connected.
    if stdout_trimmed.is_empty() {
        return Err(format!(
            "{toolkit} is already connected. Disconnect it first in the Composio dashboard if you want to re-link."
        ));
    }

    #[derive(Deserialize)]
    struct Payload {
        redirect_url: String,
        connected_account_id: String,
        toolkit: String,
    }

    let payload: Payload = serde_json::from_str(stdout_trimmed).map_err(|e| {
        format!(
            "Unexpected composio link --no-wait output: {e}\nstdout was: {stdout_trimmed}"
        )
    })?;

    Ok(StartLinkResponse {
        redirect_url: payload.redirect_url,
        connected_account_id: payload.connected_account_id,
        toolkit: payload.toolkit,
    })
}

// -- Internal helpers --

#[derive(Debug, Deserialize)]
struct WhoamiResponse {
    email: Option<String>,
    default_org_name: Option<String>,
}

/// Run `composio whoami`. Returns:
/// - `Ok(Some(info))` if signed in (CLI prints a JSON blob).
/// - `Ok(None)` if the CLI is installed but no user is signed in.
/// - `Err(...)` for anything else (CLI crash, malformed output).
async fn whoami() -> Result<Option<WhoamiResponse>, String> {
    let output = run_cli(&["whoami"]).await?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    if !output.status.success() {
        // "Not logged in" is the only expected non-zero case. Other
        // failures (CLI crash, corrupt config) are errors that should
        // surface to the user. Heuristic: if stderr mentions "login"
        // or stdout is empty, it's just unauthenticated.
        let is_auth_error = stdout.is_empty()
            || stderr.to_lowercase().contains("login")
            || stderr.to_lowercase().contains("not logged")
            || stderr.to_lowercase().contains("unauthenticated");

        if is_auth_error {
            return Ok(None);
        }
        return Err(format!(
            "composio whoami failed (exit {}): {}",
            output.status,
            if stderr.is_empty() { &stdout } else { &stderr }
        ));
    }

    if stdout.is_empty() {
        return Ok(None);
    }
    match serde_json::from_str::<WhoamiResponse>(&stdout) {
        Ok(info) => Ok(Some(info)),
        Err(e) => Err(format!(
            "composio whoami returned unparseable JSON: {e}\nstdout: {stdout}"
        )),
    }
}

/// Default per-call timeout for short CLI invocations (`whoami`,
/// `dev connected-accounts link --no-wait`, etc.). The long-running
/// `login --key` call uses a custom, much larger timeout.
const DEFAULT_CLI_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);

/// Short alias for the common 30s timeout case.
async fn run_cli(args: &[&str]) -> Result<std::process::Output, String> {
    run_cli_with_timeout(args, DEFAULT_CLI_TIMEOUT).await
}

/// Spawn the `composio` CLI with stdout/stderr captured, a hard
/// timeout, and forced non-TTY output.
///
/// The CLI defaults to a TUI in interactive mode, which produces empty
/// output from a subprocess; setting `CI=1`, `TERM=dumb`, and
/// `NO_COLOR=1` makes it emit clean JSON instead.
///
/// `kill_on_drop` ensures that if the future is cancelled or we hit
/// the timeout, the spawned process is terminated instead of leaking.
async fn run_cli_with_timeout(
    args: &[&str],
    timeout: std::time::Duration,
) -> Result<std::process::Output, String> {
    let bin = cli_binary()?;
    let start = std::time::Instant::now();
    tracing::debug!(
        "[composio:cli] → spawn {:?} {:?} (timeout={:?})",
        bin,
        args,
        timeout
    );

    // Explicitly pass HOME (and USERPROFILE on Windows) plus PATH:
    // macOS `.app` bundles launched from Finder can spawn subprocesses
    // with a stripped environment, leaving the CLI unable to find its
    // own config at `~/.composio`. Windows never sets HOME, so the
    // Bun-compiled composio.exe needs USERPROFILE to resolve
    // `os.homedir()` for the same lookup.
    let home = crate::install::home_dir().to_string_lossy().to_string();
    let path = std::env::var("PATH").unwrap_or_default();

    let mut cmd = Command::new(&bin);
    cmd.args(args)
        .env("CI", "1")
        .env("TERM", "dumb")
        .env("NO_COLOR", "1")
        .env("PATH", &path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    crate::install::set_home_env_tokio(&mut cmd, &home);

    let fut = cmd.output();
    let result = match tokio::time::timeout(timeout, fut).await {
        Ok(Ok(out)) => Ok(out),
        Ok(Err(e)) => Err(format!("Failed to spawn composio CLI: {e}")),
        Err(_) => Err(format!(
            "composio CLI timed out after {:?}: args={:?}",
            timeout, args
        )),
    };

    let elapsed = start.elapsed();
    match &result {
        Ok(out) => {
            let stdout_len = out.stdout.len();
            let stderr_len = out.stderr.len();
            tracing::debug!(
                "[composio:cli] ← exit={} stdout={}B stderr={}B in {:?} args={:?}",
                out.status,
                stdout_len,
                stderr_len,
                elapsed,
                args
            );
            if stdout_len > 0 && stdout_len < 2048 {
                tracing::debug!(
                    "[composio:cli]   stdout: {}",
                    String::from_utf8_lossy(&out.stdout).trim()
                );
            }
            if stderr_len > 0 && stderr_len < 2048 {
                tracing::debug!(
                    "[composio:cli]   stderr: {}",
                    String::from_utf8_lossy(&out.stderr).trim()
                );
            }
        }
        Err(e) => {
            tracing::error!(
                "[composio:cli] ← error in {:?}: {}",
                elapsed,
                e
            );
        }
    }
    result
}

fn cli_binary() -> Result<PathBuf, String> {
    let p = install::cli_path();
    if !p.exists() {
        return Err(format!(
            "composio CLI not installed at {} — call install_composio_cli first",
            p.display()
        ));
    }
    Ok(p)
}

// -- Connected toolkits listing --
//
// Uses the Composio REST API to get active connected toolkits in the
// consumer namespace. The CLI's `connections list` returns ALL statuses
// (including hundreds of EXPIRED entries) and can truncate results due
// to pagination limits. The REST endpoint returns only active toolkit
// slugs, is fast, and never truncates.

/// List all connected toolkit slugs in the consumer ("Composio for You")
/// namespace. Returns a sorted `Vec<String>` of toolkit slugs.
///
/// Calls `GET /api/v3/org/consumer/connected_toolkits` after resolving
/// the consumer user ID from `GET /api/v3/org/consumer/project/resolve`.
pub async fn list_connected_toolkits() -> Vec<String> {
    match list_connected_toolkits_inner().await {
        Ok(mut slugs) => {
            slugs.sort();
            tracing::info!(
                "[composio] connected_toolkits returned {} slugs: {:?}",
                slugs.len(),
                slugs
            );
            slugs
        }
        Err(e) => {
            tracing::warn!("[composio] failed to list connected toolkits: {e}");
            Vec::new()
        }
    }
}

async fn list_connected_toolkits_inner() -> Result<Vec<String>, String> {
    let (api_key, base_url, org_id) = crate::apps::read_user_config_full()?;

    let client = reqwest::Client::new();

    // Step 1: resolve consumer project to get consumer_user_id
    let resolve_resp = client
        .post(format!("{base_url}/api/v3/org/consumer/project/resolve"))
        .header("x-user-api-key", &api_key)
        .header("x-org-id", &org_id)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Consumer project resolve failed: {e}"))?;

    if !resolve_resp.status().is_success() {
        return Err(format!("Consumer project resolve returned {}", resolve_resp.status()));
    }

    #[derive(Deserialize)]
    struct ConsumerProject {
        consumer_user_id: String,
    }

    let project: ConsumerProject = resolve_resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse consumer project: {e}"))?;

    // Step 2: get connected toolkits for this consumer user
    let toolkits_resp = client
        .get(format!("{base_url}/api/v3/org/consumer/connected_toolkits"))
        .query(&[("user_id", &project.consumer_user_id)])
        .header("x-user-api-key", &api_key)
        .header("x-org-id", &org_id)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Connected toolkits request failed: {e}"))?;

    if !toolkits_resp.status().is_success() {
        return Err(format!("Connected toolkits returned {}", toolkits_resp.status()));
    }

    #[derive(Deserialize)]
    struct ConnectedToolkits {
        toolkits: Vec<String>,
    }

    let result: ConnectedToolkits = toolkits_resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse connected toolkits: {e}"))?;

    Ok(result.toolkits)
}

/// Turn a cryptic Windows process exit (e.g. `0xc000001d`) into a
/// human-actionable error message. On non-Windows or unrecognized
/// codes we return the original status verbatim.
fn decorate_windows_exit(command: &str, status_display: &str, exit_code: Option<i32>) -> String {
    // i32 sign-extended NTSTATUS values that appear in process exits.
    // Tests pass these as the canonical u32 NTSTATUS hex form so we
    // compare on the lower 32 bits.
    let nt = exit_code.map(|c| c as u32);
    let hint = match nt {
        Some(0xC000_001D) => Some(
            "STATUS_ILLEGAL_INSTRUCTION (0xc000001d): the bundled x64 \
             binary uses CPU instructions not supported by this CPU. \
             On Windows-on-ARM laptops the x64 emulator does not \
             implement every instruction set — Composio needs a \
             native aarch64 build (tracked in gethouston/composio). \
             On native x64 hardware this usually means a corrupted \
             binary; reinstall Houston.",
        ),
        Some(0xC000_0135) => Some(
            "STATUS_DLL_NOT_FOUND (0xc0000135): a runtime DLL the CLI \
             needs is missing. Reinstall Houston or check the install \
             directory for missing files.",
        ),
        Some(0xC000_0139) => Some(
            "STATUS_ENTRYPOINT_NOT_FOUND (0xc0000139): a DLL is present \
             but the wrong version. Reinstall Houston.",
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
    fn decorates_illegal_instruction() {
        let msg = decorate_windows_exit("composio whoami", "exit code: 0xc000001d", Some(0xC000_001D_u32 as i32));
        assert!(msg.contains("STATUS_ILLEGAL_INSTRUCTION"));
        assert!(msg.contains("aarch64"));
    }

    #[test]
    fn passes_through_unknown_codes() {
        let msg = decorate_windows_exit("composio login", "exit code: 1", Some(1));
        assert_eq!(msg, "composio login exited with exit code: 1");
    }

    #[test]
    fn passes_through_when_code_unavailable() {
        let msg = decorate_windows_exit("composio login", "signal: 9", None);
        assert_eq!(msg, "composio login exited with signal: 9");
    }
}
