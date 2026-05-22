//! Error formatting + checksum helpers for the download pipeline.
//!
//! Lives in its own module so `download.rs` stays under the CLAUDE.md
//! §"File size limits" cap and so the consistency assertions ("every
//! fatal carries version + URL + target") have a single source of
//! truth to test against.

/// Centralized error formatter for FATAL paths inside the download
/// pipeline. Carries pinned `version` (release-note lookup), `url`
/// (manual curl retry), `install_target` (ownership / mount checks),
/// the optional HTTP `status` for network-failure sites, and the
/// underlying OS or network `err` (whose `Display` already includes
/// "Permission denied", "Disk full", "Connection refused", etc.).
///
/// `install_target` is wrapped in double quotes so the toast renderer
/// (plain text, no markdown — see `ui/core/src/components/toast-container.tsx`)
/// shows path boundaries clearly even on Windows or for paths with
/// spaces. No em dashes: rendered verbatim as a user-facing toast.
pub(crate) fn install_err(
    stage: &str,
    version: &str,
    url: &str,
    install_target: &str,
    status: Option<reqwest::StatusCode>,
    err: &dyn std::fmt::Display,
) -> String {
    match status {
        Some(s) => format!(
            "claude-code v{version}: {stage} (HTTP {s}): {err} \
             (source {url}, target \"{install_target}\")"
        ),
        None => format!(
            "claude-code v{version}: {stage} failed: {err} \
             (source {url}, target \"{install_target}\")"
        ),
    }
}

/// Hex string equality is case-insensitive in our manifest convention,
/// but we still want a constant-time-ish compare to avoid leaking
/// whether the prefix matched in profiling. Use `subtle`? Overkill for
/// a checksum compare in a desktop app — equality is fine, just be
/// explicit about case folding.
pub(crate) fn checksum_matches(actual: &str, expected: &str) -> bool {
    actual.eq_ignore_ascii_case(expected)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checksum_match_ignores_case() {
        assert!(checksum_matches("DEADBEEF", "deadbeef"));
        assert!(checksum_matches("abc123", "abc123"));
        assert!(!checksum_matches("abc", "abd"));
    }

    #[test]
    fn install_err_with_status_carries_http_clause() {
        let s = install_err(
            "download returned non-success status",
            "9.9.9",
            "https://example.test/claude",
            "/tmp/claude",
            Some(reqwest::StatusCode::NOT_FOUND),
            &"upstream rejected request",
        );
        // reqwest::StatusCode Display renders code + reason ("404 Not Found"),
        // not just the code. Assert on the substring that uniquely identifies
        // this is the HTTP-status branch (not the plain "failed:" branch).
        assert!(s.contains("(HTTP 404"), "missing HTTP clause: {s}");
        assert!(s.contains("Not Found"), "missing reason phrase: {s}");
        assert!(s.contains("v9.9.9"), "missing version: {s}");
        assert!(s.contains("source https://example.test/claude"), "missing source: {s}");
        assert!(s.contains("target \"/tmp/claude\""), "missing target: {s}");
    }

    #[test]
    fn install_err_without_status_uses_plain_failed() {
        let s = install_err(
            "create install dir",
            "9.9.9",
            "https://example.test/claude",
            "/tmp/claude",
            None,
            &"Permission denied",
        );
        assert!(s.contains("failed:"), "missing 'failed:' marker: {s}");
        assert!(!s.contains("(HTTP"), "spurious HTTP clause: {s}");
        assert!(s.contains("Permission denied"), "missing OS error: {s}");
    }
}
