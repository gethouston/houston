//! Anthropic API-key disconnect — clears Houston-managed storage.

use super::anthropic_credentials::{strip_anthropic_api_key_storage, ENV_VAR};
use super::provider_env_store::blocking_env_var_with;
use crate::error::{CoreError, CoreResult};

pub async fn disconnect_anthropic() -> CoreResult<()> {
    if let Some(var) = blocking_env_var() {
        return Err(CoreError::Conflict(format!(
            "`{var}` is set in your shell. Unset it there, then try disconnecting again."
        )));
    }
    strip_anthropic_api_key_storage().await?;
    tracing::info!("[anthropic-creds] disconnect: Houston-managed API key cleared");
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
    fn blocking_env_var_detects_anthropic_api_key() {
        let mut map = HashMap::new();
        map.insert("ANTHROPIC_API_KEY".to_string(), "sk-ant-test".to_string());
        let r = reader(map);
        assert_eq!(
            blocking_env_var_with(ENV_VAR, r),
            Some("ANTHROPIC_API_KEY")
        );
    }
}
