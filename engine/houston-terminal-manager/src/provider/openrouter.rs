//! OpenRouter adapter — the Codex CLI pointed at OpenRouter's
//! OpenAI-compatible endpoint with a Houston-managed API key.
//!
//! OpenRouter ships no CLI of its own; it rides `codex exec` exactly like
//! the OpenAI provider, differing only in the `model_providers.openrouter`
//! config overrides and the `OPENROUTER_API_KEY` env var the runner injects.
//! That difference is fully described by [`CodexBackend`], so every codex
//! dispatch site (`session_dispatch`, `session_io`, `provider_oneshot`,
//! `cli_process`) treats OpenRouter as "codex" without an OpenRouter-specific
//! branch — and the next OpenAI-compatible provider is one more adapter file.

use super::openrouter_classify;
use super::openrouter_credentials;
use super::resolve::{which_on_path, InstallSource};
use super::{CodexBackend, ProbeFuture, ProviderAdapter};
use crate::provider_auth::ProviderAuthState;
use crate::provider_error_kind::ProviderError;
use std::path::{Path, PathBuf};

pub(super) struct OpenRouterAdapter;

pub(super) static OPENROUTER: OpenRouterAdapter = OpenRouterAdapter;

/// Model used when an agent on OpenRouter hasn't picked one. A cheap, strong
/// open-source slug so a fresh connect can chat immediately at low cost.
pub(super) const OPENROUTER_DEFAULT_MODEL: &str = "deepseek/deepseek-chat";

impl ProviderAdapter for OpenRouterAdapter {
    fn id(&self) -> &'static str {
        "openrouter"
    }

    fn cli_name(&self) -> &'static str {
        "codex"
    }

    fn resolve(&self) -> (InstallSource, Option<PathBuf>) {
        // Same binary as OpenAI: the bundled codex, or one on PATH.
        if let Some(path) = houston_cli_bundle::bundled_codex_path() {
            return (InstallSource::Bundled, Some(path));
        }
        if let Some(path) = which_on_path("codex") {
            return (InstallSource::Path, Some(path));
        }
        (InstallSource::Missing, None)
    }

    fn codex_backend(&self) -> Option<CodexBackend> {
        Some(CodexBackend {
            slug: "openrouter",
            display_name: "OpenRouter",
            base_url: "https://openrouter.ai/api/v1",
            env_key: openrouter_credentials::ENV_VAR,
            // Must be "responses": the bundled codex removed support for
            // `wire_api = "chat"` (codex#7782 — config load now errors on it),
            // so it speaks only the OpenAI Responses API, which OpenRouter
            // serves at `/api/v1/responses`.
            wire_api: "responses",
            default_model: Some(OPENROUTER_DEFAULT_MODEL),
        })
    }

    fn probe_auth<'a>(&'a self, _cli_path: &'a Path) -> ProbeFuture<'a> {
        Box::pin(async move {
            // Status reflects the Houston-stored key only. A shell
            // `OPENROUTER_API_KEY` can run a local session but isn't
            // Houston-managed, so treating it as "connected" would show
            // Sign out for a key the user never saved here.
            if openrouter_credentials::openrouter_stored_api_key_configured() {
                ProviderAuthState::Authenticated
            } else {
                ProviderAuthState::Unauthenticated
            }
        })
    }

    fn login_args(&self) -> Option<&'static [&'static str]> {
        // No CLI login: auth is a pasted API key (handled by the
        // `/providers/openrouter/credentials` route, surfaced as the
        // API-key connect dialog in the picker).
        None
    }

    fn logout_args(&self) -> Option<&'static [&'static str]> {
        None
    }

    fn effort_levels(&self) -> &'static [&'static str] {
        // The curated OpenRouter models are non-reasoning chat models, so a
        // `model_reasoning_effort` flag is pure overhead (and meaningless to
        // them). Empty = the runner omits the flag entirely, which is faster.
        &[]
    }

    fn default_effort(&self) -> Option<&'static str> {
        None
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
