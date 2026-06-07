//! Persist an Anthropic API key to `~/.houston/providers/anthropic/.env`.
//!
//! Legacy read: `~/.houston/anthropic/.env`. Advanced alternative to CLI OAuth.

use super::provider_env_store::{read_stored_api_key, set_api_key, strip_api_key_from_storage};
use crate::error::{CoreError, CoreResult};

pub const ENV_VAR: &str = "ANTHROPIC_API_KEY";
const PROVIDER: &str = "anthropic";

pub async fn set_anthropic_api_key(api_key: &str) -> CoreResult<()> {
    set_api_key(PROVIDER, ENV_VAR, api_key, validate_key).await
}

pub async fn read_anthropic_api_key() -> CoreResult<Option<String>> {
    read_stored_api_key(PROVIDER, ENV_VAR).await
}

fn validate_key(api_key: &str) -> CoreResult<&str> {
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        return Err(CoreError::BadRequest("API key cannot be empty".into()));
    }
    if trimmed.len() < 20 || trimmed.len() > 300 {
        return Err(CoreError::BadRequest(
            "API key length looks wrong. Anthropic keys are usually longer than 20 characters."
                .into(),
        ));
    }
    if trimmed.chars().any(|c| c.is_whitespace()) {
        return Err(CoreError::BadRequest(
            "API key cannot contain whitespace. Paste only the key value.".into(),
        ));
    }
    if trimmed.contains('"') || trimmed.contains('\'') {
        return Err(CoreError::BadRequest(
            "API key cannot contain quote characters. Paste the raw key value.".into(),
        ));
    }
    Ok(trimmed)
}

pub async fn strip_anthropic_api_key_storage() -> CoreResult<()> {
    strip_api_key_from_storage(PROVIDER, ENV_VAR).await
}

/// True when `~/.claude/.credentials.json` contains a non-empty OAuth access token.
pub fn claude_oauth_tokens_present() -> bool {
    let Some(home) = dirs::home_dir() else {
        return false;
    };
    let auth_path = home.join(".claude").join(".credentials.json");
    let Ok(content) = std::fs::read_to_string(&auth_path) else {
        return false;
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&content) else {
        return false;
    };
    value
        .get("claudeAiOauth")
        .and_then(|oauth| oauth.get("accessToken"))
        .and_then(|token| token.as_str())
        .is_some_and(|token| !token.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn set_anthropic_api_key_rejects_empty_input() {
        let err = set_anthropic_api_key("").await.unwrap_err();
        assert!(matches!(err, CoreError::BadRequest(_)));
    }
}
