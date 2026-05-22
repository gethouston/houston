//! Gemini provider adapter — Google's `gemini` CLI (Apache-2.0).
//!
//! Adapter for Houston's [`ProviderAdapter`] trait. Bundles a per-arch
//! macOS Node SEA binary via `houston-cli-bundle::bundled_gemini_path`.
//!
//! Auth is NOT CLI-driven: Gemini reads `GEMINI_API_KEY` /
//! `GOOGLE_API_KEY` from env and persists OAuth selection in
//! `~/.gemini/settings.json` (with the chosen Google account in
//! `~/.gemini/google_accounts.json`). There is no `gemini auth login`
//! subcommand to spawn, so [`Self::login_args`] / [`Self::logout_args`]
//! return `None` and the engine surfaces a different connect UX (see
//! `houston-engine-core::provider::launch_login`, which already maps
//! `None` to `BadRequest("...connect via settings instead")`).
//!
//! Disconnect mirrors the same shape: `launch_logout` detects Gemini
//! and routes to `houston_engine_core::provider::disconnect_gemini`,
//! which clears `~/.gemini/.env`'s `GEMINI_API_KEY` line + the OAuth
//! credential files without shelling out to the interactive `/auth
//! logout` slash command (that command mutates history, which Houston
//! must preserve).
//!
//! Pinned upstream: gemini-cli **v0.42.0** (matches the bundled binary
//! shipped by `scripts/fetch-cli-deps.sh`).

mod classify;
mod dotenv;

use super::resolve::{which_on_path, InstallSource};
use super::{ProbeFuture, ProviderAdapter};
use crate::provider_auth::ProviderAuthState;
use crate::provider_error_kind::ProviderError;
use dotenv::{probe_dotenv, DotenvProbe};
use houston_cli_bundle::bundled_gemini_path;
use std::path::{Path, PathBuf};
use std::time::Duration;

pub(super) struct GeminiAdapter;

pub(super) static GEMINI: GeminiAdapter = GeminiAdapter;

/// Hard cap on filesystem reads inside the auth probe. The probe is
/// called from the `/v1/providers/gemini/status` HTTP handler; we never
/// want a slow disk to keep that request open. 2s is well above any
/// realistic local-disk latency for two small JSON files.
const PROBE_TIMEOUT: Duration = Duration::from_secs(2);

impl ProviderAdapter for GeminiAdapter {
    fn id(&self) -> &'static str {
        "gemini"
    }

    fn cli_name(&self) -> &'static str {
        "gemini"
    }

    fn aliases(&self) -> &'static [&'static str] {
        &["google"]
    }

    fn resolve(&self) -> (InstallSource, Option<PathBuf>) {
        if let Some(path) = bundled_gemini_path() {
            return (InstallSource::Bundled, Some(path));
        }
        if let Some(path) = which_on_path("gemini") {
            return (InstallSource::Path, Some(path));
        }
        (InstallSource::Missing, None)
    }

    fn probe_auth<'a>(&'a self, _cli_path: &'a Path) -> ProbeFuture<'a> {
        Box::pin(async move {
            // 1. Env auth is unambiguous — if the key is set the SDK will
            //    use it regardless of `~/.gemini/settings.json`.
            if env_api_key_present() {
                return ProviderAuthState::Authenticated;
            }
            let Some(home) = dirs::home_dir() else {
                return ProviderAuthState::Unknown;
            };
            let gemini_dir = home.join(".gemini");

            // 2. `~/.gemini/.env` with `GEMINI_API_KEY=<non-empty>` — this
            //    is the file Houston's in-app paste flow writes (see
            //    `houston_engine_core::provider::set_gemini_api_key`). The
            //    gemini-cli loads it at startup, so the picker card flips
            //    to "Connected" on the very next status poll after the
            //    user clicks Save in the dialog.
            match probe_dotenv(&gemini_dir).await {
                DotenvProbe::Authenticated => return ProviderAuthState::Authenticated,
                DotenvProbe::Unreadable => return ProviderAuthState::Unknown,
                DotenvProbe::Absent => {}
            }

            // 3. Fall through to the settings.json / google_accounts.json
            //    OAuth-mode classifier.
            let settings_path = gemini_dir.join("settings.json");
            classify_from_settings(&gemini_dir, &settings_path).await
        })
    }

    /// Gemini has no `gemini auth login` subcommand — auth flows through
    /// `~/.gemini/settings.json` + env vars. Returning `None` makes the
    /// engine surface a clear "connect via settings instead" error.
    fn login_args(&self) -> Option<&'static [&'static str]> {
        None
    }

    /// Same reasoning as [`Self::login_args`]: there is no
    /// `gemini logout` subcommand. The engine is responsible for
    /// surfacing a settings-based disconnect UX.
    fn logout_args(&self) -> Option<&'static [&'static str]> {
        None
    }

    fn classify_stderr(&self, line: &str) -> Option<ProviderError> {
        classify::classify_stderr(line)
    }

    fn classify_result_error(
        &self,
        error_type: &str,
        error_message: &str,
    ) -> Option<ProviderError> {
        classify::classify_result_error(error_type, error_message)
    }
}

fn env_api_key_present() -> bool {
    matches!(
        std::env::var("GEMINI_API_KEY"),
        Ok(ref v) if !v.trim().is_empty()
    ) || matches!(
        std::env::var("GOOGLE_API_KEY"),
        Ok(ref v) if !v.trim().is_empty()
    )
}

async fn classify_from_settings(gemini_dir: &Path, settings_path: &Path) -> ProviderAuthState {
    let settings_bytes = match read_file_with_timeout(settings_path).await {
        ReadOutcome::Ok(bytes) => bytes,
        ReadOutcome::NotFound => return ProviderAuthState::Unauthenticated,
        ReadOutcome::Error => return ProviderAuthState::Unknown,
    };

    let value: serde_json::Value = match serde_json::from_slice(&settings_bytes) {
        Ok(v) => v,
        Err(_) => return ProviderAuthState::Unknown,
    };

    let selected = value
        .pointer("/security/auth/selectedType")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    classify_selected_type(selected, gemini_dir).await
}

async fn classify_selected_type(selected: &str, gemini_dir: &Path) -> ProviderAuthState {
    match selected {
        "gemini-api-key" => {
            // User explicitly chose API-key auth but no env var is set —
            // this is the classic "I picked the wrong auth mode" trap.
            // env_api_key_present() was already false (probe_auth's first
            // check), so we know the key is absent here.
            ProviderAuthState::Unauthenticated
        }
        "oauth-personal" | "oauth-google" => check_active_google_account(gemini_dir).await,
        // Unknown / unset value — be honest, don't guess.
        _ => ProviderAuthState::Unknown,
    }
}

async fn check_active_google_account(gemini_dir: &Path) -> ProviderAuthState {
    let accounts_path = gemini_dir.join("google_accounts.json");
    let bytes = match read_file_with_timeout(&accounts_path).await {
        ReadOutcome::Ok(b) => b,
        ReadOutcome::NotFound => return ProviderAuthState::Unauthenticated,
        ReadOutcome::Error => return ProviderAuthState::Unknown,
    };
    let value: serde_json::Value = match serde_json::from_slice(&bytes) {
        Ok(v) => v,
        Err(_) => return ProviderAuthState::Unknown,
    };
    match value.get("active") {
        Some(serde_json::Value::Null) | None => ProviderAuthState::Unauthenticated,
        Some(serde_json::Value::String(s)) if s.trim().is_empty() => {
            ProviderAuthState::Unauthenticated
        }
        Some(_) => ProviderAuthState::Authenticated,
    }
}

pub(super) enum ReadOutcome {
    Ok(Vec<u8>),
    NotFound,
    Error,
}

pub(super) async fn read_file_with_timeout(path: &Path) -> ReadOutcome {
    match tokio::time::timeout(PROBE_TIMEOUT, tokio::fs::read(path)).await {
        Ok(Ok(bytes)) => ReadOutcome::Ok(bytes),
        Ok(Err(e)) if e.kind() == std::io::ErrorKind::NotFound => ReadOutcome::NotFound,
        Ok(Err(_)) | Err(_) => ReadOutcome::Error,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn write_settings(dir: &Path, body: &str) -> PathBuf {
        fs::create_dir_all(dir).unwrap();
        let p = dir.join("settings.json");
        fs::write(&p, body).unwrap();
        p
    }

    fn write_accounts(dir: &Path, body: &str) {
        fs::create_dir_all(dir).unwrap();
        fs::write(dir.join("google_accounts.json"), body).unwrap();
    }

    #[tokio::test]
    async fn missing_settings_file_is_unauthenticated() {
        let tmp = TempDir::new().unwrap();
        let gemini_dir = tmp.path().join(".gemini");
        let settings = gemini_dir.join("settings.json");
        let state = classify_from_settings(&gemini_dir, &settings).await;
        assert_eq!(state, ProviderAuthState::Unauthenticated);
    }

    #[tokio::test]
    async fn malformed_settings_is_unknown() {
        let tmp = TempDir::new().unwrap();
        let gemini_dir = tmp.path().join(".gemini");
        let settings = write_settings(&gemini_dir, "not json");
        assert_eq!(
            classify_from_settings(&gemini_dir, &settings).await,
            ProviderAuthState::Unknown
        );
    }

    #[tokio::test]
    async fn api_key_mode_without_env_is_unauthenticated() {
        let tmp = TempDir::new().unwrap();
        let gemini_dir = tmp.path().join(".gemini");
        let settings = write_settings(
            &gemini_dir,
            r#"{"security":{"auth":{"selectedType":"gemini-api-key"}}}"#,
        );
        assert_eq!(
            classify_from_settings(&gemini_dir, &settings).await,
            ProviderAuthState::Unauthenticated
        );
    }

    #[tokio::test]
    async fn oauth_personal_with_active_account_is_authenticated() {
        let tmp = TempDir::new().unwrap();
        let gemini_dir = tmp.path().join(".gemini");
        let settings = write_settings(
            &gemini_dir,
            r#"{"security":{"auth":{"selectedType":"oauth-personal"}}}"#,
        );
        write_accounts(&gemini_dir, r#"{"active":"user@example.com"}"#);
        assert_eq!(
            classify_from_settings(&gemini_dir, &settings).await,
            ProviderAuthState::Authenticated
        );
    }

    #[tokio::test]
    async fn oauth_personal_with_null_active_is_unauthenticated() {
        let tmp = TempDir::new().unwrap();
        let gemini_dir = tmp.path().join(".gemini");
        let settings = write_settings(
            &gemini_dir,
            r#"{"security":{"auth":{"selectedType":"oauth-personal"}}}"#,
        );
        write_accounts(&gemini_dir, r#"{"active":null}"#);
        assert_eq!(
            classify_from_settings(&gemini_dir, &settings).await,
            ProviderAuthState::Unauthenticated
        );
    }

    #[tokio::test]
    async fn oauth_personal_missing_accounts_file_is_unauthenticated() {
        let tmp = TempDir::new().unwrap();
        let gemini_dir = tmp.path().join(".gemini");
        let settings = write_settings(
            &gemini_dir,
            r#"{"security":{"auth":{"selectedType":"oauth-personal"}}}"#,
        );
        assert_eq!(
            classify_from_settings(&gemini_dir, &settings).await,
            ProviderAuthState::Unauthenticated
        );
    }

    #[tokio::test]
    async fn unknown_selected_type_is_unknown() {
        let tmp = TempDir::new().unwrap();
        let gemini_dir = tmp.path().join(".gemini");
        let settings = write_settings(
            &gemini_dir,
            r#"{"security":{"auth":{"selectedType":"some-future-mode"}}}"#,
        );
        assert_eq!(
            classify_from_settings(&gemini_dir, &settings).await,
            ProviderAuthState::Unknown
        );
    }

    #[test]
    fn adapter_metadata() {
        let a = GeminiAdapter;
        assert_eq!(a.id(), "gemini");
        assert_eq!(a.cli_name(), "gemini");
        assert!(a.aliases().contains(&"google"));
        assert!(a.login_args().is_none());
        assert!(a.logout_args().is_none());
    }
}
