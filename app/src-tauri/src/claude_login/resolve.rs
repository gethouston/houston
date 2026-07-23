//! Locate the `claude` binary, build its login command, and parse the authorize
//! URL out of the CLI's `visit:` line. No process/async state lives here.

use std::path::{Path, PathBuf};
use std::process::Stdio;

use tokio::process::Command;

/// Executable name of the bundled `claude` sidecar (`.exe` on Windows). Only the
/// release-build sibling-resolution arm reads it; in a debug build that arm is
/// `cfg`'d out (we use PATH `claude` there), so mark it allowed-unused there.
#[cfg_attr(debug_assertions, allow(dead_code))]
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
///      uses on shipping platforms — IF it exists. RELEASE ONLY: a debug /
///      `tauri dev` build stages a no-op PLACEHOLDER there (a stub that exits
///      non-zero; the real ~232 MB binary ships only in release), and spawning
///      THAT fails the login. So in a debug build we skip the sibling and use
///      the real `claude` on PATH instead.
///   3. Bare `claude`, resolved via `PATH` (the dev/test path). No panics.
pub(super) fn resolve_claude_binary() -> PathBuf {
    // 1. Explicit env override.
    if let Ok(p) = std::env::var("HOUSTON_CLAUDE_BIN") {
        return PathBuf::from(p);
    }

    // 2. Sibling of the current executable, if bundled — release builds only
    //    (debug stages a `sleep`-forever placeholder; see the doc note above).
    #[cfg(not(debug_assertions))]
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            let sibling = exe_dir.join(claude_bin_name());
            if sibling.exists() {
                return sibling;
            }
        }
    }

    // 3. Fall back to PATH (always in a debug build; the release fallback when
    //    no bundled sibling is present).
    PathBuf::from("claude")
}

/// Build the `claude auth login --claudeai` command with piped stdio and the
/// shared `CLAUDE_CONFIG_DIR`. `stdin` is PIPED: the current CLI authorizes
/// with `code=true` (redirect to platform.claude.com, no localhost redirect)
/// and prints `Paste code here if prompted >` — when the callback page cannot
/// hand the code to the CLI's local listener (firewalls, strict browsers; the
/// common case on Windows), the user is shown a code that must reach the CLI's
/// stdin via `submit_claude_login_code`. `kill_on_drop` guarantees the child
/// dies if the owning task is dropped (timeout/cancel/panic).
pub(super) fn build_login_command(bin: &Path, config_dir: &Path) -> Command {
    let mut cmd = Command::new(bin);
    cmd.args(["auth", "login", "--claudeai"])
        .env("CLAUDE_CONFIG_DIR", config_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    // The CLI's Windows startup gate needs a resolvable shell (Git Bash or
    // PowerShell); repair the child env so it can't miss (HOUSTON-APP-4YP).
    for (key, value) in crate::shell_env::claude_shell_env() {
        cmd.env(key, value);
    }
    #[cfg(windows)]
    {
        // `claude.exe` is a console binary and this GUI app has no console:
        // without CREATE_NO_WINDOW every sign-in pops a visible console
        // window, and a user closing it hangs up the child — the CLI then
        // dies with SIGHUP semantics, exit 129 (HOUSTON-APP-4YQ).
        // CREATE_NEW_PROCESS_GROUP keeps console control events aimed at the
        // parent from propagating, mirroring the engine sidecar spawn.
        cmd.creation_flags(
            crate::child_guard::CREATE_NEW_PROCESS_GROUP | crate::child_guard::CREATE_NO_WINDOW,
        );
    }
    cmd
}

/// Remove OSC 8 hyperlink sequences (`ESC]8;;URI BEL|ESC\` … `ESC]8;; BEL|ESC\`)
/// so only the visible text remains. The current CLI hyperlink-wraps the URL on
/// its `visit:` line even when stdout is a pipe; without stripping, the token
/// after `visit:` starts with an escape byte and the parse below misses.
fn strip_osc8(line: &str) -> String {
    let mut out = String::with_capacity(line.len());
    let mut rest = line;
    while let Some(start) = rest.find("\u{1b}]8;") {
        out.push_str(&rest[..start]);
        let after = &rest[start..];
        // The sequence ends at BEL or ESC-backslash; skip it entirely (the URI
        // between `]8;;` and the terminator is control data, not visible text).
        let end = after
            .find('\u{7}')
            .map(|i| i + 1)
            .or_else(|| after.find("\u{1b}\\").map(|i| i + 2));
        match end {
            Some(e) => rest = &after[e..],
            // Unterminated sequence: drop the tail rather than emit raw escapes.
            None => return out,
        }
    }
    out.push_str(rest);
    out
}

/// Parse an authorize URL out of a `visit:` line like
/// `If the browser didn't open, visit: https://claude.ai/oauth/authorize?...`.
/// Returns `None` when there is no `visit:` marker or the following token is not
/// an `http(s)` URL. Dependency-free (no `regex`) — plain string ops.
pub(super) fn extract_visit_url(line: &str) -> Option<String> {
    const MARKER: &str = "visit:";
    let line = strip_osc8(line);
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
    use std::sync::Mutex;

    /// Serializes the tests that mutate the shared process env var
    /// `HOUSTON_CLAUDE_BIN` — cargo runs tests in parallel, so without this they
    /// race on the same global and flake.
    static ENV_LOCK: Mutex<()> = Mutex::new(());

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
    fn extract_visit_url_unwraps_osc8_hyperlinks() {
        // Real shape from CLI 2.1.201: the URL is OSC-8 wrapped (BEL-terminated)
        // — control URI, visible URL text, then the closing empty hyperlink.
        let url = "https://claude.com/cai/oauth/authorize?code=true&client_id=abc&state=xyz";
        let line =
            format!("If the browser didn't open, visit: \u{1b}]8;;{url}\u{7}{url}\u{1b}]8;;\u{7}");
        assert_eq!(extract_visit_url(&line).as_deref(), Some(url));
        // ESC-backslash terminated variant.
        let line = format!(
            "If the browser didn't open, visit: \u{1b}]8;;{url}\u{1b}\\{url}\u{1b}]8;;\u{1b}\\"
        );
        assert_eq!(extract_visit_url(&line).as_deref(), Some(url));
    }

    #[test]
    fn extract_visit_url_drops_an_unterminated_osc8_tail() {
        // A truncated read mid-sequence must not surface raw escape bytes.
        let line = "visit: \u{1b}]8;;https://claude.com/cai/oauth/authorize?x=1";
        assert_eq!(extract_visit_url(line), None);
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
        let _guard = ENV_LOCK.lock().unwrap();
        // The override wins verbatim over sibling/PATH resolution.
        let sentinel = "/nonexistent/houston/claude-override";
        std::env::set_var("HOUSTON_CLAUDE_BIN", sentinel);
        let resolved = resolve_claude_binary();
        std::env::remove_var("HOUSTON_CLAUDE_BIN");
        assert_eq!(resolved, PathBuf::from(sentinel));
    }

    #[test]
    #[cfg(debug_assertions)]
    fn resolve_claude_binary_uses_path_in_debug_not_the_placeholder() {
        let _guard = ENV_LOCK.lock().unwrap();
        // Tests run in a debug build, where the bundled sibling is a no-op
        // `sleep`-forever placeholder. Resolution must SKIP it and fall back to
        // the real `claude` on PATH — spawning the placeholder would hang the
        // login on a spinner forever (the dev-mode bug this guards).
        std::env::remove_var("HOUSTON_CLAUDE_BIN");
        assert_eq!(resolve_claude_binary(), PathBuf::from("claude"));
    }
}
