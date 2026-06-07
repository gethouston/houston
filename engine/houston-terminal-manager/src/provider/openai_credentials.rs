//! Read Houston-managed OpenAI credentials from
//! `~/.houston/providers/openai/.env` (legacy: `~/.houston/openai/.env`).
//! Process env `OPENAI_API_KEY` is also honored for local dev and spawn injection.

use crate::provider_env;

const ENV_VAR: &str = "OPENAI_API_KEY";
const PROVIDER: &str = "openai";

/// True when a non-empty key is available from env or Houston storage.
pub(crate) fn openai_api_key_configured() -> bool {
    read_openai_api_key().is_ok()
}

/// Load the API key Houston should inject into Codex's environment when no
/// OAuth session is present.
pub(crate) fn read_openai_api_key() -> Result<String, String> {
    if let Ok(value) = std::env::var(ENV_VAR) {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }
    provider_env::read_stored_api_key(PROVIDER, ENV_VAR).ok_or_else(|| {
        "OpenAI API key missing. Connect OpenAI in settings or sign in with ChatGPT.".to_string()
    })
}

/// True when `~/.codex/auth.json` contains OAuth tokens (subscription login).
pub(crate) fn codex_oauth_configured() -> bool {
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
