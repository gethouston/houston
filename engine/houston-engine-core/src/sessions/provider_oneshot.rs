//! Shared one-shot provider CLI invocation.
//!
//! Spawns the provider CLI (Claude / Codex), writes a prompt to
//! stdin, and returns the full stdout as a string. Used by `summarize` and
//! `generate_instructions` — both need a single prompt→text round-trip with
//! no streaming and no session state.
//!
//! Callers are responsible for resolving the model default before calling
//! `run_provider_oneshot`, since each use case has different model
//! preferences (see `default_title_model` in `summarize`, `default_gen_model`
//! in `generate_instructions`).
//!
//! Dispatch is by `provider.id()` against the trait/registry `Provider`
//! newtype (see `houston-terminal-manager::provider`). Adding a provider
//! here = one new match arm + one new `run_<id>` helper. The per-arm
//! binary resolution (claude on PATH, bundled codex, bundled gemini) is
//! intentionally NOT routed through `Provider::resolve()` because each
//! CLI has provider-specific spawn quirks (env scrubbing, args, HOME
//! isolation) that the trait doesn't model.

use crate::provider;
use houston_terminal_manager::{claude_path, Provider};
use serde_json::Value;
use std::time::Duration;
use tokio::io::AsyncWriteExt;
use tokio::time::timeout;

/// Run a single prompt through the configured provider CLI and return the
/// raw text output. `model` must be already resolved by the caller (no
/// `Option` — pick the appropriate default before calling).
const OPENROUTER_ENV_VAR: &str = "OPENROUTER_API_KEY";
const ANTHROPIC_ENV_VAR: &str = "ANTHROPIC_API_KEY";
const OPENAI_ENV_VAR: &str = "OPENAI_API_KEY";
/// Process-local Codex overrides for OpenRouter (see `cloud/openrouter-spike.md`).
/// Houston never mutates `~/.codex/config.toml`; these apply only to the child.
pub(crate) const OPENROUTER_CODEX_CONFIG: &[&str] = &[
    r#"model_provider="openrouter""#,
    r#"model_providers.openrouter.name="OpenRouter""#,
    r#"model_providers.openrouter.base_url="https://openrouter.ai/api/v1""#,
    r#"model_providers.openrouter.env_key="OPENROUTER_API_KEY""#,
    r#"model_providers.openrouter.wire_api="responses""#,
];

pub async fn run_provider_oneshot(
    prompt: &str,
    provider: Provider,
    model: &str,
    time_limit: Duration,
) -> Result<String, String> {
    match provider.id() {
        "anthropic" => run_claude(prompt, model, time_limit).await,
        "openai" => run_codex(prompt, model, time_limit).await,
        "openrouter" => run_openrouter_codex(prompt, model, time_limit).await,
        unknown => Err(format!(
            "no one-shot invocation wired up for provider {unknown:?}"
        )),
    }
}

async fn run_claude(prompt: &str, model: &str, time_limit: Duration) -> Result<String, String> {
    let mut cmd = tokio::process::Command::new("claude");
    cmd.env("PATH", claude_path::shell_path());
    cmd.env_remove("CLAUDE_CODE_ENTRYPOINT");
    cmd.env_remove("CLAUDECODE");
    if let Some(key) = read_env_or_stored(ANTHROPIC_ENV_VAR, provider::read_anthropic_api_key().await)? {
        cmd.env(ANTHROPIC_ENV_VAR, key);
    }
    cmd.arg("-p")
        .arg("--model")
        .arg(model)
        .arg("--output-format")
        .arg("text")
        .arg("--allowedTools")
        .arg("");
    run_command(cmd, prompt, time_limit).await
}

async fn run_codex(prompt: &str, model: &str, time_limit: Duration) -> Result<String, String> {
    let mut cmd = build_codex_oneshot_command(model, &[]);
    inject_openai_api_key(&mut cmd).await?;
    let stdout = run_command(cmd, prompt, time_limit).await?;
    extract_codex_text(&stdout)
}

async fn run_openrouter_codex(
    prompt: &str,
    model: &str,
    time_limit: Duration,
) -> Result<String, String> {
    let mut cmd = build_codex_oneshot_command(model, OPENROUTER_CODEX_CONFIG);
    inject_openrouter_api_key(&mut cmd).await?;
    let stdout = run_command(cmd, prompt, time_limit).await?;
    extract_codex_text(&stdout)
}

/// Inject `OPENROUTER_API_KEY` into the Codex child env. Missing key returns
/// an error so summarize/generate_instructions never spawn unauthenticated.
async fn inject_openrouter_api_key(cmd: &mut tokio::process::Command) -> Result<(), String> {
    let key = read_env_or_stored(OPENROUTER_ENV_VAR, provider::read_openrouter_api_key().await)?
        .ok_or_else(|| {
            "OpenRouter API key missing. Connect OpenRouter in settings.".to_string()
        })?;
    cmd.env(OPENROUTER_ENV_VAR, key);
    Ok(())
}

async fn inject_openai_api_key(cmd: &mut tokio::process::Command) -> Result<(), String> {
    if codex_oauth_configured() {
        return Ok(());
    }
    let key = read_env_or_stored(OPENAI_ENV_VAR, provider::read_openai_api_key().await)?
        .ok_or_else(|| {
            "OpenAI API key missing. Connect OpenAI in settings or sign in with ChatGPT."
                .to_string()
        })?;
    cmd.env(OPENAI_ENV_VAR, key);
    Ok(())
}

fn read_env_or_stored(
    env_var: &str,
    stored: Result<Option<String>, crate::error::CoreError>,
) -> Result<Option<String>, String> {
    if let Ok(value) = std::env::var(env_var) {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return Ok(Some(trimmed.to_string()));
        }
    }
    stored
        .map_err(|e| e.to_string())
        .map(|opt| opt.filter(|key| !key.trim().is_empty()))
}

fn codex_oauth_configured() -> bool {
    provider::codex_oauth_tokens_present()
}

fn build_codex_oneshot_command(
    model: &str,
    extra_config: &[&str],
) -> tokio::process::Command {
    // Prefer the bundled codex (pinned in `cli-deps.json`) so one-shot
    // generation can't get sabotaged by a stale `nvm`/`brew` codex on the
    // user's PATH that doesn't recognize the model we picked.
    let bin = houston_cli_bundle::bundled_codex_path()
        .unwrap_or_else(|| std::path::PathBuf::from("codex"));
    let mut cmd = tokio::process::Command::new(&bin);
    cmd.env("PATH", claude_path::shell_path());
    cmd.arg("exec")
        .arg("--json")
        .arg("--dangerously-bypass-approvals-and-sandbox")
        .arg("--skip-git-repo-check");
    for override_cfg in extra_config {
        cmd.arg("-c").arg(*override_cfg);
    }
    // Override `model_reasoning_effort` so a stale global
    // `~/.codex/config.toml` (newer Codex CLIs allow `xhigh`, older
    // ones reject it) can't kill one-shot generation. Callers needing
    // depth pick the model accordingly; we don't bake an effort here.
    cmd.arg("-c")
        .arg("model_reasoning_effort=\"low\"")
        .arg("--model")
        .arg(model)
        .arg("-");
    cmd
}

async fn run_command(
    mut cmd: tokio::process::Command,
    prompt: &str,
    time_limit: Duration,
) -> Result<String, String> {
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

    let secs = time_limit.as_secs();
    let output = match timeout(time_limit, child.wait_with_output()).await {
        Ok(Ok(output)) => output,
        Ok(Err(e)) => return Err(format!("process failed: {e}")),
        Err(_) => return Err(format!("process timed out after {secs} s")),
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("process exited {}: {}", output.status, stderr.trim()));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

pub(super) fn extract_codex_text(stdout: &str) -> Result<String, String> {
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

    #[test]
    fn returns_error_when_no_agent_message() {
        let raw = r#"{"type":"thread.started","thread_id":"t1"}"#;
        assert!(extract_codex_text(raw).is_err());
    }

    #[test]
    fn openrouter_codex_config_matches_spike_contract() {
        assert_eq!(OPENROUTER_CODEX_CONFIG.len(), 5);
        assert!(OPENROUTER_CODEX_CONFIG[0].contains("model_provider"));
        assert!(OPENROUTER_CODEX_CONFIG[1].contains("openrouter.name"));
        assert!(OPENROUTER_CODEX_CONFIG[2].contains("openrouter.ai"));
        assert!(OPENROUTER_CODEX_CONFIG[3].contains("OPENROUTER_API_KEY"));
        assert!(OPENROUTER_CODEX_CONFIG[4].contains("wire_api"));
    }

    #[test]
    fn codex_oneshot_command_includes_openrouter_overrides_before_model() {
        let cmd = build_codex_oneshot_command("openai/gpt-4o-mini", OPENROUTER_CODEX_CONFIG);
        let args: Vec<String> = cmd
            .as_std()
            .get_args()
            .map(|a| a.to_string_lossy().into_owned())
            .collect();
        let model_pos = args.iter().position(|a| a == "--model").expect("--model");
        let first_override = args
            .iter()
            .position(|a| a.contains("model_provider"))
            .expect("openrouter override");
        assert!(first_override < model_pos);
        assert_eq!(args[model_pos + 1], "openai/gpt-4o-mini");
    }
}
