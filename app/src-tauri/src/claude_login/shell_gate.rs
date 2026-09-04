//! Recognize the Claude Code CLI's Windows shell gate in a failed login's
//! stderr. The CLI refuses to start on Windows without a runnable shell (Git
//! Bash or PowerShell) and exits 1 with an install-Git message; when it does,
//! nothing in Houston broke — the machine is missing a prerequisite — so the
//! result is reported as an expected setup state (warn + a flagged `done`
//! payload the frontend turns into authored copy), never a raw CLI toast or a
//! Sentry error per retry (HOUSTON-APP-4ZP kept regressing on exactly that).

/// Phrases the CLI prints (any version shipped so far) when its Windows shell
/// probe fails. Matched case-insensitively on the stderr tail.
const SHELL_GATE_MARKERS: [&str; 4] = [
    // An override the CLI could not run (CLI ≤ 2.1.25x wording).
    "unable to find claude_code_git_bash_path",
    // Neither Git Bash nor PowerShell resolved.
    "requires either git for windows",
    // Git Bash missing while the PowerShell tool is disabled by env/settings.
    "requires a shell tool",
    "git bash was not found",
];

/// True when `stderr` carries the CLI's Windows shell-gate refusal.
pub(super) fn is_shell_gate_failure(stderr: &str) -> bool {
    let lowered = stderr.to_ascii_lowercase();
    SHELL_GATE_MARKERS.iter().any(|m| lowered.contains(m))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_a_rejected_override() {
        // Verbatim from HOUSTON-APP-4ZP.
        assert!(is_shell_gate_failure(
            "Claude Code was unable to find CLAUDE_CODE_GIT_BASH_PATH path \
             \"C:\\Users\\u\\AppData\\Local\\Microsoft\\WindowsApps\\bash.exe\""
        ));
    }

    #[test]
    fn recognizes_the_no_shell_install_prompts() {
        assert!(is_shell_gate_failure(
            "Claude Code on Windows requires either Git for Windows (for bash) or PowerShell. \
             Install one of:\n  - Git for Windows: https://git-scm.com/downloads/win"
        ));
        assert!(is_shell_gate_failure(
            "Claude Code on Windows requires a shell tool. Git Bash was not found and the \
             PowerShell tool is disabled (CLAUDE_CODE_USE_POWERSHELL_TOOL=0)."
        ));
    }

    #[test]
    fn ignores_other_login_failures() {
        // A declined authorization or a network error is a real login
        // failure and must keep its verbatim surface.
        assert!(!is_shell_gate_failure("authentication was declined"));
        assert!(!is_shell_gate_failure("fetch failed: ENOTFOUND claude.ai"));
        assert!(!is_shell_gate_failure(""));
    }
}
