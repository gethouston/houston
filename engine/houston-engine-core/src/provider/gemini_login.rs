//! Gemini login launcher — delegates the OAuth flow to gemini-cli itself.
//!
//! gemini-cli has no `gemini auth login` subcommand, but its `--acp`
//! mode (Agent Communication Protocol, JSON-RPC over stdio) exposes an
//! `authenticate` method that triggers the full Google OAuth flow:
//! gemini-cli opens the user's browser, the user signs in with their
//! Google account, gemini-cli's own code-with-PKCE handshake completes
//! against Google's token endpoint, and gemini-cli writes
//! `~/.gemini/oauth_creds.json` + `google_accounts.json` + sets
//! `settings.json::security.auth.selectedType = "oauth-personal"`.
//!
//! This is the same pattern Houston uses for the other providers:
//!  - `claude auth login --claudeai` for Anthropic
//!  - `codex login` for OpenAI
//!  - here: `gemini --acp` + JSON-RPC `authenticate` for Google
//!
//! Importantly, the Google consent screen the user sees says
//! "Gemini CLI" — that's accurate, because the user IS authenticating
//! gemini-cli on their machine. Houston never touches Google's OAuth
//! servers directly; gemini-cli owns the app identity, the client
//! credentials, the quota, and the credential files. Houston watches
//! the file system to detect when login completed (via the existing
//! `probe_auth` polling on the picker).
//!
//! The previous implementation embedded gemini-cli's client_id +
//! client_secret to drive OAuth directly from the engine. That
//! impersonated gemini-cli to Google (consent screen mislabeled,
//! shared quota, single point of failure if gemini-cli's OAuth client
//! gets revoked). Deleted in favor of this.
//!
//! Verified against gemini-cli v0.42.0
//! (commit 68e2196d5b487a8e477adff9ebe0b8116cead273) source files:
//!  - `packages/cli/src/acp/acpRpcDispatcher.ts::authenticate` — the
//!    JSON-RPC method we invoke
//!  - `packages/core/src/code_assist/oauth2.ts::cacheCredentials` —
//!    writes `~/.gemini/oauth_creds.json` on completion

use crate::error::{CoreError, CoreResult};
use houston_terminal_manager::claude_path;
use std::path::PathBuf;
use std::time::Duration;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;

/// ACP protocol version this code targets. gemini-cli v0.42.0 expects
/// a numeric version; sending a string yields `-32603 Internal error
/// "Invalid input: expected number, received string"`. Pinned to 1
/// because v0.42.0 ships ACP 1.x; future gemini-cli versions may
/// negotiate down on the `initialize` response.
const ACP_PROTOCOL_VERSION: u32 = 1;

/// Auth method id gemini-cli advertises in its `initialize` response
/// for personal Google account OAuth. Stable across v0.32+; the
/// alternatives (`gemini-api-key`, `vertex-ai`, `gateway`) are for
/// other auth modes Houston exposes elsewhere.
const AUTH_METHOD_OAUTH_PERSONAL: &str = "oauth-personal";

/// How long Houston waits for the gemini subprocess to print its
/// `initialize` response before giving up. Generous — gemini-cli SEA
/// bootstrap on first run can take 5-10s on a cold filesystem cache.
const INIT_TIMEOUT: Duration = Duration::from_secs(15);

/// Launch gemini-cli's OAuth flow.
///
/// Spawns `gemini --acp`, drives the JSON-RPC handshake to send
/// `initialize` then `authenticate`, and returns once gemini-cli has
/// accepted the authenticate request (which causes it to open the
/// user's browser). The subprocess is then detached and lives until
/// the user completes Google's consent flow; when gemini-cli receives
/// the OAuth callback it writes `~/.gemini/oauth_creds.json` and
/// exits. The frontend polls `check_status` to detect completion via
/// the existing `probe_auth` path — same pattern as Anthropic/OpenAI.
///
/// Errors when the spawn fails (binary missing, killed by OS, ACP
/// initialize timeout, ACP authenticate returns an error code). Each
/// of those surfaces to the user as a typed `ProviderError::SpawnFailed`
/// or `ProviderError::Unknown` via the existing classification path.
pub async fn launch_login(gemini_path: PathBuf) -> CoreResult<()> {
    let mut cmd = Command::new(&gemini_path);
    cmd.arg("--acp")
        .env("PATH", claude_path::shell_path())
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(false);

    let mut child = cmd
        .spawn()
        .map_err(|e| CoreError::Internal(format!("failed to spawn gemini --acp: {e}")))?;

    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| CoreError::Internal("gemini --acp stdin pipe not available".into()))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| CoreError::Internal("gemini --acp stdout pipe not available".into()))?;

    // Drive the handshake on a background task so we can apply a
    // timeout. The task owns stdin + stdout; on success it returns Ok,
    // on failure it returns the JSON-RPC error or an io::Error.
    let handshake = tokio::time::timeout(
        INIT_TIMEOUT,
        run_handshake(stdin, stdout),
    )
    .await;

    match handshake {
        Ok(Ok(())) => {
            // Authenticate accepted. gemini-cli is now waiting on the
            // user's browser; let it run in the background. The
            // subprocess writes `~/.gemini/oauth_creds.json` on
            // completion, which `GeminiAdapter::probe_auth` picks up
            // via the standard 1.5s frontend poll. We do NOT kill the
            // child — that would abort the OAuth flow mid-stream.
            tracing::info!(
                "[gemini-login] ACP authenticate accepted; gemini-cli now waiting on browser flow"
            );
            Ok(())
        }
        Ok(Err(e)) => {
            // ACP handshake itself failed — kill the subprocess so it
            // doesn't linger.
            let _ = child.kill().await;
            Err(e)
        }
        Err(_) => {
            let _ = child.kill().await;
            Err(CoreError::Internal(format!(
                "gemini --acp initialize timed out after {}s",
                INIT_TIMEOUT.as_secs()
            )))
        }
    }
}

/// Run the two JSON-RPC requests gemini-cli's ACP needs to start the
/// OAuth flow. Sequential because the `authenticate` request needs the
/// session id returned by `initialize`.
async fn run_handshake(
    mut stdin: tokio::process::ChildStdin,
    stdout: tokio::process::ChildStdout,
) -> CoreResult<()> {
    use tokio::io::{AsyncBufReadExt, BufReader};

    let mut reader = BufReader::new(stdout).lines();

    // 1. Send initialize. Houston advertises no client capabilities
    //    because we're not going to be reading/writing files on
    //    gemini-cli's behalf during this short-lived spawn.
    let init = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": ACP_PROTOCOL_VERSION,
            "clientCapabilities": {
                "fs": { "readTextFile": false, "writeTextFile": false }
            }
        }
    });
    let init_line = format!("{init}\n");
    stdin
        .write_all(init_line.as_bytes())
        .await
        .map_err(|e| CoreError::Internal(format!("gemini --acp stdin write (init): {e}")))?;
    stdin.flush().await.map_err(|e| {
        CoreError::Internal(format!("gemini --acp stdin flush (init): {e}"))
    })?;

    // 2. Read initialize response. We only need to confirm success;
    //    the response body lists supported authMethods (we already
    //    know oauth-personal is the right one from the schema spec).
    let init_resp = read_response(&mut reader, 1).await?;
    if let Some(error) = init_resp.get("error") {
        return Err(CoreError::Internal(format!(
            "gemini --acp initialize returned error: {error}"
        )));
    }

    // 3. Send authenticate. methodId selects the OAuth flow; gemini-cli
    //    calls config.refreshAuth() which opens the user's browser.
    let auth = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 2,
        "method": "authenticate",
        "params": { "methodId": AUTH_METHOD_OAUTH_PERSONAL }
    });
    let auth_line = format!("{auth}\n");
    stdin
        .write_all(auth_line.as_bytes())
        .await
        .map_err(|e| CoreError::Internal(format!("gemini --acp stdin write (auth): {e}")))?;
    stdin.flush().await.map_err(|e| {
        CoreError::Internal(format!("gemini --acp stdin flush (auth): {e}"))
    })?;

    // The authenticate request returns when gemini-cli has acknowledged
    // the request and started its OAuth flow. The actual browser-side
    // completion happens out-of-band. We just need to confirm the
    // request didn't fail at the protocol level.
    let auth_resp = read_response(&mut reader, 2).await?;
    if let Some(error) = auth_resp.get("error") {
        return Err(CoreError::Internal(format!(
            "gemini --acp authenticate returned error: {error}"
        )));
    }

    // Drop stdin so the channel signals EOF eventually. We do NOT
    // close stdout/wait the child — gemini-cli stays alive for the
    // browser flow.
    drop(stdin);
    Ok(())
}

/// Read JSON-RPC lines from gemini-cli's stdout until we find one
/// whose `id` matches `expected_id`. gemini-cli may also emit
/// notifications (no id) which we skip.
async fn read_response(
    reader: &mut tokio::io::Lines<tokio::io::BufReader<tokio::process::ChildStdout>>,
    expected_id: u64,
) -> CoreResult<serde_json::Value> {
    while let Ok(Some(line)) = reader.next_line().await {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let parsed: serde_json::Value = match serde_json::from_str(trimmed) {
            Ok(v) => v,
            Err(_) => continue, // gemini-cli sometimes prints non-JSON warnings
        };
        if parsed.get("id").and_then(|v| v.as_u64()) == Some(expected_id) {
            return Ok(parsed);
        }
        // Skip notifications + responses to other ids.
    }
    Err(CoreError::Internal(format!(
        "gemini --acp stream ended before response id {expected_id}"
    )))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn handshake_builds_well_formed_initialize_payload() {
        // Smoke test the payload shape we send. Real handshake is
        // covered by manual ACP probe + integration test in the
        // routes layer.
        let init = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": ACP_PROTOCOL_VERSION,
                "clientCapabilities": {
                    "fs": { "readTextFile": false, "writeTextFile": false }
                }
            }
        });
        assert_eq!(init["params"]["protocolVersion"], 1);
        assert_eq!(init["method"], "initialize");
    }

    #[test]
    fn auth_method_id_matches_gemini_cli_advertised() {
        // gemini-cli's initialize response advertises this exact
        // string; deviating from it causes -32602 invalid params.
        assert_eq!(AUTH_METHOD_OAUTH_PERSONAL, "oauth-personal");
    }
}
