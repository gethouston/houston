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
/// and gives us a JSON object in well under the 30s SUMMARY_TIMEOUT.
const GEMINI_TITLE_MODEL: &str = "gemini-3.1-flash-lite";
/// OpenRouter title-summary model — a cheap open-source slug. If the account
/// can't reach it the summarize call falls back to the deterministic local
/// title, so a stale slug degrades gracefully rather than erroring.
const OPENROUTER_TITLE_MODEL: &str = "deepseek/deepseek-chat";

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

/// Pick the default title-summary model for a provider, honoring an
/// explicit override. Returns `None` for providers we haven't wired a
/// default model for — the caller treats that as "fall back to the
/// deterministic local title" rather than spawning a CLI we can't drive.
fn default_title_model<'a>(provider: Provider, model_override: Option<&'a str>) -> Option<&'a str> {
    let default = match provider.id() {
        "anthropic" => CLAUDE_TITLE_MODEL,
        "openai" => CODEX_TITLE_MODEL,
        "openrouter" => OPENROUTER_TITLE_MODEL,
        "gemini" => GEMINI_TITLE_MODEL,
        _ => return None,
    };
    Some(model_override.unwrap_or(default))
}

async fn run_provider_summary(
    message: &str,
    provider: Provider,
    model: Option<&str>,
) -> Result<String, String> {
    let prompt = title_prompt(message);
    let model = default_title_model(provider, model).ok_or_else(|| {
        format!("no title model wired up for provider {:?}", provider.id())
    })?;
    provider_oneshot::run_provider_oneshot(&prompt, provider, model, SUMMARY_TIMEOUT)
        .await
        .map_err(|e| truncate_chars(&normalize_spaces(&e), DESCRIPTION_MAX_CHARS))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_title_model_picks_per_provider() {
        let a: Provider = "anthropic".parse().unwrap();
        let o: Provider = "openai".parse().unwrap();
        let g: Provider = "gemini".parse().unwrap();
        assert_eq!(default_title_model(a, None), Some(CLAUDE_TITLE_MODEL));
        assert_eq!(default_title_model(o, None), Some(CODEX_TITLE_MODEL));
        assert_eq!(default_title_model(g, None), Some(GEMINI_TITLE_MODEL));
    }

    #[test]
    fn default_title_model_respects_override() {
        let a: Provider = "anthropic".parse().unwrap();
        assert_eq!(default_title_model(a, Some("sonnet")), Some("sonnet"));
        let g: Provider = "gemini".parse().unwrap();
        assert_eq!(
            default_title_model(g, Some("gemini-3.1-pro")),
            Some("gemini-3.1-pro")
        );
    }

    #[test]
    fn title_prompt_includes_user_message_and_format_hints() {
        let p = title_prompt("Fix the login bug");
        assert!(p.contains("Fix the login bug"));
        assert!(p.contains("max 6 words"));
        assert!(p.contains("\"title\""));
        assert!(p.contains("\"description\""));
    }
}
