use super::session_io;
use super::types::{FeedItem, SessionStatus};
use crate::codex_command;
use crate::provider::detect_malformed_provider_json;
use crate::provider_error_kind::ProviderError;
use crate::session_update::SessionUpdate;
use crate::Provider;
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
    let cli_name = provider.cli_name();

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
            CliIoReport::Stderr(session_io::read_stderr_lines(stderr, tx2, provider).await)
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
            let is_sigterm = status.code() == Some(143);
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
            // The malformed-JSON outcome is provider-agnostic at the
            // detection level (any provider could in principle emit
            // truncated JSON), but only Anthropic's runner currently
            // knows how to retry. We use the shared detector here and
            // let `claude_runner` gate the retry on its own logic.
            let malformed_provider_json = stdout_report.malformed_provider_json
                || stderr_lines
                    .iter()
                    .any(|line| detect_malformed_provider_json(line));
            if malformed_provider_json {
                tracing::warn!("[houston:session] claude failed with malformed provider JSON");
                CliRunOutcome::ProviderRequestMalformedJson
            } else if status.success() || is_sigterm || likely_user_stop_windows {
                if likely_user_stop_windows {
                    tracing::info!(
                        "[houston:session] {cli_name} exited with code 1 + empty stderr — treating as user-initiated stop"
                    );
                }
                // SIGTERM (143) and the Windows-stop heuristic both
                // indicate user-initiated cancellation. Emit a typed
                // `Cancelled` feed item BEFORE Completed so the chat
                // history carries the structured marker (the dispatcher
                // intentionally renders nothing for `Cancelled`, but
                // analytics / debug surfaces / future "show stopped
                // sessions" filters all key off the typed variant).
                // A clean exit (`status.success()`) is NOT cancellation,
                // so we only emit when one of the stop signals fired.
                if is_sigterm || likely_user_stop_windows {
                    let _ = tx.send(SessionUpdate::Feed(FeedItem::ProviderError(
                        ProviderError::Cancelled {
                            provider: provider.id().to_string(),
                        },
                    )));
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
    // Codex resume-rollout-missing is a control-flow signal (the runner
    // restarts fresh) rather than a user-visible error, so keep it
    // checked here rather than promoting it to a typed feed item. The
    // typed `SessionResumeMissing` variant DOES fire from the
    // line-by-line classifier in `read_stderr_lines`, but that surface
    // is an information panel; the retry routing belongs here.
    if provider.id() == "openai"
        && stderr_lines
            .iter()
            .any(|line| codex_command::is_missing_rollout_error(line))
    {
        tracing::warn!("[houston:session] codex resume failed because rollout was missing");
        return CliRunOutcome::CodexResumeMissing;
    }

    // If a typed classifier matched any stderr line we've already
    // emitted that variant from `read_stderr_lines`. Skip the catch-all
    // emit so the user doesn't see two cards. We don't rely on the
    // already-emitted bookkeeping there because the channel is
    // fire-and-forget; instead we reclassify the lines here. Cheap:
    // classification is substring matching.
    let already_emitted_typed = stderr_lines
        .iter()
        .any(|line| provider.classify_stderr(line).is_some());

    if !already_emitted_typed {
        let stderr_summary = if stderr_lines.is_empty() {
            "no stderr output captured".to_string()
        } else {
            stderr_lines.join("\n")
        };
        // Only emit a fallback typed error if the line wasn't already
        // surfaced as a local-tool runtime error (codex_core router
        // failures), which keep their dedicated card.
        if !stderr_lines
            .iter()
            .any(|line| crate::stderr_filter::is_tool_runtime_stderr(line))
        {
            // Use the spawn-failure classifier as the umbrella for
            // "process exited non-zero with no recognised pattern". It
            // defaults to ProviderError::SpawnFailed; providers can
            // override for spawn-specific patterns. Truncate to keep
            // the wire frame small; full stderr stays in engine logs.
            let err: ProviderError = provider.classify_spawn_failure(None, &stderr_summary);
            let _ = tx.send(SessionUpdate::Feed(FeedItem::ProviderError(err)));
        }
    }

    let _ = tx.send(SessionUpdate::Status(SessionStatus::Error(format!(
        "{cli_name} hit a runtime error"
    ))));
    CliRunOutcome::Failed
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
