//! Turn a non-zero helper exit into the `claude-login://done` failure payload
//! and the log line that goes with it.
//!
//! Three exit flavors are EXPECTED states rather than Houston failures, and
//! each is flagged so the frontend can pick an authored surface: the helper
//! binary cannot run here (signal death, or a Windows loader failure), the CLI refused its Windows shell
//! gate, or the machine has no route to `platform.claude.com`. Those log at
//! WARN — a Sentry error per attempt from the same offline or unsupported
//! machines is noise (HOUSTON-APP-543, -4ZP and -5E9 kept regressing on it);
//! the breadcrumb + backend.log line keeps the diagnosis trail. Anything else
//! (a declined authorization, a server-side rejection) stays an ERROR.

use std::process::ExitStatus;

use serde_json::{json, Value};

use super::network_gate::is_network_failure;
use super::shell_gate::is_shell_gate_failure;

/// Classification of one non-zero helper exit.
pub(super) struct ExitReport {
    /// `Claude sign-in failed (exit <code>)[: <stderr tail>]`.
    pub error: String,
    /// The helper binary cannot run on this machine at all: a signal death on
    /// Unix, e.g. SIGILL from a pre-AVX2 CPU (HOUSTON-APP-543), or a Windows
    /// loader/startup NTSTATUS exit (HOUSTON-APP-4ZQ, see
    /// [`is_windows_loader_failure`]). Declines exit with a small code and our
    /// own cancel/timeout kills never reach this classifier.
    pub helper_unavailable: bool,
    /// The CLI ran but refused its Windows shell gate: no runnable Git Bash /
    /// PowerShell (HOUSTON-APP-4ZP).
    pub shell_unavailable: bool,
    /// The CLI could not reach `platform.claude.com`: device offline or DNS /
    /// route failure (HOUSTON-APP-5E9).
    pub network_unavailable: bool,
}

impl ExitReport {
    pub fn classify(status: &ExitStatus, stderr_tail: &str) -> Self {
        let helper_unavailable = status.code().is_none_or(is_windows_loader_failure);
        let code = status
            .code()
            .map(|c| c.to_string())
            .unwrap_or_else(|| signal_label(status));
        let tail = stderr_tail.trim();
        let mut error = format!("Claude sign-in failed (exit {code})");
        if !tail.is_empty() {
            error.push_str(": ");
            error.push_str(tail);
        }
        Self {
            error,
            helper_unavailable,
            shell_unavailable: is_shell_gate_failure(tail),
            network_unavailable: is_network_failure(tail),
        }
    }

    /// True for the flavors the frontend degrades or explains on its own.
    pub fn is_expected_state(&self) -> bool {
        self.helper_unavailable || self.shell_unavailable || self.network_unavailable
    }

    /// Log at the level the flavor deserves (see the module doc).
    pub fn log(&self) {
        if self.is_expected_state() {
            tracing::warn!("[claude-login] {}", self.error);
        } else {
            tracing::error!("[claude-login] {}", self.error);
        }
    }

    /// The `claude-login://done` payload.
    pub fn payload(&self) -> Value {
        json!({
            "success": false,
            "error": self.error,
            "helperUnavailable": self.helper_unavailable,
            "shellUnavailable": self.shell_unavailable,
            "networkUnavailable": self.network_unavailable,
        })
    }
}

/// Windows reports a process the loader could not start as an exit CODE (the
/// NTSTATUS), not a signal: a missing DLL (0xC0000135), a missing entry point
/// in a present DLL (0xC0000139, an OS too old for the binary), a DLL init
/// failure (0xC0000142), or an illegal instruction (0xC000001D, the Windows
/// face of the pre-AVX2 SIGILL). A Unix exit code never reaches these values.
fn is_windows_loader_failure(code: i32) -> bool {
    matches!(
        code as u32,
        0xC000_0135 | 0xC000_0139 | 0xC000_0142 | 0xC000_001D
    )
}

/// Diagnostic label for a signal death: "signal <n>" on Unix (which signal
/// separates SIGILL/pre-AVX2 from OOM kills and sandbox denials in triage),
/// bare "signal" where the number is unavailable.
fn signal_label(status: &ExitStatus) -> String {
    #[cfg(unix)]
    {
        use std::os::unix::process::ExitStatusExt;
        if let Some(sig) = status.signal() {
            return format!("signal {sig}");
        }
    }
    // Windows ExitStatus::code() is always Some (a loader failure is an
    // NTSTATUS code, see is_windows_loader_failure), so this arm is never
    // reached there; keep the fn total for any future target.
    #[cfg(not(unix))]
    let _ = status;
    "signal".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    fn exit_with(code: i32) -> ExitStatus {
        use std::os::unix::process::ExitStatusExt;
        ExitStatus::from_raw(code << 8)
    }

    #[cfg(unix)]
    #[test]
    fn an_offline_exit_is_an_expected_state_with_the_network_flag() {
        let report = ExitReport::classify(
            &exit_with(1),
            "Login failed: getaddrinfo ETIMEOUT platform.claude.com\n",
        );
        assert!(report.network_unavailable);
        assert!(!report.helper_unavailable);
        assert!(!report.shell_unavailable);
        assert!(report.is_expected_state());
        assert_eq!(
            report.error,
            "Claude sign-in failed (exit 1): Login failed: getaddrinfo ETIMEOUT platform.claude.com"
        );
        assert_eq!(report.payload()["networkUnavailable"], json!(true));
    }

    #[cfg(unix)]
    #[test]
    fn a_declined_exit_stays_a_real_failure() {
        let report = ExitReport::classify(&exit_with(1), "authentication was declined");
        assert!(!report.is_expected_state());
        let payload = report.payload();
        assert_eq!(payload["helperUnavailable"], json!(false));
        assert_eq!(payload["shellUnavailable"], json!(false));
        assert_eq!(payload["networkUnavailable"], json!(false));
    }

    #[test]
    fn windows_loader_ntstatus_codes_mean_the_helper_cannot_run() {
        for code in [0xC000_0135u32, 0xC000_0139, 0xC000_0142, 0xC000_001D] {
            assert!(is_windows_loader_failure(code as i32), "{code:#x}");
        }
        // STATUS_ENTRYPOINT_NOT_FOUND as the signed exit code Rust reports.
        assert!(is_windows_loader_failure(-1_073_741_511));
        for code in [
            0,
            1,
            3,
            127,
            255,
            0xC000_0005u32 as i32,
            0xC000_013A_u32 as i32,
        ] {
            assert!(!is_windows_loader_failure(code), "{code}");
        }
    }

    #[cfg(windows)]
    #[test]
    fn a_windows_entrypoint_not_found_exit_is_helper_unavailable() {
        use std::os::windows::process::ExitStatusExt;
        let report = ExitReport::classify(&ExitStatus::from_raw(0xC000_0139), "");
        assert!(report.helper_unavailable);
        assert!(report.is_expected_state());
        assert_eq!(report.payload()["helperUnavailable"], json!(true));
        let declined = ExitReport::classify(&ExitStatus::from_raw(1), "declined");
        assert!(!declined.helper_unavailable);
    }

    #[cfg(unix)]
    #[test]
    fn a_silent_exit_carries_only_the_code() {
        let report = ExitReport::classify(&exit_with(3), "  \n");
        assert_eq!(report.error, "Claude sign-in failed (exit 3)");
    }
}
