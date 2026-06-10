//! Shared detection for provider CLI authentication failures.

pub const AUTH_RETRY_MARKER: &str = "__auth_retry__";

pub fn is_auth_retry_marker(message: &str) -> bool {
    message == AUTH_RETRY_MARKER
}

pub fn is_auth_error(message: &str) -> bool {
    let lower = message.to_lowercase();
    let api_key_problem = lower.contains("api key")
        && (lower.contains("invalid")
            || lower.contains("missing")
            || lower.contains("not set")
            || lower.contains("expired"));
    lower.contains("401")
        || lower.contains("unauthorized")
        || lower.contains("not authenticated")
        || lower.contains("not logged in")
        || lower.contains("authentication expired")
        || lower.contains("auth expired")
        || lower.contains("session expired")
        || lower.contains("oauth token")
        || lower.contains("missing bearer")
        || lower.contains("invalid api key")
        || lower.contains("invalid_api_key")
        || api_key_problem
        || lower.contains("no auth credentials")
        || lower.contains("please login")
        || lower.contains("please log in")
        || lower.contains("please run /login")
        || lower.contains("run claude auth login")
        || lower.contains("run codex login")
        || lower.contains("claude auth login")
        || lower.contains("codex login")
}

pub fn is_auth_retry_noise(message: &str) -> bool {
    let lower = message.to_lowercase();
    is_auth_error(message) && (lower.contains("reconnecting") || lower.contains("retrying"))
}

/// A TERMINAL auth failure the CLI cannot recover from by retrying — the
/// session/token was killed server-side and the user MUST sign in again.
/// Distinguished from a transient reconnect (a bare 401 the CLI may refresh
/// past): codex prints "Reconnecting... N/5 (... Your session has ended.
/// Please log in again ...)" with `app_session_terminated` when ChatGPT
/// revokes the login, and keeps looping pointlessly. We use this to surface a
/// reconnect card immediately instead of deferring until the loop exhausts.
pub fn is_terminal_auth_error(message: &str) -> bool {
    let lower = message.to_lowercase();
    lower.contains("session has ended")
        || lower.contains("session_terminated") // covers app_session_terminated
        || lower.contains("has been invalidated")
        || lower.contains("log in again")
        || lower.contains("sign in again")
        || lower.contains("signing in again")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_common_cli_auth_failures() {
        let cases = [
            "unexpected status 401 Unauthorized: Missing bearer",
            "Claude Code is not authenticated. Run claude auth login",
            "Not logged in · Please run /login",
            "Invalid API key. Please login again.",
            "No API key found. Run claude auth login",
            "OAuth token has expired",
            "Reconnecting... 1/5 (unexpected status 401 Unauthorized)",
        ];

        for case in cases {
            assert!(is_auth_error(case), "{case}");
        }
    }

    #[test]
    fn detects_retry_noise_subset() {
        assert!(is_auth_retry_noise(
            "Reconnecting... 1/5 (unexpected status 401 Unauthorized)",
        ));
        assert!(!is_auth_retry_noise("Invalid API key. Please login again."));
    }

    #[test]
    fn detects_terminal_auth_signatures() {
        // Verbatim shapes codex prints when ChatGPT kills the session
        // server-side (Luis, 2026-06-09 — code app_session_terminated).
        let terminal = [
            "Reconnecting... 1/5 (Failed to refresh token: 400 Bad Request: Your session has ended. Please log in again.)",
            "Your authentication token has been invalidated. Please try signing in again.",
            "400 Bad Request: app_session_terminated",
        ];
        for case in terminal {
            assert!(is_terminal_auth_error(case), "{case}");
        }
    }

    #[test]
    fn transient_reconnects_are_not_terminal() {
        // A bare 401 the CLI may refresh past must stay deferred, not surface
        // a premature reconnect card.
        assert!(!is_terminal_auth_error(
            "Reconnecting... 1/5 (unexpected status 401 Unauthorized)"
        ));
        assert!(!is_terminal_auth_error("rate limit exceeded"));
    }
}
