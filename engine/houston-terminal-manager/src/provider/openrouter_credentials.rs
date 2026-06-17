//! Auth-status helper for the OpenRouter adapter's `probe_auth`.
//!
//! The key itself is persisted by `houston-engine-core`
//! (`provider::set_openrouter_api_key`) to
//! `<houston-home>/providers/openrouter/.env`, and injected into the spawned
//! `codex` process by the generic [`super::codex_backend_env`] helper (which
//! also honors a shell `OPENROUTER_API_KEY` override). This module only
//! answers the narrower "is a Houston-managed key on disk?" question the
//! picker card needs.

use crate::provider_env::read_stored_api_key;

pub(crate) const ENV_VAR: &str = "OPENROUTER_API_KEY";
const PROVIDER: &str = "openrouter";

/// True when a Houston-managed key exists on disk. A key present only in the
/// shell environment can run a local session but is NOT Houston-managed, so
/// the picker must still show "Connect" (never "Sign out") until the user
/// saves one through the connect dialog.
pub(crate) fn openrouter_stored_api_key_configured() -> bool {
    read_stored_api_key(PROVIDER, ENV_VAR).is_some()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_env_lock::lock_env_test;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn not_configured_without_a_stored_file() {
        let _guard = lock_env_test();
        let tmp = TempDir::new().unwrap();
        let prior_home = std::env::var_os("HOUSTON_HOME");
        let prior_key = std::env::var_os(ENV_VAR);
        std::env::set_var("HOUSTON_HOME", tmp.path());
        // A shell-only key must NOT count as Houston-configured.
        std::env::set_var(ENV_VAR, "sk-or-v1-shell-only");

        assert!(!openrouter_stored_api_key_configured());

        match prior_home {
            Some(v) => std::env::set_var("HOUSTON_HOME", v),
            None => std::env::remove_var("HOUSTON_HOME"),
        }
        match prior_key {
            Some(v) => std::env::set_var(ENV_VAR, v),
            None => std::env::remove_var(ENV_VAR),
        }
    }

    #[test]
    fn configured_once_a_file_is_written() {
        let _guard = lock_env_test();
        let tmp = TempDir::new().unwrap();
        let prior_home = std::env::var_os("HOUSTON_HOME");
        std::env::set_var("HOUSTON_HOME", tmp.path());

        let path = crate::provider_env::canonical_env_path(PROVIDER);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, "OPENROUTER_API_KEY=sk-or-v1-stored\n").unwrap();

        assert!(openrouter_stored_api_key_configured());

        match prior_home {
            Some(v) => std::env::set_var("HOUSTON_HOME", v),
            None => std::env::remove_var("HOUSTON_HOME"),
        }
    }
}
