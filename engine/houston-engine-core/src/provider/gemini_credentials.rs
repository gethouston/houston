//! Persist a Gemini API key to `~/.gemini/.env` so the bundled
//! `gemini` CLI picks it up on its next spawn.
//!
//! The CLI reads `~/.gemini/.env` at startup (documented behaviour of
//! gemini-cli `selectedType: "gemini-api-key"` mode). Houston's auth
//! probe ([`super::super::super`]: `houston_terminal_manager::provider::gemini`)
//! also reads this file directly, so the picker card flips to
//! "Connected" on the very next `/v1/providers/gemini/status` poll, no
//! engine restart required.
//!
//! Safety:
//! - The key is a SECRET. We never log it; only its length / shape.
//! - Atomic write: stage to `.env.tmp`, then `rename` to `.env`. A crash
//!   mid-write leaves the user's old `.env` intact rather than a torn
//!   empty file.
//! - Mode `0600` on Unix (owner read/write only). Windows ACLs already
//!   restrict `%USERPROFILE%` to the current user; chmod is a no-op
//!   there.
//! - We preserve any other `KEY=VALUE` lines the user may have in the
//!   file (other Google env vars, comments, etc.) — only the existing
//!   `GEMINI_API_KEY=` line is replaced.

use crate::error::{CoreError, CoreResult};
use std::path::PathBuf;
use tokio::io::AsyncWriteExt;

const ENV_VAR: &str = "GEMINI_API_KEY";

/// Persist the API key to `~/.gemini/.env`.
///
/// Validates shape, writes atomically, and chmods to 0600 on Unix.
/// Errors are `CoreError::BadRequest` for input-validation failures and
/// `CoreError::Internal` for filesystem failures, each tagging the
/// specific operation that failed so the toast/Report-bug payload is
/// actionable.
pub async fn set_gemini_api_key(api_key: &str) -> CoreResult<()> {
    let trimmed = validate_key(api_key)?;
    let env_path = resolve_env_path()?;
    let parent = env_path.parent().ok_or_else(|| {
        CoreError::Internal("gemini env path has no parent directory".into())
    })?;
    tokio::fs::create_dir_all(parent).await.map_err(|e| {
        CoreError::Internal(format!(
            "failed to create {}: {e}",
            parent.display()
        ))
    })?;
    let existing = read_existing(&env_path).await?;
    let updated = merge_env_contents(&existing, trimmed);
    write_atomic(&env_path, updated.as_bytes()).await?;
    tracing::info!(
        "[gemini-creds] wrote {} (key length={} chars)",
        env_path.display(),
        trimmed.len()
    );
    Ok(())
}

fn validate_key(api_key: &str) -> CoreResult<&str> {
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        return Err(CoreError::BadRequest("API key cannot be empty".into()));
    }
    if trimmed.len() < 10 || trimmed.len() > 200 {
        return Err(CoreError::BadRequest(
            "API key length looks wrong. Gemini keys are roughly 39 characters.".into(),
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

fn resolve_env_path() -> CoreResult<PathBuf> {
    let home = dirs::home_dir().ok_or_else(|| {
        CoreError::Internal("could not resolve home directory for ~/.gemini/.env".into())
    })?;
    Ok(home.join(".gemini").join(".env"))
}

async fn read_existing(path: &std::path::Path) -> CoreResult<String> {
    match tokio::fs::read_to_string(path).await {
        Ok(s) => Ok(s),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(CoreError::Internal(format!(
            "failed to read {}: {e}",
            path.display()
        ))),
    }
}

/// Replace the `GEMINI_API_KEY=` line if present, otherwise append.
/// Preserves all other lines verbatim (comments, blank lines, other vars).
fn merge_env_contents(existing: &str, new_value: &str) -> String {
    let mut out = String::with_capacity(existing.len() + new_value.len() + 32);
    let mut replaced = false;
    let trailing_newline = existing.is_empty() || existing.ends_with('\n');
    for line in existing.split_inclusive('\n') {
        if is_gemini_api_key_line(line) {
            out.push_str(&format!("{ENV_VAR}={new_value}"));
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
        out.push_str(&format!("{ENV_VAR}={new_value}\n"));
    }
    out
}

fn is_gemini_api_key_line(line: &str) -> bool {
    let trimmed = line.trim_start();
    // Accept `GEMINI_API_KEY=...` and `export GEMINI_API_KEY=...` forms.
    let body = trimmed.strip_prefix("export ").unwrap_or(trimmed);
    body.starts_with(&format!("{ENV_VAR}="))
}

/// Stage to `.env.tmp` + rename. The rename is atomic on the same
/// filesystem (POSIX + Windows ReplaceFile semantics), so a crash mid-
/// write can never leave the user with an empty `.env` and a broken
/// Gemini install.
async fn write_atomic(final_path: &std::path::Path, bytes: &[u8]) -> CoreResult<()> {
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
    apply_owner_only_perms(&tmp_path)?;
    tokio::fs::rename(&tmp_path, final_path).await.map_err(|e| {
        CoreError::Internal(format!(
            "failed to rename {} to {}: {e}",
            tmp_path.display(),
            final_path.display()
        ))
    })?;
    Ok(())
}

fn tmp_path_for(final_path: &std::path::Path) -> PathBuf {
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

/// Mode 0600 — owner read/write only. The Gemini API key is a secret;
/// anyone with read access to `~/.gemini/.env` can drain the user's
/// Google AI quota. On Windows, `%USERPROFILE%` is already ACL'd to the
/// current user, so a chmod equivalent is unnecessary.
#[cfg(unix)]
fn apply_owner_only_perms(path: &std::path::Path) -> CoreResult<()> {
    use std::os::unix::fs::PermissionsExt;
    let perms = std::fs::Permissions::from_mode(0o600);
    std::fs::set_permissions(path, perms).map_err(|e| {
        CoreError::Internal(format!(
            "failed to chmod 0600 on {}: {e}",
            path.display()
        ))
    })
}

#[cfg(not(unix))]
fn apply_owner_only_perms(_path: &std::path::Path) -> CoreResult<()> {
    // %USERPROFILE% is ACL'd to the current user by default on Windows.
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_rejects_empty() {
        assert!(matches!(
            validate_key(""),
            Err(CoreError::BadRequest(_))
        ));
        assert!(matches!(
            validate_key("   "),
            Err(CoreError::BadRequest(_))
        ));
    }

    #[test]
    fn validate_rejects_too_short_or_long() {
        assert!(matches!(
            validate_key("abc"),
            Err(CoreError::BadRequest(_))
        ));
        let huge = "a".repeat(300);
        assert!(matches!(
            validate_key(&huge),
            Err(CoreError::BadRequest(_))
        ));
    }

    #[test]
    fn validate_rejects_whitespace_and_quotes() {
        assert!(matches!(
            validate_key("AIzaSy with spaces here"),
            Err(CoreError::BadRequest(_))
        ));
        assert!(matches!(
            validate_key("\"AIzaSyAbcDefGhiJklMnoPqrStuVwxYz0123456789\""),
            Err(CoreError::BadRequest(_))
        ));
    }

    #[test]
    fn validate_trims_and_accepts_well_formed_key() {
        let key = "  AIzaSyAbcDefGhiJklMnoPqrStuVwxYz0123456789  ";
        assert_eq!(
            validate_key(key).unwrap(),
            "AIzaSyAbcDefGhiJklMnoPqrStuVwxYz0123456789"
        );
    }

    #[test]
    fn merge_appends_to_empty_file() {
        let out = merge_env_contents("", "AIzaTestKey1234567890");
        assert_eq!(out, "GEMINI_API_KEY=AIzaTestKey1234567890\n");
    }

    #[test]
    fn merge_preserves_other_vars() {
        let existing = "GOOGLE_API_KEY=other\nOTHER_VAR=hello\n";
        let out = merge_env_contents(existing, "AIzaTestKey1234567890");
        assert_eq!(
            out,
            "GOOGLE_API_KEY=other\nOTHER_VAR=hello\nGEMINI_API_KEY=AIzaTestKey1234567890\n"
        );
    }

    #[test]
    fn merge_replaces_existing_key_line_in_place() {
        let existing =
            "GOOGLE_API_KEY=other\nGEMINI_API_KEY=old\nOTHER_VAR=hello\n";
        let out = merge_env_contents(existing, "AIzaTestKey1234567890");
        assert_eq!(
            out,
            "GOOGLE_API_KEY=other\nGEMINI_API_KEY=AIzaTestKey1234567890\nOTHER_VAR=hello\n"
        );
    }

    #[test]
    fn merge_replaces_export_prefixed_form() {
        let existing = "export GEMINI_API_KEY=old\n";
        let out = merge_env_contents(existing, "AIzaTestKey1234567890");
        // We normalize to the bare `KEY=value` form — `.env` files don't
        // honor `export` semantics anyway; gemini-cli parses both.
        assert_eq!(out, "GEMINI_API_KEY=AIzaTestKey1234567890\n");
    }

    #[test]
    fn merge_handles_existing_file_without_trailing_newline() {
        let existing = "OTHER_VAR=hello";
        let out = merge_env_contents(existing, "AIzaTestKey1234567890");
        assert_eq!(
            out,
            "OTHER_VAR=hello\nGEMINI_API_KEY=AIzaTestKey1234567890\n"
        );
    }

    #[tokio::test]
    async fn write_atomic_creates_file_and_stages_via_tmp() {
        let tmp = tempfile::TempDir::new().unwrap();
        let target = tmp.path().join(".env");
        write_atomic(&target, b"GEMINI_API_KEY=hello\n")
            .await
            .unwrap();
        let contents = tokio::fs::read_to_string(&target).await.unwrap();
        assert_eq!(contents, "GEMINI_API_KEY=hello\n");
        // .env.tmp must NOT linger after a successful rename.
        let tmp_path = tmp.path().join(".env.tmp");
        assert!(!tmp_path.exists(), "atomic .tmp should be renamed away");
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn write_atomic_applies_mode_0600_on_unix() {
        use std::os::unix::fs::PermissionsExt;
        let tmp = tempfile::TempDir::new().unwrap();
        let target = tmp.path().join(".env");
        write_atomic(&target, b"GEMINI_API_KEY=hello\n")
            .await
            .unwrap();
        let mode = tokio::fs::metadata(&target).await.unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o600, "expected mode 0600, got {:o}", mode & 0o777);
    }

    #[tokio::test]
    async fn set_gemini_api_key_rejects_empty_input() {
        let err = set_gemini_api_key("").await.unwrap_err();
        assert!(matches!(err, CoreError::BadRequest(_)));
    }
}
