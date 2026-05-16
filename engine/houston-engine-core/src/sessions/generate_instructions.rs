//! AI-assisted agent instruction generator.
//!
//! Shells out to the user's configured provider CLI to generate CLAUDE.md
//! content and a list of suggested Composio integrations from a user-supplied
//! agent description. Unlike `summarize`, failures surface as `CoreError` so
//! the caller can show a toast — there is no silent fallback.

use super::provider_oneshot;
use crate::error::CoreResult;
use houston_terminal_manager::Provider;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

const GENERATE_TIMEOUT: Duration = Duration::from_secs(60);
const CLAUDE_GEN_MODEL: &str = "sonnet";
const CODEX_GEN_MODEL: &str = "gpt-4.1";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateInstructionsResult {
    pub name: String,
    pub instructions: String,
    pub suggested_integrations: Vec<String>,
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
    format!(
        r#"You are an expert at writing AI agent job descriptions (CLAUDE.md files).

Generate a CLAUDE.md job description for an AI agent based on this description:
"{description}"

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
- 1-4 relevant Composio integrations (toolkit names) that this agent would benefit from.
Common toolkits: GMAIL, GOOGLECALENDAR, GOOGLESHEETS, GOOGLEDOCS, SLACK, NOTION, GITHUB, JIRA, TRELLO, ASANA, HUBSPOT, SALESFORCE, SHOPIFY, STRIPE, TWITTER, LINKEDIN, DISCORD, AIRTABLE, EXCEL, GOOGLEDRIVE

Return ONLY valid JSON (no markdown fences):
{{"name": "...", "instructions": "...", "suggestedIntegrations": ["TOOLKIT1", "TOOLKIT2"]}}"#
    )
}

async fn run_provider_generate(
    description: &str,
    provider: Provider,
    model: Option<&str>,
) -> Result<String, String> {
    let prompt = build_prompt(description);
    let model = match provider {
        Provider::Anthropic => model.unwrap_or(CLAUDE_GEN_MODEL),
        Provider::OpenAI => model.unwrap_or(CODEX_GEN_MODEL),
    };
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
}
