//! Activity summarizer — relocated from `app/src-tauri/src/commands/chat.rs`.
//!
//! Shells out to the user's configured provider CLI to generate a concise
//! `{title, description}` JSON object. Failures degrade to a deterministic
//! local title so conversation creation never depends on title generation.

use super::summary_text::{
    fallback_summary, normalize_spaces, parse_summary, truncate_chars, DESCRIPTION_MAX_CHARS,
};
use crate::error::CoreResult;
use houston_terminal_manager::{claude_path, Provider};
use serde_json::Value;
use std::time::Duration;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tokio::time::timeout;

// Bumped from 12s → 30s so titles still generate when the model is briefly
// rate-limited and gemini-cli's internal retry kicks in (typical backoff
// waits 8-11s). 12s was tight enough that ~half of free-tier Gemini users
// hit "title summary fallback" on first message. 30s is well under the
// user's "this conversation feels stuck" threshold but long enough to
// absorb one quota retry. The deterministic local fallback still fires
// for the unrecoverable cases.
const SUMMARY_TIMEOUT: Duration = Duration::from_secs(30);
const CLAUDE_TITLE_MODEL: &str = "haiku";
const CODEX_TITLE_MODEL: &str = "gpt-5.5-mini";
/// Gemini title-summary model. Flash-Lite is the cheapest/fastest GA tier
/// and gives us a JSON object in well under the 12s SUMMARY_TIMEOUT.
const GEMINI_TITLE_MODEL: &str = "gemini-3.1-flash-lite";

pub use super::summary_text::SummarizeResult;

pub async fn summarize(
    message: &str,
    provider: Provider,
    model: Option<&str>,
) -> CoreResult<SummarizeResult> {
    let fallback = fallback_summary(message);
    let raw = match run_provider_summary(message, provider, model).await {
        Ok(raw) => raw,
        Err(e) => {
            tracing::warn!(provider = %provider, error = %e, "title summary fallback");
            return Ok(fallback);
        }
    };

    match parse_summary(&raw, &fallback) {
        Ok(summary) => Ok(summary),
        Err(e) => {
            tracing::warn!(provider = %provider, error = %e, "title summary parse fallback");
            Ok(fallback)
        }
    }
}

fn title_prompt(message: &str) -> String {
    let prompt = format!(
        "Generate a concise title and description for this conversation.\n\
         Title: max 6 words. Description: one short sentence.\n\
         Return ONLY valid JSON, no markdown fences:\n\
         {{\"title\": \"...\", \"description\": \"...\"}}\n\n\
         Task: {message}"
    );
    prompt
}

async fn run_provider_summary(
    message: &str,
    provider: Provider,
    model: Option<&str>,
) -> Result<String, String> {
    let prompt = title_prompt(message);
    // Same dispatch shape as the session runner: each provider has its
    // own short-prompt invocation profile (different stdout shape, model
    // name conventions, env scrubbing). Adding a provider = one new arm
    // pointing at a new `run_<provider>_summary` helper.
    match provider.id() {
        "anthropic" => run_claude_summary(&prompt, model).await,
        "openai" => run_codex_summary(&prompt, model).await,
        "gemini" => run_gemini_summary(&prompt, model).await,
        unknown => Err(format!("no title summarizer wired up for provider {unknown:?}")),
    }
}

async fn run_claude_summary(prompt: &str, model: Option<&str>) -> Result<String, String> {
    let mut cmd = tokio::process::Command::new("claude");
    cmd.env("PATH", claude_path::shell_path());
    cmd.env_remove("CLAUDE_CODE_ENTRYPOINT");
    cmd.env_remove("CLAUDECODE");
    cmd.arg("-p")
        .arg("--model")
        .arg(model.unwrap_or(CLAUDE_TITLE_MODEL))
        .arg("--output-format")
        .arg("text")
        .arg("--allowedTools")
        .arg("");
    run_command_with_prompt(cmd, prompt).await
}

async fn run_codex_summary(prompt: &str, model: Option<&str>) -> Result<String, String> {
    // Prefer the bundled codex (pinned in `cli-deps.json`) so the title
    // summarizer can't get sabotaged by a stale `nvm`/`brew` codex on the
    // user's PATH that doesn't recognize the model we picked.
    let bin = houston_cli_bundle::bundled_codex_path()
        .unwrap_or_else(|| std::path::PathBuf::from("codex"));
    let mut cmd = tokio::process::Command::new(&bin);
    cmd.env("PATH", claude_path::shell_path());
    cmd.arg("exec")
        .arg("--json")
        .arg("--dangerously-bypass-approvals-and-sandbox")
        .arg("--skip-git-repo-check")
        // Override `model_reasoning_effort` so a stale global
        // `~/.codex/config.toml` (newer Codex CLIs allow `xhigh`, older ones
        // reject it) can't kill title generation. We don't need much thought
        // here — it's a 6-word title.
        .arg("-c")
        .arg("model_reasoning_effort=\"low\"")
        .arg("--model")
        .arg(model.unwrap_or(CODEX_TITLE_MODEL))
        .arg("-");
    let stdout = run_command_with_prompt(cmd, prompt).await?;
    extract_codex_text(&stdout)
}

async fn run_gemini_summary(prompt: &str, model: Option<&str>) -> Result<String, String> {
    // Prefer the bundled gemini SEA for the same reason codex does:
    // a stale npm-global install on the user's PATH could emit a
    // different output format and break the parser. The summarizer
    // asks for plain text (`--output-format text`) so we don't have
    // to thread through a second NDJSON parser just for titles.
    let bin = houston_cli_bundle::bundled_gemini_path()
        .unwrap_or_else(|| std::path::PathBuf::from("gemini"));
    let mut cmd = tokio::process::Command::new(&bin);
    cmd.env("PATH", claude_path::shell_path());

    // Same HOME isolation the chat runner uses — see
    // `houston-terminal-manager::gemini_home`. Without it, the
    // user's accumulated `~/.gemini/GEMINI.md` memories bleed into
    // title generation prompts and produce confused titles like
    // "Alpine.js Component Refactor" for Houston tasks that have
    // nothing to do with the user's other projects.
    let houston_data = houston_terminal_manager::gemini_home::houston_data_root();
    let real_home = houston_terminal_manager::gemini_home::resolve_real_home()
        .map_err(|e| format!("failed to resolve real home for gemini runtime: {e}"))?;
    let runtime_home = houston_terminal_manager::gemini_home::ensure_gemini_runtime_home(
        &houston_data,
        &real_home,
    )
    .map_err(|e| format!("failed to prepare gemini runtime home: {e}"))?;
    cmd.env("HOME", &runtime_home);
    #[cfg(windows)]
    cmd.env("USERPROFILE", &runtime_home);

    // Run the summarizer FROM the runtime HOME so gemini-cli's
    // project-discovery walk finds nothing. Without setting cwd, gemini
    // inherits the engine process's cwd — which in `pnpm tauri dev`
    // is the Houston source repo. The model then picks up signals
    // ("houston", "vilnius" in the path) and emits titles like
    // "Houston Vilnius CLI Development" for unrelated user prompts.
    // The runtime HOME has no project files at all, so titles depend
    // only on the user's message body — which is what we want for a
    // 6-word summary.
    cmd.current_dir(&runtime_home);

    // `--skip-trust` mirrors gemini_runner: gemini-cli's trusted-folders
    // check otherwise refuses to run in Houston-managed workspace dirs
    // and the summary never completes. See gemini_runner::build_gemini_args.
    cmd.arg("--output-format")
        .arg("text")
        .arg("--yolo")
        .arg("--skip-trust")
        .arg("--model")
        .arg(model.unwrap_or(GEMINI_TITLE_MODEL));
    run_command_with_prompt(cmd, prompt).await
}

async fn run_command_with_prompt(mut cmd: Command, prompt: &str) -> Result<String, String> {
    cmd.kill_on_drop(true);
    cmd.stdin(std::process::Stdio::piped());
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("spawn failed: {e}"))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(prompt.as_bytes())
            .await
            .map_err(|e| format!("stdin write failed: {e}"))?;
        drop(stdin);
    }

    let output = match timeout(SUMMARY_TIMEOUT, child.wait_with_output()).await {
        Ok(Ok(output)) => output,
        Ok(Err(e)) => return Err(format!("process failed: {e}")),
        Err(_) => return Err("process timed out".to_string()),
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let summary = truncate_chars(&normalize_spaces(&stderr), DESCRIPTION_MAX_CHARS);
        return Err(format!("process exited {}: {summary}", output.status));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn extract_codex_text(stdout: &str) -> Result<String, String> {
    let mut latest = String::new();
    for line in stdout.lines() {
        let Ok(event) = serde_json::from_str::<Value>(line.trim()) else {
            continue;
        };
        let Some(item) = event.get("item") else {
            continue;
        };
        if item.get("type").and_then(Value::as_str) == Some("agent_message") {
            if let Some(text) = item.get("text").and_then(Value::as_str) {
                latest = text.to_string();
            }
        }
    }
    if latest.trim().is_empty() {
        Err("codex output had no agent_message text".to_string())
    } else {
        Ok(latest)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_codex_agent_message_text() {
        let raw = r#"{"type":"thread.started","thread_id":"t1"}
{"type":"item.completed","item":{"type":"agent_message","text":"{\"title\":\"Fix upload error\",\"description\":\"Debug 413 uploads.\"}"}}"#;

        assert_eq!(
            extract_codex_text(raw).unwrap(),
            "{\"title\":\"Fix upload error\",\"description\":\"Debug 413 uploads.\"}"
        );
    }
}
