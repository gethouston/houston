//! OpenRouter disconnect helper — clears Houston-managed API key storage.

use super::openrouter_credentials::{strip_openrouter_api_key_storage, ENV_VAR};
use super::provider_env_store::blocking_env_var_with;
use crate::error::{CoreError, CoreResult};

pub async fn disconnect_openrouter() -> CoreResult<()> {
    if let Some(var) = blocking_env_var() {
        return Err(CoreError::Conflict(format!(
            "`{var}` is set in your shell. Unset it there, then try disconnecting again."
        )));
    }
    strip_openrouter_api_key_storage().await?;
    super::openrouter_catalog_cache::invalidate_openrouter_catalog_cache().await;
    tracing::info!("[openrouter-creds] disconnect: Houston-managed API key cleared");
    Ok(())
}

fn blocking_env_var() -> Option<&'static str> {
    blocking_env_var_with(ENV_VAR, |name| std::env::var(name).ok())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn reader(map: HashMap<String, String>) -> impl Fn(&str) -> Option<String> {
        move |name: &str| map.get(name).cloned()
    }

    #[test]
    fn blocking_env_var_detects_openrouter_api_key() {
        let mut map = HashMap::new();
        map.insert(
            "OPENROUTER_API_KEY".to_string(),
            "sk-or-v1-test".to_string(),
        );
        let r = reader(map);
        assert_eq!(
            blocking_env_var_with(ENV_VAR, r),
            Some("OPENROUTER_API_KEY")
        );
    }
}
