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
    /// Claude's first stdout line was a `result/error_during_execution`
    /// with `duration_ms == 0` — the on-disk transcript pointed at by
    /// `--resume <id>` is unrecoverable. The runner uses this outcome to
    /// silently retry the spawn without `--resume`. See
    /// `session_io::StdoutReadReport::saw_resume_corrupted` for the full
    /// rationale.
    ClaudeResumeCorrupted,
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
    working_dir: Option<&std::path::Path>,
) -> CliRunOutcome {
    let cli_name = provider.cli_name();

    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    cmd.stdin(Stdio::piped());
    configure_process_group(cmd);

    // Airlock: when multi-tenant isolation is enabled (`HOUSTON_ISOLATION`),
    // drop the agent CLI into a per-tenant uid + Landlock filesystem jail
    // before exec. `for_agent` returns `None` — spawn exactly as before — on
    // the desktop app, dev checkouts, and non-Linux. A jail that was requested
    // but can't be applied is a hard, visible failure: we never fall back to
    // spawning an un-isolated agent (no-silent-failures policy).
    if let Some(policy) = crate::isolation::IsolationPolicy::for_agent(working_dir) {
        if let Err(e) = crate::isolation::apply_to_command(cmd, &policy) {
            tracing::error!("[houston:session] failed to isolate {cli_name}: {e}");
            let _ = tx.send(SessionUpdate::Feed(FeedItem::ProviderError(
                ProviderError::SpawnFailed {
                    provider: provider.id().to_string(),
                    cli_name: cli_name.to_string(),
                    message: format!("isolation setup failed: {e}"),
                },
            )));
            let _ = tx.send(SessionUpdate::Status(SessionStatus::Error(format!(
                "Failed to isolate {cli_name}: {e}"
            ))));
            return CliRunOutcome::Failed;
        }
    }

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
            // Claude resume-corrupted: must precede `status.success()`
            // and the generic failure path so the runner can retry
            // silently without the user seeing a flicker of "claude hit
            // a runtime error".
            if stdout_report.saw_resume_corrupted {
                tracing::warn!(
                    "[houston:session] claude failed with corrupted-resume signature"
                );
                CliRunOutcome::ClaudeResumeCorrupted
            } else if malformed_provider_json {
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
                handle_failed_exit(tx, cli_name, provider, &stderr_lines, &stdout_report)
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
    stdout_report: &session_io::StdoutReadReport,
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

    // Claude reports 401s as a JSON `result` event on stdout, not stderr.
    // Without checking stdout_report.saw_auth_error here, stderr is empty
    // and we'd fall through to the generic spawn-failure card on top of
    // the AuthRequired UI the parser already emitted.
    let has_auth_error = stdout_report.saw_auth_error
        || stderr_lines
            .iter()
            .any(|l| crate::auth_error::is_auth_error(l));
    if has_auth_error {
        let _ = tx.send(SessionUpdate::Status(SessionStatus::Error(
            "Authentication expired. Sign in again to continue.".to_string(),
        )));
        return CliRunOutcome::Failed;
    }

    // Model-not-allowed (e.g. `gpt-5.5-codex` on a Business ChatGPT
    // plan). The stdout parser may have already emitted a
    // `ProviderError::ModelUnavailable` card via the typed classifier;
    // if it came in only on stderr, `read_stderr_lines` already typed
    // it too. Either way, surface a clean status without duplicating
    // the card.
    if stdout_report.saw_model_unsupported_error {
        let _ = tx.send(SessionUpdate::Status(SessionStatus::Error(
            "Selected model is not available on this ChatGPT plan.".to_string(),
        )));
        return CliRunOutcome::Failed;
    }

    // Generic fallback. Skip emitting the typed card if the stderr
    // classifier already produced one (`read_stderr_lines` walks the
    // same lines, so re-classifying here tells us whether a typed
    // variant was sent), or if the line matched the local-tool runtime
    // filter (codex_core router exec_command failures keep their
    // dedicated card path).
    let already_emitted_typed = stderr_lines
        .iter()
        .any(|line| provider.classify_stderr(line).is_some());
    let is_tool_runtime = stderr_lines
        .iter()
        .any(|line| crate::stderr_filter::is_tool_runtime_stderr(line));
    if !already_emitted_typed && !is_tool_runtime {
        let stderr_summary = if stderr_lines.is_empty() {
            "no stderr output captured".to_string()
        } else {
            stderr_lines.join("\n")
        };
        // Use the spawn-failure classifier as the umbrella for
        // "process exited non-zero with no recognised pattern". It
        // defaults to ProviderError::SpawnFailed; providers can
        // override for spawn-specific patterns. Truncate to keep
        // the wire frame small; full stderr stays in engine logs.
        let err: ProviderError = provider.classify_spawn_failure(None, &stderr_summary);
        let _ = tx.send(SessionUpdate::Feed(FeedItem::ProviderError(err)));
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::SessionStatus;

    fn drain(rx: &mut mpsc::UnboundedReceiver<SessionUpdate>) -> Vec<SessionUpdate> {
        let mut out = Vec::new();
        while let Ok(u) = rx.try_recv() {
            out.push(u);
        }
        out
    }

    #[test]
    fn claude_stdout_auth_error_skips_tool_runtime_error() {
        // Claude 401: empty stderr, stdout reported an auth SystemMessage.
        let (tx, mut rx) = mpsc::unbounded_channel();
        let stdout_report = session_io::StdoutReadReport {
            malformed_provider_json: false,
            saw_auth_error: true,
            saw_model_unsupported_error: false,
            saw_resume_corrupted: false,
        };

        let outcome =
            handle_failed_exit(&tx, "claude", Provider::default(), &[], &stdout_report);
        assert_eq!(outcome, CliRunOutcome::Failed);

        let updates = drain(&mut rx);
        assert!(
            !updates.iter().any(|u| matches!(
                u,
                SessionUpdate::Feed(FeedItem::ToolRuntimeError { .. })
            )),
            "should not emit ToolRuntimeError when auth was seen on stdout: {updates:?}"
        );
        assert!(
            updates.iter().any(|u| matches!(
                u,
                SessionUpdate::Status(SessionStatus::Error(msg))
                    if msg.to_lowercase().contains("authentication expired")
            )),
            "should emit auth-expired status error: {updates:?}"
        );
    }

    #[test]
    fn empty_stderr_without_auth_signal_still_emits_typed_provider_error() {
        // Pre-existing behaviour (preserved across the typed-classifier
        // migration): genuine empty-stderr failures keep a diagnostic so
        // the user always gets feedback. Post-migration the diagnostic
        // is a typed `ProviderError::SpawnFailed` instead of the legacy
        // generic `ToolRuntimeError`, but the "no stderr output captured"
        // detail string is preserved so log readers can still grep for it.
        let (tx, mut rx) = mpsc::unbounded_channel();
        let stdout_report = session_io::StdoutReadReport::default();

        let outcome =
            handle_failed_exit(&tx, "claude", Provider::default(), &[], &stdout_report);
        assert_eq!(outcome, CliRunOutcome::Failed);

        let updates = drain(&mut rx);
        assert!(updates.iter().any(|u| matches!(
            u,
            SessionUpdate::Feed(FeedItem::ProviderError(ProviderError::SpawnFailed { message, .. }))
                if message == "no stderr output captured"
        )));
    }
}
