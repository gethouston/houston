//! Persist / clear the Houston-managed OpenRouter API key at
//! `<houston-home>/providers/openrouter/.env`.
//!
//! The Codex runner injects this key as `OPENROUTER_API_KEY` into the spawned
//! `codex` process (see `houston_terminal_manager::provider::codex_backend_env`)
//! so the `model_providers.openrouter` config can authenticate against
//! `https://openrouter.ai/api/v1`.
//!
//! Path resolution + the `.env` line-merge live in
//! `houston_terminal_manager::provider_env` (the runner reads the same file),
//! so the engine writes and the runner reads exactly the same place. Safety
//! mirrors `gemini_credentials`: secret never logged, atomic stage+rename,
//! mode `0600` on Unix.

use crate::error::{CoreError, CoreResult};
use houston_terminal_manager::provider_env::{
    apply_owner_only_perms, canonical_env_path, is_env_var_line, merge_env_contents, tmp_path_for,
};
use tokio::io::AsyncWriteExt;

const ENV_VAR: &str = "OPENROUTER_API_KEY";
const PROVIDER: &str = "openrouter";

/// Validate the pasted key, then persist it atomically with owner-only perms.
pub async fn set_openrouter_api_key(api_key: &str) -> CoreResult<()> {
    let trimmed = validate_key(api_key)?;
    let env_path = canonical_env_path(PROVIDER);
    let parent = env_path
        .parent()
        .ok_or_else(|| CoreError::Internal("openrouter env path has no parent directory".into()))?;
    tokio::fs::create_dir_all(parent)
        .await
        .map_err(|e| CoreError::Internal(format!("failed to create {}: {e}", parent.display())))?;
    let existing = match tokio::fs::read_to_string(&env_path).await {
        Ok(s) => s,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(e) => {
            return Err(CoreError::Internal(format!(
                "failed to read {}: {e}",
                env_path.display()
            )))
        }
    };
    let updated = merge_env_contents(&existing, ENV_VAR, trimmed);
    write_atomic(&env_path, updated.as_bytes()).await?;
    tracing::info!(
        "[openrouter-creds] wrote {} (key length={} chars)",
        env_path.display(),
        trimmed.len()
    );
    Ok(())
}

/// Remove the stored key on disconnect: drop the `OPENROUTER_API_KEY=` line,
/// deleting the file if nothing else remains. Idempotent (no-op when absent).
pub async fn strip_openrouter_api_key_storage() -> CoreResult<()> {
    let env_path = canonical_env_path(PROVIDER);
    let existing = match tokio::fs::read_to_string(&env_path).await {
        Ok(s) => s,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => {
            return Err(CoreError::Internal(format!(
                "failed to read {}: {e}",
                env_path.display()
            )))
        }
    };
    let stripped: String = existing
        .split_inclusive('\n')
        .filter(|line| !is_env_var_line(line, ENV_VAR))
        .collect();
    if stripped == existing {
        return Ok(());
    }
    if stripped.trim().is_empty() {
        tokio::fs::remove_file(&env_path).await.map_err(|e| {
            CoreError::Internal(format!("failed to remove {}: {e}", env_path.display()))
        })?;
        return Ok(());
    }
    write_atomic(&env_path, stripped.as_bytes()).await
}

fn validate_key(api_key: &str) -> CoreResult<&str> {
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        return Err(CoreError::BadRequest("API key cannot be empty".into()));
    }
    if trimmed.len() < 16 || trimmed.len() > 512 {
        return Err(CoreError::BadRequest(
            "API key length looks wrong. Paste the full OpenRouter key (starts with sk-or-).".into(),
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

/// Stage to `.env.tmp` + rename (atomic on the same filesystem), chmod 0600.
async fn write_atomic(final_path: &std::path::Path, bytes: &[u8]) -> CoreResult<()> {
    let tmp_path = tmp_path_for(final_path);
    {
        let mut f = tokio::fs::File::create(&tmp_path).await.map_err(|e| {
            CoreError::Internal(format!("failed to open {} for writing: {e}", tmp_path.display()))
        })?;
        f.write_all(bytes)
            .await
            .map_err(|e| CoreError::Internal(format!("failed to write {}: {e}", tmp_path.display())))?;
        f.sync_all()
            .await
            .map_err(|e| CoreError::Internal(format!("failed to fsync {}: {e}", tmp_path.display())))?;
    }
    apply_owner_only_perms(&tmp_path).map_err(|e| {
        CoreError::Internal(format!("failed to chmod 0600 on {}: {e}", tmp_path.display()))
    })?;
    tokio::fs::rename(&tmp_path, final_path).await.map_err(|e| {
        CoreError::Internal(format!(
            "failed to rename {} to {}: {e}",
            tmp_path.display(),
            final_path.display()
        ))
    })?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_rejects_empty_and_whitespace() {
        assert!(matches!(validate_key(""), Err(CoreError::BadRequest(_))));
        assert!(matches!(validate_key("   "), Err(CoreError::BadRequest(_))));
        assert!(matches!(
            validate_key("sk-or v1 spaced key here"),
            Err(CoreError::BadRequest(_))
        ));
    }

    #[test]
    fn validate_rejects_too_short_or_long() {
        assert!(matches!(validate_key("abc"), Err(CoreError::BadRequest(_))));
        let huge = "a".repeat(600);
        assert!(matches!(validate_key(&huge), Err(CoreError::BadRequest(_))));
    }

    #[test]
    fn validate_rejects_quotes() {
        assert!(matches!(
            validate_key("sk-or-v1-\"quoted-key-value\""),
            Err(CoreError::BadRequest(_))
        ));
    }

    #[test]
    fn validate_accepts_well_formed_key_and_trims() {
        let key = "  sk-or-v1-0123456789abcdef0123456789  ";
        assert_eq!(validate_key(key).unwrap(), "sk-or-v1-0123456789abcdef0123456789");
    }
}
