//! LLM-pick step.
//!
//! Given the top-K candidates from the matcher, ask the user's already-
//! configured provider CLI (Claude `-p` or Codex `exec`) to choose the
//! final stack and write the human-facing reasons. Clones the one-shot
//! invocation pattern used by `houston-engine-core::sessions::summarize`
//! so end users never need API keys server-side.
//!
//! Failure-mode philosophy: if the CLI is missing, errors out, times
//! out, or returns garbage, the caller falls back to a deterministic
//! "top candidates as stack" result with `llm_picked: false`. We never
//! let a flaky provider kill a recommendation.

use super::catalog;
use super::types::{EnrichedToolkit, RecommendResult, StackEntry};
use houston_terminal_manager::{claude_path, Provider};
use serde::Deserialize;
use serde_json::Value;
use std::collections::BTreeMap;
use std::time::Duration;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tokio::time::timeout;

const PICK_TIMEOUT: Duration = Duration::from_secs(30);
const CLAUDE_PICK_MODEL: &str = "haiku";
const CODEX_PICK_MODEL: &str = "gpt-5.5-mini";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PickedStackEntry {
    toolkit: String,
    #[serde(default)]
    role: String,
    #[serde(default)]
    reason: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PickResponse {
    #[serde(default)]
    primary_stack: Vec<PickedStackEntry>,
    #[serde(default)]
    alternatives: BTreeMap<String, Vec<String>>,
    #[serde(default)]
    missing_capabilities: Vec<String>,
}

/// Build a recommendation by calling the user's provider CLI. Returns
/// `None` on any failure — the caller is expected to fall back.
pub async fn pick(
    intent: &str,
    candidates: &[&EnrichedToolkit],
    already_connected: &[String],
    provider: Provider,
) -> Option<RecommendResult> {
    if candidates.is_empty() {
        return None;
    }

    let prompt = build_prompt(intent, candidates, already_connected);
    let raw = match run_provider(&prompt, provider).await {
        Ok(text) => text,
        Err(e) => {
            tracing::warn!(provider = %provider, error = %e, "recommender LLM pick failed");
            return None;
        }
    };

    let parsed = match parse_response(&raw) {
        Ok(p) => p,
        Err(e) => {
            tracing::warn!(error = %e, "recommender LLM pick parse failed");
            return None;
        }
    };

    Some(materialize(parsed, candidates, already_connected))
}

/// Deterministic fallback: turn the top candidates into a stack without
/// calling any LLM. Used when no CLI is available or the LLM pick step
/// failed. Reason text is generic but honest.
pub fn fallback_from_candidates(
    candidates: &[&EnrichedToolkit],
    already_connected: &[String],
    max: usize,
) -> RecommendResult {
    let connected = lower_set(already_connected);
    let entries: Vec<StackEntry> = candidates
        .iter()
        .take(max)
        .map(|t| StackEntry {
            toolkit: t.slug.clone(),
            name: t.name.clone(),
            role: t.primary_category.clone(),
            reason: t.one_liner.clone(),
            connected: connected.contains(&t.slug),
            logo_url: t.logo_url.clone(),
        })
        .collect();

    let alternatives = candidates
        .iter()
        .take(max)
        .filter(|t| !t.alternatives.is_empty())
        .map(|t| (t.slug.clone(), t.alternatives.clone()))
        .collect();

    RecommendResult {
        primary_stack: entries,
        alternatives,
        missing_capabilities: Vec::new(),
        llm_picked: false,
    }
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

fn build_prompt(intent: &str, candidates: &[&EnrichedToolkit], already_connected: &[String]) -> String {
    // Compact JSON per candidate — only the fields the LLM needs.
    let cand_lines: Vec<String> = candidates
        .iter()
        .map(|t| {
            let entry = serde_json::json!({
                "slug": t.slug,
                "name": t.name,
                "oneLiner": t.one_liner,
                "useCases": t.use_cases,
                "primaryCategory": t.primary_category,
                "alternatives": t.alternatives,
            });
            entry.to_string()
        })
        .collect();

    let connected_str = if already_connected.is_empty() {
        "(none)".to_string()
    } else {
        already_connected.join(", ")
    };

    format!(
        "You are picking the right tools for a non-technical user.\n\n\
         Their goal: {intent}\n\n\
         Tools they ALREADY have connected: {connected_str}\n\n\
         Candidate tools (pre-filtered, JSON one per line):\n{candidates}\n\n\
         Pick 2-6 tools that together solve the user's goal. Prefer tools\n\
         they already have connected over new ones when equivalent.\n\
         Each entry: role = the job this tool does in this workflow, reason\n\
         = one short sentence tied to the user's actual goal (not marketing).\n\
         Use the exact `slug` from the candidates — never invent slugs.\n\
         If the candidates cannot solve part of the goal, list it under\n\
         `missingCapabilities` in plain language.\n\n\
         Return ONLY valid JSON, no markdown fences:\n\
         {{\n  \"primaryStack\": [{{\"toolkit\": \"slug\", \"role\": \"...\", \"reason\": \"...\"}}],\n  \"alternatives\": {{\"slug\": [\"alt_slug\", ...]}},\n  \"missingCapabilities\": [\"plain-language phrase\", ...]\n}}",
        intent = intent.trim(),
        connected_str = connected_str,
        candidates = cand_lines.join("\n"),
    )
}

// ---------------------------------------------------------------------------
// Provider invocation (mirrors sessions::summarize)
// ---------------------------------------------------------------------------

async fn run_provider(prompt: &str, provider: Provider) -> Result<String, String> {
    match provider {
        Provider::Anthropic => run_claude(prompt).await,
        Provider::OpenAI => run_codex(prompt).await,
    }
}

async fn run_claude(prompt: &str) -> Result<String, String> {
    let mut cmd = Command::new("claude");
    cmd.env("PATH", claude_path::shell_path());
    cmd.env_remove("CLAUDE_CODE_ENTRYPOINT");
    cmd.env_remove("CLAUDECODE");
    cmd.arg("-p")
        .arg("--model")
        .arg(CLAUDE_PICK_MODEL)
        .arg("--output-format")
        .arg("text")
        .arg("--allowedTools")
        .arg("");
    run_with_prompt(cmd, prompt).await
}

async fn run_codex(prompt: &str) -> Result<String, String> {
    let bin = houston_cli_bundle::bundled_codex_path()
        .unwrap_or_else(|| std::path::PathBuf::from("codex"));
    let mut cmd = Command::new(&bin);
    cmd.env("PATH", claude_path::shell_path());
    cmd.arg("exec")
        .arg("--json")
        .arg("--dangerously-bypass-approvals-and-sandbox")
        .arg("--skip-git-repo-check")
        .arg("-c")
        .arg("model_reasoning_effort=\"low\"")
        .arg("--model")
        .arg(CODEX_PICK_MODEL)
        .arg("-");
    let stdout = run_with_prompt(cmd, prompt).await?;
    extract_codex_text(&stdout)
}

async fn run_with_prompt(mut cmd: Command, prompt: &str) -> Result<String, String> {
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

    let output = match timeout(PICK_TIMEOUT, child.wait_with_output()).await {
        Ok(Ok(o)) => o,
        Ok(Err(e)) => return Err(format!("process failed: {e}")),
        Err(_) => return Err("process timed out".to_string()),
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let trimmed: String = stderr.chars().take(200).collect();
        return Err(format!("process exited {}: {trimmed}", output.status));
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

// ---------------------------------------------------------------------------
// Parse + materialize
// ---------------------------------------------------------------------------

fn parse_response(raw: &str) -> Result<PickResponse, String> {
    let trimmed = raw.trim();
    // Strip markdown fences if the model wrapped its output.
    let cleaned = if let Some(rest) = trimmed.strip_prefix("```json") {
        rest.trim_start().trim_end_matches("```").trim()
    } else if let Some(rest) = trimmed.strip_prefix("```") {
        rest.trim_start().trim_end_matches("```").trim()
    } else {
        trimmed
    };
    serde_json::from_str::<PickResponse>(cleaned).map_err(|e| format!("invalid JSON: {e}"))
}

fn materialize(
    parsed: PickResponse,
    candidates: &[&EnrichedToolkit],
    already_connected: &[String],
) -> RecommendResult {
    let connected = lower_set(already_connected);
    let cand_slugs: std::collections::HashSet<&str> =
        candidates.iter().map(|t| t.slug.as_str()).collect();

    let mut stack = Vec::new();
    for picked in parsed.primary_stack {
        let slug = picked.toolkit.trim().to_lowercase();
        // Discard hallucinated slugs — only accept ones the LLM was
        // shown in the candidate list, or known to the catalog.
        if !cand_slugs.contains(slug.as_str()) && catalog::find(&slug).is_none() {
            tracing::warn!(slug = %slug, "recommender skipped hallucinated slug");
            continue;
        }
        let tk = candidates
            .iter()
            .find(|t| t.slug == slug)
            .copied()
            .or_else(|| catalog::find(&slug));
        let Some(tk) = tk else { continue };
        stack.push(StackEntry {
            toolkit: tk.slug.clone(),
            name: tk.name.clone(),
            role: pick_or_default(&picked.role, &tk.primary_category),
            reason: pick_or_default(&picked.reason, &tk.one_liner),
            connected: connected.contains(&tk.slug),
            logo_url: tk.logo_url.clone(),
        });
    }

    // Sanitize alternatives map: lowercase keys, drop unknown slugs.
    let mut alternatives = BTreeMap::new();
    for (k, vs) in parsed.alternatives {
        let key = k.trim().to_lowercase();
        if key.is_empty() {
            continue;
        }
        let cleaned: Vec<String> = vs
            .into_iter()
            .map(|s| s.trim().to_lowercase())
            .filter(|s| !s.is_empty() && catalog::find(s).is_some())
            .collect();
        if !cleaned.is_empty() {
            alternatives.insert(key, cleaned);
        }
    }

    RecommendResult {
        primary_stack: stack,
        alternatives,
        missing_capabilities: parsed
            .missing_capabilities
            .into_iter()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect(),
        llm_picked: true,
    }
}

fn pick_or_default(picked: &str, fallback: &str) -> String {
    if picked.trim().is_empty() {
        fallback.to_string()
    } else {
        picked.trim().to_string()
    }
}

fn lower_set(slugs: &[String]) -> std::collections::HashSet<String> {
    slugs.iter().map(|s| s.trim().to_lowercase()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_response_strips_markdown_fences() {
        let raw = "```json\n{\"primaryStack\":[],\"alternatives\":{},\"missingCapabilities\":[]}\n```";
        let parsed = parse_response(raw).unwrap();
        assert!(parsed.primary_stack.is_empty());
    }

    #[test]
    fn materialize_drops_hallucinated_slugs() {
        let known = EnrichedToolkit {
            slug: "slack".into(),
            name: "Slack".into(),
            description: String::new(),
            logo_url: "https://logo".into(),
            categories: vec![],
            one_liner: "Team chat.".into(),
            use_cases: vec![],
            keywords: vec![],
            typical_combos: vec![],
            alternatives: vec![],
            pricing_tier: "freemium".into(),
            primary_category: "communication".into(),
            enrichment_failed: false,
        };
        let candidates = vec![&known];
        let parsed = PickResponse {
            primary_stack: vec![
                PickedStackEntry {
                    toolkit: "slack".into(),
                    role: "notify team".into(),
                    reason: "Team chat".into(),
                },
                PickedStackEntry {
                    toolkit: "imaginary-tool".into(),
                    role: "fake".into(),
                    reason: "fake".into(),
                },
            ],
            alternatives: BTreeMap::new(),
            missing_capabilities: vec![],
        };
        let result = materialize(parsed, &candidates, &[]);
        assert_eq!(result.primary_stack.len(), 1);
        assert_eq!(result.primary_stack[0].toolkit, "slack");
    }

    #[test]
    fn fallback_uses_one_liner_as_reason() {
        let tk = EnrichedToolkit {
            slug: "stripe".into(),
            name: "Stripe".into(),
            description: String::new(),
            logo_url: "https://logo".into(),
            categories: vec![],
            one_liner: "Payments.".into(),
            use_cases: vec![],
            keywords: vec![],
            typical_combos: vec![],
            alternatives: vec!["paddle".into()],
            pricing_tier: "freemium".into(),
            primary_category: "payment".into(),
            enrichment_failed: false,
        };
        let cands = vec![&tk];
        let r = fallback_from_candidates(&cands, &["stripe".into()], 5);
        assert!(!r.llm_picked);
        assert_eq!(r.primary_stack[0].reason, "Payments.");
        assert!(r.primary_stack[0].connected);
        assert_eq!(r.alternatives.get("stripe").unwrap(), &vec!["paddle".to_string()]);
    }
}
