use super::session_io;
use super::types::{FeedItem, Provider, SessionStatus, ToolRuntimeErrorKind};
use crate::auth_error::is_auth_error;
use crate::codex_command;
use crate::provider_error::is_malformed_provider_json_error;
use crate::session_update::SessionUpdate;
use std::process::Stdio;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tokio::sync::mpsc;
use tokio::task::JoinSet;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum CliRunOutcome {
    Completed,
    Failed,
    CodexResumeMissing,
    ProviderRequestMalformedJson,
}

enum CliIoReport {
    Stderr(Vec<String>),
    Stdout(session_io::StdoutReadReport),
}

/// Shared subprocess lifecycle: spawn, write prompt to stdin, read stdout/stderr, wait.
pub(crate) async fn run_cli_process(
    tx: &mpsc::UnboundedSender<SessionUpdate>,
    cmd: &mut Command,
    prompt: &str,
    provider: Provider,
) -> CliRunOutcome {
    let cli_name = match provider {
        Provider::Anthropic => "claude",
        Provider::OpenAI => "codex",
    };

    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    cmd.stdin(Stdio::piped());
    configure_process_group(cmd);

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            let _ = tx.send(SessionUpdate::Status(SessionStatus::Error(format!(
                "Failed to spawn {cli_name}: {e}"
            ))));
            return CliRunOutcome::Failed;
        }
    };

    if let Some(mut stdin) = child.stdin.take() {
        if let Err(e) = stdin.write_all(prompt.as_bytes()).await {
            let _ = tx.send(SessionUpdate::Status(SessionStatus::Error(format!(
                "Failed to write prompt to stdin: {e}"
            ))));
            return CliRunOutcome::Failed;
        }
        drop(stdin);
    }

    if let Some(pid) = child.id() {
        let _ = tx.send(SessionUpdate::ProcessPid(pid));
    }
    let _ = tx.send(SessionUpdate::Status(SessionStatus::Running));
    tracing::info!("[houston:session] {cli_name} process started, reading output");

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let mut io_set: JoinSet<CliIoReport> = JoinSet::new();

    if let Some(stderr) = stderr {
        let tx2 = tx.clone();
        io_set.spawn(async move {
            CliIoReport::Stderr(session_io::read_stderr_lines(stderr, tx2).await)
        });
    }
    if let Some(stdout) = stdout {
        let tx2 = tx.clone();
        io_set.spawn(async move {
            CliIoReport::Stdout(session_io::read_stdout_events(stdout, tx2, provider).await)
        });
    }

    let mut stderr_lines = Vec::new();
    let mut stdout_report = session_io::StdoutReadReport::default();
    while let Some(result) = io_set.join_next().await {
        match result {
            Ok(CliIoReport::Stderr(lines)) => stderr_lines = lines,
            Ok(CliIoReport::Stdout(report)) => stdout_report = report,
            Err(e) => {
                let msg = format!("I/O reader panicked: {e:?}");
                tracing::info!("[houston:session] {msg}");
                let _ = tx.send(SessionUpdate::Status(SessionStatus::Error(msg)));
                let _ = child.kill().await;
                return CliRunOutcome::Failed;
            }
        }
    }

    tracing::info!("[houston:session] stdout closed, waiting for process exit");
    match child.wait().await {
        Ok(status) => {
            tracing::info!("[houston:session] process exited with {status}");
            // Detect user-initiated Stop. On Unix the CLI dies via SIGTERM
            // from `sessions::cancel` → `kill -TERM -pid`; `ExitStatus::code()`
            // returns `None` for signal-killed processes, so the previous
            // `code() == Some(143)` check was dead code on macOS/Linux (143
            // is the *shell* convention for "128 + signal", not what the
            // syscall layer reports). We check `signal() == Some(SIGTERM)`
            // directly. The CLI's own SIGTERM-trap path (if it installs one
            // and exits 143 voluntarily, like some npm wrappers) is still
            // caught via `code() == Some(143)` as a belt-and-suspenders.
            let is_sigterm = is_user_stop_unix(&status);
            // On Windows, `sessions::cancel` calls `taskkill /F /T /PID` to
            // tear down the codex / claude process tree when the user
            // clicks Stop. TerminateProcess sets the killed process's exit
            // code to 1 by default and produces no stderr — there is no
            // "graceful sigterm" equivalent on Windows. Without this
            // branch the failure path below would emit a `ToolRuntimeError`
            // ("A local tool failed to start.") on every user-initiated
            // Stop, sitting next to the "Stopped by user" system message
            // that `sessions::cancel` emits. Real provider failures
            // essentially always print at least one stderr line (a panic,
            // an HTTP error, a model error), so empty-stderr-with-exit-1
            // on Windows is a reliable user-stop signal.
            let likely_user_stop_windows =
                cfg!(windows) && status.code() == Some(1) && stderr_lines.is_empty();
            let malformed_provider_json = provider == Provider::Anthropic
                && (stdout_report.malformed_provider_json
                    || stderr_lines
                        .iter()
                        .any(|line| is_malformed_provider_json_error(line)));
            if malformed_provider_json {
                tracing::warn!("[houston:session] claude failed with malformed provider JSON");
                CliRunOutcome::ProviderRequestMalformedJson
            } else if status.success() || is_sigterm || likely_user_stop_windows {
                if likely_user_stop_windows {
                    tracing::info!(
                        "[houston:session] {cli_name} exited with code 1 + empty stderr — treating as user-initiated stop"
                    );
                }
                let _ = tx.send(SessionUpdate::Status(SessionStatus::Completed));
                CliRunOutcome::Completed
            } else {
                handle_failed_exit(tx, cli_name, provider, &stderr_lines)
            }
        }
        Err(e) => {
            let _ = tx.send(SessionUpdate::Status(SessionStatus::Error(format!(
                "Failed to wait for {cli_name}: {e}"
            ))));
            CliRunOutcome::Failed
        }
    }
}

fn handle_failed_exit(
    tx: &mpsc::UnboundedSender<SessionUpdate>,
    cli_name: &str,
    provider: Provider,
    stderr_lines: &[String],
) -> CliRunOutcome {
    if provider == Provider::OpenAI
        && stderr_lines
            .iter()
            .any(|line| codex_command::is_missing_rollout_error(line))
    {
        tracing::warn!("[houston:session] codex resume failed because rollout was missing");
        return CliRunOutcome::CodexResumeMissing;
    }

    let has_auth_error = stderr_lines.iter().any(|l| is_auth_error(l));
    if has_auth_error {
        let _ = tx.send(SessionUpdate::Status(SessionStatus::Error(
            "Authentication expired — sign in again to continue".to_string(),
        )));
        return CliRunOutcome::Failed;
    }

    let stderr_summary = if stderr_lines.is_empty() {
        "no stderr output captured".to_string()
    } else {
        stderr_lines.join("\n")
    };
    if !stderr_lines
        .iter()
        .any(|line| crate::stderr_filter::is_tool_runtime_stderr(line))
    {
        let _ = tx.send(SessionUpdate::Feed(FeedItem::ToolRuntimeError {
            kind: ToolRuntimeErrorKind::ProviderProcess,
            details: stderr_summary,
        }));
    }
    let _ = tx.send(SessionUpdate::Status(SessionStatus::Error(format!(
        "{cli_name} hit a runtime error"
    ))));
    CliRunOutcome::Failed
}

/// `true` when the CLI exit looks like a user-initiated Stop on Unix —
/// either killed by SIGTERM (the path `sessions::cancel` takes), or
/// voluntarily exited with code 143 (some CLIs install their own SIGTERM
/// handler and exit via `process::exit(128 + sig)`).
#[cfg(unix)]
fn is_user_stop_unix(status: &std::process::ExitStatus) -> bool {
    use std::os::unix::process::ExitStatusExt;
    status.signal() == Some(libc::SIGTERM) || status.code() == Some(143)
}

#[cfg(not(unix))]
fn is_user_stop_unix(_status: &std::process::ExitStatus) -> bool {
    false
}

#[cfg(unix)]
fn configure_process_group(cmd: &mut Command) {
    unsafe {
        cmd.pre_exec(|| {
            if setpgid(0, 0) == -1 {
                return Err(std::io::Error::last_os_error());
            }
            Ok(())
        });
    }
}

#[cfg(windows)]
fn configure_process_group(_cmd: &mut Command) {}

#[cfg(not(any(unix, windows)))]
fn configure_process_group(_cmd: &mut Command) {}

#[cfg(unix)]
extern "C" {
    fn setpgid(pid: i32, pgid: i32) -> i32;
}

#[cfg(test)]
#[cfg(unix)]
mod tests {
    use super::is_user_stop_unix;
    use std::os::unix::process::ExitStatusExt;
    use std::process::ExitStatus;

    #[test]
    fn sigterm_killed_process_is_user_stop() {
        // Raw status with the low byte = signal number (no WIFEXITED).
        // SIGTERM = 15. This is what `kill -TERM` produces and what
        // `sessions::cancel` triggers — the previous `code() == Some(143)`
        // check missed it entirely.
        let status = ExitStatus::from_raw(libc::SIGTERM);
        assert!(is_user_stop_unix(&status));
    }

    #[test]
    fn voluntary_exit_143_is_user_stop() {
        // Some CLIs install their own SIGTERM trap and exit with
        // `process::exit(128 + sig)`. The low byte being 0 indicates
        // a normal (WIFEXITED) exit; the high byte carries the code.
        // 143 << 8 = 0x8F00.
        let status = ExitStatus::from_raw(143 << 8);
        assert_eq!(status.code(), Some(143));
        assert!(is_user_stop_unix(&status));
    }

    #[test]
    fn clean_zero_exit_is_not_user_stop() {
        let status = ExitStatus::from_raw(0);
        assert!(!is_user_stop_unix(&status));
    }

    #[test]
    fn sigkill_is_not_treated_as_user_stop() {
        // SIGKILL (9) means something else killed the CLI — OOM killer,
        // external `kill -9`. Don't conflate that with a user click.
        let status = ExitStatus::from_raw(libc::SIGKILL);
        assert!(!is_user_stop_unix(&status));
    }

    #[test]
    fn arbitrary_nonzero_exit_is_not_user_stop() {
        // 1 << 8 = exit code 1 (normal failure). Not a Stop.
        let status = ExitStatus::from_raw(1 << 8);
        assert!(!is_user_stop_unix(&status));
    }
}
