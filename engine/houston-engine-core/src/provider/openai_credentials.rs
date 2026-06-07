//! Persist an OpenAI API key to `~/.houston/providers/openai/.env`.
//!
//! Legacy read: `~/.houston/openai/.env`. Advanced alternative to Codex OAuth.

use super::provider_env_store::{read_stored_api_key, set_api_key, strip_api_key_from_storage};
use crate::error::{CoreError, CoreResult};

pub const ENV_VAR: &str = "OPENAI_API_KEY";
const PROVIDER: &str = "openai";

pub async fn set_openai_api_key(api_key: &str) -> CoreResult<()> {
    set_api_key(PROVIDER, ENV_VAR, api_key, validate_key).await
}

pub async fn read_openai_api_key() -> CoreResult<Option<String>> {
    read_stored_api_key(PROVIDER, ENV_VAR).await
}

/// True when `~/.codex/auth.json` contains OAuth tokens (subscription login).
pub fn codex_oauth_tokens_present() -> bool {
    let Some(home) = dirs::home_dir() else {
        return false;
    };
    let auth_path = home.join(".codex").join("auth.json");
    let Ok(content) = std::fs::read_to_string(&auth_path) else {
        return false;
    };
    serde_json::from_str::<serde_json::Value>(&content)
        .ok()
        .is_some_and(|value| {
            value
                .get("tokens")
                .map(|tokens| !tokens.is_null())
                .unwrap_or(false)
        })
}

fn validate_key(api_key: &str) -> CoreResult<&str> {
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        return Err(CoreError::BadRequest("API key cannot be empty".into()));
    }
    if trimmed.len() < 20 || trimmed.len() > 300 {
        return Err(CoreError::BadRequest(
            "API key length looks wrong. OpenAI keys are usually longer than 20 characters."
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

pub async fn strip_openai_api_key_storage() -> CoreResult<()> {
    strip_api_key_from_storage(PROVIDER, ENV_VAR).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn set_openai_api_key_rejects_empty_input() {
        let err = set_openai_api_key("").await.unwrap_err();
        assert!(matches!(err, CoreError::BadRequest(_)));
    }
}
