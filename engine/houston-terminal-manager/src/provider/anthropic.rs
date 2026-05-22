//! Anthropic / Claude Code adapter.

use super::anthropic_classify;
use super::resolve::{which_on_path, InstallSource};
use super::{ProbeFuture, ProviderAdapter};
use crate::claude_install_path;
use crate::provider_auth::probe_claude_auth_status;
use crate::provider_error_kind::ProviderError;
use std::path::{Path, PathBuf};

pub(super) struct AnthropicAdapter;

pub(super) static ANTHROPIC: AnthropicAdapter = AnthropicAdapter;

impl ProviderAdapter for AnthropicAdapter {
    fn id(&self) -> &'static str {
        "anthropic"
    }

    fn cli_name(&self) -> &'static str {
        "claude"
    }

    fn aliases(&self) -> &'static [&'static str] {
        &["claude"]
    }

    fn resolve(&self) -> (InstallSource, Option<PathBuf>) {
        if claude_install_path::is_installed() {
            return (
                InstallSource::Managed,
                Some(claude_install_path::cli_path()),
            );
        }
        if let Some(path) = which_on_path("claude") {
            return (InstallSource::Path, Some(path));
        }
        (InstallSource::Missing, None)
    }

    fn probe_auth<'a>(&'a self, cli_path: &'a Path) -> ProbeFuture<'a> {
        Box::pin(probe_claude_auth_status(cli_path))
    }

    fn login_args(&self) -> Option<&'static [&'static str]> {
        Some(&["auth", "login", "--claudeai"])
    }

    fn logout_args(&self) -> Option<&'static [&'static str]> {
        // `claude auth logout` clears the macOS Keychain entry (service
        // `claude-code`) on Mac and `~/.claude/.credentials.json` on Linux.
        Some(&["auth", "logout"])
    }

    fn classify_stderr(&self, line: &str) -> Option<ProviderError> {
        anthropic_classify::classify_stderr(line)
    }

    fn classify_result_error(
        &self,
        error_type: &str,
        error_message: &str,
    ) -> Option<ProviderError> {
        anthropic_classify::classify_result_error(error_type, error_message)
    }
}
