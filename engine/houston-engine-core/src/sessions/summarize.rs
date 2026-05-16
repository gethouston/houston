//! Activity summarizer — relocated from `app/src-tauri/src/commands/chat.rs`.
//!
//! Shells out to the user's configured provider CLI to generate a concise
//! `{title, description}` JSON object. Failures degrade to a deterministic
//! local title so conversation creation never depends on title generation.

use super::provider_oneshot;
use super::summary_text::{
    fallback_summary, normalize_spaces, parse_summary, truncate_chars, DESCRIPTION_MAX_CHARS,
};
use crate::error::CoreResult;
use houston_terminal_manager::Provider;
use std::time::Duration;

const SUMMARY_TIMEOUT: Duration = Duration::from_secs(12);
const CLAUDE_TITLE_MODEL: &str = "haiku";
const CODEX_TITLE_MODEL: &str = "gpt-5.5-mini";

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
    format!(
        "Generate a concise title and description for this conversation.\n\
         Title: max 6 words. Description: one short sentence.\n\
         Return ONLY valid JSON, no markdown fences:\n\
         {{\"title\": \"...\", \"description\": \"...\"}}\n\n\
         Task: {message}"
    )
}

async fn run_provider_summary(
    message: &str,
    provider: Provider,
    model: Option<&str>,
) -> Result<String, String> {
    let prompt = title_prompt(message);
    let model = match provider {
        Provider::Anthropic => model.unwrap_or(CLAUDE_TITLE_MODEL),
        Provider::OpenAI => model.unwrap_or(CODEX_TITLE_MODEL),
    };
    provider_oneshot::run_provider_oneshot(&prompt, provider, model, SUMMARY_TIMEOUT)
        .await
        .map_err(|e| truncate_chars(&normalize_spaces(&e), DESCRIPTION_MAX_CHARS))
}
