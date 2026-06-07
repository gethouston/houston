//! Strict path allowlist for provider credential sync.

use crate::error::{CoreError, CoreResult};
use std::path::{Component, Path, PathBuf};

/// Provider ids supported by credential export/import.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CredentialProvider {
    OpenAi,
    Anthropic,
    OpenRouter,
    Composio,
}

impl CredentialProvider {
    pub fn id(self) -> &'static str {
        match self {
            Self::OpenAi => "openai",
            Self::Anthropic => "anthropic",
            Self::OpenRouter => "openrouter",
            Self::Composio => "composio",
        }
    }

    pub fn parse(name: &str) -> CoreResult<Self> {
        match name {
            "openai" => Ok(Self::OpenAi),
            "anthropic" | "claude" => Ok(Self::Anthropic),
            "openrouter" => Ok(Self::OpenRouter),
            "composio" => Ok(Self::Composio),
            other => Err(CoreError::BadRequest(format!(
                "credential sync is not supported for provider '{other}'"
            ))),
        }
    }

    /// Relative paths (from HOME) that may be exported/imported.
    pub fn allowed_rel_paths(self) -> &'static [&'static str] {
        match self {
            Self::OpenAi => &[".codex/auth.json", ".houston/providers/openai/.env"],
            Self::Anthropic => &[
                ".claude/.credentials.json",
                ".houston/providers/anthropic/.env",
            ],
            Self::OpenRouter => &[".houston/providers/openrouter/.env"],
            Self::Composio => &[".composio/user_data.json"],
        }
    }

    pub fn default_file_mode(self, rel_path: &str) -> u32 {
        if rel_path.ends_with(".env") || rel_path.contains("credentials") || rel_path.contains("auth")
        {
            0o600
        } else {
            0o600
        }
    }
}

/// Normalize and validate a relative path against the provider allowlist.
pub fn validate_rel_path(provider: CredentialProvider, rel_path: &str) -> CoreResult<String> {
    let normalized = normalize_rel_path(rel_path)?;
    let allowed = provider.allowed_rel_paths();
    if allowed.iter().any(|p| *p == normalized.as_str()) {
        Ok(normalized)
    } else {
        Err(CoreError::BadRequest(format!(
            "path '{}' is not allowlisted for provider '{}'",
            normalized,
            provider.id()
        )))
    }
}

fn is_legacy_houston_env(rel: &str) -> bool {
    let Some(after) = rel.strip_prefix(".houston/") else {
        return false;
    };
    if after.starts_with("providers/") {
        return false;
    }
    let mut parts = after.split('/');
    matches!(
        (parts.next(), parts.next(), parts.next()),
        (Some(seg), Some(".env"), None) if !seg.is_empty()
    )
}

pub fn home_join(rel_path: &str) -> CoreResult<PathBuf> {
    let rel = normalize_rel_path(rel_path)?;
    if let Some(after) = rel.strip_prefix(".houston/") {
        if after.starts_with("providers/") {
            return Ok(
                houston_terminal_manager::houston_data_root::houston_data_root().join(after),
            );
        }
        if is_legacy_houston_env(&rel) {
            let home = dirs::home_dir().ok_or_else(|| {
                CoreError::Internal("could not resolve home directory for credential sync".into())
            })?;
            return Ok(home.join(&rel));
        }
        return Ok(
            houston_terminal_manager::houston_data_root::houston_data_root().join(after),
        );
    }
    let home = dirs::home_dir().ok_or_else(|| {
        CoreError::Internal("could not resolve home directory for credential sync".into())
    })?;
    Ok(home.join(rel))
}

pub fn normalize_rel_path(rel_path: &str) -> CoreResult<String> {
    let trimmed = rel_path.trim();
    if trimmed.is_empty() {
        return Err(CoreError::BadRequest("credential path cannot be empty".into()));
    }
    if trimmed.starts_with('/') || trimmed.starts_with('\\') {
        return Err(CoreError::BadRequest(
            "credential paths must be relative to HOME".into(),
        ));
    }
    let path = Path::new(trimmed);
    for component in path.components() {
        match component {
            Component::Normal(_) => {}
            Component::CurDir => {}
            _ => {
                return Err(CoreError::BadRequest(format!(
                    "credential path '{}' contains forbidden segments",
                    rel_path
                )));
            }
        }
    }
    Ok(path
        .components()
        .filter_map(|c| match c {
            Component::Normal(s) => Some(s.to_string_lossy()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/"))
}

/// Validate Composio `user_data.json` shape before export/import.
pub fn validate_composio_user_data(content: &str) -> CoreResult<()> {
    let value: serde_json::Value = serde_json::from_str(content).map_err(|e| {
        CoreError::BadRequest(format!("composio user_data.json is not valid JSON: {e}"))
    })?;
    let api_key = value
        .get("api_key")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if api_key.trim().is_empty() {
        return Err(CoreError::BadRequest(
            "composio user_data.json is missing a non-empty api_key".into(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_env_lock::lock_env_test;
    use tempfile::TempDir;

    #[test]
    fn rejects_traversal() {
        assert!(normalize_rel_path("../.codex/auth.json").is_err());
        assert!(normalize_rel_path(".codex/../auth.json").is_err());
    }

    #[test]
    fn allowlist_accepts_openai_paths() {
        let p = CredentialProvider::OpenAi;
        assert!(validate_rel_path(p, ".codex/auth.json").is_ok());
        assert!(validate_rel_path(p, ".houston/providers/openai/.env").is_ok());
        assert!(validate_rel_path(p, ".houston/openai/.env").is_err());
    }

    #[test]
    fn composio_validation_requires_api_key() {
        assert!(validate_composio_user_data(r#"{"api_key":"k"}"#).is_ok());
        assert!(validate_composio_user_data(r#"{"api_key":""}"#).is_err());
    }

    #[test]
    fn home_join_splits_canonical_and_legacy_houston_paths() {
        let _guard = lock_env_test();
        let tmp = TempDir::new().unwrap();
        let prior_home = std::env::var_os("HOME");
        let prior_houston = std::env::var_os("HOUSTON_HOME");
        std::env::set_var("HOME", tmp.path());
        let data_root = tmp.path().join("houston-data");
        std::env::set_var("HOUSTON_HOME", &data_root);

        let canonical = home_join(".houston/providers/openrouter/.env").unwrap();
        assert_eq!(canonical, data_root.join("providers/openrouter/.env"));

        let legacy = home_join(".houston/openrouter/.env").unwrap();
        assert_eq!(legacy, tmp.path().join(".houston/openrouter/.env"));

        match prior_home {
            Some(v) => std::env::set_var("HOME", v),
            None => std::env::remove_var("HOME"),
        }
        match prior_houston {
            Some(v) => std::env::set_var("HOUSTON_HOME", v),
            None => std::env::remove_var("HOUSTON_HOME"),
        }
    }
}
