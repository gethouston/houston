use super::types::SessionStatus;
use crate::claude_install_path;
use crate::cli_process::{run_cli_process, CliRunOutcome};
use crate::provider_error::MALFORMED_PROVIDER_JSON_MESSAGE;
use crate::session_update::SessionUpdate;
use crate::Provider;
use std::ffi::OsString;
use tokio::process::Command;
use tokio::sync::mpsc;

/// Absolute path to the Houston-managed `claude` if the runtime installer
/// dropped it (`~/.local/bin/claude` on Unix,
/// `%LOCALAPPDATA%\Programs\claude\claude.exe` on Windows). Falls back to
/// the bare name `"claude"` (PATH lookup) only when the installer hasn't
/// run yet, e.g. dev checkouts without `cli-deps.json`.
///
/// Spawning the absolute path matters: we pin a specific claude-code
/// version in `cli-deps.json` and pass flags
/// (`--include-partial-messages`, `--dangerously-skip-permissions`, ...)
/// that only newer versions support. PATH lookup can hit an older
/// `claude` from npm-global, homebrew, or a prior install, which then
/// rejects the flag with `error: unknown option '--include-partial-messages'`
/// and the session dies before producing any output.
fn claude_command_name() -> OsString {
    if claude_install_path::is_installed() {
        claude_install_path::cli_path().into_os_string()
    } else {
        OsString::from("claude")
    }
}

/// Spawn a Claude CLI session (`claude -p --output-format stream-json`).
#[allow(clippy::too_many_arguments)]
pub(crate) async fn spawn_claude(
    tx: &mpsc::UnboundedSender<SessionUpdate>,
    provider: Provider,
    prompt: String,
    resume_session_id: Option<String>,
    working_dir: Option<std::path::PathBuf>,
    model: Option<String>,
    effort: Option<String>,
    system_prompt: Option<String>,
    mcp_config: Option<std::path::PathBuf>,
    disable_builtin_tools: bool,
    disable_all_tools: bool,
) {
    tracing::info!(
        "[houston:session] spawning claude -p (resume={:?}, model={:?}, effort={:?})",
        resume_session_id,
        model,
        effort,
    );

    if let Some(ref dir) = working_dir {
        if !dir.is_dir() {
            let _ = tx.send(SessionUpdate::Status(SessionStatus::Error(format!(
                "Working directory not found: {}. Was it deleted?",
                dir.display()
            ))));
            return;
        }
    }

    let mut cmd = Command::new(claude_command_name());
    configure_claude_command(
        &mut cmd,
        resume_session_id.as_deref(),
        working_dir.as_deref(),
        model.as_deref(),
        effort.as_deref(),
        system_prompt.as_deref(),
        mcp_config.as_deref(),
        disable_builtin_tools,
        disable_all_tools,
    );
    let outcome =
        run_cli_process(tx, &mut cmd, &prompt, provider, resume_session_id.is_some()).await;
    if should_retry_malformed_provider_json(outcome, resume_session_id.as_deref()) {
        tracing::warn!(
            "[houston:session] claude resume failed with malformed provider JSON; retrying fresh"
        );
        let _ = tx.send(SessionUpdate::ResumeInvalid);
        retry_fresh(
            tx,
            provider,
            &prompt,
            working_dir.as_deref(),
            model.as_deref(),
            effort.as_deref(),
            system_prompt.as_deref(),
            mcp_config.as_deref(),
            disable_builtin_tools,
            disable_all_tools,
        )
        .await;
    } else if should_retry_resume_rejected(outcome, resume_session_id.as_deref()) {
        tracing::warn!("[houston:session] claude resume rejected by provider; retrying fresh");
        let _ = tx.send(SessionUpdate::ResumeInvalid);
        retry_fresh(
            tx,
            provider,
            &prompt,
            working_dir.as_deref(),
            model.as_deref(),
            effort.as_deref(),
            system_prompt.as_deref(),
            mcp_config.as_deref(),
            disable_builtin_tools,
            disable_all_tools,
        )
        .await;
    } else if outcome == CliRunOutcome::ProviderRequestMalformedJson {
        send_malformed_provider_json_status(tx);
    } else if outcome == CliRunOutcome::ProviderResumeRejected {
        let _ = tx.send(SessionUpdate::Status(SessionStatus::Error(
            "Claude hit a runtime error".to_string(),
        )));
    }
}

#[allow(clippy::too_many_arguments)]
async fn retry_fresh(
    tx: &mpsc::UnboundedSender<SessionUpdate>,
    provider: Provider,
    prompt: &str,
    working_dir: Option<&std::path::Path>,
    model: Option<&str>,
    effort: Option<&str>,
    system_prompt: Option<&str>,
    mcp_config: Option<&std::path::Path>,
    disable_builtin_tools: bool,
    disable_all_tools: bool,
) {
    let mut fresh_cmd = Command::new(claude_command_name());
    configure_claude_command(
        &mut fresh_cmd,
        None,
        working_dir,
        model,
        effort,
        system_prompt,
        mcp_config,
        disable_builtin_tools,
        disable_all_tools,
    );
    let retry_outcome = run_cli_process(tx, &mut fresh_cmd, prompt, provider, false).await;
    if retry_outcome == CliRunOutcome::ProviderRequestMalformedJson {
        send_malformed_provider_json_status(tx);
    }
}

#[allow(clippy::too_many_arguments)]
fn configure_claude_command(
    cmd: &mut Command,
    resume_session_id: Option<&str>,
    working_dir: Option<&std::path::Path>,
    model: Option<&str>,
    effort: Option<&str>,
    system_prompt: Option<&str>,
    mcp_config: Option<&std::path::Path>,
    disable_builtin_tools: bool,
    disable_all_tools: bool,
) {
    cmd.env("PATH", super::claude_path::shell_path());
    cmd.arg("-p")
        .arg("--output-format")
        .arg("stream-json")
        .arg("--verbose")
        .arg("--include-partial-messages");

    if disable_all_tools {
        cmd.arg("--allowedTools").arg("");
    } else {
        cmd.arg("--dangerously-skip-permissions");
        if disable_builtin_tools {
            cmd.arg("--disallowedTools")
                .arg("Edit")
                .arg("Write")
                .arg("NotebookEdit");
        }
    }

    if let Some(m) = model {
        cmd.arg("--model").arg(m);
    }
    if let Some(e) = effort {
        cmd.arg("--effort").arg(e);
    }
    if let Some(sp) = system_prompt {
        cmd.arg("--system-prompt").arg(sp);
    }
    if let Some(mcp) = mcp_config {
        cmd.arg("--mcp-config").arg(mcp);
    }
    if let Some(session_id) = resume_session_id {
        cmd.arg("--resume").arg(session_id);
    }

    cmd.env_remove("CLAUDE_CODE_ENTRYPOINT");
    cmd.env_remove("CLAUDECODE");

    if let Some(dir) = working_dir {
        cmd.current_dir(dir);
    }
}

fn should_retry_malformed_provider_json(
    outcome: CliRunOutcome,
    resume_session_id: Option<&str>,
) -> bool {
    outcome == CliRunOutcome::ProviderRequestMalformedJson && resume_session_id.is_some()
}

fn should_retry_resume_rejected(outcome: CliRunOutcome, resume_session_id: Option<&str>) -> bool {
    outcome == CliRunOutcome::ProviderResumeRejected && resume_session_id.is_some()
}

fn send_malformed_provider_json_status(tx: &mpsc::UnboundedSender<SessionUpdate>) {
    let _ = tx.send(SessionUpdate::Status(SessionStatus::Error(
        MALFORMED_PROVIDER_JSON_MESSAGE.to_string(),
    )));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retries_malformed_provider_json_only_for_resume() {
        assert!(should_retry_malformed_provider_json(
            CliRunOutcome::ProviderRequestMalformedJson,
            Some("claude-session-id"),
        ));
        assert!(!should_retry_malformed_provider_json(
            CliRunOutcome::ProviderRequestMalformedJson,
            None,
        ));
    }

    #[test]
    fn retries_resume_rejected_only_for_resume() {
        assert!(should_retry_resume_rejected(
            CliRunOutcome::ProviderResumeRejected,
            Some("claude-session-id"),
        ));
        assert!(!should_retry_resume_rejected(
            CliRunOutcome::ProviderResumeRejected,
            None,
        ));
    }

    #[test]
    fn does_not_retry_other_outcomes() {
        assert!(!should_retry_malformed_provider_json(
            CliRunOutcome::Failed,
            Some("claude-session-id"),
        ));
        assert!(!should_retry_malformed_provider_json(
            CliRunOutcome::Completed,
            Some("claude-session-id"),
        ));
    }
}
