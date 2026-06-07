//! Read Houston-managed Anthropic credentials (canonical + legacy paths).
//! Process env `ANTHROPIC_API_KEY` is also honored for local dev and spawn injection.

use crate::provider_env;

const ENV_VAR: &str = "ANTHROPIC_API_KEY";
const PROVIDER: &str = "anthropic";

/// True when a non-empty key is available from env or Houston storage.
pub(crate) fn anthropic_api_key_configured() -> bool {
    read_anthropic_api_key_for_spawn().is_some()
}

/// Load the API key Houston should inject into Claude Code's environment.
/// Returns `None` when no key is configured (OAuth-only sessions).
pub(crate) fn read_anthropic_api_key_for_spawn() -> Option<String> {
    if let Ok(value) = std::env::var(ENV_VAR) {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }
    provider_env::read_stored_api_key(PROVIDER, ENV_VAR)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::provider_env::merge_env_contents;

    #[test]
    fn merge_appends_anthropic_key() {
        let out = merge_env_contents("", ENV_VAR, "sk-ant-api03-testkey1234567890");
        assert_eq!(out, "ANTHROPIC_API_KEY=sk-ant-api03-testkey1234567890\n");
    }
}
