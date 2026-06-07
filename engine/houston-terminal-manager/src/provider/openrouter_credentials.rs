//! Read Houston-managed provider credentials from `~/.houston/providers/<provider>/.env`.
//! Legacy paths are read for idempotent migration.

use crate::provider_env::read_stored_api_key;

const ENV_VAR: &str = "OPENROUTER_API_KEY";
const OPENROUTER_PROVIDER: &str = "openrouter";

/// True when a Houston-managed key exists on disk (exportable to cloud).
pub(crate) fn openrouter_stored_api_key_configured() -> bool {
    read_stored_api_key(OPENROUTER_PROVIDER, ENV_VAR).is_some()
}

pub(crate) fn read_openrouter_api_key() -> Result<String, String> {
    if let Ok(value) = std::env::var(ENV_VAR) {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }

    read_stored_api_key(OPENROUTER_PROVIDER, ENV_VAR).ok_or_else(|| {
        "OpenRouter API key missing. Connect OpenRouter in settings.".to_string()
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_env_lock::lock_env_test;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn stored_configured_ignores_process_env_without_file() {
        let _guard = lock_env_test();
        let tmp = TempDir::new().unwrap();
        let prior_home = std::env::var_os("HOME");
        let prior_houston = std::env::var_os("HOUSTON_HOME");
        let prior_key = std::env::var_os(ENV_VAR);
        std::env::set_var("HOME", tmp.path());
        std::env::set_var("HOUSTON_HOME", tmp.path());
        std::env::set_var(ENV_VAR, "sk-or-v1-from-shell-only");

        assert!(!openrouter_stored_api_key_configured());
        assert!(read_openrouter_api_key().is_ok());
        assert_eq!(
            read_openrouter_api_key().as_deref(),
            Ok("sk-or-v1-from-shell-only")
        );

        match prior_home {
            Some(v) => std::env::set_var("HOME", v),
            None => std::env::remove_var("HOME"),
        }
        match prior_houston {
            Some(v) => std::env::set_var("HOUSTON_HOME", v),
            None => std::env::remove_var("HOUSTON_HOME"),
        }
        match prior_key {
            Some(v) => std::env::set_var(ENV_VAR, v),
            None => std::env::remove_var(ENV_VAR),
        }
    }

    #[test]
    fn read_openrouter_api_key_reads_canonical_path() {
        let _guard = lock_env_test();
        let tmp = TempDir::new().unwrap();
        let prior_home = std::env::var_os("HOME");
        let prior_houston = std::env::var_os("HOUSTON_HOME");
        let prior_key = std::env::var_os(ENV_VAR);
        std::env::remove_var(ENV_VAR);
        std::env::set_var("HOME", tmp.path());
        std::env::set_var("HOUSTON_HOME", tmp.path());

        let path = crate::provider_env::canonical_env_path(OPENROUTER_PROVIDER);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, "OPENROUTER_API_KEY=sk-or-v1-testkey1234567890\n").unwrap();

        assert_eq!(
            read_openrouter_api_key().as_deref(),
            Ok("sk-or-v1-testkey1234567890")
        );

        match prior_home {
            Some(v) => std::env::set_var("HOME", v),
            None => std::env::remove_var("HOME"),
        }
        match prior_houston {
            Some(v) => std::env::set_var("HOUSTON_HOME", v),
            None => std::env::remove_var("HOUSTON_HOME"),
        }
        match prior_key {
            Some(v) => std::env::set_var(ENV_VAR, v),
            None => std::env::remove_var(ENV_VAR),
        }
    }
}
