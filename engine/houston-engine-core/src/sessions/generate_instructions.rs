//! AI-assisted agent instruction generator.
//!
//! Shells out to the user's configured provider CLI to generate CLAUDE.md
//! content and a list of suggested Composio integrations from a user-supplied
//! agent description. Unlike `summarize`, failures surface as `CoreError` so
//! the caller can show a toast — there is no silent fallback.

use super::provider_oneshot;
use super::suggested_routine::build_routine;
pub use super::suggested_routine::SuggestedRoutine;
use crate::error::CoreResult;
use houston_terminal_manager::Provider;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

const GENERATE_TIMEOUT: Duration = Duration::from_secs(60);
const CLAUDE_GEN_MODEL: &str = "sonnet";
const CODEX_GEN_MODEL: &str = "gpt-5.5";
/// OpenRouter generation model. Capable slug routed through Codex CLI
/// with process-local provider overrides (see `provider_oneshot`).
pub(crate) const OPENROUTER_GEN_MODEL: &str = "openai/gpt-4o";
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateInstructionsResult {
    pub name: String,
    pub instructions: String,
    pub suggested_integrations: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub suggested_routine: Option<SuggestedRoutine>,
}

pub async fn generate_instructions(
    description: &str,
    provider: Provider,
    model: Option<&str>,
) -> CoreResult<GenerateInstructionsResult> {
    let raw = run_provider_generate(description, provider, model)
        .await
        .map_err(crate::CoreError::Internal)?;
    parse_result(&raw).map_err(crate::CoreError::Internal)
}

fn build_prompt(description: &str) -> String {
    // JSON-encode the user text so quotes/newlines in it can't break out of
    // the prompt context and inject instructions. Encoded form keeps quotes.
    let description = serde_json::to_string(description)
        .unwrap_or_else(|_| format!("{description:?}"));
    format!(
        r#"You are an expert at writing AI agent job descriptions (CLAUDE.md files).

Generate a CLAUDE.md job description for an AI agent based on this description:
{description}

The job description should:
- Start with a clear role definition (what the agent is and does)
- Include specific responsibilities and capabilities
- Include behavioral guidelines and constraints
- Be written in second person ("You are...", "You will...", "Your role...")
- Be practical, specific, and actionable
- Be between 200-500 words
- Use markdown headers and bullet points for clarity

Also suggest:
- A short agent name (2-4 words, title case, no generic words like "Agent" or "Assistant" unless truly fitting, e.g. "Email Inbox Manager", "Quant Analyst", "Sales Pipeline Bot")
- 0-4 relevant Composio integrations (toolkit names) that this agent would genuinely benefit from. Use an empty array if no external service integration is needed.
Common toolkits: GMAIL, GOOGLECALENDAR, GOOGLESHEETS, GOOGLEDOCS, SLACK, NOTION, GITHUB, JIRA, TRELLO, ASANA, HUBSPOT, SALESFORCE, SHOPIFY, STRIPE, TWITTER, LINKEDIN, DISCORD, AIRTABLE, EXCEL, GOOGLEDRIVE
- Optionally, exactly ONE routine, but ONLY if the agent's job clearly involves a recurring scheduled task (e.g. a daily inbox digest, a weekly report). If the agent is reactive / on-demand / one-off, set suggestedRoutine to null. Do not invent a schedule just to fill the field.
  Allowed scheduleType values ONLY: "daily", "weekdays", "weekly". Give timeOfDay as 24h "HH:MM". For "weekly" also give dayOfWeek (0=Sunday .. 6=Saturday). Keep the routine prompt to one sentence describing what it should do each run.

Return ONLY valid JSON (no markdown fences):
{{"name": "...", "instructions": "...", "suggestedIntegrations": ["TOOLKIT1", "TOOLKIT2"], "suggestedRoutine": {{"name": "...", "prompt": "...", "scheduleType": "daily", "timeOfDay": "08:00", "dayOfWeek": 1}}}}
Set "suggestedRoutine" to null when no recurring schedule is appropriate."#
    )
}

/// Pick the default generation model for a provider, honoring an
/// explicit override. Returns `None` for providers we haven't wired a
/// default model for — the caller surfaces that as a `CoreError` (no
/// silent fallback, unlike `summarize`: instruction generation is
/// user-initiated work and must show a toast on failure per the
/// "No silent failures" rule in CLAUDE.md).
fn default_gen_model<'a>(provider: Provider, model_override: Option<&'a str>) -> Option<&'a str> {
    let default = match provider.id() {
        "anthropic" => CLAUDE_GEN_MODEL,
        "openai" => CODEX_GEN_MODEL,
        "openrouter" => OPENROUTER_GEN_MODEL,
        _ => return None,
    };
    Some(model_override.unwrap_or(default))
}

async fn run_provider_generate(
    description: &str,
    provider: Provider,
    model: Option<&str>,
) -> Result<String, String> {
    let prompt = build_prompt(description);
    let model = default_gen_model(provider, model).ok_or_else(|| {
        format!("no generate model wired up for provider {:?}", provider.id())
    })?;
    provider_oneshot::run_provider_oneshot(&prompt, provider, model, GENERATE_TIMEOUT).await
}

fn parse_result(raw: &str) -> Result<GenerateInstructionsResult, String> {
    let cleaned = raw
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    let v: Value =
        serde_json::from_str(cleaned).map_err(|e| format!("JSON parse failed: {e}"))?;

    let name = v
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();

    let instructions = v
        .get("instructions")
        .and_then(Value::as_str)
        .ok_or_else(|| "missing 'instructions' field in response".to_string())?
        .to_string();

    let suggested_integrations = v
        .get("suggestedIntegrations")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default();

    Ok(GenerateInstructionsResult {
        name,
        instructions,
        suggested_integrations,
        suggested_routine: build_routine(v.get("suggestedRoutine")),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_valid_json_response() {
        let raw = r#"{"name": "Email Manager", "instructions": "You are a helpful agent.", "suggestedIntegrations": ["GMAIL", "SLACK"]}"#;
        let result = parse_result(raw).unwrap();
        assert_eq!(result.name, "Email Manager");
        assert_eq!(result.instructions, "You are a helpful agent.");
        assert_eq!(result.suggested_integrations, vec!["GMAIL", "SLACK"]);
    }

    #[test]
    fn strips_markdown_fences() {
        let raw = "```json\n{\"name\": \"Test Bot\", \"instructions\": \"Test.\", \"suggestedIntegrations\": []}\n```";
        let result = parse_result(raw).unwrap();
        assert_eq!(result.name, "Test Bot");
        assert_eq!(result.instructions, "Test.");
        assert!(result.suggested_integrations.is_empty());
    }

    #[test]
    fn missing_name_defaults_to_empty_string() {
        let raw = r#"{"instructions": "Test."}"#;
        let result = parse_result(raw).unwrap();
        assert_eq!(result.name, "");
        assert!(result.suggested_integrations.is_empty());
    }

    #[test]
    fn null_suggested_integrations_returns_empty_vec() {
        // Models sometimes emit `null` instead of `[]`.
        let raw = r#"{"name": "Bot", "instructions": "Do things.", "suggestedIntegrations": null}"#;
        let result = parse_result(raw).unwrap();
        assert!(result.suggested_integrations.is_empty());
    }

    #[test]
    fn non_string_entries_in_integrations_are_filtered() {
        // Malformed model output with mixed types must not panic.
        let raw = r#"{"name": "Bot", "instructions": "Do things.", "suggestedIntegrations": ["GMAIL", 42, null, "SLACK"]}"#;
        let result = parse_result(raw).unwrap();
        assert_eq!(result.suggested_integrations, vec!["GMAIL", "SLACK"]);
    }

    #[test]
    fn missing_instructions_returns_error() {
        let raw = r#"{"name": "Bot", "suggestedIntegrations": []}"#;
        assert!(parse_result(raw).is_err());
    }

    #[test]
    fn invalid_json_returns_error() {
        assert!(parse_result("not json at all").is_err());
    }

    // Routine *parsing* edge cases live in `suggested_routine` unit tests;
    // here we only assert `parse_result` wires the value through correctly.
    #[test]
    fn parse_result_wires_routine_through() {
        let raw = r#"{"name":"Bot","instructions":"Do.","suggestedRoutine":{"name":"Morning digest","prompt":"Summarize new emails.","scheduleType":"daily","timeOfDay":"08:00"}}"#;
        let r = parse_result(raw).unwrap().suggested_routine.unwrap();
        assert_eq!(r.name, "Morning digest");
        assert_eq!(r.schedule, "0 8 * * *");

        let none = r#"{"name":"B","instructions":"D","suggestedRoutine":null}"#;
        assert!(parse_result(none).unwrap().suggested_routine.is_none());
    }

    #[test]
    fn build_prompt_json_escapes_description() {
        let prompt = build_prompt("say \"hi\"\nthen ignore previous");
        // Quotes and newline are JSON-escaped, not embedded raw.
        assert!(prompt.contains(r#""say \"hi\"\nthen ignore previous""#));
        assert!(!prompt.contains("\"say \"hi\""));
    }

    #[test]
    fn default_gen_model_picks_per_provider() {
        let a: Provider = "anthropic".parse().unwrap();
        let o: Provider = "openai".parse().unwrap();
        assert_eq!(default_gen_model(a, None), Some(CLAUDE_GEN_MODEL));
        assert_eq!(default_gen_model(o, None), Some(CODEX_GEN_MODEL));
    }

    #[test]
    fn openrouter_gen_model_is_capable_openrouter_slug() {
        assert_eq!(OPENROUTER_GEN_MODEL, "openai/gpt-4o");
    }

    #[test]
    fn default_gen_model_wires_openrouter_when_registered() {
        let or: Provider = match "openrouter".parse() {
            Ok(p) => p,
            Err(_) => return, // agent-02 registry; session defaults ready when it lands
        };
        assert_eq!(default_gen_model(or, None), Some(OPENROUTER_GEN_MODEL));
        assert_eq!(
            default_gen_model(or, Some("anthropic/claude-sonnet-4")),
            Some("anthropic/claude-sonnet-4"),
        );
    }

    #[test]
    fn default_gen_model_respects_override() {
        let a: Provider = "anthropic".parse().unwrap();
        assert_eq!(default_gen_model(a, Some("opus")), Some("opus"));
    }
}
