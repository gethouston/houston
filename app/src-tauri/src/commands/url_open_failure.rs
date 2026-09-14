//! The typed failure `open_url` rejects with.
//!
//! Before HOUSTON-APP-5ES the command rejected with the raw shell string
//! ("Failed to open URL: ShellExecuteW failed (code 31)") and every
//! fire-and-forget caller turned it into an unhandled rejection filed as a
//! Sentry bug. Code 31 is `SE_ERR_NOASSOC`: Windows has no default browser,
//! nothing is registered for `https`. That is a state the user fixes in the
//! OS settings, so the frontend (`app/src/lib/url-open-failure.ts`) reads
//! `kind` into authored expected-state copy and reports only `other`.

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum UrlOpenFailureKind {
    /// No application is registered to open the target: no default browser
    /// (Windows `SE_ERR_NOASSOC` / `SE_ERR_ASSOCINCOMPLETE`), or a Linux
    /// desktop without `xdg-open`.
    NoHandler,
    Other,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct UrlOpenFailure {
    pub kind: UrlOpenFailureKind,
    /// The raw diagnostic; it reaches the frontend log and, for `Other`,
    /// Sentry. Never shown to the user.
    pub message: String,
}

impl UrlOpenFailure {
    pub fn other(message: impl Into<String>) -> Self {
        Self {
            kind: UrlOpenFailureKind::Other,
            message: message.into(),
        }
    }

    pub fn no_handler(message: impl Into<String>) -> Self {
        Self {
            kind: UrlOpenFailureKind::NoHandler,
            message: message.into(),
        }
    }

    /// Prefix the diagnostic with the failing operation, keeping the kind.
    pub fn context(mut self, context: &str) -> Self {
        self.message = format!("{context}: {}", self.message);
        self
    }
}

impl std::fmt::Display for UrlOpenFailure {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

/// `ShellExecuteW` reports failure as a value <= 32; these two say the shell
/// found no program to hand the target to.
const SE_ERR_ASSOCINCOMPLETE: isize = 27;
const SE_ERR_NOASSOC: isize = 31;

/// Classify a failed `ShellExecuteW` return value (<= 32). Only the Windows
/// opener calls it; the classification itself is platform-free so the tests
/// run everywhere.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub fn from_shell_execute_code(code: isize) -> UrlOpenFailure {
    let message = format!("ShellExecuteW failed (code {code})");
    if code == SE_ERR_NOASSOC || code == SE_ERR_ASSOCINCOMPLETE {
        UrlOpenFailure::no_handler(message)
    } else {
        UrlOpenFailure::other(message)
    }
}

/// Classify a failure to spawn the platform opener (`open`, `xdg-open`).
pub fn from_spawn_error(program: &str, err: &std::io::Error) -> UrlOpenFailure {
    let message = format!("Failed to spawn {program}: {err}");
    if err.kind() == std::io::ErrorKind::NotFound {
        UrlOpenFailure::no_handler(message)
    } else {
        UrlOpenFailure::other(message)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_association_codes_are_no_handler() {
        assert_eq!(
            from_shell_execute_code(31).kind,
            UrlOpenFailureKind::NoHandler
        );
        assert_eq!(
            from_shell_execute_code(27).kind,
            UrlOpenFailureKind::NoHandler
        );
        assert_eq!(
            from_shell_execute_code(31).message,
            "ShellExecuteW failed (code 31)"
        );
    }

    #[test]
    fn every_other_shell_code_is_other() {
        for code in [0, 2, 3, 5, 8, 26, 32] {
            assert_eq!(
                from_shell_execute_code(code).kind,
                UrlOpenFailureKind::Other
            );
        }
    }

    #[test]
    fn missing_opener_binary_is_no_handler() {
        let missing = std::io::Error::from(std::io::ErrorKind::NotFound);
        assert_eq!(
            from_spawn_error("xdg-open", &missing).kind,
            UrlOpenFailureKind::NoHandler
        );
        let denied = std::io::Error::from(std::io::ErrorKind::PermissionDenied);
        assert_eq!(
            from_spawn_error("xdg-open", &denied).kind,
            UrlOpenFailureKind::Other
        );
    }

    #[test]
    fn serializes_snake_case_kind() {
        let json = serde_json::to_string(&from_shell_execute_code(31)).unwrap();
        assert_eq!(
            json,
            r#"{"kind":"no_handler","message":"ShellExecuteW failed (code 31)"}"#
        );
    }

    #[test]
    fn context_prefixes_the_message() {
        let f = from_shell_execute_code(31).context("Failed to open URL");
        assert_eq!(
            f.message,
            "Failed to open URL: ShellExecuteW failed (code 31)"
        );
        assert_eq!(f.kind, UrlOpenFailureKind::NoHandler);
    }
}
