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
//! when enforcement was inherited it relaunches through the shell and exits.
//! A parent that IS the shell means a relaunch cannot help (the policy came
//! from explorer itself), which stops any relaunch loop without touching
//! the disk: the mitigated process may not even be able to write a marker.
//!
//! Compiled on every platform so the decision logic stays unit-tested on the
//! developer machines; only the Win32 probes are `cfg(windows)`.

/// The process image name of the Windows shell.
const SHELL_IMAGE: &str = "explorer.exe";

/// Best-effort telemetry marker written by the mitigated instance right
/// before it hands off, so the clean instance can log that the hand-off
/// happened. Lives in the temp dir; a failed write is ignored.
const RELAUNCH_MARKER: &str = "houston-redirection-guard-relaunch";

/// `PROCESS_MITIGATION_REDIRECTION_TRUST_POLICY.EnforceRedirectionTrust`
/// (bit 0 of `Flags`). Bit 1 is audit-only and harmless.
pub(crate) fn enforces_redirection_trust(flags: u32) -> bool {
    flags & 1 != 0
}

/// Case-insensitive match on the shell's image name; ToolHelp reports the
/// bare file name, but be lenient about a path prefix.
pub(crate) fn is_shell_image(name: &str) -> bool {
    name.rsplit(['\\', '/'])
        .next()
        .is_some_and(|base| base.eq_ignore_ascii_case(SHELL_IMAGE))
}

/// Relaunch only when enforcement was inherited AND the shell did not launch
/// us. An unknown parent (already exited, as msiexec often has) still
/// relaunches: the shell is the only launcher known to be clean.
pub(crate) fn should_relaunch(enforced: bool, parent_image: Option<&str>) -> bool {
    enforced && !parent_image.is_some_and(is_shell_image)
}

/// Relaunch through the shell and exit when the mitigation was inherited.
/// Must run before Sentry, logging and the Tauri builder.
pub fn relaunch_if_inherited() {
    #[cfg(target_os = "windows")]
    {
        let enforced = win::current_process_enforces_redirection_trust();
        let parent = win::parent_process_image();
        if !should_relaunch(enforced, parent.as_deref()) {
            return;
        }
        match win::relaunch_through_shell() {
            Ok(()) => {
                let _ = std::fs::write(std::env::temp_dir().join(RELAUNCH_MARKER), b"1");
                std::process::exit(0);
            }
            // Keep running mitigated rather than not at all; the clean-launch
            // report below records it once logging is up.
            Err(e) => eprintln!("[redirection-guard] shell relaunch failed, running mitigated: {e}"),
        }
    }
}

/// Log the outcome once logging is initialized: an info line for a completed
/// hand-off, a warn when this instance still runs mitigated (the shell itself
/// carries the policy, or the relaunch failed).
pub fn report_after_logging_init() {
    let marker = std::env::temp_dir().join(RELAUNCH_MARKER);
    if marker.exists() {
        let _ = std::fs::remove_file(&marker);
        tracing::info!(
            "[redirection-guard] relaunched through the shell to drop an inherited Redirection Guard"
        );
    }
    #[cfg(target_os = "windows")]
    if win::current_process_enforces_redirection_trust() {
        tracing::warn!(
            parent = win::parent_process_image().as_deref().unwrap_or("unknown"),
            "[redirection-guard] still running with Redirection Guard enforced; junction paths will fail"
        );
    }
}

#[cfg(target_os = "windows")]
mod win {
    use std::os::windows::ffi::OsStringExt as _;
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };
    use windows_sys::Win32::System::Threading::{
        GetCurrentProcess, GetCurrentProcessId, GetProcessMitigationPolicy,
        ProcessRedirectionTrustPolicy,
    };

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

    /// Image name of our parent process, `None` when it already exited or
    /// the snapshot failed.
    pub(super) fn parent_process_image() -> Option<String> {
        let me = unsafe { GetCurrentProcessId() };
        // SAFETY: plain Win32 snapshot walk; the handle is closed below.
        unsafe {
            let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if snapshot.is_null() || snapshot as isize == -1 {
                return None;
            }
            let mut entry: PROCESSENTRY32W = std::mem::zeroed();
            entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
            let mut parent_pid = None;
            let mut names = Vec::new();
            let mut ok = Process32FirstW(snapshot, &mut entry);
            while ok != 0 {
                if entry.th32ProcessID == me {
                    parent_pid = Some(entry.th32ParentProcessID);
                }
                names.push((entry.th32ProcessID, image_name(&entry.szExeFile)));
                ok = Process32NextW(snapshot, &mut entry);
            }
            CloseHandle(snapshot);
            let parent_pid = parent_pid?;
            names
                .into_iter()
                .find(|(pid, _)| *pid == parent_pid)
                .map(|(_, name)| name)
        }
    }

    fn image_name(raw: &[u16; 260]) -> String {
        let len = raw.iter().position(|&c| c == 0).unwrap_or(raw.len());
        std::ffi::OsString::from_wide(&raw[..len])
            .to_string_lossy()
            .into_owned()
    }

    /// `explorer.exe "<our exe>"`: the running shell creates the new process,
    /// so it carries the shell's clean token instead of ours. Explorer cannot
    /// forward arguments; an installer launch has none worth keeping.
    pub(super) fn relaunch_through_shell() -> Result<(), String> {
        let exe = std::env::current_exe().map_err(|e| format!("current exe: {e}"))?;
        let system_root = std::env::var_os("SystemRoot")
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|| std::path::PathBuf::from(r"C:\Windows"));
        std::process::Command::new(system_root.join(super::SHELL_IMAGE))
            .arg(&exe)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("spawn explorer: {e}"))
    }
}

#[cfg(test)]
mod tests {
    use super::{enforces_redirection_trust, is_shell_image, should_relaunch};

    #[test]
    fn enforce_is_bit_zero_audit_is_not() {
        assert!(!enforces_redirection_trust(0));
        assert!(enforces_redirection_trust(1));
        assert!(!enforces_redirection_trust(2), "audit-only never relaunches");
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
    fn relaunches_only_when_enforced_and_not_shell_launched() {
        // The PRODUCT-1698 shape: launched by the Windows Installer Service.
        assert!(should_relaunch(true, Some("msiexec.exe")));
        // The installer often exits before we look: still relaunch.
        assert!(should_relaunch(true, None));
        // Already shell-launched: the policy came from explorer, a relaunch
        // would only loop.
        assert!(!should_relaunch(true, Some("explorer.exe")));
        // Clean token: nothing to do, whoever launched us.
        assert!(!should_relaunch(false, Some("msiexec.exe")));
        assert!(!should_relaunch(false, None));
    }
}
