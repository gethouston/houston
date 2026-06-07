//! Codex CLI session runner — counterpart of `claude_runner` for the
//! OpenAI / OpenRouter providers (both use `codex exec --json`).

use crate::cli_process::{run_cli_process, CliRunOutcome};
use crate::codex_command;
use crate::provider::openai_credentials;
use crate::provider::openrouter_credentials;
use crate::session_update::SessionUpdate;
use crate::types::SessionStatus;
use crate::Provider;
use tokio::process::Command;
use tokio::sync::mpsc;

/// Spawn a Codex CLI session (`codex exec --json --dangerously-bypass-approvals-and-sandbox`).
pub(crate) async fn spawn_codex(
    tx: &mpsc::UnboundedSender<SessionUpdate>,
    provider: Provider,
    prompt: String,
    resume_session_id: Option<String>,
    resume_fallback_prompt: Option<String>,
    working_dir: Option<std::path::PathBuf>,
    model: Option<String>,
    effort: Option<String>,
    system_prompt: Option<String>,
) {
    let effort = effort.or_else(|| provider.default_effort().map(str::to_string));
    tracing::info!(
        "[houston:session] spawning codex exec --json (provider={}, resume={:?}, model={:?}, effort={:?})",
        provider.id(),
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

    let openrouter_api_key = if provider.id() == "openrouter" {
        match openrouter_credentials::read_openrouter_api_key() {
            Ok(key) => Some(key),
            Err(message) => {
                let _ = tx.send(SessionUpdate::Status(SessionStatus::Error(message)));
                return;
            }
        }
    } else {
        None
    };

    let openai_api_key = if provider.id() == "openai" && !openai_credentials::codex_oauth_configured()
    {
        match openai_credentials::read_openai_api_key() {
            Ok(key) => Some(key),
            Err(message) => {
                let _ = tx.send(SessionUpdate::Status(SessionStatus::Error(message)));
                return;
            }
        }
    } else {
        None
    };

    let mut cmd = build_codex_command(
        provider,
        resume_session_id.as_deref(),
        working_dir.as_deref(),
        model.as_deref(),
        effort.as_deref(),
        system_prompt.as_deref(),
        openrouter_api_key.as_deref(),
        openai_api_key.as_deref(),
    );

    let outcome = run_cli_process(tx, &mut cmd, &prompt, provider).await;
    if outcome == CliRunOutcome::CodexResumeMissing && resume_session_id.is_some() {
        tracing::warn!("[houston:session] codex resume rollout missing; retrying with fresh thread");
        let _ = tx.send(SessionUpdate::ResumeInvalid);
        let mut fresh_cmd = build_codex_command(
            provider,
            None,
            working_dir.as_deref(),
            model.as_deref(),
            effort.as_deref(),
            system_prompt.as_deref(),
            openrouter_api_key.as_deref(),
            openai_api_key.as_deref(),
        );
        run_cli_process(
            tx,
            &mut fresh_cmd,
            fresh_retry_prompt(&prompt, resume_fallback_prompt.as_deref()),
            provider,
        )
        .await;
    }
}

fn fresh_retry_prompt<'a>(prompt: &'a str, resume_fallback_prompt: Option<&'a str>) -> &'a str {
    resume_fallback_prompt.unwrap_or(prompt)
}

fn build_codex_command(
    provider: Provider,
    resume_session_id: Option<&str>,
    working_dir: Option<&std::path::Path>,
    model: Option<&str>,
    effort: Option<&str>,
    system_prompt: Option<&str>,
    openrouter_api_key: Option<&str>,
    openai_api_key: Option<&str>,
) -> Command {
    let bin = houston_cli_bundle::bundled_codex_path()
        .unwrap_or_else(|| std::path::PathBuf::from("codex"));
    let mut cmd = Command::new(&bin);
    cmd.env("PATH", super::claude_path::shell_path());
    cmd.args(codex_command::build_args(
        provider,
        resume_session_id,
        working_dir,
        model,
        effort,
        system_prompt,
    ));
    if let Some(key) = openrouter_api_key {
        cmd.env("OPENROUTER_API_KEY", key);
    }
    if let Some(key) = openai_api_key {
        cmd.env("OPENAI_API_KEY", key);
    }
    if let Some(dir) = working_dir {
        cmd.current_dir(dir);
    }
    cmd
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fresh_retry_uses_recovery_prompt_when_available() {
        assert_eq!(
            fresh_retry_prompt("latest", Some("recovered history + latest")),
            "recovered history + latest"
        );
        assert_eq!(fresh_retry_prompt("latest", None), "latest");
    }
}
