//! OpenAI / Codex adapter.

use super::openai_classify;
use super::resolve::{which_on_path, InstallSource};
use super::{ProbeFuture, ProviderAdapter};
use crate::provider_auth::probe_codex_auth_status;
use crate::provider_error_kind::ProviderError;
use std::path::{Path, PathBuf};

pub(super) struct OpenAiAdapter;

pub(super) static OPENAI: OpenAiAdapter = OpenAiAdapter;

impl ProviderAdapter for OpenAiAdapter {
    fn id(&self) -> &'static str {
        "openai"
    }

    fn cli_name(&self) -> &'static str {
        "codex"
    }

    fn aliases(&self) -> &'static [&'static str] {
        &["codex"]
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

    fn probe_auth<'a>(&'a self, cli_path: &'a Path) -> ProbeFuture<'a> {
        Box::pin(async move {
            let home = dirs::home_dir()
                .map(|p| p.to_string_lossy().into_owned())
                .unwrap_or_default();
            probe_codex_auth_status(cli_path, &home).await
        })
    }

    fn login_args(&self) -> Option<&'static [&'static str]> {
        // Same guard as `logout_args` and the runner: codex loads
        // `~/.codex/config.toml` before any subcommand, so a stale
        // `model_reasoning_effort` the bundled enum can't parse (e.g. a
        // stray `max` copied from Claude) would make it bail out before the
        // OAuth flow can even start. Force a known-good value.
        Some(&["login", "-c", "model_reasoning_effort=high"])
    }

    fn logout_args(&self) -> Option<&'static [&'static str]> {
        // `codex logout` revokes the ChatGPT refresh token server-side
        // then deletes `~/.codex/auth.json`.
        //
        // Codex loads `~/.codex/config.toml` before running any subcommand,
        // including `logout`. A `model_reasoning_effort` value the bundled
        // CLI's enum doesn't recognize (e.g. `max`, which is Claude-only)
        // makes logout exit 1 with a config error, leaving the user stuck
        // signed in. Force a known-good value, same trick
        // `provider_auth::probe_codex_auth_status` uses for `login status`.
        Some(&["logout", "-c", "model_reasoning_effort=high"])
    }

    fn effort_levels(&self) -> &'static [&'static str] {
        // Codex `ReasoningEffort` enum (bundled CLI):
        // none/minimal/low/medium/high/xhigh. We surface the meaningful
        // tuning range. `max` is Claude-only and would be an "unknown
        // variant" to codex — and codex has no clamp-to-highest fallback —
        // so it is deliberately excluded.
        &["low", "medium", "high", "xhigh"]
    }

    fn default_effort(&self) -> Option<&'static str> {
        Some("medium")
    }

    fn classify_stderr(&self, line: &str) -> Option<ProviderError> {
        openai_classify::classify_stderr(line)
    }

    fn classify_result_error(
        &self,
        error_type: &str,
        error_message: &str,
    ) -> Option<ProviderError> {
        openai_classify::classify_result_error(error_type, error_message)
    }
}
