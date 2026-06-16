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
                "Failed to spawn {cli_name}: {e}{}",
                spawn_error_hint(e.raw_os_error())
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
            let is_stop_signal = exited_by_stop_signal(&status);
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
            } else if status.success() || is_stop_signal || likely_user_stop_windows {
                if likely_user_stop_windows {
                    tracing::info!(
                        "[houston:session] {cli_name} exited with code 1 + empty stderr — treating as user-initiated stop"
                    );
                }
                // Stop signals (SIGTERM/SIGKILL) and the Windows-stop
                // heuristic both indicate user-initiated cancellation.
                // Emit a typed `Cancelled` feed item BEFORE Completed so
                // the chat history carries the structured marker (the
                // dispatcher intentionally renders nothing for
                // `Cancelled`, but analytics / debug surfaces / future
                // "show stopped sessions" filters all key off the typed
                // variant). A clean exit (`status.success()`) is NOT
                // cancellation, so we only emit when a stop signal fired.
                if is_stop_signal || likely_user_stop_windows {
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
    // variant was sent), if the stdout parser already emitted a typed
    // ProviderError (e.g. claude reports a 429 as a `result` event on
    // stdout with empty stderr — without this guard we'd stack a
    // `SpawnFailed` card on top of the real `RateLimited` one), or if the
    // line matched the local-tool runtime filter (codex_core router
    // exec_command failures keep their dedicated card path).
    let already_emitted_typed = stderr_lines
        .iter()
        .any(|line| provider.classify_stderr(line).is_some());
    let is_tool_runtime = stderr_lines
        .iter()
        .any(|line| crate::stderr_filter::is_tool_runtime_stderr(line));
    if !already_emitted_typed && !is_tool_runtime && !stdout_report.saw_provider_error {
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

/// Did the process die from a user-initiated stop? `sessions::cancel`
/// SIGTERMs the provider process group and escalates to SIGKILL when the
/// CLI (or a child) traps/ignores TERM. On Unix a signal death reports
/// `code() == None` with `signal()` set — checking `code() == Some(143)`
/// alone misses every direct signal kill and misfiles it as a runtime
/// error next to the "Stopped by user" message. The 143/137 codes cover
/// CLIs that catch the signal and re-exit with the shell convention.
/// (An OOM-killer SIGKILL is indistinguishable and also lands here —
/// acceptable: rare, and the session status still resolves.)
#[cfg(unix)]
fn exited_by_stop_signal(status: &std::process::ExitStatus) -> bool {
    use std::os::unix::process::ExitStatusExt;
    const SIGKILL: i32 = 9;
    const SIGTERM: i32 = 15;
    matches!(status.signal(), Some(SIGTERM) | Some(SIGKILL))
        || matches!(status.code(), Some(143) | Some(137))
}

#[cfg(not(unix))]
fn exited_by_stop_signal(status: &std::process::ExitStatus) -> bool {
    matches!(status.code(), Some(143) | Some(137))
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

/// Decorate a raw spawn errno with an actionable hint. 206 is Windows'
/// `ERROR_FILENAME_EXCED_RANGE`: `CreateProcessW` rejected the command line
/// for exceeding 32,767 chars before the CLI ever started. The localized OS
/// string ("El nombre del archivo o la extensión es demasiado largo") gives
/// the user no path forward, so spell out what actually happened. 206 is not
/// a spawn errno on Unix, so the match needs no platform gate.
fn spawn_error_hint(raw_os_error: Option<i32>) -> &'static str {
    match raw_os_error {
        Some(206) => {
            " — the command line passed to the provider exceeded Windows' \
             32,767-character limit. This is a Houston bug (the agent's \
             instructions should never ride on the command line); please \
             report it from the menu."
        }
        _ => "",
    }
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

    #[cfg(unix)]
    #[test]
    fn stop_signal_classification_covers_signal_and_code_forms() {
        use std::os::unix::process::ExitStatusExt;
        use std::process::ExitStatus;
        // Raw wait status: low byte = signal, exit code = code << 8.
        assert!(exited_by_stop_signal(&ExitStatus::from_raw(15))); // SIGTERM
        assert!(exited_by_stop_signal(&ExitStatus::from_raw(9))); // SIGKILL
        assert!(exited_by_stop_signal(&ExitStatus::from_raw(143 << 8))); // shell convention
        assert!(exited_by_stop_signal(&ExitStatus::from_raw(137 << 8)));
        assert!(!exited_by_stop_signal(&ExitStatus::from_raw(0))); // clean exit
        assert!(!exited_by_stop_signal(&ExitStatus::from_raw(1 << 8))); // real failure
        assert!(!exited_by_stop_signal(&ExitStatus::from_raw(2))); // SIGINT — not ours
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
            saw_provider_error: false,
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

    #[test]
    fn stdout_provider_error_skips_generic_spawn_failure_card() {
        // The double-card regression: claude reports a 429 as a stdout
        // `result` event (the parser already emitted ProviderError::RateLimited
        // and set saw_provider_error), with empty stderr. handle_failed_exit
        // must NOT pile a second SpawnFailed card on top.
        let (tx, mut rx) = mpsc::unbounded_channel();
        let stdout_report = session_io::StdoutReadReport {
            saw_provider_error: true,
            ..session_io::StdoutReadReport::default()
        };

        let outcome =
            handle_failed_exit(&tx, "claude", Provider::default(), &[], &stdout_report);
        assert_eq!(outcome, CliRunOutcome::Failed);

        let updates = drain(&mut rx);
        assert!(
            !updates.iter().any(|u| matches!(
                u,
                SessionUpdate::Feed(FeedItem::ProviderError(_))
            )),
            "must not emit a second ProviderError card when the parser already did: {updates:?}"
        );
        // Status error still flips so the session resolves.
        assert!(updates.iter().any(|u| matches!(
            u,
            SessionUpdate::Status(SessionStatus::Error(_))
        )));
    }

    #[test]
    fn spawn_error_hint_explains_windows_cmdline_overflow() {
        assert!(spawn_error_hint(Some(206)).contains("32,767"));
        assert_eq!(spawn_error_hint(Some(2)), "");
        assert_eq!(spawn_error_hint(None), "");
    }
}
