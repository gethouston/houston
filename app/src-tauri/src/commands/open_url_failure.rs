//! The typed failure `open_url` rejects with. Before PRODUCT-1814 the
//! command rejected with the raw string ("Failed to open URL: ShellExecuteW
//! failed (code 31)") and the frontend filed every one as a Sentry bug, three
//! times over for one ChatGPT sign-in (HOUSTON-APP-5EV / 5ES / 5ET). Code 31
//! is `SE_ERR_NOASSOC`: Windows has no application registered for `https`
//! (no default browser, or a policy that unset it). That is a state of the
//! user's machine with a remedy they can act on, so the frontend maps
//! `no_handler` to authored expected-state copy (`app/src/lib/open-url-
//! failure.ts`) and only `other` is still reported.

use serde::Serialize;
use std::io;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum OpenUrlFailureKind {
    /// Nothing on this machine is registered to open the target: no default
    /// browser for a URL (Windows `SE_ERR_NOASSOC`), or `xdg-open` missing.
    NoHandler,
    Other,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct OpenUrlFailure {
    pub kind: OpenUrlFailureKind,
    /// The raw diagnostic; it reaches the frontend log and, for `Other`,
    /// Sentry. Never shown to the user.
    pub message: String,
}

/// `ShellExecuteW` returns an `HINSTANCE` whose value is a Win32 error code
/// when it is 32 or less. Only `SE_ERR_NOASSOC` means "no app for this kind
/// of target"; every other code (out of memory, access denied, a DDE
/// failure) is still a bug to look at.
const SE_ERR_NOASSOC: isize = 31;

impl OpenUrlFailure {
    pub fn from_shell_execute(code: isize) -> Self {
        Self {
            kind: if code == SE_ERR_NOASSOC {
                OpenUrlFailureKind::NoHandler
            } else {
                OpenUrlFailureKind::Other
            },
            message: format!("ShellExecuteW failed (code {code})"),
        }
    }

    /// A failed spawn of the platform opener (`open`, `xdg-open`). The
    /// opener binary itself being absent is the Linux shape of "nothing can
    /// open this": an AppImage on a minimal desktop without xdg-utils.
    pub fn from_spawn(context: &str, err: &io::Error) -> Self {
        Self {
            kind: if err.kind() == io::ErrorKind::NotFound {
                OpenUrlFailureKind::NoHandler
            } else {
                OpenUrlFailureKind::Other
            },
            message: format!("{context}: {err}"),
        }
    }
}

impl std::fmt::Display for OpenUrlFailure {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shell_execute_no_association_is_no_handler() {
        let failure = OpenUrlFailure::from_shell_execute(31);
        assert_eq!(failure.kind, OpenUrlFailureKind::NoHandler);
        assert_eq!(failure.message, "ShellExecuteW failed (code 31)");
    }

    #[test]
    fn other_shell_execute_codes_stay_reported() {
        for code in [0, 2, 5, 8, 32] {
            assert_eq!(
                OpenUrlFailure::from_shell_execute(code).kind,
                OpenUrlFailureKind::Other,
                "code {code}"
            );
        }
    }

    #[test]
    fn missing_opener_binary_is_no_handler() {
        let err = io::Error::new(io::ErrorKind::NotFound, "No such file or directory");
        let failure = OpenUrlFailure::from_spawn("Failed to open (install xdg-utils)", &err);
        assert_eq!(failure.kind, OpenUrlFailureKind::NoHandler);
        assert_eq!(
            failure.message,
            "Failed to open (install xdg-utils): No such file or directory"
        );
    }

    #[test]
    fn other_spawn_errors_stay_reported() {
        let err = io::Error::new(io::ErrorKind::PermissionDenied, "Access is denied");
        assert_eq!(
            OpenUrlFailure::from_spawn("Failed to open", &err).kind,
            OpenUrlFailureKind::Other
        );
    }

    #[test]
    fn serializes_snake_case_kind() {
        let json = serde_json::to_string(&OpenUrlFailure::from_shell_execute(31)).unwrap();
        assert_eq!(
            json,
            r#"{"kind":"no_handler","message":"ShellExecuteW failed (code 31)"}"#
        );
    }
}
