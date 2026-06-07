//! Provider CLI auth probes shared by status routes and session error handling.

use crate::provider_env::read_stored_api_key;
use crate::claude_path;
use crate::provider::openai_credentials;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::Duration;

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProviderAuthState {
    Authenticated,
    Unauthenticated,
    Unknown,
}

impl ProviderAuthState {
    pub const fn is_authenticated(self) -> bool {
        matches!(self, Self::Authenticated)
    }
}

/// True when a non-empty API key is set in the process env or Houston storage.
pub fn houston_managed_api_key_authenticated(provider: &str, env_var: &str) -> bool {
    if process_env_api_key_present(env_var) {
        return true;
    }
    read_stored_api_key(provider, env_var).is_some()
}

fn process_env_api_key_present(env_var: &str) -> bool {
    matches!(
        std::env::var(env_var),
        Ok(ref v) if !v.trim().is_empty()
    )
}

pub async fn probe_claude_auth_status(cli_path: &Path, home: &str) -> ProviderAuthState {
    if houston_managed_api_key_authenticated("anthropic", "ANTHROPIC_API_KEY") {
        return ProviderAuthState::Authenticated;
    }
    match probe_claude_status_cli(cli_path).await {
        ProviderAuthState::Authenticated => ProviderAuthState::Authenticated,
        ProviderAuthState::Unauthenticated => ProviderAuthState::Unauthenticated,
        // `claude auth status` couldn't be classified (timed out, errored, or
        // printed a format we don't recognize). Fall back to the OAuth
        // credential file the CLI writes on login and removes on
        // `claude auth logout`, mirroring the codex probe. Without this the
        // status stays Unknown, which the settings card can't distinguish
        // from connected — so a sign-out never flipped the Anthropic card
        // back to "Connect" (unlike codex, which already has this fallback).
        ProviderAuthState::Unknown => read_claude_auth_file(home),
    }
}

async fn probe_claude_status_cli(cli_path: &Path) -> ProviderAuthState {
    let result = tokio::time::timeout(
        Duration::from_secs(5),
        tokio::process::Command::new(cli_path)
            .args(["auth", "status"])
            .env("PATH", claude_path::shell_path())
            .kill_on_drop(true)
            .output(),
    )
    .await;

    let output = match result {
        Ok(Ok(output)) => output,
        _ => return ProviderAuthState::Unknown,
    };

    classify_claude_auth_status_output(
        output.status.success(),
        &String::from_utf8_lossy(&output.stdout),
        &String::from_utf8_lossy(&output.stderr),
    )
}

pub async fn probe_codex_auth_status(cli_path: &Path, home: &str) -> ProviderAuthState {
    if houston_managed_api_key_authenticated("openai", "OPENAI_API_KEY") {
        return ProviderAuthState::Authenticated;
    }
    match probe_codex_login_status(cli_path).await {
        ProviderAuthState::Authenticated => ProviderAuthState::Authenticated,
        ProviderAuthState::Unauthenticated => {
            if openai_credentials::openai_api_key_configured() {
                ProviderAuthState::Authenticated
            } else {
                read_codex_auth_file(home)
            }
        }
        ProviderAuthState::Unknown => match read_codex_auth_file(home) {
            ProviderAuthState::Authenticated => ProviderAuthState::Authenticated,
            other => {
                if openai_credentials::openai_api_key_configured() {
                    ProviderAuthState::Authenticated
                } else {
                    other
                }
            }
        },
    }
}

async fn probe_codex_login_status(cli_path: &Path) -> ProviderAuthState {
    let result = tokio::time::timeout(
        Duration::from_secs(5),
        tokio::process::Command::new(cli_path)
            .args(["login", "status", "-c", "model_reasoning_effort=high"])
            .env("PATH", claude_path::shell_path())
            .kill_on_drop(true)
            .output(),
    )
    .await;

    let output = match result {
        Ok(Ok(output)) => output,
        _ => return ProviderAuthState::Unknown,
    };

    classify_codex_login_status_output(
        output.status.success(),
        &String::from_utf8_lossy(&output.stdout),
        &String::from_utf8_lossy(&output.stderr),
    )
}

fn classify_claude_auth_status_output(
    success: bool,
    stdout: &str,
    stderr: &str,
) -> ProviderAuthState {
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(stdout.trim()) {
        if let Some(logged_in) = value.get("loggedIn").and_then(|v| v.as_bool()) {
            return if logged_in {
                ProviderAuthState::Authenticated
            } else {
                ProviderAuthState::Unauthenticated
            };
        }
    }

    let text = format!("{stdout}\n{stderr}").to_lowercase();
    if contains_unauthenticated_text(&text) {
        return ProviderAuthState::Unauthenticated;
    }
    if success && (text.contains("logged in") || text.contains("authenticated")) {
        return ProviderAuthState::Authenticated;
    }
    ProviderAuthState::Unknown
}

fn classify_codex_login_status_output(
    success: bool,
    stdout: &str,
    stderr: &str,
) -> ProviderAuthState {
    let text = format!("{stdout}\n{stderr}").to_lowercase();
    if contains_unauthenticated_text(&text)
        || text.contains("signed out")
        || text.contains("no auth credentials")
        || text.contains("run codex login")
    {
        return ProviderAuthState::Unauthenticated;
    }
    if success && (text.contains("logged in") || text.contains("authenticated")) {
        return ProviderAuthState::Authenticated;
    }
    ProviderAuthState::Unknown
}

fn contains_unauthenticated_text(text: &str) -> bool {
    text.contains("not logged in")
        || text.contains("not authenticated")
        || text.contains("please login")
        || text.contains("please log in")
}

fn read_codex_auth_file(home: &str) -> ProviderAuthState {
    let auth_path = PathBuf::from(home).join(".codex").join("auth.json");
    let content = match std::fs::read_to_string(&auth_path) {
        Ok(content) => content,
        Err(_) => return ProviderAuthState::Unauthenticated,
    };
    serde_json::from_str::<serde_json::Value>(&content)
        .ok()
        .map(|value| {
            let has_api_key = value
                .get("OPENAI_API_KEY")
                .and_then(|key| key.as_str())
                .is_some_and(|s| !s.is_empty());
            let has_tokens = value.get("tokens").is_some();
            if has_api_key || has_tokens {
                ProviderAuthState::Authenticated
            } else {
                ProviderAuthState::Unauthenticated
            }
        })
        .unwrap_or(ProviderAuthState::Unknown)
}

/// Resolve Anthropic auth from the OAuth credential file as a fallback when
/// `claude auth status` can't be classified. The `claude` CLI writes
/// `~/.claude/.credentials.json` on login and deletes it on `claude auth
/// logout`, so a present file with a non-empty access token is a reliable
/// signal. On macOS the CLI can store credentials in the Keychain instead,
/// but there `claude auth status` answers cleanly, so this file fallback is
/// only reached on the rare CLI timeout/error path.
fn read_claude_auth_file(home: &str) -> ProviderAuthState {
    let auth_path = PathBuf::from(home).join(".claude").join(".credentials.json");
    match std::fs::read_to_string(&auth_path) {
        Ok(content) => classify_claude_credentials_json(&content),
        Err(_) => ProviderAuthState::Unauthenticated,
    }
}

fn classify_claude_credentials_json(content: &str) -> ProviderAuthState {
    serde_json::from_str::<serde_json::Value>(content)
        .ok()
        .map(|value| {
            let has_token = value
                .get("claudeAiOauth")
                .and_then(|oauth| oauth.get("accessToken"))
                .and_then(|token| token.as_str())
                .is_some_and(|token| !token.is_empty());
            if has_token {
                ProviderAuthState::Authenticated
            } else {
                ProviderAuthState::Unauthenticated
            }
        })
        .unwrap_or(ProviderAuthState::Unknown)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_env_lock::lock_env_test;

    #[test]
    fn claude_auth_status_classifies_json_logged_in() {
        let state = classify_claude_auth_status_output(true, r#"{"loggedIn":true}"#, "");
        assert_eq!(state, ProviderAuthState::Authenticated);
    }

    #[test]
    fn claude_auth_status_classifies_json_logged_out() {
        let state = classify_claude_auth_status_output(true, r#"{"loggedIn":false}"#, "");
        assert_eq!(state, ProviderAuthState::Unauthenticated);
    }

    #[test]
    fn claude_auth_status_keeps_opaque_failures_unknown() {
        let state = classify_claude_auth_status_output(false, "", "Error: Unknown error");
        assert_eq!(state, ProviderAuthState::Unknown);
    }

    #[test]
    fn codex_login_status_classifies_logged_in_output() {
        let state = classify_codex_login_status_output(true, "Logged in using ChatGPT", "");
        assert_eq!(state, ProviderAuthState::Authenticated);
    }

    #[test]
    fn codex_login_status_classifies_not_logged_in_output_first() {
        let state = classify_codex_login_status_output(true, "Not logged in", "");
        assert_eq!(state, ProviderAuthState::Unauthenticated);
    }

    #[test]
    fn codex_login_status_falls_back_on_config_errors() {
        let stderr = "Error loading configuration: unknown variant `xhigh`";
        let state = classify_codex_login_status_output(false, "", stderr);
        assert_eq!(state, ProviderAuthState::Unknown);
    }

    #[test]
    fn claude_credentials_with_access_token_is_authenticated() {
        let state = classify_claude_credentials_json(
            r#"{"claudeAiOauth":{"accessToken":"sk-ant-oat01-abc","refreshToken":"r","expiresAt":1}}"#,
        );
        assert_eq!(state, ProviderAuthState::Authenticated);
    }

    #[test]
    fn claude_credentials_without_token_is_unauthenticated() {
        assert_eq!(
            classify_claude_credentials_json(r#"{"claudeAiOauth":{"accessToken":""}}"#),
            ProviderAuthState::Unauthenticated,
        );
        assert_eq!(
            classify_claude_credentials_json("{}"),
            ProviderAuthState::Unauthenticated,
        );
    }

    #[test]
    fn claude_credentials_garbage_is_unknown() {
        assert_eq!(
            classify_claude_credentials_json("not json at all"),
            ProviderAuthState::Unknown,
        );
    }

    #[test]
    fn claude_auth_file_missing_is_unauthenticated() {
        // A logged-out user has no ~/.claude/.credentials.json — the fallback
        // must read that as signed out so the settings card flips to Connect.
        let state = read_claude_auth_file("/no-such-home-dir-houston-unit-test");
        assert_eq!(state, ProviderAuthState::Unauthenticated);
    }

    #[test]
    fn codex_auth_file_with_oauth_tokens_is_authenticated() {
        let tmp = tempfile::TempDir::new().unwrap();
        let codex_dir = tmp.path().join(".codex");
        std::fs::create_dir_all(&codex_dir).unwrap();
        std::fs::write(
            codex_dir.join("auth.json"),
            r#"{"tokens":{"access_token":"tok"}}"#,
        )
        .unwrap();
        let state = read_codex_auth_file(tmp.path().to_str().unwrap());
        assert_eq!(state, ProviderAuthState::Authenticated);
    }

    #[test]
    fn houston_managed_key_authenticated_reads_legacy_path() {
        let _guard = lock_env_test();
        let tmp = tempfile::TempDir::new().unwrap();
        let prior_home = std::env::var_os("HOME");
        let prior_houston = std::env::var_os("HOUSTON_HOME");
        std::env::set_var("HOME", tmp.path());
        std::env::set_var("HOUSTON_HOME", tmp.path());

        let legacy = tmp.path().join(".houston/openrouter/.env");
        std::fs::create_dir_all(legacy.parent().unwrap()).unwrap();
        std::fs::write(&legacy, "OPENROUTER_API_KEY=sk-or-v1-test\n").unwrap();

        assert!(houston_managed_api_key_authenticated(
            "openrouter",
            "OPENROUTER_API_KEY"
        ));

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
