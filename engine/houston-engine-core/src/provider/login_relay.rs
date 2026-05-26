//! OAuth URL-relay for provider sign-in subprocesses.
//!
//! When [`crate::provider::launch_login`] runs in a remote/headless
//! deployment (Docker container, Always-On VPS, future Cloud), the
//! provider CLI (`claude auth login`, `codex login`) can't open the
//! user's browser — the browser lives on a different machine. The
//! CLI prints a sign-in URL to stdout; this module surfaces it to the
//! frontend (via [`HoustonEvent::ProviderLoginUrl`]). Completion takes
//! one of two shapes:
//!
//!  * **Paste-back** (`claude auth login`): the CLI waits for the user
//!    to paste a verification code on stdin. We write the code the user
//!    submitted back via [`submit_login_code`].
//!  * **Device-grant** (`codex login --device-auth`): the CLI also
//!    prints a one-time code; the user enters THAT code on the
//!    provider's page and the CLI polls + completes itself. We scan
//!    stdout for the code and re-emit `ProviderLoginUrl` carrying it
//!    (no stdin write — there's nothing to paste back).
//!
//! When the CLI finally exits — cleanly after auth, or with an error —
//! the relay task emits [`HoustonEvent::ProviderLoginComplete`] so the
//! frontend can close the sign-in dialog and refresh `providerStatus`.
//!
//! Same machinery handles desktop too: claude prints the URL
//! unconditionally, but completes via its own local callback before
//! the user needs to interact with the Houston dialog. The dialog
//! pops, then auto-dismisses on `ProviderLoginComplete`.

use crate::error::{CoreError, CoreResult};
use houston_terminal_manager::Provider;
use houston_ui_events::{DynEventSink, HoustonEvent};
use once_cell::sync::Lazy;
use regex::Regex;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout};
use tokio::sync::{Mutex, Notify};

/// Hard ceiling on a single OAuth login subprocess lifetime. If the
/// CLI hasn't exited by then (e.g. user abandoned the browser flow
/// or claude got stuck) the relay task force-emits a
/// `ProviderLoginComplete` with a timeout error and the session is
/// removed so the next Connect click can spawn a fresh subprocess.
const LOGIN_SESSION_TIMEOUT: Duration = Duration::from_secs(600);

/// In-flight OAuth login sessions, keyed by provider id (e.g.
/// `"anthropic"`, `"openai"`). Single-entry-per-provider by design:
/// [`insert_session`] rejects a second concurrent attempt with
/// `BadRequest` so a fast double-click can't orphan a subprocess.
/// Removed by [`relay_login_output`] when the child exits, or eagerly
/// by [`cancel_login`] so an abandoned sign-in can be retried at once.
///
/// `stdin` is wrapped in its own `Arc<Mutex<_>>` so
/// [`submit_login_code`] can clone the handle out of this map under
/// a brief outer-lock acquisition, then await the `write_all` against
/// the inner lock — never holding the outer mutex across an `.await`
/// (which would jam the whole map under any slow write).
static LOGIN_SESSIONS: Lazy<Mutex<HashMap<String, LoginSession>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

/// Monotonic session token source. Each [`insert_session`] mints a
/// fresh token so the relay task can prove ownership of the map entry
/// before removing it — otherwise a [`cancel_login`] followed by an
/// immediate re-`Connect` (new session, same provider id) could be
/// evicted by the *previous* relay's end-of-life cleanup.
static SESSION_SEQ: AtomicU64 = AtomicU64::new(0);

struct LoginSession {
    stdin: Arc<Mutex<ChildStdin>>,
    /// Fired by [`cancel_login`] to abort an in-flight browser sign-in.
    /// The relay task holds its own `Arc` clone and selects on it.
    cancel: Arc<Notify>,
    /// Identifies which relay owns this map entry (see [`SESSION_SEQ`]).
    token: u64,
}

/// Handed back by [`insert_session`] to the spawn site so the relay
/// task gets the same cancel handle + token stored in the map.
#[derive(Debug)]
pub(super) struct RelayRegistration {
    cancel: Arc<Notify>,
    token: u64,
}

/// How a relay's lifetime ended, distinguishing a user-initiated
/// [`cancel_login`] (benign — no error toast) from the CLI exiting on
/// its own (success or real failure).
enum RelayOutcome {
    Exited(std::io::Result<std::process::ExitStatus>),
    Cancelled,
}

/// Regex over a single line of CLI stdout, looking for an HTTPS URL
/// the user should open in their browser. Claude (`claude auth
/// login`), codex (`codex login`), and other OAuth device-flow CLIs
/// all print at least one — we capture the first one on the first
/// matching line. The trailing-punctuation guard in
/// [`extract_login_url`] strips characters that are legal inside a
/// URL but almost always sentence terminators in CLI output.
static LOGIN_URL_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(https://[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+)")
        .expect("login url regex must compile")
});

/// Extract an OAuth URL from a CLI stdout line, with trailing-
/// punctuation cleanup. The regex character class is permissive on
/// purpose (URLs legitimately contain `.` `,` `;`), so we trim
/// terminators after the match — a sentence-ending period from
/// `"visit https://example.com/auth?x=1."` would otherwise become
/// part of the URL and break the OAuth state round-trip.
fn extract_login_url(line: &str) -> Option<String> {
    let cap = LOGIN_URL_RE.captures(line)?;
    let raw = cap.get(1)?.as_str();
    let trimmed = raw.trim_end_matches(|c: char| ".,;:)]}>'\"".contains(c));
    Some(trimmed.to_string())
}

/// Regex over a single line of CLI stdout, looking for the one-time
/// device-authorization code codex prints under `--device-auth` (e.g.
/// the `ABCD-EFGHI` on its own line beneath "Enter this one-time
/// code"). The code is one or more hyphen-separated groups of uppercase
/// letters/digits — distinctive enough that it won't collide with
/// codex's prose lines or the verification URL (neither contains an
/// uppercase hyphenated token).
static DEVICE_CODE_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"\b[A-Z0-9]{3,}(?:-[A-Z0-9]{3,})+\b").expect("device code regex must compile")
});

/// Extract codex's one-time device code from a stdout line. Only
/// consulted in device-auth mode (see [`relay_login_output`]), so the
/// standard paste-back flow (Claude) never runs it and can't be tripped
/// by a stray uppercase token in claude's output.
fn extract_device_user_code(line: &str) -> Option<String> {
    DEVICE_CODE_RE.find(line).map(|m| m.as_str().to_string())
}

/// Register a new login session, taking ownership of the CLI's
/// stdin handle. Returns `BadRequest` if a session is already in
/// flight for the same provider — the caller should kill its own
/// child and surface the conflict so the user can wait or restart.
pub(super) async fn insert_session(
    provider_id: &str,
    cli_name: &str,
    stdin: ChildStdin,
) -> CoreResult<RelayRegistration> {
    let mut sessions = LOGIN_SESSIONS.lock().await;
    if sessions.contains_key(provider_id) {
        return Err(CoreError::BadRequest(format!(
            "{cli_name} sign-in is already pending. Finish the open sign-in or cancel it to retry.",
        )));
    }
    let cancel = Arc::new(Notify::new());
    let token = SESSION_SEQ.fetch_add(1, Ordering::Relaxed);
    sessions.insert(
        provider_id.to_string(),
        LoginSession {
            stdin: Arc::new(Mutex::new(stdin)),
            cancel: Arc::clone(&cancel),
            token,
        },
    );
    Ok(RelayRegistration { cancel, token })
}

/// Cancel an in-flight OAuth login. Removes the map entry **eagerly**
/// (under the lock) so a follow-up `Connect` click isn't rejected by
/// [`insert_session`]'s already-pending guard, then signals the relay
/// task — which holds its own `Arc<Notify>` clone — to kill the
/// subprocess and emit a benign [`HoustonEvent::ProviderLoginComplete`]
/// (`success: false`, `error: None`). Idempotent: cancelling when no
/// session is pending is a no-op success, because the goal state — no
/// pending sign-in — already holds (e.g. the flow completed between the
/// user opening the browser and giving up).
pub async fn cancel_login(provider: Provider) -> CoreResult<()> {
    cancel_login_inner(provider.id(), provider.cli_name()).await
}

/// Id-based core of [`cancel_login`], split out so unit tests can drive
/// it with a synthetic provider id that won't collide with the real
/// providers other tests touch on the shared [`LOGIN_SESSIONS`] map.
async fn cancel_login_inner(provider_id: &str, cli_name: &str) -> CoreResult<()> {
    let session = {
        let mut sessions = LOGIN_SESSIONS.lock().await;
        sessions.remove(provider_id)
    };
    match session {
        Some(session) => {
            session.cancel.notify_one();
            tracing::info!("[houston:provider] {cli_name} login cancel requested");
        }
        None => {
            tracing::debug!("[houston:provider] cancel_login: no pending {cli_name} session");
        }
    }
    Ok(())
}

/// Spawn the background task that drives a single login session:
/// stream stdout looking for the OAuth URL (and, in device-auth mode,
/// the one-time code), drain stderr into a buffer for the failure path,
/// and wait for the child to exit (with a hard timeout). Emits
/// `ProviderLoginUrl` (once, or twice for a device-grant code) and
/// `ProviderLoginComplete` exactly once.
///
/// `device_auth` mirrors the flag the caller passed to
/// [`crate::provider::launch_login`]: when set, the relay also scans for
/// codex's device code and re-emits `ProviderLoginUrl` carrying it.
pub(super) fn spawn_relay(
    provider_id: String,
    cli_name: String,
    child: Child,
    stdout: ChildStdout,
    stderr: Option<tokio::process::ChildStderr>,
    sink: DynEventSink,
    registration: RelayRegistration,
    device_auth: bool,
) {
    tokio::spawn(async move {
        relay_login_output(
            provider_id,
            cli_name,
            child,
            stdout,
            stderr,
            sink,
            registration,
            device_auth,
        )
        .await;
    });
}

async fn relay_login_output(
    provider_id: String,
    cli_name: String,
    mut child: Child,
    stdout: ChildStdout,
    stderr: Option<tokio::process::ChildStderr>,
    sink: DynEventSink,
    registration: RelayRegistration,
    device_auth: bool,
) {
    let RelayRegistration { cancel, token } = registration;
    // Drain stderr in a sibling task so a verbose CLI can't fill the
    // 64KB stderr pipe buffer and deadlock the child on write.
    // Captured stderr is appended to the `ProviderLoginComplete`
    // error message on failure — without this drain a non-zero exit
    // surfaces only "claude exited with status: 1" instead of the
    // actionable reason (no-silent-failures policy).
    let stderr_handle = stderr.map(|mut s| {
        tokio::spawn(async move {
            let mut buf = String::new();
            let _ = s.read_to_string(&mut buf).await;
            buf
        })
    });

    let mut url_emitted = false;
    // Buffered first URL + whether we've emitted the device code yet.
    // codex's `--device-auth` prints the verification URL first, then the
    // one-time code a few lines later; we hold the URL so the code-bearing
    // re-emit can carry both.
    let mut login_url: Option<String> = None;
    let mut code_emitted = false;
    let mut reader = BufReader::new(stdout).lines();

    // Outer timeout protects against a CLI that keeps stdout open
    // and never exits (user abandoned the browser flow, claude
    // wedged on a network call, …). When the timeout fires we kill
    // the child so its `wait()` resolves quickly below. A user
    // [`cancel_login`] takes the fast path through the `cancel` arm.
    let work = async {
        loop {
            tokio::select! {
                _ = cancel.notified() => {
                    tracing::info!(
                        "[houston:provider] {cli_name} login cancelled — killing subprocess"
                    );
                    let _ = child.kill().await;
                    // Reap so the OS doesn't keep a zombie around.
                    let _ = child.wait().await;
                    return RelayOutcome::Cancelled;
                }
                line = reader.next_line() => {
                    match line {
                        Ok(Some(line)) => {
                            if !url_emitted {
                                if let Some(url) = extract_login_url(&line) {
                                    tracing::info!(
                                        "[houston:provider] {cli_name} login URL surfaced: {url}"
                                    );
                                    sink.emit(HoustonEvent::ProviderLoginUrl {
                                        provider: provider_id.clone(),
                                        url: url.clone(),
                                        user_code: None,
                                    });
                                    login_url = Some(url);
                                    url_emitted = true;
                                }
                            }
                            // Device-auth (codex `--device-auth`) prints a
                            // one-time code on a later line. Re-emit
                            // ProviderLoginUrl carrying both the buffered URL
                            // and the code so the dialog switches from "open
                            // the link" to "enter this code on the page". The
                            // code value is never logged. Claude's paste-back
                            // flow has device_auth = false and never reaches
                            // here.
                            if device_auth && !code_emitted {
                                if let (Some(url), Some(code)) =
                                    (login_url.as_ref(), extract_device_user_code(&line))
                                {
                                    tracing::info!(
                                        "[houston:provider] {cli_name} device login code surfaced"
                                    );
                                    sink.emit(HoustonEvent::ProviderLoginUrl {
                                        provider: provider_id.clone(),
                                        url: url.clone(),
                                        user_code: Some(code),
                                    });
                                    code_emitted = true;
                                }
                            }
                        }
                        Ok(None) => break, // stdout EOF — fall through to child.wait
                        Err(e) => {
                            tracing::warn!(
                                "[houston:provider] {cli_name} login stdout read error: {e}"
                            );
                            break;
                        }
                    }
                }
                exit = child.wait() => {
                    return RelayOutcome::Exited(exit);
                }
            }
        }
        // Stdout EOF without seeing the child exit — wait for it
        // explicitly so we still observe the exit status.
        RelayOutcome::Exited(child.wait().await)
    };

    let (success, error) = match tokio::time::timeout(LOGIN_SESSION_TIMEOUT, work).await {
        Ok(RelayOutcome::Exited(Ok(status))) => {
            tracing::info!("[houston:provider] {cli_name} login exited: {status}");
            let stderr_text = drain_stderr(stderr_handle).await;
            (
                status.success(),
                if status.success() {
                    None
                } else {
                    Some(format_exit_error(&cli_name, &format!("{status}"), &stderr_text))
                },
            )
        }
        Ok(RelayOutcome::Exited(Err(e))) => {
            tracing::warn!("[houston:provider] {cli_name} login wait failed: {e}");
            let stderr_text = drain_stderr(stderr_handle).await;
            (
                false,
                Some(format_exit_error(&cli_name, &format!("wait failed: {e}"), &stderr_text)),
            )
        }
        Ok(RelayOutcome::Cancelled) => {
            // User abandoned the sign-in. Drain stderr so the sibling
            // task joins, but DON'T surface it — a deliberate cancel
            // isn't an error, so `error: None` keeps the frontend from
            // toasting. The spinner just clears and the card re-arms.
            drain_stderr(stderr_handle).await;
            (false, None)
        }
        Err(_) => {
            tracing::warn!(
                "[houston:provider] {cli_name} login timed out after {}s — killing subprocess",
                LOGIN_SESSION_TIMEOUT.as_secs()
            );
            let _ = child.kill().await;
            let stderr_text = drain_stderr(stderr_handle).await;
            (
                false,
                Some(format_exit_error(
                    &cli_name,
                    &format!("timed out after {}s", LOGIN_SESSION_TIMEOUT.as_secs()),
                    &stderr_text,
                )),
            )
        }
    };

    // Remove the map entry only if it's still *ours*. A `cancel_login`
    // already removed it eagerly, and a fresh `Connect` may have
    // inserted a brand-new session under the same provider id — token
    // equality stops us from evicting that newcomer.
    {
        let mut sessions = LOGIN_SESSIONS.lock().await;
        if sessions.get(&provider_id).map(|s| s.token) == Some(token) {
            sessions.remove(&provider_id);
        }
    }
    sink.emit(HoustonEvent::ProviderLoginComplete {
        provider: provider_id,
        success,
        error,
    });
}

async fn drain_stderr(handle: Option<tokio::task::JoinHandle<String>>) -> String {
    match handle {
        Some(h) => h.await.unwrap_or_default(),
        None => String::new(),
    }
}

fn format_exit_error(cli_name: &str, status: &str, stderr: &str) -> String {
    let stderr = stderr.trim();
    if stderr.is_empty() {
        format!("{cli_name} {status}")
    } else {
        format!("{cli_name} {status}: {stderr}")
    }
}

/// Submit the OAuth verification code the user pasted from their
/// browser. Locks the global session map only long enough to clone
/// the per-session stdin handle, then writes against the inner lock
/// so a slow CLI can't block other provider operations.
///
/// Does NOT remove the session on success — the relay task does
/// that when the child actually exits, which is how the
/// `ProviderLoginComplete` event lands on the WS.
pub async fn submit_login_code(provider: Provider, code: &str) -> CoreResult<()> {
    // Brief outer-lock acquisition — no .await between get and clone.
    let stdin = {
        let sessions = LOGIN_SESSIONS.lock().await;
        let session = sessions.get(provider.id()).ok_or_else(|| {
            CoreError::BadRequest(format!(
                "no pending sign-in for {}. Click Connect first.",
                provider.cli_name()
            ))
        })?;
        Arc::clone(&session.stdin)
    };

    let mut stdin = stdin.lock().await;
    let line = format!("{}\n", code.trim());
    stdin
        .write_all(line.as_bytes())
        .await
        .map_err(|e| CoreError::Internal(format!("write code to stdin: {e}")))?;
    stdin
        .flush()
        .await
        .map_err(|e| CoreError::Internal(format!("flush stdin: {e}")))?;
    tracing::info!(
        "[houston:provider] {} login code submitted",
        provider.cli_name()
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::provider::parse;

    #[test]
    fn extract_url_from_claude_oauth_line() {
        let line = "If the browser didn't open, visit: \
                    https://claude.com/cai/oauth/authorize?code=true&client_id=abc&state=xyz";
        assert_eq!(
            extract_login_url(line).unwrap(),
            "https://claude.com/cai/oauth/authorize?code=true&client_id=abc&state=xyz"
        );
    }

    #[test]
    fn extract_url_returns_none_for_prose_lines() {
        assert!(extract_login_url("Opening browser to sign in…").is_none());
        assert!(extract_login_url("Paste code here if prompted >").is_none());
    }

    #[test]
    fn extract_url_stops_at_whitespace() {
        let line = "visit: https://example.com/oauth?x=1 and then come back";
        assert_eq!(extract_login_url(line).unwrap(), "https://example.com/oauth?x=1");
    }

    #[test]
    fn extract_url_trims_sentence_punctuation() {
        // Claude has shipped lines like "Visit https://example.com/auth." with
        // a sentence-ending period in the past. The character class includes
        // `.` (legal in URLs) so we'd otherwise capture the period and break
        // OAuth state validation.
        assert_eq!(
            extract_login_url("Visit https://example.com/auth.").unwrap(),
            "https://example.com/auth"
        );
        assert_eq!(
            extract_login_url("See (https://example.com/auth) for details").unwrap(),
            "https://example.com/auth"
        );
        assert_eq!(
            extract_login_url("URL: https://example.com/auth, then paste code").unwrap(),
            "https://example.com/auth"
        );
    }

    #[test]
    fn extract_device_code_from_codex_device_auth_output() {
        // Verbatim shape of `codex login --device-auth` stdout — the URL
        // and the one-time code land on separate, indented lines.
        assert!(extract_device_user_code(
            "1. Open this link in your browser and sign in to your account"
        )
        .is_none());
        // The verification URL line must not be misread as a code (it has
        // no uppercase hyphenated token).
        assert!(extract_device_user_code("   https://auth.openai.com/codex/device").is_none());
        // The cue line carries no code.
        assert!(
            extract_device_user_code("2. Enter this one-time code (expires in 15 minutes)")
                .is_none()
        );
        // The code line yields the code.
        assert_eq!(extract_device_user_code("   ABCD-EFGHI").unwrap(), "ABCD-EFGHI");
    }

    #[test]
    fn extract_device_code_ignores_prose_and_lowercase() {
        // The pattern needs at least one hyphen-joined uppercase/digit
        // group, so prose never matches — including "ChatGPT", whose "GPT"
        // run has no following `-XXX` group.
        assert!(extract_device_user_code("Follow these steps to sign in with ChatGPT").is_none());
        assert!(extract_device_user_code("using device code authorization:").is_none());
        assert!(extract_device_user_code("HELLO").is_none()); // single group, no hyphen
        assert!(extract_device_user_code("abcd-efghi").is_none()); // lowercase
        // Some device codes chunk into three groups — still one token.
        assert_eq!(
            extract_device_user_code("code: WDJB-MJHT-1234 now").unwrap(),
            "WDJB-MJHT-1234"
        );
    }

    #[tokio::test]
    async fn submit_login_code_errors_without_pending_session() {
        let provider = parse("anthropic").unwrap();
        let err = submit_login_code(provider, "abc123").await.unwrap_err();
        assert!(format!("{err:?}").contains("no pending sign-in"));
    }

    #[tokio::test]
    async fn insert_session_rejects_duplicate() {
        // Spawn a long-running subprocess to grab a real ChildStdin —
        // `sleep` blocks until killed, so its stdin handle stays alive
        // long enough for both insert attempts.
        async fn make_stdin() -> ChildStdin {
            let mut cmd = tokio::process::Command::new("sleep");
            cmd.arg("60")
                .stdin(std::process::Stdio::piped())
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .kill_on_drop(true);
            let mut child = cmd.spawn().expect("spawn sleep");
            child.stdin.take().expect("stdin piped")
        }
        // Use a unique provider id so this test doesn't collide with
        // other tests touching LOGIN_SESSIONS in the same process.
        let provider_id = "test-duplicate-reject";
        let cli_name = "test-cli";
        insert_session(provider_id, cli_name, make_stdin().await)
            .await
            .expect("first insert succeeds");
        let err = insert_session(provider_id, cli_name, make_stdin().await)
            .await
            .unwrap_err();
        assert!(
            format!("{err:?}").contains("already pending"),
            "unexpected error shape: {err:?}"
        );
        // Cleanup so subsequent tests in this process see an empty map.
        LOGIN_SESSIONS.lock().await.remove(provider_id);
    }

    /// Spawn a long-lived child with piped stdio so the relay has a
    /// real subprocess to kill. `sleep 60` never writes stdout, so the
    /// relay only ever emits on cancel/exit — no spurious URL event.
    async fn spawn_idle_child() -> Child {
        let mut cmd = tokio::process::Command::new("sleep");
        cmd.arg("60")
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true);
        cmd.spawn().expect("spawn sleep")
    }

    #[tokio::test]
    async fn cancel_login_kills_session_and_emits_benign_completion() {
        use houston_ui_events::BroadcastEventSink;

        let provider_id = "test-cancel-provider";
        let cli_name = "test-cli";

        let mut child = spawn_idle_child().await;
        let stdin = child.stdin.take().expect("stdin piped");
        let stdout = child.stdout.take().expect("stdout piped");
        let stderr = child.stderr.take();

        let sink = Arc::new(BroadcastEventSink::new(16));
        let mut rx = sink.subscribe();

        let registration = insert_session(provider_id, cli_name, stdin)
            .await
            .expect("first insert succeeds");
        spawn_relay(
            provider_id.to_string(),
            cli_name.to_string(),
            child,
            stdout,
            stderr,
            sink.clone(),
            registration,
            false,
        );

        assert!(
            LOGIN_SESSIONS.lock().await.contains_key(provider_id),
            "session should be pending right after spawn"
        );

        cancel_login_inner(provider_id, cli_name)
            .await
            .expect("cancel succeeds");

        let ev = tokio::time::timeout(Duration::from_secs(5), rx.recv())
            .await
            .expect("relay emits within 5s")
            .expect("event received");
        match ev {
            HoustonEvent::ProviderLoginComplete {
                provider,
                success,
                error,
            } => {
                assert_eq!(provider, provider_id);
                assert!(!success, "a cancelled sign-in did not complete");
                assert_eq!(error, None, "a user cancel must not surface an error toast");
            }
            other => panic!("expected ProviderLoginComplete, got {other:?}"),
        }

        // Cancel removed the entry eagerly; the relay's token-guarded
        // cleanup is a no-op. Either way the slot is free so a fresh
        // Connect can spawn immediately instead of hitting "already
        // pending" (#237).
        assert!(
            !LOGIN_SESSIONS.lock().await.contains_key(provider_id),
            "session should be cleared after cancel"
        );
    }

    #[tokio::test]
    async fn cancel_login_without_session_is_idempotent() {
        cancel_login_inner("test-cancel-absent", "test-cli")
            .await
            .expect("cancelling a non-existent session is a no-op success");
    }

    #[tokio::test]
    async fn device_auth_relay_emits_url_then_code() {
        use houston_ui_events::BroadcastEventSink;

        // Stand-in for `codex login --device-auth`: `printf` emits the
        // verbatim multi-line output (prose, the verification URL, then the
        // one-time code on its own line) and exits. The relay should surface
        // the URL the moment it streams, then re-emit with the code.
        let mut cmd = tokio::process::Command::new("printf");
        cmd.arg("%s\\n")
            .arg("Follow these steps to sign in with ChatGPT using device code authorization:")
            .arg("1. Open this link in your browser and sign in to your account")
            .arg("   https://auth.openai.com/codex/device")
            .arg("2. Enter this one-time code (expires in 15 minutes)")
            .arg("   ABCD-EFGHI")
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true);
        let mut child = cmd.spawn().expect("spawn printf");
        let stdin = child.stdin.take().expect("stdin piped");
        let stdout = child.stdout.take().expect("stdout piped");
        let stderr = child.stderr.take();

        let provider_id = "test-device-auth-provider";
        let cli_name = "test-cli";
        let sink = Arc::new(BroadcastEventSink::new(16));
        let mut rx = sink.subscribe();

        let registration = insert_session(provider_id, cli_name, stdin)
            .await
            .expect("insert succeeds");
        spawn_relay(
            provider_id.to_string(),
            cli_name.to_string(),
            child,
            stdout,
            stderr,
            sink.clone(),
            registration,
            true, // device_auth
        );

        // First emit: URL only, the instant the URL line streams in.
        let ev1 = tokio::time::timeout(Duration::from_secs(5), rx.recv())
            .await
            .expect("relay emits a URL within 5s")
            .expect("event received");
        match ev1 {
            HoustonEvent::ProviderLoginUrl {
                provider,
                url,
                user_code,
            } => {
                assert_eq!(provider, provider_id);
                assert_eq!(url, "https://auth.openai.com/codex/device");
                assert_eq!(user_code, None, "first emit carries no code yet");
            }
            other => panic!("expected ProviderLoginUrl, got {other:?}"),
        }

        // Second emit: same URL, now carrying the one-time device code.
        let ev2 = tokio::time::timeout(Duration::from_secs(5), rx.recv())
            .await
            .expect("relay emits the code within 5s")
            .expect("event received");
        match ev2 {
            HoustonEvent::ProviderLoginUrl {
                provider,
                url,
                user_code,
            } => {
                assert_eq!(provider, provider_id);
                assert_eq!(url, "https://auth.openai.com/codex/device");
                assert_eq!(user_code.as_deref(), Some("ABCD-EFGHI"));
            }
            other => panic!("expected ProviderLoginUrl with code, got {other:?}"),
        }

        // The relay removes the session on child exit (token-guarded); clear
        // it explicitly too so a slow exit can't leak into sibling tests that
        // share the global LOGIN_SESSIONS map.
        LOGIN_SESSIONS.lock().await.remove(provider_id);
    }
}
