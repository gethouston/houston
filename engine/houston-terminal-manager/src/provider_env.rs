//! Shared environment for provider CLI subprocesses (claude, codex, gemini).
//!
//! Child shell commands inherit this env, so tools like `composio` pick up
//! `CI=1` and emit JSON on stdout instead of TUI / upgrade banners on stderr.

use tokio::process::Command;

/// PATH resolution plus non-interactive env for provider spawns.
pub fn apply_provider_subprocess_env(cmd: &mut Command) {
    cmd.env("PATH", super::claude_path::shell_path());
    cmd.env("CI", "1");
    cmd.env("NO_COLOR", "1");
    cmd.env("TERM", "dumb");
}
