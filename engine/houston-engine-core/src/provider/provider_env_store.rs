//! Async read/write helpers for Houston-managed provider `.env` files.

use crate::error::{CoreError, CoreResult};
use houston_terminal_manager::provider_env::{
    self, apply_owner_only_perms, canonical_env_path, is_env_var_line, legacy_env_paths,
    merge_env_contents, read_env_paths, tmp_path_for,
};
use std::path::Path;
use tokio::io::AsyncWriteExt;

pub async fn read_stored_api_key(provider: &str, env_var: &str) -> CoreResult<Option<String>> {
    Ok(provider_env::read_stored_api_key(provider, env_var))
}

pub async fn set_api_key(
    provider: &str,
    env_var: &str,
    api_key: &str,
    validate: fn(&str) -> CoreResult<&str>,
) -> CoreResult<()> {
    let trimmed = validate(api_key)?;
    let env_path = canonical_env_path(provider);
    let parent = env_path.parent().ok_or_else(|| {
        CoreError::Internal(format!("{provider} env path has no parent directory"))
    })?;
    tokio::fs::create_dir_all(parent).await.map_err(|e| {
        CoreError::Internal(format!("failed to create {}: {e}", parent.display()))
    })?;
    let existing = read_existing_for_merge(provider).await?;
    let updated = merge_env_contents(&existing, env_var, trimmed);
    write_atomic(&env_path, updated.as_bytes()).await?;
    for path in legacy_env_paths(provider) {
        strip_api_key_line_at(&path, env_var).await?;
    }
    tracing::info!(
        "[{provider}-creds] wrote {} (key length={} chars)",
        env_path.display(),
        trimmed.len()
    );
    Ok(())
}

pub async fn strip_api_key_from_storage(provider: &str, env_var: &str) -> CoreResult<()> {
    for path in read_env_paths(provider) {
        strip_api_key_line_at(&path, env_var).await?;
    }
    Ok(())
}

async fn read_existing_for_merge(provider: &str) -> CoreResult<String> {
    for path in read_env_paths(provider) {
        match read_existing(&path).await? {
            s if !s.is_empty() => return Ok(s),
            _ => {}
        }
    }
    Ok(String::new())
}

async fn read_existing(path: &Path) -> CoreResult<String> {
    match tokio::fs::read_to_string(path).await {
        Ok(s) => Ok(s),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(CoreError::Internal(format!(
            "failed to read {}: {e}",
            path.display()
        ))),
    }
}

async fn strip_api_key_line_at(env_path: &Path, env_var: &str) -> CoreResult<()> {
    let existing = match tokio::fs::read_to_string(env_path).await {
        Ok(s) => s,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => {
            return Err(CoreError::Internal(format!(
                "failed to read {}: {e}",
                env_path.display()
            )));
        }
    };
    let new_contents: String = existing
        .split_inclusive('\n')
        .filter(|line| !is_env_var_line(line, env_var))
        .collect();
    if new_contents == existing {
        return Ok(());
    }
    if new_contents.trim().is_empty() {
        tokio::fs::remove_file(env_path).await.map_err(|e| {
            CoreError::Internal(format!(
                "failed to remove empty {}: {e}",
                env_path.display()
            ))
        })?;
        return Ok(());
    }
    write_atomic(env_path, new_contents.as_bytes()).await
}

pub async fn write_atomic(final_path: &Path, bytes: &[u8]) -> CoreResult<()> {
    let tmp_path = tmp_path_for(final_path);
    {
        let mut f = tokio::fs::File::create(&tmp_path).await.map_err(|e| {
            CoreError::Internal(format!(
                "failed to open {} for writing: {e}",
                tmp_path.display()
            ))
        })?;
        f.write_all(bytes).await.map_err(|e| {
            CoreError::Internal(format!("failed to write {}: {e}", tmp_path.display()))
        })?;
        f.sync_all().await.map_err(|e| {
            CoreError::Internal(format!("failed to fsync {}: {e}", tmp_path.display()))
        })?;
    }
    apply_owner_only_perms(&tmp_path).map_err(|e| {
        CoreError::Internal(format!(
            "failed to chmod 0600 on {}: {e}",
            tmp_path.display()
        ))
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

pub fn blocking_env_var_with(
    env_var: &'static str,
    get: impl Fn(&str) -> Option<String>,
) -> Option<&'static str> {
    match get(env_var).as_deref() {
        Some(v) if !v.trim().is_empty() => Some(env_var),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_env_lock::lock_env_test;
    use tempfile::TempDir;
    use tokio::fs;

    #[tokio::test]
    async fn write_atomic_applies_mode_0600_on_unix() {
        let tmp = TempDir::new().unwrap();
        let target = tmp.path().join(".env");
        write_atomic(&target, b"ANTHROPIC_API_KEY=hello\n")
            .await
            .unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = fs::metadata(&target).await.unwrap().permissions().mode();
            assert_eq!(mode & 0o777, 0o600);
        }
    }

    #[tokio::test]
    async fn set_api_key_strips_legacy_after_canonical_write() {
        let _guard = lock_env_test();
        let tmp = TempDir::new().unwrap();
        let prior_home = std::env::var_os("HOME");
        let prior_houston = std::env::var_os("HOUSTON_HOME");
        std::env::set_var("HOME", tmp.path());
        std::env::set_var("HOUSTON_HOME", tmp.path());

        let legacy = tmp.path().join(".houston/openrouter/.env");
        fs::create_dir_all(legacy.parent().unwrap()).await.unwrap();
        fs::write(&legacy, "OPENROUTER_API_KEY=old-secret-key-value\n")
            .await
            .unwrap();

        fn test_validate_key(k: &str) -> CoreResult<&str> {
            if k.len() >= 20 {
                Ok(k)
            } else {
                Err(CoreError::BadRequest("too short".into()))
            }
        }
        set_api_key(
            "openrouter",
            "OPENROUTER_API_KEY",
            "sk-or-v1-newkey1234567890",
            test_validate_key,
        )
        .await
        .unwrap();

        let canonical = canonical_env_path("openrouter");
        let canonical_contents = fs::read_to_string(&canonical).await.unwrap();
        assert!(canonical_contents.contains("sk-or-v1-newkey1234567890"));
        assert!(!legacy.exists());

        match prior_home {
            Some(v) => std::env::set_var("HOME", v),
            None => std::env::remove_var("HOME"),
        }
        match prior_houston {
            Some(v) => std::env::set_var("HOUSTON_HOME", v),
            None => std::env::remove_var("HOUSTON_HOME"),
        }
    }

    #[tokio::test]
    async fn strip_clears_canonical_and_legacy() {
        let _guard = lock_env_test();
        let tmp = TempDir::new().unwrap();
        let prior_home = std::env::var_os("HOME");
        let prior_houston = std::env::var_os("HOUSTON_HOME");
        std::env::set_var("HOME", tmp.path());
        std::env::set_var("HOUSTON_HOME", tmp.path());

        let canonical = canonical_env_path("openrouter");
        fs::create_dir_all(canonical.parent().unwrap()).await.unwrap();
        fs::write(&canonical, "OPENROUTER_API_KEY=secret\n")
            .await
            .unwrap();
        let legacy = tmp.path().join(".houston/openrouter/.env");
        fs::create_dir_all(legacy.parent().unwrap()).await.unwrap();
        fs::write(&legacy, "OPENROUTER_API_KEY=secret\n")
            .await
            .unwrap();

        strip_api_key_from_storage("openrouter", "OPENROUTER_API_KEY")
            .await
            .unwrap();

        assert!(!canonical.exists());
        assert!(!legacy.exists());

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
