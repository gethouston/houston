use super::types::{FeedItem, SessionStatus};
use crate::claude_command::{
    claude_command_name, configure_claude_command, fresh_retry_prompt,
    should_retry_fresh_after_resume_failure,
};
use crate::cli_process::{run_cli_process, CliRunOutcome};
use crate::prompt_scratch;
use crate::provider_error::MALFORMED_PROVIDER_JSON_MESSAGE;
use crate::provider_error_kind::ProviderError;
use crate::session_update::SessionUpdate;
use crate::Provider;
use tokio::process::Command;
use tokio::sync::mpsc;

/// Spawn a Claude CLI session (`claude -p --output-format stream-json`).
#[allow(clippy::too_many_arguments)]
pub(crate) async fn spawn_claude(
    tx: &mpsc::UnboundedSender<SessionUpdate>,
    provider: Provider,
    prompt: String,
    resume_session_id: Option<String>,
    resume_fallback_prompt: Option<String>,
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

    // The system prompt travels via `--system-prompt-file`, never as an argv
    // token (`--system-prompt <text>` broke `CreateProcessW` on Windows once
    // the prompt outgrew the 32,767-char command-line limit). The scratch
    // value owns the temp file; it is deleted when this fn returns.
    let system_prompt_file = match system_prompt.as_deref() {
        None => None,
        Some(sp) => match prompt_scratch::claude_system_prompt_file(sp) {
            Ok(f) => Some(f),
            Err(e) => {
                let _ = tx.send(SessionUpdate::Status(SessionStatus::Error(format!(
                    "Failed to prepare claude instructions: {e}"
                ))));
                return;
            }
        },
    };

    let mut cmd = Command::new(claude_command_name());
    configure_claude_command(
        &mut cmd,
        resume_session_id.as_deref(),
        working_dir.as_deref(),
        model.as_deref(),
        effort.as_deref(),
        system_prompt_file.as_ref().map(|f| f.path()),
        mcp_config.as_deref(),
        disable_builtin_tools,
        disable_all_tools,
    );
    let outcome = run_cli_process(tx, &mut cmd, &prompt, provider).await;
    if should_retry_fresh_after_resume_failure(outcome, resume_session_id.as_deref()) {
        tracing::warn!(
            "[houston:session] claude resume failed ({outcome:?}); retrying fresh"
        );
        let _ = tx.send(SessionUpdate::ResumeInvalid);
        let retry_prompt = fresh_retry_prompt(&prompt, resume_fallback_prompt.as_deref());
        retry_fresh(
            tx,
            provider,
            retry_prompt,
            working_dir.as_deref(),
            model.as_deref(),
            effort.as_deref(),
            system_prompt_file.as_ref().map(|f| f.path()),
            mcp_config.as_deref(),
            disable_builtin_tools,
            disable_all_tools,
        )
        .await;
    } else if outcome == CliRunOutcome::ProviderRequestMalformedJson {
        // Malformed-JSON without a resume to clear: tell the user
        // explicitly so they can edit the prompt and try again.
        send_malformed_provider_json_status(tx);
    } else if outcome == CliRunOutcome::ClaudeResumeCorrupted {
        // Corrupted-resume signature fired but we had no `--resume` to
        // strip. That means claude itself bombed at startup for some
        // unrelated reason — surface a typed `SpawnFailed` so the user
        // sees a "Report bug" card instead of a silent hang.
        let _ = tx.send(SessionUpdate::Feed(FeedItem::ProviderError(
            ProviderError::SpawnFailed {
                provider: provider.id().to_string(),
                cli_name: provider.cli_name().to_string(),
                message: "claude exited at startup with error_during_execution".to_string(),
            },
        )));
        let _ = tx.send(SessionUpdate::Status(SessionStatus::Error(
            "claude failed to start".to_string(),
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
    system_prompt_file: Option<&std::path::Path>,
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
        system_prompt_file,
        mcp_config,
        disable_builtin_tools,
        disable_all_tools,
    );
    let retry_outcome = run_cli_process(tx, &mut fresh_cmd, prompt, provider).await;
    if retry_outcome == CliRunOutcome::ProviderRequestMalformedJson {
        send_malformed_provider_json_status(tx);
    } else if retry_outcome == CliRunOutcome::ClaudeResumeCorrupted {
        // Defensive: the fresh retry has no `--resume`, so the
        // corrupted-resume signature firing here means claude is
        // crashing at startup for an unrelated reason. cli_process
        // skipped its normal failed-exit emission, so surface the
        // failure ourselves rather than leaving the user staring at a
        // spinner.
        let _ = tx.send(SessionUpdate::Feed(FeedItem::ProviderError(
            ProviderError::SpawnFailed {
                provider: provider.id().to_string(),
                cli_name: provider.cli_name().to_string(),
                message: "claude exited at startup with error_during_execution".to_string(),
            },
        )));
        let _ = tx.send(SessionUpdate::Status(SessionStatus::Error(
            "claude failed to start".to_string(),
        )));
    }
}

fn send_malformed_provider_json_status(tx: &mpsc::UnboundedSender<SessionUpdate>) {
    let _ = tx.send(SessionUpdate::Status(SessionStatus::Error(
        MALFORMED_PROVIDER_JSON_MESSAGE.to_string(),
    )));
}
