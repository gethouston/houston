//! Shared OS process-lifetime primitives so a spawned child never outlives the
//! app, plus the bundled-sidecar binary resolver. Both the engine sidecar
//! ([`crate::engine_supervisor`]) and the local-bridge frpc tunnel
//! ([`crate::local_bridge::frpc`]) share ONE copy of this tricky code instead of
//! duplicating it.
//!
//! Two orphan-prevention mechanisms, one per OS:
//!   - **Unix**: the child runs in its own process group (`setpgid(0,0)` in a
//!     `pre_exec`) and is reaped with `killpg`, so killing/tearing down the app
//!     takes the whole group (tokio workers + grandchildren) with it.
//!   - **Windows**: the child is bound to a kill-on-close Job Object. When the
//!     last handle closes — graceful `Drop` OR the app process dying and the OS
//!     closing it — the kernel terminates the child and everything it spawned.
//!     `TerminateProcess` (force-quit, crash, Task Manager "End task") never
//!     delivers stdin EOF, so a watchdog would block forever and orphan the
//!     child (gethouston/houston#306); the job is kernel-enforced on every
//!     death mode.

use std::path::PathBuf;

/// New process group for a child so killing the parent won't orphan it. Call
/// from a `Command::pre_exec` closure (Unix only).
#[cfg(unix)]
pub fn set_new_process_group() -> std::io::Result<()> {
    // SAFETY: `setpgid(0, 0)` puts the calling (just-forked, pre-exec) process
    // into a new group of its own; it touches no Rust state.
    unsafe {
        if libc::setpgid(0, 0) == -1 {
            return Err(std::io::Error::last_os_error());
        }
    }
    Ok(())
}

/// SIGTERM a whole process group (the child plus its tokio workers /
/// grandchildren). `pid` is the child's PID, which equals its PGID because it
/// was placed in a new group by [`set_new_process_group`].
#[cfg(unix)]
pub fn kill_process_group(pid: i32) {
    const SIGTERM: i32 = 15;
    // SAFETY: `killpg` only signals; an invalid pgid returns an error we ignore.
    unsafe {
        libc::killpg(pid, SIGTERM);
    }
}

#[cfg(unix)]
mod libc {
    extern "C" {
        pub fn setpgid(pid: i32, pgid: i32) -> i32;
        pub fn killpg(pgrp: i32, sig: i32) -> i32;
    }
}

/// CREATE_NEW_PROCESS_GROUP — detaches a Windows child from the parent's
/// console group so CTRL_C_EVENT / CTRL_CLOSE_EVENT delivered to the parent do
/// NOT propagate to the child (which would kill it with STATUS_CONTROL_C_EXIT,
/// 0xC000013A — observed on Windows MSI builds).
#[cfg(windows)]
pub const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;

/// CREATE_NO_WINDOW — a GUI Tauri process has no console, so without this a
/// child compiled for the `console` subsystem pops a visible cmd window on
/// every launch.
#[cfg(windows)]
pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Windows: bind a child to a kill-on-close Job Object. See module docs.
#[cfg(windows)]
pub mod win_job {
    use std::os::windows::io::AsRawHandle;
    use std::process::Child;
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };

    /// Owns the kill-on-close job handle. The app holds exactly one handle
    /// (this one); when it drops — or the app process dies and the OS closes it
    /// — the job's last handle goes away and the kernel terminates every
    /// process in the job. Created non-inheritable so no child keeps it open.
    pub struct KillOnCloseJob(HANDLE);

    // A Win32 job handle is a process-wide kernel handle; supervisors own it
    // across threads.
    unsafe impl Send for KillOnCloseJob {}
    unsafe impl Sync for KillOnCloseJob {}

    impl Drop for KillOnCloseJob {
        fn drop(&mut self) {
            // Best-effort: closing the last handle is what triggers the kill,
            // and there is no UI thread to surface a CloseHandle failure to.
            unsafe { CloseHandle(self.0) };
        }
    }

    /// Create a kill-on-close job and assign `child` to it. The returned handle
    /// must be held for the child's lifetime.
    pub fn assign(child: &Child) -> Result<KillOnCloseJob, String> {
        // SAFETY: every handle is checked before use; the info struct is fully
        // initialized (zeroed, then one field set) before the call.
        unsafe {
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if job.is_null() {
                return Err(format!(
                    "CreateJobObjectW: {}",
                    std::io::Error::last_os_error()
                ));
            }
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                std::ptr::addr_of!(info).cast(),
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            ) == 0
            {
                let e = std::io::Error::last_os_error();
                CloseHandle(job);
                return Err(format!("SetInformationJobObject: {e}"));
            }
            if AssignProcessToJobObject(job, child.as_raw_handle() as HANDLE) == 0 {
                let e = std::io::Error::last_os_error();
                CloseHandle(job);
                return Err(format!("AssignProcessToJobObject: {e}"));
            }
            Ok(KillOnCloseJob(job))
        }
    }
}

/// Host target triple — matches the suffix Tauri's `externalBin` appends when
/// staging per-arch sidecars into the bundle.
pub fn target_triple() -> &'static str {
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        "aarch64-apple-darwin"
    }
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    {
        "x86_64-apple-darwin"
    }
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    {
        "x86_64-unknown-linux-gnu"
    }
    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    {
        "aarch64-unknown-linux-gnu"
    }
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    {
        "x86_64-pc-windows-msvc"
    }
    #[cfg(not(any(
        all(target_os = "macos", target_arch = "aarch64"),
        all(target_os = "macos", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "aarch64"),
        all(target_os = "windows", target_arch = "x86_64"),
    )))]
    {
        "unknown-unknown-unknown"
    }
}

/// Resolve a bundled sidecar binary staged by Tauri's `externalBin`.
///
/// Resolution order (mirrors how sidecars actually land on shipping platforms):
///   1. `env_override` env var (dev override / SSH deploy).
///   2. Sibling of the current executable — where `externalBin` places sidecars
///      in shipped bundles (macOS `Contents/MacOS/`, next to the Windows exe,
///      inside the Linux AppImage). Tries the plain name then the
///      `<base>-<triple>` form.
///   3. `<resource_dir>/binaries/<name>` — legacy / belt-and-braces fallback.
///
/// The cargo target dir is deliberately NOT searched: only pre-cutover builds
/// produced artifacts there, so a match could only ever shadow the real staged
/// binary with a stale one.
pub fn resolve_bundled_binary(
    base: &str,
    resource_dir: Option<&PathBuf>,
    env_override: &str,
) -> Result<PathBuf, String> {
    let ext = if cfg!(windows) { ".exe" } else { "" };
    let plain = format!("{base}{ext}");
    let triple = format!("{base}-{}{ext}", target_triple());

    let mut tried: Vec<PathBuf> = Vec::new();
    let check = |p: PathBuf, tried: &mut Vec<PathBuf>| -> Option<PathBuf> {
        if p.exists() {
            Some(p)
        } else {
            tried.push(p);
            None
        }
    };

    if let Ok(p) = std::env::var(env_override) {
        if let Some(hit) = check(PathBuf::from(p), &mut tried) {
            return Ok(hit);
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for name in [&plain, &triple] {
                if let Some(hit) = check(dir.join(name), &mut tried) {
                    return Ok(hit);
                }
            }
        }
    }
    if let Some(res) = resource_dir {
        for name in [&plain, &triple] {
            if let Some(hit) = check(res.join("binaries").join(name), &mut tried) {
                return Ok(hit);
            }
        }
    }

    Err(format!(
        "{base} binary not found. Tried:\n  - {}",
        tried
            .iter()
            .map(|p| p.display().to_string())
            .collect::<Vec<_>>()
            .join("\n  - ")
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolver_reports_every_tried_path_when_missing() {
        // A base that can't exist anywhere → Err listing candidates, never a
        // panic. `HOUSTON_TEST_MISSING_BIN` is unset so the env arm is skipped.
        let err =
            resolve_bundled_binary("houston-nonexistent-xyz", None, "HOUSTON_TEST_MISSING_BIN")
                .unwrap_err();
        assert!(err.contains("houston-nonexistent-xyz"));
        assert!(err.contains("Tried:"));
    }

    #[test]
    fn resolver_honors_env_override() {
        // Point the override at THIS test binary, which certainly exists.
        let me = std::env::current_exe().expect("current exe");
        std::env::set_var("HOUSTON_TEST_GUARD_BIN", &me);
        let hit = resolve_bundled_binary("whatever", None, "HOUSTON_TEST_GUARD_BIN")
            .expect("env override should resolve");
        assert_eq!(hit, me);
        std::env::remove_var("HOUSTON_TEST_GUARD_BIN");
    }

    /// The Windows orphan-fix contract: a process assigned to our job dies the
    /// moment the last job handle closes — the kernel-enforced behavior that
    /// replaces the stdin-EOF watchdog. Runs on a real child.
    #[cfg(windows)]
    #[test]
    fn job_kills_child_when_handle_dropped() {
        use std::os::windows::process::CommandExt;
        use std::process::{Command, Stdio};
        use std::time::{Duration, Instant};

        let mut child = Command::new("cmd")
            .args(["/c", "ping", "-n", "30", "127.0.0.1"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .expect("spawn test child");

        let job = win_job::assign(&child).expect("assign child to job");
        drop(job);

        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            match child.try_wait().expect("try_wait") {
                Some(_) => break,
                None if Instant::now() >= deadline => {
                    let _ = child.kill();
                    panic!("child survived job-handle close — KILL_ON_JOB_CLOSE not in effect");
                }
                None => std::thread::sleep(Duration::from_millis(25)),
            }
        }
    }
}
