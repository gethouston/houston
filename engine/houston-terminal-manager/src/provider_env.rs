//! Houston-managed provider API keys under
//! `<houston-home>/providers/<provider>/.env`.
//!
//! Used by providers that ride a CLI against a custom endpoint and need an
//! API key injected as an environment variable at spawn time (e.g.
//! OpenRouter through the Codex CLI — see `provider::CodexBackend`). The
//! credential WRITE side lives in `houston-engine-core`
//! (`provider_env_store`), which reuses the merge/perms helpers here; this
//! module owns the canonical path resolution and the synchronous read the
//! runner needs on the spawn hot path.
//!
//! Storage shape mirrors the rest of `~/.houston/**`: `HOUSTON_HOME` wins,
//! otherwise `~/.dev-houston` in debug builds and `~/.houston` in release —
//! the exact resolution `houston-db` uses for the data root, so a key
//! written by the engine and read by the runner always land on the same
//! file regardless of build profile.

use std::path::{Path, PathBuf};

/// Houston data root. `HOUSTON_HOME` overrides; otherwise debug builds use
/// `~/.dev-houston` and release builds `~/.houston`. Kept in sync with
/// `houston_db::houston_dir` (terminal-manager does not depend on the db
/// crate, so the resolution is replicated rather than imported).
fn houston_data_root() -> PathBuf {
    if let Ok(override_path) = std::env::var("HOUSTON_HOME") {
        return PathBuf::from(override_path);
    }
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    let subdir = if cfg!(debug_assertions) {
        ".dev-houston"
    } else {
        ".houston"
    };
    home.join(subdir)
}

/// Canonical credential file for a provider id (`openrouter`, …):
/// `<houston-home>/providers/<provider>/.env`.
pub fn canonical_env_path(provider: &str) -> PathBuf {
    houston_data_root()
        .join("providers")
        .join(provider)
        .join(".env")
}

/// Read a non-empty `KEY=value` for `env_var` from the provider's stored
/// `.env`. Returns `None` when the file or the key is absent/empty.
pub fn read_stored_api_key(provider: &str, env_var: &str) -> Option<String> {
    read_api_key_from_file(&canonical_env_path(provider), env_var)
}

pub fn read_api_key_from_file(path: &Path, env_var: &str) -> Option<String> {
    let contents = std::fs::read_to_string(path).ok()?;
    extract_env_value(&contents, env_var)
}

/// Extract the value of `env_var` from `.env` contents, tolerating an
/// `export ` prefix and surrounding quotes. Returns `None` if absent/empty.
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

/// Replace the `env_var=` line in `.env` contents if present, otherwise
/// append it. Preserves every other line (other env vars, comments) so a
/// user's hand-edited `.env` is never clobbered.
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

/// True when `line` assigns `env_var` (with or without an `export ` prefix).
pub fn is_env_var_line(line: &str, env_var: &str) -> bool {
    let trimmed = line.trim_start();
    let body = trimmed.strip_prefix("export ").unwrap_or(trimmed);
    body.starts_with(&format!("{env_var}="))
}

/// Sibling `<name>.tmp` path used to stage an atomic write.
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
    // Windows ACLs already restrict %USERPROFILE% to the current user.
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
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
    fn merge_preserves_unrelated_lines_and_appends() {
        let existing = "# my keys\nGEMINI_API_KEY=abc\n";
        let out = merge_env_contents(existing, "OPENROUTER_API_KEY", "sk-or-new");
        assert_eq!(out, "# my keys\nGEMINI_API_KEY=abc\nOPENROUTER_API_KEY=sk-or-new\n");
    }

    #[test]
    fn extract_tolerates_export_and_quotes() {
        assert_eq!(
            extract_env_value("export OPENROUTER_API_KEY=\"sk-or-x\"\n", "OPENROUTER_API_KEY")
                .as_deref(),
            Some("sk-or-x")
        );
        assert_eq!(extract_env_value("OPENROUTER_API_KEY=\n", "OPENROUTER_API_KEY"), None);
    }

    #[test]
    fn read_api_key_from_file_reads_value() {
        let tmp = TempDir::new().unwrap();
        let path = tmp.path().join(".env");
        fs::write(&path, "OTHER=x\nOPENROUTER_API_KEY=sk-or-v1-fromfile\n").unwrap();
        assert_eq!(
            read_api_key_from_file(&path, "OPENROUTER_API_KEY").as_deref(),
            Some("sk-or-v1-fromfile")
        );
    }

    #[test]
    fn read_api_key_from_missing_file_is_none() {
        let tmp = TempDir::new().unwrap();
        let path = tmp.path().join("nope.env");
        assert_eq!(read_api_key_from_file(&path, "OPENROUTER_API_KEY"), None);
    }

    #[test]
    fn canonical_env_path_is_under_providers() {
        let path = canonical_env_path("openrouter");
        assert!(path.ends_with("providers/openrouter/.env"));
    }
}
