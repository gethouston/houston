//! Gemini disconnect helper — symmetric counterpart to
//! [`super::gemini_credentials::set_gemini_api_key`].
//!
//! Gemini has no `gemini auth logout` CLI subcommand. The interactive
//! `/auth logout` slash command added in gemini-cli PR #13383 DOES
//! exist, but it calls `stripThoughtsFromHistory()` as a side effect,
//! which mutates conversation history — Houston must preserve history,
//! so we can't shell out to that command. Instead, we clear the same
//! credential files that command clears internally, directly from the
//! engine.
//!
//! Cleared:
//! - `~/.gemini/.env`'s `GEMINI_API_KEY=` line (and the file itself if
//!   stripping the line leaves it empty). Other `KEY=VALUE` lines in
//!   `.env` are preserved verbatim — mirror of the set-side merge.
//! - `~/.gemini/oauth_creds.json` (the OAuth access + refresh token
//!   blob gemini-cli writes after a successful browser flow).
//! - `~/.gemini/google_accounts.json` (the active-Google-account
//!   record gemini-cli maintains alongside oauth_creds).
//!
//! Left alone:
//! - `settings.json` — keeps the user's preferred `selectedAuthType`
//!   for the next login (saves them re-picking OAuth vs API-key).
//! - `history/`, `tmp/`, `GEMINI.md` — sessions and user memories.
//! - `projects.json`, `trustedFolders.json`, `state.json`,
//!   `installation_id` — UI / project metadata.
//!
//! Env-var case: if `GEMINI_API_KEY` or `GOOGLE_API_KEY` is set in the
//! user's shell, we refuse to disconnect (returning
//! [`CoreError::Conflict`]) and surface an instruction. Houston cannot
//! unset shell env vars, and the auth probe would keep reporting
//! "Connected" if we cleared the files anyway. Block + instruct is
//! more honest than half-disconnecting.

use super::gemini_credentials::{is_gemini_api_key_line, write_atomic};
use crate::error::{CoreError, CoreResult};
use std::path::{Path, PathBuf};

const GEMINI_API_KEY_ENV: &str = "GEMINI_API_KEY";
const GOOGLE_API_KEY_ENV: &str = "GOOGLE_API_KEY";

/// Disconnect Houston from Gemini by clearing the credential files
/// gemini-cli persists in `~/.gemini/`.
///
/// Returns `CoreError::Conflict` if a Gemini auth env var is set in
/// the user's shell — Houston cannot unset shell vars, and clearing
/// files while the env var is still set would not actually log the
/// user out (the auth probe checks env vars first).
pub async fn disconnect_gemini() -> CoreResult<()> {
    if let Some(var) = blocking_env_var() {
        return Err(CoreError::Conflict(format!(
            "`{var}` is set in your shell. Unset it there, then try disconnecting again."
        )));
    }
    let gemini_dir = resolve_gemini_dir()?;
    disconnect_gemini_at(&gemini_dir).await
}

fn resolve_gemini_dir() -> CoreResult<PathBuf> {
    let home = dirs::home_dir().ok_or_else(|| {
        CoreError::Internal("could not resolve home directory for gemini disconnect".into())
    })?;
    Ok(home.join(".gemini"))
}

fn blocking_env_var() -> Option<&'static str> {
    blocking_env_var_with(|name| std::env::var(name).ok())
}

/// Inner so tests can inject a fake env reader without mutating
/// `std::env` (which is process-global and hostile to parallel tests).
fn blocking_env_var_with(get: impl Fn(&str) -> Option<String>) -> Option<&'static str> {
    if has_value(get(GEMINI_API_KEY_ENV).as_deref()) {
        return Some(GEMINI_API_KEY_ENV);
    }
    if has_value(get(GOOGLE_API_KEY_ENV).as_deref()) {
        return Some(GOOGLE_API_KEY_ENV);
    }
    None
}

fn has_value(value: Option<&str>) -> bool {
    matches!(value, Some(v) if !v.trim().is_empty())
}

/// Testable inner that takes the gemini directory as a parameter
/// (instead of resolving from `dirs::home_dir()`). Idempotent: missing
/// files are not an error — re-running this on an already-disconnected
/// state is a successful no-op.
async fn disconnect_gemini_at(gemini_dir: &Path) -> CoreResult<()> {
    strip_api_key_line(&gemini_dir.join(".env")).await?;
    remove_file_if_present(&gemini_dir.join("oauth_creds.json"), "oauth_creds.json").await?;
    remove_file_if_present(
        &gemini_dir.join("google_accounts.json"),
        "google_accounts.json",
    )
    .await?;
    tracing::info!(
        "[gemini-creds] disconnect: credential files cleared at {}",
        gemini_dir.display()
    );
    Ok(())
}

/// Strip the `GEMINI_API_KEY=` line from `.env` if present.
/// - File doesn't exist: no-op success.
/// - No `GEMINI_API_KEY=` line in the file: file left untouched.
/// - Stripping leaves the file empty (only whitespace): the file is
///   deleted entirely rather than leaving an empty `.env` behind.
/// - Otherwise: atomic write of the remaining content (mirrors the
///   set-side's atomicity guarantee — torn writes can't leave the user
///   with a half-empty `.env`).
async fn strip_api_key_line(env_path: &Path) -> CoreResult<()> {
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
        .filter(|line| !is_gemini_api_key_line(line))
        .collect();
    if new_contents == existing {
        return Ok(()); // No api-key line found; file is unrelated.
    }
    if new_contents.trim().is_empty() {
        tokio::fs::remove_file(env_path).await.map_err(|e| {
            CoreError::Internal(format!(
                "failed to remove empty {}: {e}",
                env_path.display()
            ))
        })?;
        tracing::info!(
            "[gemini-creds] disconnect: removed empty .env at {}",
            env_path.display()
        );
        return Ok(());
    }
    write_atomic(env_path, new_contents.as_bytes()).await?;
    tracing::info!(
        "[gemini-creds] disconnect: stripped GEMINI_API_KEY line from {}",
        env_path.display()
    );
    Ok(())
}

async fn remove_file_if_present(path: &Path, log_name: &str) -> CoreResult<()> {
    match tokio::fs::remove_file(path).await {
        Ok(()) => {
            tracing::info!("[gemini-creds] disconnect: removed {log_name}");
            Ok(())
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(CoreError::Internal(format!(
            "failed to remove {}: {e}",
            path.display()
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use tempfile::TempDir;
    use tokio::fs;

    fn env(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs
            .iter()
            .map(|(k, v)| ((*k).to_string(), (*v).to_string()))
            .collect()
    }

    fn reader(map: HashMap<String, String>) -> impl Fn(&str) -> Option<String> {
        move |name: &str| map.get(name).cloned()
    }

    #[test]
    fn blocking_env_var_detects_gemini_api_key() {
        let r = reader(env(&[("GEMINI_API_KEY", "AIzaSampleKey")]));
        assert_eq!(blocking_env_var_with(r), Some("GEMINI_API_KEY"));
    }

    #[test]
    fn blocking_env_var_detects_google_api_key() {
        let r = reader(env(&[("GOOGLE_API_KEY", "AIzaSampleKey")]));
        assert_eq!(blocking_env_var_with(r), Some("GOOGLE_API_KEY"));
    }

    #[test]
    fn blocking_env_var_prefers_gemini_when_both_set() {
        let r = reader(env(&[
            ("GEMINI_API_KEY", "key1"),
            ("GOOGLE_API_KEY", "key2"),
        ]));
        assert_eq!(blocking_env_var_with(r), Some("GEMINI_API_KEY"));
    }

    #[test]
    fn blocking_env_var_ignores_whitespace_only_values() {
        let r = reader(env(&[
            ("GEMINI_API_KEY", "   "),
            ("GOOGLE_API_KEY", ""),
        ]));
        assert_eq!(blocking_env_var_with(r), None);
    }

    #[test]
    fn blocking_env_var_returns_none_when_unset() {
        let r = reader(HashMap::new());
        assert_eq!(blocking_env_var_with(r), None);
    }

    #[tokio::test]
    async fn disconnect_when_both_files_present_clears_both_and_removes_solo_env() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path();
        fs::write(dir.join("oauth_creds.json"), r#"{"token":"x"}"#)
            .await
            .unwrap();
        fs::write(dir.join("google_accounts.json"), r#"{"active":"a@b.c"}"#)
            .await
            .unwrap();
        fs::write(dir.join(".env"), "GEMINI_API_KEY=secret\n")
            .await
            .unwrap();

        disconnect_gemini_at(dir).await.unwrap();

        assert!(!dir.join("oauth_creds.json").exists());
        assert!(!dir.join("google_accounts.json").exists());
        assert!(
            !dir.join(".env").exists(),
            ".env containing only the API key line must be removed"
        );
    }

    #[tokio::test]
    async fn disconnect_preserves_other_env_vars_when_stripping_api_key() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path();
        fs::write(
            dir.join(".env"),
            "OTHER_VAR=hello\nGEMINI_API_KEY=secret\nANOTHER=world\n",
        )
        .await
        .unwrap();

        disconnect_gemini_at(dir).await.unwrap();

        let contents = fs::read_to_string(dir.join(".env")).await.unwrap();
        assert_eq!(contents, "OTHER_VAR=hello\nANOTHER=world\n");
    }

    #[tokio::test]
    async fn disconnect_strips_export_prefixed_form() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path();
        fs::write(
            dir.join(".env"),
            "OTHER=keep\nexport GEMINI_API_KEY=secret\n",
        )
        .await
        .unwrap();

        disconnect_gemini_at(dir).await.unwrap();

        let contents = fs::read_to_string(dir.join(".env")).await.unwrap();
        assert_eq!(contents, "OTHER=keep\n");
    }

    #[tokio::test]
    async fn disconnect_is_idempotent_when_nothing_to_clear() {
        let tmp = TempDir::new().unwrap();
        disconnect_gemini_at(tmp.path()).await.unwrap();
        disconnect_gemini_at(tmp.path()).await.unwrap();
    }

    #[tokio::test]
    async fn disconnect_leaves_env_alone_when_no_api_key_line() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path();
        let original = "OTHER_VAR=hello\nUNRELATED=world\n";
        fs::write(dir.join(".env"), original).await.unwrap();

        disconnect_gemini_at(dir).await.unwrap();

        let contents = fs::read_to_string(dir.join(".env")).await.unwrap();
        assert_eq!(
            contents, original,
            "an .env without the api-key line must be untouched"
        );
    }

    #[tokio::test]
    async fn disconnect_does_not_touch_settings_or_history_or_memories() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path();
        fs::write(dir.join("settings.json"), r#"{"theme":"dark"}"#)
            .await
            .unwrap();
        fs::create_dir_all(dir.join("history")).await.unwrap();
        fs::write(dir.join("history").join("session.json"), r#"{"id":"s1"}"#)
            .await
            .unwrap();
        fs::write(dir.join("GEMINI.md"), "User memories.")
            .await
            .unwrap();
        fs::write(dir.join("projects.json"), r#"{}"#).await.unwrap();
        fs::write(dir.join("trustedFolders.json"), r#"{}"#)
            .await
            .unwrap();
        fs::write(dir.join(".env"), "GEMINI_API_KEY=secret\n")
            .await
            .unwrap();
        fs::write(dir.join("oauth_creds.json"), r#"{"t":"x"}"#)
            .await
            .unwrap();

        disconnect_gemini_at(dir).await.unwrap();

        assert!(dir.join("settings.json").exists(), "settings.json must survive");
        assert!(
            dir.join("history").join("session.json").exists(),
            "history must survive"
        );
        assert!(dir.join("GEMINI.md").exists(), "GEMINI.md must survive");
        assert!(dir.join("projects.json").exists(), "projects.json must survive");
        assert!(
            dir.join("trustedFolders.json").exists(),
            "trustedFolders.json must survive"
        );
        assert!(!dir.join(".env").exists());
        assert!(!dir.join("oauth_creds.json").exists());
    }

    #[tokio::test]
    async fn disconnect_clears_oauth_alone_without_env() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path();
        fs::write(dir.join("oauth_creds.json"), r#"{"token":"x"}"#)
            .await
            .unwrap();

        disconnect_gemini_at(dir).await.unwrap();

        assert!(!dir.join("oauth_creds.json").exists());
    }

    #[tokio::test]
    async fn disconnect_clears_google_accounts_alone() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path();
        fs::write(dir.join("google_accounts.json"), r#"{"active":"a@b.c"}"#)
            .await
            .unwrap();

        disconnect_gemini_at(dir).await.unwrap();

        assert!(!dir.join("google_accounts.json").exists());
    }
}
