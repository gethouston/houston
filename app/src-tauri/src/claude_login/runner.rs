//! The spawn/stream/wait state machine behind one native Claude login.
//!
//! `run_login_child` owns the spawned child: it streams stdout for the authorize
//! URL, drains stderr for a failure tail, and waits for exit under a timeout
//! while polling the cancel flag — emitting exactly one terminal
//! `claude-login://done`. `run_login` is the testable front door (spawns from a
//! path, no `AppHandle`) exercised against a fake `claude` script.

use std::path::Path;
use std::process::ExitStatus;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader, Lines};
use tokio::process::{Child, ChildStdout};

use super::resolve::{build_login_command, extract_visit_url};
use super::{EVENT_DONE, EVENT_URL};

/// Give up on the login if the CLI never returns (user closed the consent tab,
/// bailed on the browser approve, …). Mirrors the loopback's 300s ceiling. The
/// frontend can start a fresh attempt after this.
const LOGIN_TIMEOUT: Duration = Duration::from_secs(300);

/// How often the wait loop wakes to check the cancel flag while the child is
/// still running. Small enough that Cancel feels instant, large enough not to
/// busy-spin during the (potentially long) browser-approve wait.
const CANCEL_POLL: Duration = Duration::from_millis(250);

/// Spawn `claude auth login --claudeai` and drive it to completion, emitting the
/// URL and done events through `emit`. Factored out of the Tauri command (no
/// `AppHandle`) so the spawn/exit/argv/env behavior is unit-testable against a
/// fake `claude` script. The command wraps `run_login_child` directly (it spawns
/// synchronously for an up-front `Err`); this front door mirrors that for tests.
#[cfg_attr(not(test), allow(dead_code))]
pub(super) async fn run_login<E>(bin: &Path, config_dir: &Path, cancel: Arc<AtomicBool>, emit: E)
where
    E: Fn(&str, Value),
{
    let child = match build_login_command(bin, config_dir).spawn() {
        Ok(child) => child,
        Err(e) => {
            emit(
                EVENT_DONE,
                json!({ "success": false, "error": format!("Could not start the Claude sign-in helper: {e}") }),
            );
            return;
        }
    };
    run_login_child(child, cancel, emit).await;
}

/// Which way the wait loop ended.
enum LoginOutcome {
    /// The child exited (or we failed to observe it exiting).
    Exited(std::io::Result<ExitStatus>),
    /// The cancel flag flipped before the child exited.
    Cancelled,
}

/// Own the spawned child: stream its stdout for the authorize URL, drain its
/// stderr for a failure tail, and wait for exit under the login timeout while
/// watching the cancel flag. Emits exactly one terminal `claude-login://done`.
pub(super) async fn run_login_child<E>(mut child: Child, cancel: Arc<AtomicBool>, emit: E)
where
    E: Fn(&str, Value),
{
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    // Drain stderr concurrently so a chatty failure can't fill the pipe and
    // wedge the child before it exits. The tail is only read on a non-zero exit.
    let stderr_task = stderr.map(|s| {
        tokio::spawn(async move {
            let mut buf = String::new();
            let mut reader = BufReader::new(s);
            if let Err(e) = reader.read_to_string(&mut buf).await {
                tracing::warn!("[claude-login] failed to read helper stderr: {e}");
            }
            buf
        })
    });

    let outcome = tokio::time::timeout(
        LOGIN_TIMEOUT,
        drive_login(&mut child, stdout, &cancel, &emit),
    )
    .await;

    match outcome {
        Ok(LoginOutcome::Exited(Ok(status))) if status.success() => {
            tracing::info!("[claude-login] login successful");
            emit(EVENT_DONE, json!({ "success": true, "error": Value::Null }));
        }
        Ok(LoginOutcome::Exited(Ok(status))) => {
            let tail = collect_stderr(stderr_task).await;
            let code = status
                .code()
                .map(|c| c.to_string())
                .unwrap_or_else(|| "signal".to_string());
            let mut error = format!("Claude sign-in failed (exit {code})");
            if !tail.trim().is_empty() {
                error.push_str(": ");
                error.push_str(tail.trim());
            }
            tracing::error!("[claude-login] {error}");
            emit(EVENT_DONE, json!({ "success": false, "error": error }));
        }
        Ok(LoginOutcome::Exited(Err(e))) => {
            let error = format!("Claude sign-in could not be monitored: {e}");
            tracing::error!("[claude-login] {error}");
            emit(EVENT_DONE, json!({ "success": false, "error": error }));
        }
        Ok(LoginOutcome::Cancelled) => {
            // Benign user cancel: kill the child, report a null error so the
            // frontend dismisses silently.
            if let Err(e) = child.kill().await {
                tracing::error!("[claude-login] failed to kill helper after cancel: {e}");
            }
            emit(
                EVENT_DONE,
                json!({ "success": false, "error": Value::Null }),
            );
        }
        Err(_) => {
            if let Err(e) = child.kill().await {
                tracing::error!("[claude-login] failed to kill helper after timeout: {e}");
            }
            tracing::error!(
                "[claude-login] timed out after {}s with no result",
                LOGIN_TIMEOUT.as_secs()
            );
            emit(
                EVENT_DONE,
                json!({ "success": false, "error": "Claude sign-in timed out" }),
            );
        }
    }
}

/// The select loop: emit the authorize URL as soon as the CLI prints it, keep
/// draining stdout (so it can't wedge), poll the cancel flag, and detect exit.
/// On exit we finish draining stdout before returning so a fast-exiting child
/// can't beat the URL emit.
async fn drive_login<E>(
    child: &mut Child,
    stdout: Option<ChildStdout>,
    cancel: &Arc<AtomicBool>,
    emit: &E,
) -> LoginOutcome
where
    E: Fn(&str, Value),
{
    let mut lines = stdout.map(|s| BufReader::new(s).lines());
    let mut reading = lines.is_some();
    let mut url_emitted = false;
    let mut exited: Option<std::io::Result<ExitStatus>> = None;

    loop {
        // Done only once the child has exited AND stdout is fully drained.
        if !reading {
            if let Some(status) = exited.take() {
                return LoginOutcome::Exited(status);
            }
        }

        tokio::select! {
            // Cancel poll — active only while the child is still running.
            _ = tokio::time::sleep(CANCEL_POLL), if exited.is_none() => {
                if cancel.load(Ordering::SeqCst) {
                    return LoginOutcome::Cancelled;
                }
            }
            // Next stdout line — active only while there is a pipe to read.
            next = read_next_line(lines.as_mut()), if reading => {
                match next {
                    Ok(Some(line)) => {
                        if !url_emitted {
                            if let Some(url) = extract_visit_url(&line) {
                                emit(EVENT_URL, json!(url));
                                url_emitted = true;
                            }
                        }
                    }
                    Ok(None) => reading = false,
                    Err(e) => {
                        tracing::warn!("[claude-login] error reading helper stdout: {e}");
                        reading = false;
                    }
                }
            }
            // Child exit — active only until observed once.
            status = child.wait(), if exited.is_none() => {
                exited = Some(status);
            }
        }
    }
}

/// Read the next stdout line, or hang forever when there is no pipe. The `None`
/// arm is never actually polled — the caller gates this future behind
/// `if reading`, which is only true when `lines` is `Some` — but returning a
/// pending future keeps the type uniform without an `unwrap`.
async fn read_next_line(
    lines: Option<&mut Lines<BufReader<ChildStdout>>>,
) -> std::io::Result<Option<String>> {
    match lines {
        Some(l) => l.next_line().await,
        None => std::future::pending().await,
    }
}

/// Await the concurrent stderr reader (if any) for the failure tail.
async fn collect_stderr(task: Option<tokio::task::JoinHandle<String>>) -> String {
    match task {
        Some(handle) => match handle.await {
            Ok(buf) => buf,
            Err(e) => {
                tracing::error!("[claude-login] stderr reader task failed: {e}");
                String::new()
            }
        },
        None => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[cfg(unix)]
    fn write_fake_claude(dir: &Path, name: &str, body: &str) -> PathBuf {
        use std::os::unix::fs::PermissionsExt;
        let path = dir.join(name);
        std::fs::write(&path, body).expect("write fake claude script");
        let mut perms = std::fs::metadata(&path)
            .expect("stat fake claude")
            .permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&path, perms).expect("chmod fake claude");
        path
    }

    #[cfg(unix)]
    fn unique_tmp_dir(tag: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "houston-claude-login-{tag}-{}-{nanos}",
            std::process::id()
        ));
        std::fs::create_dir_all(&dir).expect("mkdir temp");
        dir
    }

    /// Record `(event, payload)` pairs from a `run_login` call.
    #[cfg(unix)]
    fn collect() -> (
        Arc<std::sync::Mutex<Vec<(String, Value)>>>,
        impl Fn(&str, Value),
    ) {
        let events = Arc::new(std::sync::Mutex::new(Vec::<(String, Value)>::new()));
        let sink = events.clone();
        let emit = move |name: &str, payload: Value| {
            sink.lock()
                .expect("events lock")
                .push((name.to_string(), payload));
        };
        (events, emit)
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn run_login_emits_url_then_success_on_exit_zero() {
        let dir = unique_tmp_dir("ok");
        let script = write_fake_claude(
            &dir,
            "claude",
            "#!/bin/sh\n\
             echo \"Opening browser to sign in\"\n\
             echo \"If the browser didn't open, visit: https://claude.ai/oauth/authorize?code=abc123\"\n\
             echo \"Login successful\"\n\
             exit 0\n",
        );
        let config_dir = dir.join("config");

        let (events, emit) = collect();
        run_login(&script, &config_dir, Arc::new(AtomicBool::new(false)), emit).await;

        let got = events.lock().expect("events lock");
        assert_eq!(got.first().expect("url event").0, EVENT_URL);
        assert_eq!(
            got[0].1,
            json!("https://claude.ai/oauth/authorize?code=abc123")
        );
        let done = got.last().expect("done event");
        assert_eq!(done.0, EVENT_DONE);
        assert_eq!(done.1["success"], json!(true));
        assert_eq!(done.1["error"], Value::Null);

        std::fs::remove_dir_all(&dir).expect("cleanup");
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn run_login_reports_failure_on_nonzero_exit() {
        let dir = unique_tmp_dir("fail");
        let script = write_fake_claude(
            &dir,
            "claude",
            "#!/bin/sh\n\
             echo \"authentication was declined\" 1>&2\n\
             exit 1\n",
        );
        let config_dir = dir.join("config");

        let (events, emit) = collect();
        run_login(&script, &config_dir, Arc::new(AtomicBool::new(false)), emit).await;

        let got = events.lock().expect("events lock");
        // No URL was printed, so no url event.
        assert!(got.iter().all(|(name, _)| name != EVENT_URL));
        let done = got.last().expect("done event");
        assert_eq!(done.0, EVENT_DONE);
        assert_eq!(done.1["success"], json!(false));
        // A non-null error carries the reason (incl. the stderr tail).
        let error = done.1["error"].as_str().expect("error string");
        assert!(error.contains("exit 1"), "error was: {error}");
        assert!(
            error.contains("authentication was declined"),
            "error was: {error}"
        );

        std::fs::remove_dir_all(&dir).expect("cleanup");
    }
}
