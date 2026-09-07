//! Drop an inherited Windows Redirection Guard before it breaks file access
//! (PRODUCT-1698).
//!
//! Redirection Guard (`ProcessRedirectionTrustPolicy`) makes Windows refuse
//! to follow any junction a non-admin account created, answering
//! `STATUS_UNTRUSTED_MOUNT_POINT` ("The path cannot be traversed because it
//! contains an untrusted mount point"). The policy sits on the process token
//! and every child inherits it. The Windows Installer Service ships with it
//! enforced, and Houston's in-app update hands off to `msiexec … AUTOLAUNCHAPP=True`
//! whose `LaunchApplication` action starts the new Houston FROM that service.
//! So every instance launched by an update, plus its WebView2 processes and
//! the host sidecar, runs with the mitigation enforced. A user whose profile
//! folders sit behind a `mklink /J` junction (relocated Documents, a moved
//! AppData, a package manager's `current` link) then cannot attach a file:
//! the WebView2 file picker fails inside the OS, before any Houston code
//! sees the file, so nothing reaches Sentry.
//!
//! The policy cannot be cleared on a live process, but the user's shell
//! never has it: launching through `explorer.exe <exe>` makes the already
//! running shell create the process with a clean token. This module runs
//! before any plugin registers (so no single-instance mutex exists yet), and
//! when enforcement was inherited it relaunches through the shell, waits for
//! the new instance to appear, and exits. Three things stop it from making
//! the situation worse:
//!   - a parent that IS the shell means a relaunch cannot help (the policy
//!     came from explorer itself), so the guard stands down;
//!   - explorer only delegates to the running shell when there is one; if
//!     the transient explorer we spawned launched Houston itself, the new
//!     instance inherits our environment, and a sentinel variable in it
//!     tells the guard to stand down instead of looping;
//!   - the old instance only exits once a second Houston process is visible,
//!     so a shell that silently refuses the launch never leaves the user
//!     with no app at all.
//! A launch that carries arguments (a `houston://` deep link arrives as a
//! fresh process with the URL in argv) is never relaunched: explorer cannot
//! forward them, and dropping a deep link is worse than a junction failure.
//!
//! Compiled on every platform so the decision logic stays unit-tested on the
//! developer machines; only the Win32 probes are `cfg(windows)`.

/// The process image name of the Windows shell.
const SHELL_IMAGE: &str = "explorer.exe";

/// Set on the explorer we spawn. The running shell supplies its own
/// environment to what it launches (so a clean relaunch never sees it); a
/// non-delegating explorer passes ours through, and the still-mitigated
/// child then knows a second relaunch would only loop.
const RELAUNCHED_ENV: &str = "HOUSTON_REDIRECTION_GUARD_RELAUNCHED";

/// Best-effort telemetry marker written by the mitigated instance right
/// before it hands off, so the clean instance can log that the hand-off
/// happened. Lives in the temp dir; a failed write is ignored.
const RELAUNCH_MARKER: &str = "houston-redirection-guard-relaunch";

/// `PROCESS_MITIGATION_REDIRECTION_TRUST_POLICY.EnforceRedirectionTrust`
/// (bit 0 of `Flags`). Bit 1 is audit-only and harmless.
fn enforces_redirection_trust(flags: u32) -> bool {
    flags & 1 != 0
}

/// Case-insensitive match on the shell's image name; ToolHelp reports the
/// bare file name, but be lenient about a path prefix.
fn is_shell_image(name: &str) -> bool {
    name.rsplit(['\\', '/'])
        .next()
        .is_some_and(|base| base.eq_ignore_ascii_case(SHELL_IMAGE))
}

/// Why an enforced instance keeps running instead of relaunching.
#[derive(Debug, PartialEq, Eq)]
enum StandDown {
    /// The shell launched us: the policy is the shell's own.
    ShellParent,
    /// We ARE the relaunch and still enforced: explorer did not delegate.
    AlreadyRelaunched,
    /// argv would be lost through explorer (deep link, CLI flag).
    HasArguments,
}

/// Relaunch only when enforcement was inherited and none of the stand-down
/// reasons apply. An unknown parent (already exited, as msiexec often has)
/// still relaunches: the shell is the only launcher known to be clean.
fn relaunch_decision(
    enforced: bool,
    parent_image: Option<&str>,
    already_relaunched: bool,
    has_arguments: bool,
) -> Result<bool, StandDown> {
    if !enforced {
        return Ok(false);
    }
    if parent_image.is_some_and(is_shell_image) {
        return Err(StandDown::ShellParent);
    }
    if already_relaunched {
        return Err(StandDown::AlreadyRelaunched);
    }
    if has_arguments {
        return Err(StandDown::HasArguments);
    }
    Ok(true)
}

/// Relaunch through the shell and exit when the mitigation was inherited.
/// Must run before Sentry, logging and the Tauri builder.
pub fn relaunch_if_inherited() {
    #[cfg(target_os = "windows")]
    {
        if !win::current_process_enforces_redirection_trust() {
            return;
        }
        let parent = win::parent_process_image();
        let decision = relaunch_decision(
            true,
            parent.as_deref(),
            std::env::var_os(RELAUNCHED_ENV).is_some(),
            std::env::args_os().count() > 1,
        );
        if decision != Ok(true) {
            // `report_after_logging_init` records the stand-down once
            // logging is up; nothing can be logged yet.
            return;
        }
        let marker = std::env::temp_dir().join(RELAUNCH_MARKER);
        let _ = std::fs::write(&marker, b"1");
        if win::relaunch_through_shell() {
            std::process::exit(0);
        }
        // No second instance appeared: keep running mitigated rather than
        // leave the user with no app. The marker must not claim a hand-off.
        let _ = std::fs::remove_file(&marker);
    }
}

/// Log the outcome once logging is initialized: an info line for a completed
/// hand-off, a warn when this instance still runs mitigated (the shell itself
/// carries the policy, explorer did not delegate, a deep link kept us here,
/// or the relaunch never produced a second instance).
pub fn report_after_logging_init() {
    #[cfg(target_os = "windows")]
    {
        let marker = std::env::temp_dir().join(RELAUNCH_MARKER);
        if marker.exists() {
            let _ = std::fs::remove_file(&marker);
            tracing::info!(
                "[redirection-guard] relaunched through the shell to drop an inherited Redirection Guard"
            );
        }
        if win::current_process_enforces_redirection_trust() {
            tracing::warn!(
                parent = win::parent_process_image().as_deref().unwrap_or("unknown"),
                already_relaunched = std::env::var_os(RELAUNCHED_ENV).is_some(),
                has_arguments = std::env::args_os().count() > 1,
                "[redirection-guard] still running with Redirection Guard enforced; junction paths will fail"
            );
        }
    }
}

#[cfg(target_os = "windows")]
mod win {
    use std::os::windows::ffi::OsStringExt as _;
    use std::time::{Duration, Instant};
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };
    use windows_sys::Win32::System::Threading::{
        GetCurrentProcess, GetCurrentProcessId, GetProcessMitigationPolicy,
        ProcessRedirectionTrustPolicy,
    };

    /// How long the old instance waits for the relaunched one to show up
    /// before concluding the shell refused and running mitigated instead.
    const RELAUNCH_WAIT: Duration = Duration::from_secs(5);

    pub(super) fn current_process_enforces_redirection_trust() -> bool {
        // The policy struct is a plain u32 of flags; read it as such.
        let mut flags: u32 = 0;
        // SAFETY: the buffer is a live u32 and the length matches it.
        let ok = unsafe {
            GetProcessMitigationPolicy(
                GetCurrentProcess(),
                ProcessRedirectionTrustPolicy,
                &mut flags as *mut u32 as *mut core::ffi::c_void,
                std::mem::size_of::<u32>(),
            )
        };
        // Pre-22H2 Windows has no such policy: the call fails, nothing to drop.
        ok != 0 && super::enforces_redirection_trust(flags)
    }

    /// One row of the process table.
    struct ProcessRow {
        pid: u32,
        parent_pid: u32,
        image: String,
    }

    /// Snapshot of the process table; empty when the snapshot failed.
    fn process_table() -> Vec<ProcessRow> {
        let mut rows = Vec::new();
        // SAFETY: plain Win32 snapshot walk; the handle is closed before
        // returning and the entry is a zeroed POD with its size set.
        unsafe {
            let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if snapshot == INVALID_HANDLE_VALUE {
                return rows;
            }
            let mut entry: PROCESSENTRY32W = std::mem::zeroed();
            entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
            let mut ok = Process32FirstW(snapshot, &mut entry);
            while ok != 0 {
                rows.push(ProcessRow {
                    pid: entry.th32ProcessID,
                    parent_pid: entry.th32ParentProcessID,
                    image: image_name(&entry.szExeFile),
                });
                ok = Process32NextW(snapshot, &mut entry);
            }
            CloseHandle(snapshot);
        }
        rows
    }

    /// Image name of our parent process, `None` when it already exited or
    /// the snapshot failed.
    pub(super) fn parent_process_image() -> Option<String> {
        let me = unsafe { GetCurrentProcessId() };
        let rows = process_table();
        let parent_pid = rows.iter().find(|row| row.pid == me)?.parent_pid;
        rows.into_iter()
            .find(|row| row.pid == parent_pid)
            .map(|row| row.image)
    }

    fn image_name(raw: &[u16; 260]) -> String {
        let len = raw.iter().position(|&c| c == 0).unwrap_or(raw.len());
        std::ffi::OsString::from_wide(&raw[..len])
            .to_string_lossy()
            .into_owned()
    }

    /// `explorer.exe "<our exe>"`: the running shell creates the new process,
    /// so it carries the shell's clean token instead of ours. Explorer reports
    /// nothing back, so success means "a second instance of our image is now
    /// running"; `false` means keep this one.
    pub(super) fn relaunch_through_shell() -> bool {
        let Ok(exe) = std::env::current_exe() else {
            return false;
        };
        let Some(image) = exe.file_name().map(|n| n.to_string_lossy().into_owned()) else {
            return false;
        };
        let system_root = std::env::var_os("SystemRoot")
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|| std::path::PathBuf::from(r"C:\Windows"));
        let spawned = std::process::Command::new(system_root.join(super::SHELL_IMAGE))
            .arg(&exe)
            .env(super::RELAUNCHED_ENV, "1")
            .spawn();
        if spawned.is_err() {
            return false;
        }
        let me = unsafe { GetCurrentProcessId() };
        let deadline = Instant::now() + RELAUNCH_WAIT;
        while Instant::now() < deadline {
            if process_table()
                .iter()
                .any(|row| row.pid != me && row.image.eq_ignore_ascii_case(&image))
            {
                return true;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::{enforces_redirection_trust, is_shell_image, relaunch_decision, StandDown};

    #[test]
    fn enforce_is_bit_zero_audit_is_not() {
        assert!(!enforces_redirection_trust(0));
        assert!(enforces_redirection_trust(1));
        assert!(
            !enforces_redirection_trust(2),
            "audit-only never relaunches"
        );
        assert!(enforces_redirection_trust(3));
    }

    #[test]
    fn shell_image_matches_case_insensitively_with_or_without_a_path() {
        assert!(is_shell_image("explorer.exe"));
        assert!(is_shell_image("Explorer.EXE"));
        assert!(is_shell_image(r"C:\Windows\explorer.exe"));
        assert!(!is_shell_image("msiexec.exe"));
        assert!(!is_shell_image("notexplorer.exe"));
        assert!(!is_shell_image(""));
    }

    #[test]
    fn clean_token_never_relaunches_whoever_launched_us() {
        assert_eq!(
            relaunch_decision(false, Some("msiexec.exe"), false, false),
            Ok(false)
        );
        assert_eq!(relaunch_decision(false, None, true, true), Ok(false));
    }

    #[test]
    fn installer_launch_relaunches_even_when_the_parent_is_gone() {
        // The PRODUCT-1698 shape: launched by the Windows Installer Service.
        assert_eq!(
            relaunch_decision(true, Some("msiexec.exe"), false, false),
            Ok(true)
        );
        // msiexec often exits before we look: still relaunch.
        assert_eq!(relaunch_decision(true, None, false, false), Ok(true));
    }

    #[test]
    fn stands_down_when_a_relaunch_cannot_help() {
        // Shell-launched: the policy is explorer's own, a relaunch would loop.
        assert_eq!(
            relaunch_decision(true, Some("explorer.exe"), false, false),
            Err(StandDown::ShellParent)
        );
        // We are the relaunch and explorer did not delegate to the shell.
        assert_eq!(
            relaunch_decision(true, None, true, false),
            Err(StandDown::AlreadyRelaunched)
        );
        // A deep link in argv would be lost through explorer.
        assert_eq!(
            relaunch_decision(true, Some("msiexec.exe"), false, true),
            Err(StandDown::HasArguments)
        );
    }
}
