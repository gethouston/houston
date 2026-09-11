//! Recognize a network-transport failure in a failed login's stderr.
//!
//! `claude auth login` talks to `platform.claude.com` before it can even print
//! an authorize URL; with no DNS or no route it exits 1 and prints Node's raw
//! socket error (`Login failed: getaddrinfo ETIMEOUT platform.claude.com`,
//! HOUSTON-APP-5E9; `ENOTFOUND`, -56S; `connect ECONNREFUSED`, -5AE). The
//! device is offline or the host is unreachable — nothing in Houston broke —
//! so the result is an expected connectivity state: a warn-level log (never a
//! Sentry error per attempt) plus a flagged `done` payload the frontend turns
//! into its authored connectivity toast instead of the raw CLI text.

/// Node / undici error codes and phrases the CLI surfaces for a transport
/// failure. Matched case-insensitively on the stderr tail. TLS and HTTP-status
/// failures are deliberately absent: a rejected certificate (corporate MITM)
/// or a `400` from the auth endpoint is a real failure that keeps its surface.
const NETWORK_MARKERS: [&str; 13] = [
    // DNS: any getaddrinfo failure, plus the resolver's own codes.
    "getaddrinfo",
    "enotfound",
    "eai_again",
    "eai_fail",
    // Connect: Windows reports DNS/connect timeouts as `ETIMEOUT`, POSIX as
    // `ETIMEDOUT`; neither is a substring of the other.
    "etimeout",
    "etimedout",
    "econnrefused",
    "econnreset",
    "enetunreach",
    "ehostunreach",
    "enetdown",
    // undici's wrapper when the cause is not spelled out.
    "fetch failed",
    "socket hang up",
];

/// True when `stderr` carries a network-transport failure.
pub(super) fn is_network_failure(stderr: &str) -> bool {
    let lowered = stderr.to_ascii_lowercase();
    NETWORK_MARKERS.iter().any(|m| lowered.contains(m))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_the_dns_failures_seen_in_the_field() {
        // Verbatim from HOUSTON-APP-5E9 and -56S.
        assert!(is_network_failure(
            "Login failed: getaddrinfo ETIMEOUT platform.claude.com"
        ));
        assert!(is_network_failure(
            "Login failed: getaddrinfo ENOTFOUND platform.claude.com"
        ));
    }

    #[test]
    fn recognizes_a_refused_or_timed_out_connect() {
        // Verbatim from HOUSTON-APP-5AE.
        assert!(is_network_failure(
            "Login failed: connect ECONNREFUSED 160.79.104.10:443"
        ));
        assert!(is_network_failure(
            "Login failed: connect ETIMEDOUT 1.2.3.4:443"
        ));
        assert!(is_network_failure("TypeError: fetch failed"));
    }

    #[test]
    fn ignores_other_login_failures() {
        // A declined authorization, a server-side rejection, a TLS failure or
        // the shell gate are not connectivity and must keep their surface.
        assert!(!is_network_failure("authentication was declined"));
        assert!(!is_network_failure(
            "Login failed: Request failed with status code 400"
        ));
        assert!(!is_network_failure(
            "unable to verify the first certificate (UNABLE_TO_VERIFY_LEAF_SIGNATURE)"
        ));
        assert!(!is_network_failure(
            "Claude Code on Windows requires either Git for Windows (for bash) or PowerShell."
        ));
        assert!(!is_network_failure(""));
    }
}
