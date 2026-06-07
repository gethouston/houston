//! Houston-managed provider API keys under `~/.houston/providers/<provider>/.env`.
//!
//! Legacy paths are read for idempotent migration; writes always target the
//! canonical path. See `knowledge-base/auth.md` for the full layout.

use std::path::{Path, PathBuf};

use crate::houston_data_root::houston_data_root;

/// Canonical credential file for a provider id (`anthropic`, `openai`, …).
pub fn canonical_env_path(provider: &str) -> PathBuf {
    houston_data_root()
        .join("providers")
        .join(provider)
        .join(".env")
}

/// Pre-unification paths still honored on read and cleared on disconnect.
pub fn legacy_env_paths(provider: &str) -> Vec<PathBuf> {
    let home = dirs::home_dir().unwrap_or_default();
    match provider {
        "openrouter" => vec![home.join(".houston").join("openrouter").join(".env")],
        "anthropic" => vec![home.join(".houston").join("anthropic").join(".env")],
        "openai" => vec![home.join(".houston").join("openai").join(".env")],
        _ => vec![],
    }
}

/// Paths to probe for a stored key (canonical first, then legacy).
pub fn read_env_paths(provider: &str) -> Vec<PathBuf> {
    let mut paths = vec![canonical_env_path(provider)];
    paths.extend(legacy_env_paths(provider));
    paths
}

/// Read a non-empty `KEY=value` from Houston storage (canonical, then legacy).
pub fn read_stored_api_key(provider: &str, env_var: &str) -> Option<String> {
    for path in read_env_paths(provider) {
        if let Some(key) = read_api_key_from_file(&path, env_var) {
            return Some(key);
        }
    }
    None
}

pub fn read_api_key_from_file(path: &Path, env_var: &str) -> Option<String> {
    let contents = std::fs::read_to_string(path).ok()?;
    extract_env_value(&contents, env_var)
}

pub fn extract_env_value(existing: &str, env_var: &str) -> Option<String> {
    for line in existing.split_inclusive('\n') {
        if !is_env_var_line(line, env_var) {
            continue;
        }
        let trimmed = line.trim_start();
        let body = trimmed.strip_prefix("export ").unwrap_or(trimmed);
        let rest = body.strip_prefix(&format!("{env_var}="))?;
        let cleaned = rest
            .trim()
            .trim_matches('"')
            .trim_matches('\'')
            .trim()
            .to_string();
        if !cleaned.is_empty() {
            return Some(cleaned);
        }
    }
    None
}

pub fn merge_env_contents(existing: &str, env_var: &str, new_value: &str) -> String {
    let mut out = String::with_capacity(existing.len() + new_value.len() + 32);
    let mut replaced = false;
    let trailing_newline = existing.is_empty() || existing.ends_with('\n');
    for line in existing.split_inclusive('\n') {
        if is_env_var_line(line, env_var) {
            out.push_str(&format!("{env_var}={new_value}"));
            if line.ends_with('\n') {
                out.push('\n');
            }
            replaced = true;
        } else {
            out.push_str(line);
        }
    }
    if !replaced {
        if !out.is_empty() && !trailing_newline {
            out.push('\n');
        }
        out.push_str(&format!("{env_var}={new_value}\n"));
    }
    out
}

pub fn is_env_var_line(line: &str, env_var: &str) -> bool {
    let trimmed = line.trim_start();
    let body = trimmed.strip_prefix("export ").unwrap_or(trimmed);
    body.starts_with(&format!("{env_var}="))
}

pub fn tmp_path_for(final_path: &Path) -> PathBuf {
    let mut name = final_path
        .file_name()
        .map(|n| n.to_os_string())
        .unwrap_or_default();
    name.push(".tmp");
    final_path
        .parent()
        .map(|p| p.join(&name))
        .unwrap_or_else(|| PathBuf::from(&name))
}

#[cfg(unix)]
pub fn apply_owner_only_perms(path: &Path) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
}

#[cfg(not(unix))]
pub fn apply_owner_only_perms(_path: &Path) -> std::io::Result<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_env_lock::lock_env_test;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn merge_appends_to_empty_file() {
        let out = merge_env_contents("", "OPENROUTER_API_KEY", "sk-or-test");
        assert_eq!(out, "OPENROUTER_API_KEY=sk-or-test\n");
    }

    #[test]
    fn merge_replaces_existing_key_line() {
        let existing = "OTHER=hello\nOPENROUTER_API_KEY=old\n";
        let out = merge_env_contents(existing, "OPENROUTER_API_KEY", "sk-or-new");
        assert_eq!(out, "OTHER=hello\nOPENROUTER_API_KEY=sk-or-new\n");
    }

    #[test]
    fn read_stored_api_key_prefers_canonical_over_legacy() {
        let _guard = lock_env_test();
        let tmp = TempDir::new().unwrap();
        let prior = std::env::var_os("HOUSTON_HOME");
        std::env::set_var("HOUSTON_HOME", tmp.path());

        let canonical = canonical_env_path("openrouter");
        fs::create_dir_all(canonical.parent().unwrap()).unwrap();
        fs::write(&canonical, "OPENROUTER_API_KEY=canonical-key\n").unwrap();

        let legacy_dir = tmp.path().join("legacy-openrouter");
        fs::create_dir_all(&legacy_dir).unwrap();
        fs::write(
            legacy_dir.join(".env"),
            "OPENROUTER_API_KEY=legacy-key\n",
        )
        .unwrap();

        // Override legacy path by writing directly — read_stored uses HOUSTON_HOME canonical first.
        assert_eq!(
            read_api_key_from_file(&canonical, "OPENROUTER_API_KEY").as_deref(),
            Some("canonical-key")
        );

        match prior {
            Some(v) => std::env::set_var("HOUSTON_HOME", v),
            None => std::env::remove_var("HOUSTON_HOME"),
        }
    }

    #[test]
    fn read_stored_falls_back_to_legacy_when_canonical_missing() {
        let _guard = lock_env_test();
        let tmp = TempDir::new().unwrap();
        let prior_home = std::env::var_os("HOME");
        let prior_houston = std::env::var_os("HOUSTON_HOME");
        std::env::set_var("HOME", tmp.path());
        std::env::set_var("HOUSTON_HOME", tmp.path().join("houston-data"));

        let legacy = tmp.path().join(".houston/openrouter/.env");
        fs::create_dir_all(legacy.parent().unwrap()).unwrap();
        fs::write(&legacy, "OPENROUTER_API_KEY=legacy-key\n").unwrap();

        assert_eq!(
            read_stored_api_key("openrouter", "OPENROUTER_API_KEY").as_deref(),
            Some("legacy-key")
        );

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
