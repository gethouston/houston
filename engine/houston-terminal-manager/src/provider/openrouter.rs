//! OpenRouter adapter — Codex CLI with process-local provider overrides.

use super::openrouter_classify;
use super::openrouter_credentials;
use super::resolve::{which_on_path, InstallSource};
use super::{ProbeFuture, ProviderAdapter};
use crate::provider_auth::ProviderAuthState;
use crate::provider_error_kind::ProviderError;
use std::path::{Path, PathBuf};

pub(super) struct OpenRouterAdapter;

pub(super) static OPENROUTER: OpenRouterAdapter = OpenRouterAdapter;

impl ProviderAdapter for OpenRouterAdapter {
    fn id(&self) -> &'static str {
        "openrouter"
    }

    fn cli_name(&self) -> &'static str {
        "codex"
    }

    fn resolve(&self) -> (InstallSource, Option<PathBuf>) {
        if let Some(path) = houston_cli_bundle::bundled_codex_path() {
            return (InstallSource::Bundled, Some(path));
        }
        if let Some(path) = which_on_path("codex") {
            return (InstallSource::Path, Some(path));
        }
        (InstallSource::Missing, None)
    }

    fn probe_auth<'a>(&'a self, _cli_path: &'a Path) -> ProbeFuture<'a> {
        Box::pin(async move {
            // Status reflects Houston-stored credentials only. A shell
            // `OPENROUTER_API_KEY` can run sessions locally but is not
            // exportable for cloud sync, so treating it as "connected"
            // made Settings show Sign out + Sync while sync failed with
            // "connect on this device first".
            if openrouter_credentials::openrouter_stored_api_key_configured() {
                ProviderAuthState::Authenticated
            } else {
                ProviderAuthState::Unauthenticated
            }
        })
    }

    fn login_args(&self) -> Option<&'static [&'static str]> {
        None
    }

    fn logout_args(&self) -> Option<&'static [&'static str]> {
        None
    }

    fn effort_levels(&self) -> &'static [&'static str] {
        &["low", "medium", "high", "xhigh"]
    }

    fn default_effort(&self) -> Option<&'static str> {
        Some("medium")
    }

    fn classify_stderr(&self, line: &str) -> Option<ProviderError> {
        openrouter_classify::classify_stderr(line)
    }

    fn classify_result_error(
        &self,
        error_type: &str,
        error_message: &str,
    ) -> Option<ProviderError> {
        openrouter_classify::classify_result_error(error_type, error_message)
    }
}
