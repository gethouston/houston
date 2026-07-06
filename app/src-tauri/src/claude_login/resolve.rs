//! Locate the `claude` binary, build its login command, and parse the authorize
//! URL out of the CLI's `visit:` line. No process/async state lives here.

use std::path::{Path, PathBuf};
use std::process::Stdio;

use tokio::process::Command;

/// Executable name of the bundled `claude` sidecar (`.exe` on Windows).
fn claude_bin_name() -> &'static str {
    if cfg!(windows) {
        "claude.exe"
    } else {
        "claude"
    }
}

/// Resolve the `claude` binary. Order mirrors `resolve_engine_binary`:
///   1. Explicit env override `HOUSTON_CLAUDE_BIN` (dev/test escape hatch —
///      honored verbatim, even if it points outside a bundle).
///   2. Sibling of the current executable — the bundled-sidecar location Tauri
///      uses on shipping platforms — IF it exists.
///   3. Bare `claude`, resolved via `PATH` (the dev/test path). No panics.
pub(super) fn resolve_claude_binary() -> PathBuf {
    // 1. Explicit env override.
    if let Ok(p) = std::env::var("HOUSTON_CLAUDE_BIN") {
        return PathBuf::from(p);
    }

    // 2. Sibling of the current executable, if bundled.
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            let sibling = exe_dir.join(claude_bin_name());
            if sibling.exists() {
                return sibling;
            }
        }
    }

    // 3. Fall back to PATH.
    PathBuf::from("claude")
}

/// Build the `claude auth login --claudeai` command with piped stdio and the
/// shared `CLAUDE_CONFIG_DIR`. `stdin` is null (the flow is browser-only —
/// there is no terminal to read from) and `kill_on_drop` guarantees the child
/// dies if the owning task is dropped (timeout/cancel/panic).
pub(super) fn build_login_command(bin: &Path, config_dir: &Path) -> Command {
    let mut cmd = Command::new(bin);
    cmd.args(["auth", "login", "--claudeai"])
        .env("CLAUDE_CONFIG_DIR", config_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    cmd
}

/// Parse an authorize URL out of a `visit:` line like
/// `If the browser didn't open, visit: https://claude.ai/oauth/authorize?...`.
/// Returns `None` when there is no `visit:` marker or the following token is not
/// an `http(s)` URL. Dependency-free (no `regex`) — plain string ops.
pub(super) fn extract_visit_url(line: &str) -> Option<String> {
    const MARKER: &str = "visit:";
    let idx = line.find(MARKER)?;
    let rest = line[idx + MARKER.len()..].trim();
    // The URL is the first whitespace-delimited token after the marker.
    let token = rest.split_whitespace().next()?;
    if !(token.starts_with("http://") || token.starts_with("https://")) {
        return None;
    }
    // Strip trailing sentence punctuation the CLI might append (`.` / `)`).
    let trimmed = token.trim_end_matches(|c| c == '.' || c == ')');
    Some(trimmed.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_visit_url_pulls_the_authorize_url() {
        let line = "If the browser didn't open, visit: https://claude.ai/oauth/authorize?code=abc&state=xyz";
        assert_eq!(
            extract_visit_url(line).as_deref(),
            Some("https://claude.ai/oauth/authorize?code=abc&state=xyz")
        );
    }

    #[test]
    fn extract_visit_url_strips_trailing_punctuation() {
        // The CLI could wrap the URL in a sentence: `visit: <url>.`
        let line = "If the browser didn't open, visit: https://claude.ai/oauth/authorize?code=abc.";
        assert_eq!(
            extract_visit_url(line).as_deref(),
            Some("https://claude.ai/oauth/authorize?code=abc")
        );
        // …or in parentheses.
        let line = "(visit: https://claude.ai/oauth/authorize?code=abc)";
        assert_eq!(
            extract_visit_url(line).as_deref(),
            Some("https://claude.ai/oauth/authorize?code=abc")
        );
    }

    #[test]
    fn extract_visit_url_returns_none_without_a_marker_or_url() {
        // No `visit:` marker.
        assert_eq!(extract_visit_url("Opening browser to sign in"), None);
        // Marker but no http(s) token.
        assert_eq!(extract_visit_url("please visit: the docs"), None);
    }

    #[test]
    fn resolve_claude_binary_honors_env_override() {
        // The override wins verbatim over sibling/PATH resolution.
        let sentinel = "/nonexistent/houston/claude-override";
        std::env::set_var("HOUSTON_CLAUDE_BIN", sentinel);
        let resolved = resolve_claude_binary();
        std::env::remove_var("HOUSTON_CLAUDE_BIN");
        assert_eq!(resolved, PathBuf::from(sentinel));
    }
}
