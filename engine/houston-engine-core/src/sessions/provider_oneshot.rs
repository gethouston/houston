//! Shared one-shot provider CLI invocation.
//!
//! Spawns the provider CLI (Claude / Codex / Gemini), writes a prompt to
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

use houston_terminal_manager::{claude_path, gemini_home, Provider};
use serde_json::Value;
use std::time::Duration;
use tokio::io::AsyncWriteExt;
use tokio::time::timeout;

/// Run a single prompt through the configured provider CLI and return the
/// raw text output. `model` must be already resolved by the caller (no
/// `Option` — pick the appropriate default before calling).
pub async fn run_provider_oneshot(
    prompt: &str,
    provider: Provider,
    model: &str,
    time_limit: Duration,
) -> Result<String, String> {
    match provider.id() {
        "anthropic" => run_claude(prompt, model, time_limit).await,
        // OpenRouter rides codex with a custom model-provider config.
        "openai" | "openrouter" => run_codex(provider, prompt, model, time_limit).await,
        "gemini" => run_gemini(prompt, model, time_limit).await,
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
    cmd.arg("-p")
        .arg("--model")
        .arg(model)
        .arg("--output-format")
        .arg("text")
        .arg("--allowedTools")
        .arg("");
    run_command(cmd, prompt, time_limit).await
}

async fn run_codex(
    provider: Provider,
    prompt: &str,
    model: &str,
    time_limit: Duration,
) -> Result<String, String> {
    // Prefer the bundled codex (pinned in `cli-deps.json`) so one-shot
    // generation can't get sabotaged by a stale `nvm`/`brew` codex on the
    // user's PATH that doesn't recognize the model we picked.
    let bin = houston_cli_bundle::bundled_codex_path()
        .unwrap_or_else(|| std::path::PathBuf::from("codex"));
    let mut cmd = tokio::process::Command::new(&bin);
    cmd.env("PATH", claude_path::shell_path());
    // Custom OpenAI-compatible backend (OpenRouter, …): inject the API key
    // env var the codex `model_providers.<slug>.env_key` config references.
    if let Some((key, value)) =
        houston_terminal_manager::provider::codex_backend_env(provider)
    {
        cmd.env(key, value);
    }
    cmd.arg("exec")
        .arg("--json")
        .arg("--dangerously-bypass-approvals-and-sandbox")
        .arg("--skip-git-repo-check")
        // Override `model_reasoning_effort` so a stale global
        // `~/.codex/config.toml` (newer Codex CLIs allow `xhigh`, older
        // ones reject it) can't kill one-shot generation. Callers needing
        // depth pick the model accordingly; we don't bake an effort here.
        .arg("-c")
        .arg("model_reasoning_effort=\"low\"");
    // Route to the provider's endpoint when it's a custom codex backend.
    // Native codex (OpenAI) yields no overrides and is unchanged.
    if let Some(backend) = provider.codex_backend() {
        for override_kv in backend.config_overrides() {
            cmd.arg("-c").arg(override_kv);
        }
    }
    cmd.arg("--model").arg(model).arg("-");
    let stdout = run_command(cmd, prompt, time_limit).await?;
    extract_codex_text(&stdout)
}

async fn run_gemini(prompt: &str, model: &str, time_limit: Duration) -> Result<String, String> {
    // Prefer the bundled gemini SEA for the same reason codex does: a
    // stale npm-global install on the user's PATH could emit a different
    // output format and break parsers. The one-shot path asks for plain
    // text (`--output-format text`) so we don't have to thread through a
    // second NDJSON parser just for this call.
    //
    // On Windows there is no upstream gemini binary in v1 (see
    // knowledge-base/cli-bundling.md, phase-2 note), so `bundled_gemini_path`
    // returns None AND there's nothing on PATH. Surface a clear error
    // instead of falling through to `Command::new("gemini")` which would
    // fail with "program not found" and confuse the caller.
    let bin = match houston_cli_bundle::bundled_gemini_path() {
        Some(p) => p,
        None => match houston_terminal_manager::provider::which_on_path("gemini") {
            Some(p) => p,
            None => {
                return Err(if cfg!(windows) {
                    "Gemini is not available on Windows yet. Switch to Anthropic \
                     or OpenAI for now, or follow Houston's Windows release notes \
                     for when Gemini lands."
                        .into()
                } else {
                    "Gemini CLI binary missing. Reinstall Houston to restore the \
                     bundled CLI."
                        .into()
                });
            }
        },
    };
    let mut cmd = tokio::process::Command::new(&bin);
    cmd.env("PATH", claude_path::shell_path());

    // Same HOME isolation the chat runner uses — see
    // `houston-terminal-manager::gemini_home`. Without it, the user's
    // accumulated `~/.gemini/GEMINI.md` memories bleed into the prompt
    // and produce confused outputs like "Alpine.js Component Refactor"
    // titles for Houston tasks that have nothing to do with the user's
    // other projects.
    let houston_data = gemini_home::houston_data_root();
    let real_home = gemini_home::resolve_real_home()
        .map_err(|e| format!("failed to resolve real home for gemini runtime: {e}"))?;
    let runtime_home = gemini_home::ensure_gemini_runtime_home(&houston_data, &real_home)
        .map_err(|e| format!("failed to prepare gemini runtime home: {e}"))?;
    cmd.env("HOME", &runtime_home);
    #[cfg(windows)]
    cmd.env("USERPROFILE", &runtime_home);

    // Run FROM the runtime HOME so gemini-cli's project-discovery walk
    // finds nothing. Without setting cwd, gemini inherits the engine's
    // cwd — which in `pnpm tauri dev` is the Houston source repo. The
    // model then picks up signals ("houston", "vilnius" in the path)
    // and emits titles like "Houston Vilnius CLI Development" for
    // unrelated user prompts. The runtime HOME has no project files at
    // all, so output depends only on the user's prompt body.
    cmd.current_dir(&runtime_home);

    // `--skip-trust` mirrors gemini_runner: gemini-cli's trusted-folders
    // check otherwise refuses to run in Houston-managed workspace dirs
    // and the call never completes. See gemini_runner::build_gemini_args.
    cmd.arg("--output-format")
        .arg("text")
        .arg("--yolo")
        .arg("--skip-trust")
        .arg("--model")
        .arg(model);
    run_command(cmd, prompt, time_limit).await
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
}
