//! Claude CLI command assembly — counterpart of `codex_command` for the
//! Anthropic provider: binary resolution, argv construction, and the
//! retry-policy predicates the runner consults.

use crate::cli_process::CliRunOutcome;
use std::ffi::OsString;
use tokio::process::Command;

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
pub(crate) fn claude_command_name() -> OsString {
    if crate::claude_install_path::is_installed() {
        crate::claude_install_path::cli_path().into_os_string()
    } else {
        OsString::from("claude")
    }
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn configure_claude_command(
    cmd: &mut Command,
    resume_session_id: Option<&str>,
    working_dir: Option<&std::path::Path>,
    model: Option<&str>,
    effort: Option<&str>,
    system_prompt_file: Option<&std::path::Path>,
    mcp_config: Option<&std::path::Path>,
    disable_builtin_tools: bool,
    disable_all_tools: bool,
) {
    cmd.env("PATH", crate::claude_path::shell_path());
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
    if let Some(path) = system_prompt_file {
        // File, not inline text: inline `--system-prompt <text>` puts the
        // whole prompt on the command line, which exceeds Windows'
        // 32,767-char limit for agents with large accumulated context.
        cmd.arg("--system-prompt-file").arg(path);
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

/// Two failure modes share the "retry without `--resume`" recovery path:
/// 1. `ProviderRequestMalformedJson` — Anthropic API rejected the resumed
///    transcript as having an unpaired UTF-16 surrogate (a single bad
///    emoji or pasted character anywhere in history poisons it forever).
/// 2. `ClaudeResumeCorrupted` — the on-disk transcript JSONL at
///    `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl` is structurally
///    broken (truncated trailing line, dangling tool_use without
///    tool_result). The CLI crashes before contacting the API.
///
/// In both cases the cure is the same: clear the persisted session id,
/// re-spawn `claude -p` without `--resume`, and let the user continue.
/// Without a resume id there is nothing to strip — fall through to the
/// outer error-surfacing branches so the user still gets feedback.
pub(crate) fn should_retry_fresh_after_resume_failure(
    outcome: CliRunOutcome,
    resume_session_id: Option<&str>,
) -> bool {
    matches!(
        outcome,
        CliRunOutcome::ProviderRequestMalformedJson | CliRunOutcome::ClaudeResumeCorrupted
    ) && resume_session_id.is_some()
}

pub(crate) fn fresh_retry_prompt<'a>(
    prompt: &'a str,
    resume_fallback_prompt: Option<&'a str>,
) -> &'a str {
    resume_fallback_prompt.unwrap_or(prompt)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retries_malformed_provider_json_only_for_resume() {
        assert!(should_retry_fresh_after_resume_failure(
            CliRunOutcome::ProviderRequestMalformedJson,
            Some("claude-session-id"),
        ));
        assert!(!should_retry_fresh_after_resume_failure(
            CliRunOutcome::ProviderRequestMalformedJson,
            None,
        ));
    }

    #[test]
    fn retries_corrupted_resume_only_when_resume_id_present() {
        assert!(should_retry_fresh_after_resume_failure(
            CliRunOutcome::ClaudeResumeCorrupted,
            Some("claude-session-id"),
        ));
        // No resume to strip — the runner surfaces a SpawnFailed card instead.
        assert!(!should_retry_fresh_after_resume_failure(
            CliRunOutcome::ClaudeResumeCorrupted,
            None,
        ));
    }

    #[test]
    fn does_not_retry_other_outcomes() {
        assert!(!should_retry_fresh_after_resume_failure(
            CliRunOutcome::Failed,
            Some("claude-session-id"),
        ));
        assert!(!should_retry_fresh_after_resume_failure(
            CliRunOutcome::Completed,
            Some("claude-session-id"),
        ));
        assert!(!should_retry_fresh_after_resume_failure(
            CliRunOutcome::CodexResumeMissing,
            Some("claude-session-id"),
        ));
    }

    #[test]
    fn fresh_retry_uses_recovery_prompt_when_available() {
        assert_eq!(
            fresh_retry_prompt("latest", Some("recovered history + latest")),
            "recovered history + latest"
        );
        assert_eq!(fresh_retry_prompt("latest", None), "latest");
    }

    /// Mirror of `codex_command::argv_length_is_independent_of_prompt_size`:
    /// the system prompt reaches claude via `--system-prompt-file <path>`,
    /// so argv stays small and constant regardless of prompt size and the
    /// Windows 32,767-char command-line limit can never kill the spawn.
    #[test]
    fn argv_carries_a_file_path_not_the_prompt_text() {
        let mut cmd = Command::new("claude");
        let sp_file = std::path::Path::new("/tmp/houston-claude-sp-1-1.md");
        configure_claude_command(
            &mut cmd,
            Some("session-id"),
            None,
            Some("claude-opus-4-8"),
            Some("high"),
            Some(sp_file),
            None,
            false,
            false,
        );

        let args: Vec<String> = cmd
            .as_std()
            .get_args()
            .map(|a| a.to_string_lossy().to_string())
            .collect();
        let total: usize = args.iter().map(|a| a.len() + 1).sum();
        assert!(total < 1_000, "claude argv must stay tiny, got {total}: {args:?}");

        let flag_pos = args.iter().position(|a| a == "--system-prompt-file").unwrap();
        assert_eq!(args[flag_pos + 1], sp_file.to_string_lossy());
        assert!(
            !args.iter().any(|a| a == "--system-prompt"),
            "inline --system-prompt must never be used"
        );
    }
}
