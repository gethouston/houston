use houston_terminal_manager::{claude_path, Provider};
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
    match provider {
        Provider::Anthropic => run_claude(prompt, model, time_limit).await,
        Provider::OpenAI => run_codex(prompt, model, time_limit).await,
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

async fn run_codex(prompt: &str, model: &str, time_limit: Duration) -> Result<String, String> {
    let bin = houston_cli_bundle::bundled_codex_path()
        .unwrap_or_else(|| std::path::PathBuf::from("codex"));
    let mut cmd = tokio::process::Command::new(&bin);
    cmd.env("PATH", claude_path::shell_path());
    cmd.arg("exec")
        .arg("--json")
        .arg("--dangerously-bypass-approvals-and-sandbox")
        .arg("--skip-git-repo-check")
        .arg("-c")
        .arg("model_reasoning_effort=\"low\"")
        .arg("--model")
        .arg(model)
        .arg("-");
    let stdout = run_command(cmd, prompt, time_limit).await?;
    extract_codex_text(&stdout)
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
