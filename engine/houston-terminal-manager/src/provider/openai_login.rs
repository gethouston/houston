//! Codex login-subprocess failure diagnosis.
//!
//! Distinct from [`super::openai_classify`], which maps a *running* codex
//! session's stderr / result errors onto the session-level
//! [`crate::provider_error_kind::ProviderError`] card taxonomy. This module
//! diagnoses a `codex login` subprocess that exits non-zero, turning a
//! confusing raw-CLI-output toast into an actionable, recoverable message.
//!
//! ## The bug this fixes (HOU-446)
//!
//! Plain `codex login` (the desktop loopback flow) starts a local HTTP
//! callback server on a **fixed** port (1455) and prints the informational
//! banner `Starting local login server on http://localhost:1455.` before it
//! waits for the browser redirect. When that helper can't start — the port is
//! already held by an orphaned prior `codex login`, or it's blocked by a
//! firewall / VPN / security tool — codex exits non-zero within a second of
//! printing that banner.
//!
//! Houston's login probe ([`crate::provider`] caller in
//! `houston-engine-core`) surfaced the first non-empty output stream verbatim
//! as the failure detail, so the user saw
//! `internal: codex login: Starting local login server on http://localhost:1455.`
//! — codex's benign startup line dressed up as an internal error, with no
//! cause and no path to recover.
//!
//! [`diagnose`] recognizes that startup-failure signature (the banner, the
//! fixed port, or an explicit address-in-use / bind error on any platform)
//! and returns a [`super::LoginFailureHint`] the caller renders as a clear,
//! recoverable message. Anything it doesn't recognize returns `None`, so a
//! genuine codex login error (bad config, auth failure, ...) still surfaces
//! its real stderr.

use super::LoginFailureHint;

/// Machine-readable tag attached to the diagnosed error
/// (`CoreError::Labeled.kind` → `error.details.kind` on the wire). The
/// frontend may match on it to render localized copy; until it does, the
/// English [`SERVER_UNAVAILABLE_MESSAGE`] is shown as the toast description.
pub const SERVER_UNAVAILABLE_KIND: &str = "codex_login_server_unavailable";

/// User-facing, recoverable message for the codex loopback login-server
/// startup failure. Desktop-appropriate: the desktop app has no device-code
/// fallback button (that flow is remote-only), so the guidance is "close the
/// other sign-in, wait, retry" rather than "use a one-time code". No em dash
/// per the copy rules.
pub const SERVER_UNAVAILABLE_MESSAGE: &str = "Codex could not start its local sign-in helper on port 1455. Another Codex sign-in may still be running, or the port is blocked by other software. Close any other sign-in window, wait a few seconds, then try Connect again.";

/// Lowercased substrings that mark a codex loopback login-server startup
/// failure. Any one match is enough. Kept deliberately specific to the
/// login-server / fixed port so a different codex login failure (bad config,
/// auth error) falls through to its real stderr instead of being mislabeled.
const SERVER_FAILURE_SIGNATURES: &[&str] = &[
    // codex's own informational banner — present even when the bind then
    // fails, which is exactly the line that used to leak as "the error".
    "local login server",
    // The fixed loopback port codex always uses for this flow.
    "localhost:1455",
    "127.0.0.1:1455",
    ":1455",
    // Explicit bind failures, across platforms:
    "address already in use", // generic
    "address in use",
    "eaddrinuse",                            // Node-style / some wrappers
    "os error 48",                           // macOS EADDRINUSE
    "os error 98",                           // Linux EADDRINUSE
    "only one usage of each socket address", // Windows WSAEADDRINUSE
    "failed to bind",
    "could not bind",
    "error binding",
];

/// Diagnose a non-zero `codex login` exit from its captured `stdout` +
/// `stderr`. Returns [`Some`] with a recoverable hint when the output carries
/// a loopback login-server startup-failure signature, otherwise [`None`].
///
/// Both streams are inspected because codex has printed the banner to stderr
/// in shipped versions while a bind error can land on either stream; matching
/// the union avoids depending on which stream a given codex build uses.
pub fn diagnose(stdout: &str, stderr: &str) -> Option<LoginFailureHint> {
    let haystack = format!("{stdout}\n{stderr}").to_lowercase();
    SERVER_FAILURE_SIGNATURES
        .iter()
        .any(|sig| haystack.contains(sig))
        .then(|| LoginFailureHint {
            kind: SERVER_UNAVAILABLE_KIND,
            message: SERVER_UNAVAILABLE_MESSAGE.to_string(),
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn diagnoses_the_benign_banner_on_stderr() {
        // The exact Sentry case (HOU-446): codex printed only its
        // informational startup banner and exited non-zero. It must become
        // the recoverable hint, never leak verbatim as "the error".
        let hint = diagnose("", "Starting local login server on http://localhost:1455.")
            .expect("banner is a login-server startup failure");
        assert_eq!(hint.kind, SERVER_UNAVAILABLE_KIND);
        assert!(hint.message.contains("1455"), "message names the port: {}", hint.message);
        assert!(
            hint.message.to_lowercase().contains("try connect again"),
            "message tells the user how to recover: {}",
            hint.message
        );
    }

    #[test]
    fn diagnoses_the_banner_on_stdout_too() {
        // Some codex builds print the banner to stdout; the caller prefers
        // stderr but falls back to stdout, so we must catch either stream.
        assert!(diagnose("Starting local login server on http://localhost:1455.", "").is_some());
    }

    #[test]
    fn diagnoses_explicit_bind_errors_each_platform() {
        // macOS / Linux / Windows address-in-use phrasings, plus the generic.
        for stderr in [
            "Error: Address already in use (os error 48)",
            "thread 'main' panicked: address already in use (os error 98)",
            "only one usage of each socket address is normally permitted",
            "EADDRINUSE: address already in use 127.0.0.1:1455",
            "failed to bind TcpListener",
        ] {
            assert!(
                diagnose("", stderr).is_some(),
                "should diagnose bind failure: {stderr:?}"
            );
        }
    }

    #[test]
    fn is_case_insensitive() {
        assert!(diagnose("", "STARTING LOCAL LOGIN SERVER ON HTTP://LOCALHOST:1455.").is_some());
    }

    #[test]
    fn ignores_unrelated_codex_login_errors() {
        // A genuine, already-actionable codex error must fall through to its
        // real stderr (return None) instead of being mislabeled as a port
        // problem. These are the false-positive guards.
        for stderr in [
            "Error loading configuration: unknown variant `max`",
            "error: unexpected argument '--nope'",
            "Your access token could not be refreshed. Please log out and sign in again.",
            "could not connect to https://chatgpt.com",
        ] {
            assert!(
                diagnose("", stderr).is_none(),
                "must NOT hijack a real error: {stderr:?}"
            );
        }
    }

    #[test]
    fn empty_output_is_none() {
        assert!(diagnose("", "").is_none());
        assert!(diagnose("   \n  ", "  ").is_none());
    }

    #[test]
    fn message_has_no_em_dash() {
        // Copy rule: no em dashes in user-facing strings.
        assert!(!SERVER_UNAVAILABLE_MESSAGE.contains('\u{2014}'));
    }
}
