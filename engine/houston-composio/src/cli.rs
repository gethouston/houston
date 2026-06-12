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
use crate::toolkits::normalize_toolkit_slug;

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

            // Do NOT log the raw stdout: it is the `{login_url, cli_key}`
            // JSON, and `cli_key` is the login-session credential that
            // `complete_login` later passes as `--key` (HOU-431). Log only
            // its size so "CLI returned something" is still distinguishable
            // from "CLI returned nothing".
            tracing::info!(
                "[composio:cli] start_login returned {} bytes",
                stdout.trim().len()
            );
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
        // Do NOT echo the raw stdout: it is the `{login_url, cli_key}` payload
        // and both fields carry the login-session secret (`login_url` embeds
        // it as `?cliKey=`). The serde message names the failing field/offset
        // without dumping the blob (HOU-431).
        format!("Unexpected composio login --no-wait output: {e}")
    })?;

    Ok(StartLoginResponse {
        login_url: payload.login_url,
        cli_key: payload.cli_key,
    })
}

/// How long `complete_login` waits for the user to approve the sign-in
/// in their browser before giving up.
///
/// The composio CLI's `login --key` polls the pending-login session for
/// up to **10 minutes** — the session's own lifetime (`expiresAt -
/// cachedAt` in `~/.composio/pending-login-session.json` is exactly
/// 600s). Crucially the CLI stays completely silent the whole time (no
/// stdout, no stderr) even for an invalid or already-expired key
/// (verified by probing the bundled binary), so there is no early
/// failure signal to surface — this wall-clock cap is the de-facto
/// outcome for any login the user does not approve.
///
/// 180s comfortably covers a real browser OAuth (the happy path returns
/// within seconds of the user approving) while surfacing an actionable,
/// retryable error ~2.5 minutes sooner than the previous 330s. That 330s
/// rested on a wrong "5 minute session" assumption AND was shorter than
/// the CLI's real 10-minute poll, so it cut still-valid sessions off
/// mid-flight and handed the user a raw internal timeout string (HOU-434).
const LOGIN_POLL_TIMEOUT_SECS: u64 = 180;

/// Why `complete_login` failed, so the caller can tell an expected "user
/// never finished in the browser" timeout apart from a genuine CLI fault.
/// The engine server maps `TimedOut` to a typed, localized, user-
/// actionable error (`kind = "composio_login_timeout"`) and leaves
/// `Failed` as an internal error worth a bug report.
#[derive(Debug)]
pub enum CompleteLoginError {
    /// We hit `LOGIN_POLL_TIMEOUT_SECS` before the CLI completed — the
    /// user almost certainly closed the tab or walked away. Not a bug.
    TimedOut,
    /// Spawn failure or a non-zero CLI exit. Carries internal detail for
    /// logs / the bug report; never shown verbatim to the user.
    Failed(String),
}

impl std::fmt::Display for CompleteLoginError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::TimedOut => write!(
                f,
                "composio login timed out after {LOGIN_POLL_TIMEOUT_SECS}s waiting for browser approval"
            ),
            Self::Failed(detail) => write!(f, "{detail}"),
        }
    }
}

/// Complete the login flow started by `start_login`. Shells out to
/// `composio login --key <cli_key>`, which polls Composio's backend for
/// the user's browser approval and exits once the credentials are
/// written to `~/.composio/user_data.json`.
///
/// Bounded by `LOGIN_POLL_TIMEOUT_SECS`; `kill_on_drop` on the Command
/// (see `run_cli_with_timeout`) terminates the subprocess if we time out
/// so it can't leak.
pub async fn complete_login(cli_key: &str) -> Result<(), CompleteLoginError> {
    let args = ["login", "--key", cli_key, "--no-skill-install", "-y"];
    let timeout = std::time::Duration::from_secs(LOGIN_POLL_TIMEOUT_SECS);

    match run_cli_with_timeout(&args, timeout).await {
        Ok(output) if output.status.success() => {
            tracing::info!("[composio:cli] login completed via cli_key");
            Ok(())
        }
        Ok(output) => {
            // CLI exited non-zero before our cap. Rare — the CLI polls
            // silently for invalid/expired keys rather than failing fast
            // — so a fast non-zero exit is a genuine fault. No argv here,
            // so the `--key` secret can't leak into the message.
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            Err(CompleteLoginError::Failed(format!(
                "composio login --key failed (exit {}): {}",
                output.status, stderr
            )))
        }
        Err(CliError::TimedOut) => Err(CompleteLoginError::TimedOut),
        Err(CliError::Spawn(detail)) => Err(CompleteLoginError::Failed(detail)),
    }
}

/// Log out of Composio. Shells out to `composio logout` (no flags —
/// the subcommand takes none and rejects `-y` with exit 1 + usage
/// text). Errors surface to the caller so the UI can toast on failure
/// instead of falsely reporting success.
pub async fn logout() -> Result<(), String> {
    let output = run_cli(&["logout"]).await?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(format!(
            "composio logout failed (exit {}): {}",
            output.status,
            if stderr.is_empty() { "<no stderr>" } else { &stderr }
        ));
    }
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
    let stderr = String::from_utf8_lossy(&output.stderr);
    interpret_link_output(toolkit, &stdout, &stderr)
}

/// Interpret the stdout of a successful `composio link <toolkit> --no-wait`.
///
/// The CLI's `--no-wait` output is not a single stable shape. Depending on
/// the toolkit's auth scheme (and CLI version) a successful run prints ONE of:
///   1. a JSON object `{redirect_url, connected_account_id, toolkit}`, or
///   2. a bare authorization URL on a single line, e.g.
///      `https://dashboard.composio.dev/<ws>/~/connect/apps/<toolkit>?open=true`,
/// and it prints nothing at all when the toolkit is already connected.
///
/// All three are normal CLI behavior. Only the bare-URL case used to crash
/// (`Unexpected composio link --no-wait output: expected value at line 1
/// column 1`, HOU-433) because the engine assumed JSON and fed a URL to
/// serde. The frontend only ever opens `redirect_url`, so a bare URL is a
/// complete, usable response; `connected_account_id` is unknown until the
/// user authorizes and is not consumed downstream (the connection watcher
/// keys off the toolkit slug, not the account id).
fn interpret_link_output(
    toolkit: &str,
    stdout: &str,
    stderr: &str,
) -> Result<StartLinkResponse, String> {
    let stdout = stdout.trim();
    let stderr = stderr.trim();

    // Empty stdout: the CLI no-ops when the toolkit is already connected.
    if stdout.is_empty() {
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

    // Mode 1: full JSON payload.
    if let Ok(p) = serde_json::from_str::<Payload>(stdout) {
        return Ok(StartLinkResponse {
            redirect_url: p.redirect_url,
            connected_account_id: p.connected_account_id,
            toolkit: p.toolkit,
        });
    }

    // Mode 2: a single bare authorization URL. That URL is exactly what the
    // frontend opens, so treat it as the redirect_url instead of crashing.
    if let Some(url) = bare_url(stdout) {
        return Ok(StartLinkResponse {
            redirect_url: url.to_string(),
            connected_account_id: String::new(),
            toolkit: toolkit.to_string(),
        });
    }

    // Neither JSON nor a URL: surface the CLI's own stdout/stderr so the bug
    // report shows what actually happened instead of a bare parse error.
    Err(format!(
        "composio link --no-wait produced unrecognized output for {toolkit}.\nstdout: {stdout}{}",
        if stderr.is_empty() {
            String::new()
        } else {
            format!("\nstderr: {stderr}")
        }
    ))
}

/// `Some(url)` when `s` is exactly one `http(s)://` URL token with no
/// surrounding prose or whitespace. Requiring the whole trimmed string to be
/// the URL avoids mistaking a URL embedded in an error message ("...see
/// https://docs... for help") for a redirect target.
fn bare_url(s: &str) -> Option<&str> {
    let s = s.trim();
    if (s.starts_with("https://") || s.starts_with("http://")) && !s.contains(char::is_whitespace) {
        Some(s)
    } else {
        None
    }
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

/// Short alias for the common 30s timeout case. Flattens the typed
/// `CliError` to a string — only `complete_login` needs to tell a
/// timeout apart from a spawn failure.
async fn run_cli(args: &[&str]) -> Result<std::process::Output, String> {
    run_cli_with_timeout(args, DEFAULT_CLI_TIMEOUT)
        .await
        .map_err(|e| e.to_string())
}

/// Failure modes of a CLI invocation. Kept distinct so `complete_login`
/// can map a wall-clock timeout to a user-actionable message while every
/// other caller flattens both arms to a string via `run_cli`.
enum CliError {
    /// The process did not exit before the caller's timeout elapsed.
    TimedOut,
    /// Failed to spawn or wait on the process.
    Spawn(String),
}

impl std::fmt::Display for CliError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            // No argv in the message: a `login --key` timeout must never
            // surface the secret cli_key (HOU-431 / HOU-434).
            Self::TimedOut => write!(f, "composio CLI timed out"),
            Self::Spawn(detail) => write!(f, "{detail}"),
        }
    }
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
) -> Result<std::process::Output, CliError> {
    // A missing binary is a spawn precondition failure, not a timeout.
    let bin = cli_binary().map_err(CliError::Spawn)?;
    let start = std::time::Instant::now();
    tracing::debug!(
        "[composio:cli] → spawn {:?} {:?} (timeout={:?})",
        bin,
        redact_secret_args(args),
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
        Ok(Err(e)) => Err(CliError::Spawn(format!("Failed to spawn composio CLI: {e}"))),
        Err(_) => Err(CliError::TimedOut),
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
                redact_secret_args(args)
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
        Err(CliError::TimedOut) => {
            // A timeout is transient/expected — most often the user never
            // approved a `login` in the browser. Log at warn! (a Sentry
            // breadcrumb, NOT an event) so an abandoned sign-in stops
            // spamming crash reporting (HOU-434); `sentry_tracing` would
            // ship an error! here as a full event. Log only the
            // subcommand, never argv — `login` carries the secret key.
            tracing::warn!(
                "[composio:cli] ← `{}` timed out after {:?}",
                args.first().copied().unwrap_or("?"),
                elapsed
            );
        }
        Err(CliError::Spawn(detail)) => {
            tracing::error!("[composio:cli] ← error in {:?}: {detail}", elapsed);
        }
    }
    result
}

/// Mask secret-bearing argv values before an arg list is formatted into a
/// log line or a returned error string. `composio login --key <cli_key>`
/// puts a login-session credential on argv; without this it rode into
/// `backend.log`, the timeout error string, and from there into Sentry
/// (HOU-431). Returns owned `String`s safe to `{:?}`-format. Handles both
/// the separated (`--key`, `<value>`) and joined (`--key=<value>`) forms.
fn redact_secret_args(args: &[&str]) -> Vec<String> {
    let mut out = Vec::with_capacity(args.len());
    let mut redact_next = false;
    for &arg in args {
        if redact_next {
            out.push("<redacted>".to_string());
            redact_next = false;
        } else if arg == "--key" {
            out.push(arg.to_string());
            redact_next = true;
        } else if arg.starts_with("--key=") {
            out.push("--key=<redacted>".to_string());
        } else {
            out.push(arg.to_string());
        }
    }
    out
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
    let project = resolve_consumer_project(&client, &base_url, &api_key, &org_id).await?;

    let toolkits_resp = client
        .get(format!("{base_url}/api/v3/org/consumer/connected_toolkits"))
        .query(&[("user_id", &project.user_id)])
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

/// Consumer ("Composio for You") project identity, resolved once per
/// operation and reused across the consumer-namespace REST calls.
struct ConsumerProject {
    /// Consumer user id (e.g. `consumer-...-ok_...`).
    user_id: String,
    /// Project nano id (e.g. `pr_...`). REQUIRED as the `x-project-id`
    /// header on `/api/v3/connected_accounts*` — without it the endpoint
    /// resolves to the org's default project and returns ZERO accounts
    /// even though the consumer connection exists (verified against the
    /// live API: org-only headers → `items: []`; + `x-project-id` → the
    /// real accounts).
    project_nano_id: String,
}

/// Resolve the consumer project (user id + project nano id). Shared by
/// every consumer-namespace REST call. Mirrors the resolve step the
/// composio CLI performs before scoping `client.connectedAccounts.*` to
/// the consumer project.
async fn resolve_consumer_project(
    client: &reqwest::Client,
    base_url: &str,
    api_key: &str,
    org_id: &str,
) -> Result<ConsumerProject, String> {
    let resolve_resp = client
        .post(format!("{base_url}/api/v3/org/consumer/project/resolve"))
        .header("x-user-api-key", api_key)
        .header("x-org-id", org_id)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Consumer project resolve failed: {e}"))?;

    if !resolve_resp.status().is_success() {
        return Err(format!(
            "Consumer project resolve returned {}",
            resolve_resp.status()
        ));
    }

    #[derive(Deserialize)]
    struct Resolved {
        consumer_user_id: String,
        project_nano_id: String,
    }

    let r: Resolved = resolve_resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse consumer project: {e}"))?;
    Ok(ConsumerProject {
        user_id: r.consumer_user_id,
        project_nano_id: r.project_nano_id,
    })
}

/// GET the consumer's connected accounts for a toolkit, scoped to an
/// already-resolved project. The `x-project-id` header (project nano id)
/// is what scopes the query to the consumer project; omit it and the
/// endpoint returns an empty list.
async fn fetch_connected_accounts(
    client: &reqwest::Client,
    base_url: &str,
    api_key: &str,
    org_id: &str,
    project: &ConsumerProject,
    toolkit: &str,
) -> Result<Vec<ConnectedAccount>, String> {
    let resp = client
        .get(format!("{base_url}/api/v3/connected_accounts"))
        .query(&[
            ("user_ids", project.user_id.as_str()),
            ("toolkit_slugs", toolkit),
            ("limit", "1000"),
        ])
        .header("x-user-api-key", api_key)
        .header("x-org-id", org_id)
        .header("x-project-id", &project.project_nano_id)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Connected accounts request failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Connected accounts returned {}", resp.status()));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse connected accounts: {e}"))?;

    parse_connected_accounts(&body)
}

// -- Connected accounts (disconnect + reconnect) --
//
// `connected_toolkits` (above) tells us WHICH apps are connected; managing
// a connection needs the underlying connected-account ids. These mirror the
// exact calls the composio CLI's `connections list` / `connections remove`
// make through the SDK (`client.connectedAccounts.list` / `.delete` /
// `.refresh`), scoped to the consumer user. We go straight to REST because:
//   - `connections remove` only ships in @composio/cli >= 0.2.26 (Houston
//     bundles 0.2.24) AND always prompts an interactive confirm with no
//     `--yes` bypass, so it can't run in the engine's non-TTY wrapper.
//   - there is NO CLI command for reconnect/refresh in any version.
// `/api/v3/connected_accounts` exposes list + delete + refresh; v3 and v3.1
// are aliases, and Houston speaks v3 everywhere else.

/// One connected account as returned by `GET /api/v3/connected_accounts`.
#[derive(Debug, Clone, Deserialize)]
pub struct ConnectedAccount {
    /// Composio nanoid (e.g. `ca_...`). The handle for delete/refresh.
    pub id: String,
    /// Account status (e.g. `ACTIVE`, `INITIATED`, `EXPIRED`, `FAILED`).
    #[serde(default)]
    pub status: String,
}

/// List the consumer's connected accounts for a single toolkit slug.
/// Empty `Vec` means the toolkit has no connected account.
pub async fn list_connected_accounts(toolkit: &str) -> Result<Vec<ConnectedAccount>, String> {
    let toolkit = normalize_toolkit_slug(toolkit);
    if toolkit.is_empty() {
        return Err("toolkit must not be empty".into());
    }
    let (api_key, base_url, org_id) = crate::apps::read_user_config_full()?;
    let client = reqwest::Client::new();
    let project = resolve_consumer_project(&client, &base_url, &api_key, &org_id).await?;
    fetch_connected_accounts(&client, &base_url, &api_key, &org_id, &project, &toolkit).await
}

/// Extract `{ id, status }` records from a `connected_accounts` list
/// response. The payload wraps results in an `items` array (same shape as
/// the toolkit catalog endpoint).
fn parse_connected_accounts(body: &serde_json::Value) -> Result<Vec<ConnectedAccount>, String> {
    let items = body
        .get("items")
        .and_then(|v| v.as_array())
        .ok_or("Expected 'items' array in connected accounts response")?;

    Ok(items
        .iter()
        .filter_map(|item| {
            let id = item.get("id").and_then(|v| v.as_str())?.trim().to_string();
            if id.is_empty() {
                return None;
            }
            let status = item
                .get("status")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
            Some(ConnectedAccount { id, status })
        })
        .collect())
}

/// Disconnect (delete) every connected account for `toolkit` in the
/// consumer namespace. Returns the number of accounts removed.
///
/// Deletes ALL matching accounts (active + stale/expired) so the toolkit
/// is fully gone, matching what a user expects from "Disconnect". Errors
/// surface to the caller so the UI toasts on failure.
///
/// Upstream caveat: `connectedAccounts.delete` removes Composio's record
/// but does NOT revoke the OAuth token at the upstream provider.
pub async fn disconnect_toolkit(toolkit: &str) -> Result<usize, String> {
    let toolkit = normalize_toolkit_slug(toolkit);
    if toolkit.is_empty() {
        return Err("toolkit must not be empty".into());
    }
    let (api_key, base_url, org_id) = crate::apps::read_user_config_full()?;
    let client = reqwest::Client::new();
    let project = resolve_consumer_project(&client, &base_url, &api_key, &org_id).await?;
    let accounts =
        fetch_connected_accounts(&client, &base_url, &api_key, &org_id, &project, &toolkit).await?;
    if accounts.is_empty() {
        return Err(format!("No connected account found for {toolkit}"));
    }

    let mut removed = 0usize;
    for acct in &accounts {
        let resp = client
            .delete(format!("{base_url}/api/v3/connected_accounts/{}", acct.id))
            .header("x-user-api-key", &api_key)
            .header("x-org-id", &org_id)
            .header("x-project-id", &project.project_nano_id)
            .header("Accept", "application/json")
            .send()
            .await
            .map_err(|e| format!("Disconnect request failed for {}: {e}", acct.id))?;

        if !resp.status().is_success() {
            return Err(format!(
                "Disconnect failed for {} (status {})",
                acct.id,
                resp.status()
            ));
        }
        removed += 1;
    }

    Ok(removed)
}

/// Reconnect (refresh authentication on) the connected account for
/// `toolkit`. Returns the browser URL the user must open to complete
/// OAuth re-consent, or `None` for auth schemes that refresh silently
/// (e.g. API-key connections).
///
/// Maps to `POST /api/v3/connected_accounts/{id}/refresh` — the same call
/// the dashboard "Reconnect" button makes (formerly v1 `reinitiate`).
/// There is no CLI command for this in any composio version, so REST is
/// the only path. Prefers an `ACTIVE` account, else falls back to the
/// first one (a broken connection has no active account, and that is
/// exactly the account a reconnect needs to refresh).
pub async fn reconnect_toolkit(toolkit: &str) -> Result<Option<String>, String> {
    let toolkit = normalize_toolkit_slug(toolkit);
    if toolkit.is_empty() {
        return Err("toolkit must not be empty".into());
    }
    let (api_key, base_url, org_id) = crate::apps::read_user_config_full()?;
    let client = reqwest::Client::new();
    let project = resolve_consumer_project(&client, &base_url, &api_key, &org_id).await?;
    let accounts =
        fetch_connected_accounts(&client, &base_url, &api_key, &org_id, &project, &toolkit).await?;
    let target = accounts
        .iter()
        .find(|a| a.status.eq_ignore_ascii_case("ACTIVE"))
        .or_else(|| accounts.first())
        .ok_or_else(|| format!("No connected account found for {toolkit}"))?;

    let resp = client
        .post(format!(
            "{base_url}/api/v3/connected_accounts/{}/refresh",
            target.id
        ))
        .header("x-user-api-key", &api_key)
        .header("x-org-id", &org_id)
        .header("x-project-id", &project.project_nano_id)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&serde_json::json!({}))
        .send()
        .await
        .map_err(|e| format!("Reconnect request failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Reconnect failed (status {})", resp.status()));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse reconnect response: {e}"))?;

    Ok(parse_redirect_url(&body))
}

/// Pull a non-empty `redirect_url` out of a refresh response, or `None`.
fn parse_redirect_url(body: &serde_json::Value) -> Option<String> {
    body.get("redirect_url")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
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
    fn redact_secret_args_masks_separated_key() {
        let args = [
            "login",
            "--key",
            "cf7f2461-f693-4f65-95bf-6d110f1d4344",
            "--no-skill-install",
            "-y",
        ];
        let red = redact_secret_args(&args);
        assert_eq!(
            red,
            vec!["login", "--key", "<redacted>", "--no-skill-install", "-y"]
        );
        // The Debug-formatted form is what reached Sentry — it must be clean.
        assert!(!format!("{red:?}").contains("cf7f2461"));
    }

    #[test]
    fn redact_secret_args_masks_joined_key() {
        let args = ["login", "--key=super-secret", "-y"];
        assert_eq!(
            redact_secret_args(&args),
            vec!["login", "--key=<redacted>", "-y"]
        );
    }

    #[test]
    fn redact_secret_args_passes_through_non_key() {
        assert_eq!(redact_secret_args(&["whoami"]), vec!["whoami"]);
        assert_eq!(redact_secret_args(&["logout"]), vec!["logout"]);
    }

    #[test]
    fn complete_login_timeout_message_has_no_secret_argv() {
        let msg = CompleteLoginError::TimedOut.to_string();
        assert!(msg.contains("timed out"), "msg: {msg}");
        assert!(msg.contains("180"), "should name the cap: {msg}");
        // The login argv carries the secret `--key`; it must never reach
        // a message we hand back to the user / logs (HOU-431 / HOU-434).
        assert!(!msg.contains("--key"), "leaked argv: {msg}");
        assert!(!msg.contains("args"), "leaked argv: {msg}");
    }

    #[test]
    fn complete_login_failed_passes_detail_through() {
        let msg = CompleteLoginError::Failed("exit 1: boom".into()).to_string();
        assert_eq!(msg, "exit 1: boom");
    }

    #[test]
    fn cli_timeout_message_has_no_secret_argv() {
        let msg = CliError::TimedOut.to_string();
        assert!(msg.contains("timed out"), "msg: {msg}");
        assert!(!msg.contains("--key"), "leaked argv: {msg}");
    }

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

    #[test]
    fn parses_connected_accounts_items() {
        let body = serde_json::json!({
            "items": [
                { "id": "ca_active", "status": "ACTIVE" },
                { "id": "ca_expired", "status": "EXPIRED" },
                { "id": "  ", "status": "ACTIVE" },
                { "status": "ACTIVE" }
            ],
            "total_pages": 1
        });
        let accounts = parse_connected_accounts(&body).unwrap();
        assert_eq!(accounts.len(), 2);
        assert_eq!(accounts[0].id, "ca_active");
        assert_eq!(accounts[0].status, "ACTIVE");
        assert_eq!(accounts[1].id, "ca_expired");
    }

    #[test]
    fn parse_connected_accounts_defaults_missing_status() {
        let body = serde_json::json!({ "items": [ { "id": "ca_1" } ] });
        let accounts = parse_connected_accounts(&body).unwrap();
        assert_eq!(accounts.len(), 1);
        assert_eq!(accounts[0].status, "");
    }

    #[test]
    fn parse_connected_accounts_rejects_missing_items() {
        let body = serde_json::json!({ "data": [] });
        assert!(parse_connected_accounts(&body).is_err());
    }

    #[test]
    fn parses_redirect_url_when_present() {
        let body = serde_json::json!({
            "id": "ca_1",
            "status": "INITIATED",
            "redirect_url": "https://backend.composio.dev/auth/redirect/abc"
        });
        assert_eq!(
            parse_redirect_url(&body).as_deref(),
            Some("https://backend.composio.dev/auth/redirect/abc")
        );
    }

    #[test]
    fn redirect_url_none_for_silent_refresh() {
        // Non-redirect schemes (e.g. API-key) return null / absent / empty.
        assert!(parse_redirect_url(&serde_json::json!({ "redirect_url": null })).is_none());
        assert!(parse_redirect_url(&serde_json::json!({ "redirect_url": "" })).is_none());
        assert!(parse_redirect_url(&serde_json::json!({ "id": "ca_1" })).is_none());
    }

    #[test]
    fn link_output_parses_json_payload() {
        let json = r#"{"redirect_url":"https://backend.composio.dev/auth/redirect/abc","connected_account_id":"ca_123","toolkit":"gmail"}"#;
        let r = interpret_link_output("gmail", json, "").unwrap();
        assert_eq!(r.redirect_url, "https://backend.composio.dev/auth/redirect/abc");
        assert_eq!(r.connected_account_id, "ca_123");
        assert_eq!(r.toolkit, "gmail");
    }

    #[test]
    fn link_output_accepts_bare_url() {
        // Verbatim stdout from the HOU-433 Sentry crash (toolkit "highlevel").
        let url = "https://dashboard.composio.dev/hola_workspace/~/connect/apps/highlevel?open=true";
        let r = interpret_link_output("highlevel", &format!("{url}\n"), "").unwrap();
        assert_eq!(r.redirect_url, url);
        assert_eq!(r.toolkit, "highlevel");
        assert!(r.connected_account_id.is_empty());
    }

    #[test]
    fn link_output_empty_is_already_connected() {
        for s in ["", "   ", "\n\t"] {
            let err = interpret_link_output("slack", s, "").unwrap_err();
            assert!(err.contains("already connected"), "got: {err}");
            assert!(err.contains("slack"), "got: {err}");
        }
    }

    #[test]
    fn link_output_unrecognized_surfaces_stdout_and_stderr() {
        let err =
            interpret_link_output("github", "totally not json or a url", "boom from cli").unwrap_err();
        assert!(err.contains("totally not json or a url"), "got: {err}");
        assert!(err.contains("boom from cli"), "got: {err}");
        // Must NOT leak a raw serde message ("expected value...") as the error.
        assert!(!err.contains("expected value"), "got: {err}");
    }

    #[test]
    fn bare_url_rejects_prose_with_embedded_url() {
        assert!(bare_url("see https://docs.composio.dev/errors for help").is_none());
        assert!(bare_url("https://dashboard.composio.dev/x?open=true").is_some());
        assert!(bare_url("not-a-url").is_none());
    }
}
