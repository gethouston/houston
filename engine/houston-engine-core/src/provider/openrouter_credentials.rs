//! Persist an OpenRouter API key to `~/.houston/providers/openrouter/.env`.
//!
//! Legacy read: `~/.houston/openrouter/.env`. Houston injects
//! `OPENROUTER_API_KEY` into Codex subprocesses at spawn time.

use super::provider_env_store::{read_stored_api_key, set_api_key, strip_api_key_from_storage};
use crate::error::{CoreError, CoreResult};

pub const ENV_VAR: &str = "OPENROUTER_API_KEY";
const PROVIDER: &str = "openrouter";

pub async fn set_openrouter_api_key(api_key: &str) -> CoreResult<()> {
    set_api_key(PROVIDER, ENV_VAR, api_key, validate_key).await?;
    super::openrouter_catalog_cache::invalidate_openrouter_catalog_cache().await;
    Ok(())
}

pub async fn read_openrouter_api_key() -> CoreResult<Option<String>> {
    read_stored_api_key(PROVIDER, ENV_VAR).await
}

fn validate_key(api_key: &str) -> CoreResult<&str> {
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        return Err(CoreError::BadRequest("API key cannot be empty".into()));
    }
    if trimmed.len() < 20 || trimmed.len() > 300 {
        return Err(CoreError::BadRequest(
            "API key length looks wrong. OpenRouter keys are usually longer than 20 characters."
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

pub async fn strip_openrouter_api_key_storage() -> CoreResult<()> {
    strip_api_key_from_storage(PROVIDER, ENV_VAR).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use houston_terminal_manager::provider_env::merge_env_contents;

    #[test]
    fn validate_rejects_empty() {
        assert!(matches!(
            validate_key(""),
            Err(CoreError::BadRequest(_))
        ));
        assert!(matches!(
            validate_key("   "),
            Err(CoreError::BadRequest(_))
        ));
    }

    #[test]
    fn validate_rejects_too_short_or_long() {
        assert!(matches!(
            validate_key("abc"),
            Err(CoreError::BadRequest(_))
        ));
        let huge = "a".repeat(301);
        assert!(matches!(
            validate_key(&huge),
            Err(CoreError::BadRequest(_))
        ));
    }

    #[test]
    fn validate_rejects_whitespace_and_quotes() {
        assert!(matches!(
            validate_key("sk-or-v1 with spaces here1234567890"),
            Err(CoreError::BadRequest(_))
        ));
        assert!(matches!(
            validate_key("\"sk-or-v1-testkey1234567890123456789\""),
            Err(CoreError::BadRequest(_))
        ));
    }

    #[test]
    fn validate_trims_and_accepts_well_formed_key() {
        let key = "  sk-or-v1-testkey1234567890123456789  ";
        assert_eq!(
            validate_key(key).unwrap(),
            "sk-or-v1-testkey1234567890123456789"
        );
    }

    #[test]
    fn merge_appends_to_empty_file() {
        let out = merge_env_contents("", ENV_VAR, "sk-or-v1-testkey1234567890");
        assert_eq!(out, "OPENROUTER_API_KEY=sk-or-v1-testkey1234567890\n");
    }

    #[tokio::test]
    async fn set_openrouter_api_key_rejects_empty_input() {
        let err = set_openrouter_api_key("").await.unwrap_err();
        assert!(matches!(err, CoreError::BadRequest(_)));
    }
}
