//! LLM-pick step — reasoning-first pipeline (V1.6).
//!
//! Two entry points:
//!
//! 1. [`decompose_and_pick`] (V1.6, the primary path) — single LLM
//!    call that decomposes the user intent into sub-tasks AND suggests
//!    concrete app slugs for each, using the LLM's own knowledge of
//!    the software landscape. We do NOT hand it a pre-filtered
//!    candidate list — the LLM names apps directly (github, gmail,
//!    trello, firecrawl, …) because it already knows them. The caller
//!    then validates each slug against the bundled catalog, falling
//!    back to embedding-search only when the LLM hallucinates a slug.
//!
//! 2. [`pick`] (V1.5, retained for backwards compat) — older retrieval-
//!    first path that hands a top-K candidate list to the LLM and asks
//!    it to filter. Kept for testing/comparison; not used in the live
//!    pipeline anymore.
//!
//! Why reasoning-first wins: the LLM knows that "review my code" needs
//! GitHub and "research new tools" needs Tavily/Firecrawl, even when
//! those words don't cosine-match the user's intent. Embedding
//! retrieval drops 30-50% of relevant tools on abstract intents;
//! reasoning catches them.
//!
//! Failure-mode philosophy: if the CLI is missing, errors out, times
//! out, or returns garbage, the caller falls back to a deterministic
//! result so the UX never hangs.

use super::banlist::is_banned_app;
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

/// 90s upper bound for the provider CLI call. Empirically the
/// multi-step prompt (with sub-task decomposition + 20-30 candidate
/// JSON entries) takes 20-45s on `claude -p --model haiku` end-to-end
/// when the user's home network is healthy; we add headroom for slow
/// links and rare model latency spikes. Beyond 90s we fall back to
/// the deterministic top-K stack so the UX never hangs.
const PICK_TIMEOUT: Duration = Duration::from_secs(90);
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

/// One sub-task identified by the reasoning LLM, with the apps it
/// thinks solve that sub-task. `suggested_slugs` is in priority order
/// (most popular / most likely to exist in Composio catalog first).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecomposedSubtask {
    pub description: String,
    #[serde(default)]
    pub suggested_slugs: Vec<String>,
    #[serde(default)]
    pub role: String,
    #[serde(default)]
    pub reason: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DecomposeResponse {
    #[serde(default)]
    subtasks: Vec<DecomposedSubtask>,
    #[serde(default)]
    missing_capabilities: Vec<String>,
}

/// Outcome of a reasoning-first LLM call. Always carries timing + error
/// so the recommender debug payload can surface what happened, even on
/// timeout.
pub struct DecomposeOutcome {
    pub subtasks: Vec<DecomposedSubtask>,
    pub missing_capabilities: Vec<String>,
    pub elapsed_ms: u64,
    pub error: Option<String>,
}

/// Result of an LLM pick attempt. Always returns timing + error info
/// so the caller can populate the debug payload even on failure.
pub struct PickOutcome {
    pub result: Option<RecommendResult>,
    pub elapsed_ms: u64,
    pub error: Option<String>,
}

// =========================================================================
// V1.6 — Reasoning-first decomposition path
// =========================================================================

/// Ask the LLM to decompose the intent into sub-tasks and suggest
/// concrete app slugs for each. Returns the raw decomposition; the
/// caller validates slugs against the catalog and falls back to
/// embedding-search for any slug the LLM hallucinated.
///
/// Single round-trip: no candidates passed in, no retrieval first.
/// The LLM uses its own world knowledge to name apps directly.
pub async fn decompose_and_pick(
    intent: &str,
    already_connected: &[String],
    provider: Provider,
) -> DecomposeOutcome {
    let prompt = build_decompose_prompt(intent, already_connected);
    let call_start = std::time::Instant::now();
    let raw = match run_provider(&prompt, provider).await {
        Ok(text) => {
            let ms = call_start.elapsed().as_millis() as u64;
            tracing::info!(
                provider = %provider,
                ms,
                response_len = text.len(),
                "recommender: decompose_and_pick returned"
            );
            text
        }
        Err(e) => {
            let ms = call_start.elapsed().as_millis() as u64;
            tracing::warn!(
                provider = %provider,
                ms,
                error = %e,
                "recommender: decompose_and_pick failed"
            );
            return DecomposeOutcome {
                subtasks: Vec::new(),
                missing_capabilities: Vec::new(),
                elapsed_ms: ms,
                error: Some(e),
            };
        }
    };
    let elapsed_ms = call_start.elapsed().as_millis() as u64;

    let parsed = match parse_decompose_response(&raw) {
        Ok(p) => p,
        Err(e) => {
            tracing::warn!(error = %e, "recommender: decompose parse failed");
            return DecomposeOutcome {
                subtasks: Vec::new(),
                missing_capabilities: Vec::new(),
                elapsed_ms,
                error: Some(format!("parse failed: {e}")),
            };
        }
    };

    DecomposeOutcome {
        subtasks: parsed.subtasks,
        missing_capabilities: parsed.missing_capabilities,
        elapsed_ms,
        error: None,
    }
}

fn build_decompose_prompt(intent: &str, already_connected: &[String]) -> String {
    let connected_str = if already_connected.is_empty() {
        "(none)".to_string()
    } else {
        already_connected.join(", ")
    };

    format!(
        "You are an expert at picking software integration stacks for non-technical users. You have deep knowledge of 1000+ SaaS apps and their categories — use that knowledge to suggest concrete app slugs directly.\n\n\
         === CRITICAL CONTEXT ===\n\
         The host application IS an AI assistant. It already reasons, analyzes, classifies, summarizes, decides, and generates text. You are picking EXTERNAL data sources, action endpoints, and side-effect destinations — NOT a brain. The host is the brain.\n\n\
         === USER GOAL ===\n\
         {intent}\n\n\
         === APPS THEY ALREADY HAVE CONNECTED ===\n\
         {connected_str}\n\n\
         === HOW TO REASON ===\n\
         STEP 1 — Decompose the goal into INDEPENDENT sub-tasks. Many intents chain multiple actions: \"review my code AND research new tools AND create tasks in Trello\" is THREE sub-tasks. Identify EVERY part — don't drop any sub-task even if it sounds minor.\n\n\
         STEP 1B — For sub-tasks where SEVERAL sources together give a better result than one (e.g. \"discover new dev tools\" benefits from GitHub Trending + ProductHunt + Hacker News as complementary signals), split that sub-task into ONE sub-task PER SOURCE. Each gets its own description naming the specific angle (\"discover new dev tools via community votes\" vs \"discover new dev tools via hacker news front page\"). Do NOT pack complementary sources into a single sub-task's suggestedSlugs — those slots are for FALLBACKS of the same role, not complements.\n\n\
         STEP 2 — For each sub-task, suggest 2-4 concrete app slugs (lowercase, hyphens or underscores) that solve it, in priority order. Slot 1 = primary choice. Slots 2-4 = fallbacks of the SAME role (in case slot 1 isn't in our catalog). Examples by capability:\n\
         - code-hosting / code review: github, gitlab, bitbucket\n\
         - web research / scraping: tavily, firecrawl, apify, exa, brave_search, perplexityai\n\
         - email: gmail, outlook, resend\n\
         - chat / team notifications: slack, microsoft-teams, discord\n\
         - mobile push notifications: pushover, ntfy\n\
         - WhatsApp messaging: whatsapp, twilio, msg91\n\
         - task management: trello, asana, linear, jira, notion, clickup, monday\n\
         - calendar: googlecalendar, outlook-calendar\n\
         - file storage: googledrive, dropbox, onedrive\n\
         - CRM: hubspot, salesforce, pipedrive\n\
         - payments: stripe, paddle\n\
         - accounting: xero, quickbooks\n\
         - forms: tally, typeform, googleforms\n\
         - analytics: posthog, mixpanel, amplitude, plausible_analytics\n\
         - design: figma\n\
         - product discovery / tech news: producthunt, hacker-news, github (trending)\n\
         These are examples, not an exhaustive list. Use the best app you know for each sub-task.\n\n\
         STEP 3 — Prefer apps the user already has connected when equivalent.\n\n\
         STEP 4 — NEVER suggest any of these slugs (hard rule, no exceptions):\n\
         (a) Generic automation orchestrators — the host has native scheduling and routines, so these are redundant:\n\
             make, make_com, zapier, n8n, workato, pipedream, ifttt, integromat, automatisch, kit, promptmate, promptmate_io.\n\
         (b) Generic LLM API providers — the host IS the LLM, so wiring it to call another LLM is redundant and confusing:\n\
             openai, anthropic, gemini, google_ai, googleai, cohere, mistral_ai, mistralai, togetherai, together_ai, groq, replicate.\n\
         If a sub-task sounds like \"use AI to decide/classify/analyze/summarize/judge\", it does NOT need an app at all — the host does that natively. Drop those sub-tasks; do not list a missingCapability either.\n\n\
         STEP 5 — Apps in the SAME category, two patterns:\n\
         (a) OVERLAP (same thing, different vendor — e.g. 3 task managers, 2 WhatsApp clones): pick ONE for the primary slot and put the rest in subsequent suggestedSlugs slots as fallbacks. They cover the same role.\n\
         (b) COMPLEMENT (different angle on the same goal — e.g. ProductHunt + Hacker News + GitHub Trending all surface NEW dev tools but from different communities, so using all three gives wider coverage): create ONE sub-task per source (see STEP 1B). Each sub-task has its own primary slug.\n\n\
         STEP 6 — If a sub-task genuinely has NO good tool available (e.g. \"hire a human consultant\"), put it in missingCapabilities instead of suggesting a tool.\n\n\
         === EXAMPLE ===\n\
         Goal: \"create trello tasks based on new tools that come out and could improve my code or my app\"\n\
         Good decomposition (4 sub-tasks — note the multi-source split):\n\
         - {{ description: \"surface new dev tools from product communities\", suggestedSlugs: [\"producthunt\"], role: \"product discovery\", reason: \"...\" }}\n\
         - {{ description: \"surface new dev tools from hacker news front page\", suggestedSlugs: [\"hacker-news\"], role: \"tech news source\", reason: \"...\" }}\n\
         - {{ description: \"surface trending open-source repositories\", suggestedSlugs: [\"github\"], role: \"trending repos\", reason: \"...\" }}\n\
         - {{ description: \"create a task per shortlisted tool\", suggestedSlugs: [\"trello\"], role: \"task creation\", reason: \"...\" }}\n\
         NOTE: there is NO \"analyze with AI\" sub-task — the host does that itself.\n\n\
         === OUTPUT ===\n\
         Return ONLY valid JSON, no markdown fences:\n\
         {{\n\
           \"subtasks\": [\n\
             {{\n\
               \"description\": \"short phrase in the user's language describing what this sub-task does\",\n\
               \"suggestedSlugs\": [\"slug1\", \"slug2\", \"slug3\"],\n\
               \"role\": \"specific role in the workflow (e.g. 'code source', 'web research', 'task creation')\",\n\
               \"reason\": \"one-sentence justification tied to the user's goal, in the user's language\"\n\
             }}\n\
           ],\n\
           \"missingCapabilities\": [\"plain-language phrase in user's language\", ...]\n\
         }}",
        intent = intent.trim(),
        connected_str = connected_str,
    )
}

fn parse_decompose_response(raw: &str) -> Result<DecomposeResponse, String> {
    let trimmed = raw.trim();
    let cleaned = if let Some(rest) = trimmed.strip_prefix("```json") {
        rest.trim_start().trim_end_matches("```").trim()
    } else if let Some(rest) = trimmed.strip_prefix("```") {
        rest.trim_start().trim_end_matches("```").trim()
    } else {
        trimmed
    };
    serde_json::from_str::<DecomposeResponse>(cleaned).map_err(|e| format!("invalid JSON: {e}"))
}

/// Build a recommendation by calling the user's provider CLI. The
/// outcome always carries timing + error info even on failure so the
/// recommender debug payload can surface what went wrong.
pub async fn pick(
    intent: &str,
    candidates: &[&EnrichedToolkit],
    already_connected: &[String],
    provider: Provider,
) -> PickOutcome {
    if candidates.is_empty() {
        return PickOutcome {
            result: None,
            elapsed_ms: 0,
            error: Some("no candidates to pick from".into()),
        };
    }

    let prompt = build_prompt(intent, candidates, already_connected);
    let call_start = std::time::Instant::now();
    let raw = match run_provider(&prompt, provider).await {
        Ok(text) => {
            let ms = call_start.elapsed().as_millis() as u64;
            tracing::info!(
                provider = %provider,
                ms,
                response_len = text.len(),
                "recommender: LLM pick returned"
            );
            text
        }
        Err(e) => {
            let ms = call_start.elapsed().as_millis() as u64;
            tracing::warn!(
                provider = %provider,
                ms,
                error = %e,
                "recommender: LLM pick failed → falling back to keyword top-K"
            );
            return PickOutcome {
                result: None,
                elapsed_ms: ms,
                error: Some(e),
            };
        }
    };
    let elapsed_ms = call_start.elapsed().as_millis() as u64;

    let parsed = match parse_response(&raw) {
        Ok(p) => p,
        Err(e) => {
            tracing::warn!(error = %e, "recommender LLM pick parse failed");
            return PickOutcome {
                result: None,
                elapsed_ms,
                error: Some(format!("parse failed: {e}")),
            };
        }
    };

    PickOutcome {
        result: Some(materialize(parsed, candidates, already_connected)),
        elapsed_ms,
        error: None,
    }
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
        debug: None,
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
         Candidate tools (pre-filtered by semantic relevance, JSON one per line):\n{candidates}\n\n\
         === HOW TO PICK ===\n\
         STEP 1 — Decompose the goal into INDEPENDENT sub-tasks. Many real intents\n\
         chain multiple actions: \"review my code AND research new tools AND create\n\
         tasks in Trello\" is THREE sub-tasks (code review, web research, task\n\
         creation), not one. Identify each one explicitly.\n\n\
         STEP 2 — For EACH sub-task, pick at least one toolkit from the candidates\n\
         that can perform it. Prefer toolkits the user already has connected when\n\
         equivalent. Aim for 2-6 toolkits total in the stack.\n\n\
         STEP 3 — DO NOT recommend these apps:\n\
         (a) Generic automation orchestrators (Make, Zapier, n8n, Workato,\n\
         Pipedream, IFTTT, Promptmate, Automatisch). The host has native scheduling\n\
         and routines — orchestrators are redundant.\n\
         (b) Generic LLM API providers (OpenAI, Anthropic, Gemini, Cohere, Mistral,\n\
         Together, Groq, Replicate). The host IS the LLM — wiring it to call another\n\
         LLM is redundant. If a sub-task is \"analyze with AI\" or \"classify with AI\",\n\
         drop it: the host already does that natively.\n\n\
         STEP 4 — DO NOT recommend redundant toolkits in the same category (e.g.\n\
         don't pick 3 different WhatsApp clones — pick the canonical one and list\n\
         the others under `alternatives`).\n\n\
         STEP 5 — If a sub-task has NO matching candidate, declare it in\n\
         `missingCapabilities` using plain language. Do NOT silently drop sub-tasks.\n\n\
         === OUTPUT RULES ===\n\
         - Use the exact `slug` from the candidates — never invent slugs.\n\
         - role = the SPECIFIC sub-task this toolkit covers (e.g. \"code source\",\n\
           \"web research\", \"task creation\"), not a generic category.\n\
         - reason = one short sentence tied to the user's actual goal, in the user's\n\
           language (Spanish, English, or Portuguese — match the intent's language).\n\
         - Order primaryStack by sub-task order in the goal, not by importance.\n\n\
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
    match provider.id() {
        "anthropic" => run_claude(prompt).await,
        "openai" => run_codex(prompt).await,
        other => Err(format!(
            "recommender does not yet support provider {other}"
        )),
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
        if is_banned_app(&slug) {
            tracing::warn!(slug = %slug, "recommender skipped banned app (orchestrator or LLM provider)");
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
        debug: None,
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
