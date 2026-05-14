//! Cross-platform "is this PID alive?" probe.
//!
//! Two callers today:
//! - [`crate::runtime_pids::reap_orphans`] — decides whether to SIGTERM
//!   a registered CLI subprocess from a prior engine instance.
//! - [`crate::agents::lifecycle::sweep_stale`] — decides whether an
//!   activity's expired lease should be transitioned to `Interrupted`
//!   (don't transition if the owning process is still alive, e.g. the
//!   laptop just woke from sleep and our heartbeat task is microseconds
//!   from catching up).
//!
//! This module deliberately stays a probe — no termination, no identity
//! validation. PID identity validation (`{pid, exe_path, start_time}`)
//! lives in [`identity`] and is only used by the orphan reaper where
//! killing the wrong process has a worse blast radius than letting a
//! lease linger.

#[cfg(unix)]
pub fn is_alive(pid: u32) -> bool {
    // POSIX: `kill(pid, 0)` returns 0 if a signal could be sent (i.e.
    // the process exists and we have permission). ESRCH means no such
    // pid. EPERM means it exists but we can't signal it (still "alive"
    // from our perspective — could be a child reparented under root or
    // another user). Any other errno (rare) we treat as "alive" to avoid
    // racing toward Interrupted on a transient `kill` failure.
    let r = unsafe { libc::kill(pid as libc::pid_t, 0) };
    if r == 0 {
        return true;
    }
    let err = std::io::Error::last_os_error();
    match err.raw_os_error() {
        Some(libc::ESRCH) => false,
        Some(libc::EPERM) => true,
        _ => true,
    }
}

#[cfg(windows)]
pub fn is_alive(pid: u32) -> bool {
    // Without OpenProcess scaffolding, return `true` so callers always
    // attempt to act on the pid. For the orphan reaper this means we
    // still try `taskkill` (which exits 128 for dead pids — harmless).
    // For sweep_stale this means a stale lease whose owner_pid is on
    // Windows will skip interruption, which is the conservative call:
    // the reaper still runs every 10s, so any genuinely dead owner will
    // surface to the user via the eventual lease-expiry path once we
    // wire up `OpenProcess`-based liveness. Tracked separately.
    let _ = pid;
    true
}

// ---------------------------------------------------------------------------
// Identity probe — `{exe_path, start_time}` fingerprint of a process.
//
// Why: a bare PID is not a stable handle. macOS recycles PIDs aggressively
// (low pids first when high pids exhaust). For Houston's orphan reaper,
// which reads a `cli_pids.json` written by a prior engine instance and
// might be tens of seconds to days old, terminating "PID 12345" without
// verifying it's still the *same process* we registered can SIGTERM an
// unrelated process group — e.g. the user's editor.
//
// `ProcessIdentity { exe_path, start_time_secs }` is the minimum
// fingerprint that survives PID reuse: start_time is monotonic per
// boot, exe_path catches the case where a re-exec changed binaries.
// We record both at registration and re-probe at reap time; if either
// differs from the stored value, the pid was recycled and we skip.
// ---------------------------------------------------------------------------

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProcessIdentity {
    pub exe_path: PathBuf,
    /// Seconds since the Unix epoch (Linux/macOS) or since the Windows
    /// FILETIME epoch (1601-01-01). Used only for equality vs. a
    /// previously-captured value — not for arithmetic across boots.
    pub start_time_secs: u64,
}

/// Capture `{exe_path, start_time}` for `pid`, or `None` if the process
/// doesn't exist or we lack permission to probe it.
pub fn identity(pid: u32) -> Option<ProcessIdentity> {
    identity_impl(pid)
}

#[cfg(target_os = "linux")]
fn identity_impl(pid: u32) -> Option<ProcessIdentity> {
    let exe_path = std::fs::read_link(format!("/proc/{pid}/exe")).ok()?;
    // /proc/<pid>/stat layout: pid (comm) state ppid ... starttime ...
    // starttime is field 22 in clock ticks since boot. The `comm` field
    // can contain spaces and parentheses, so split on the trailing ')'.
    let stat = std::fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
    let rest = stat.rsplit_once(')').map(|t| t.1)?;
    // After ")", fields are space-separated starting at field 3 (state).
    // Field 22 in 1-indexed → index 19 in 0-indexed-after-comm.
    let starttime_ticks: u64 = rest.split_whitespace().nth(19)?.parse().ok()?;
    // Convert ticks since boot to seconds since boot. CLK_TCK is the
    // sysconf value; on Linux it's universally 100, but read it for
    // correctness. As above, this is used only for equality so the
    // unit doesn't matter as long as it's stable across calls.
    let clk_tck = unsafe { libc::sysconf(libc::_SC_CLK_TCK) };
    let clk_tck = if clk_tck > 0 { clk_tck as u64 } else { 100 };
    Some(ProcessIdentity {
        exe_path,
        start_time_secs: starttime_ticks / clk_tck,
    })
}

#[cfg(target_os = "macos")]
fn identity_impl(pid: u32) -> Option<ProcessIdentity> {
    // macOS exposes `proc_pidpath` for the executable path and
    // `proc_pidinfo(PROC_PIDTBSDINFO)` for the BSD process info which
    // includes `pbi_start_tvsec` — wall-clock seconds at process start.
    // Neither is in the `libc` crate's public surface, so we declare
    // the FFI inline.
    const PROC_PIDTBSDINFO: i32 = 3;
    const PROC_PIDPATHINFO_MAXSIZE: usize = 4 * 1024;

    #[repr(C)]
    #[derive(Default, Copy, Clone)]
    struct ProcBsdInfo {
        pbi_flags: u32,
        pbi_status: u32,
        pbi_xstatus: u32,
        pbi_pid: u32,
        pbi_ppid: u32,
        pbi_uid: u32,
        pbi_gid: u32,
        pbi_ruid: u32,
        pbi_rgid: u32,
        pbi_svuid: u32,
        pbi_svgid: u32,
        rfu_1: u32,
        pbi_comm: [u8; 16],
        pbi_name: [u8; 32],
        pbi_nfiles: u32,
        pbi_pgid: u32,
        pbi_pjobc: u32,
        e_tdev: u32,
        e_tpgid: u32,
        pbi_nice: i32,
        pbi_start_tvsec: u64,
        pbi_start_tvusec: u64,
    }

    extern "C" {
        fn proc_pidpath(pid: libc::c_int, buf: *mut libc::c_char, buf_size: u32) -> i32;
        fn proc_pidinfo(
            pid: libc::c_int,
            flavor: i32,
            arg: u64,
            buffer: *mut libc::c_void,
            buffer_size: i32,
        ) -> i32;
    }

    let mut buf = vec![0i8; PROC_PIDPATHINFO_MAXSIZE];
    let n = unsafe {
        proc_pidpath(
            pid as libc::c_int,
            buf.as_mut_ptr(),
            PROC_PIDPATHINFO_MAXSIZE as u32,
        )
    };
    if n <= 0 {
        return None;
    }
    let bytes: Vec<u8> = buf[..n as usize].iter().map(|&b| b as u8).collect();
    let exe_path = PathBuf::from(String::from_utf8_lossy(&bytes).into_owned());

    let mut info = ProcBsdInfo::default();
    let size = std::mem::size_of::<ProcBsdInfo>() as i32;
    let r = unsafe {
        proc_pidinfo(
            pid as libc::c_int,
            PROC_PIDTBSDINFO,
            0,
            &mut info as *mut _ as *mut libc::c_void,
            size,
        )
    };
    if r != size {
        return None;
    }
    Some(ProcessIdentity {
        exe_path,
        start_time_secs: info.pbi_start_tvsec,
    })
}

#[cfg(windows)]
fn identity_impl(_pid: u32) -> Option<ProcessIdentity> {
    // Windows identity probe is intentionally deferred: the orphan reap
    // on Windows uses `taskkill /F /T`, which the kernel rejects with
    // exit 128 if the pid no longer maps to a process, so the worst
    // case of a recycled pid is "we try to kill a stranger and either
    // taskkill refuses or we kill the wrong tree." This is the same
    // gap acknowledged in `is_alive(windows)` above. When we tighten
    // either path, do both at once via `OpenProcess` + `GetProcessTimes`
    // + `QueryFullProcessImageNameW`.
    None
}

#[cfg(not(any(target_os = "linux", target_os = "macos", windows)))]
fn identity_impl(_pid: u32) -> Option<ProcessIdentity> {
    None
}

#[cfg(test)]
mod tests {
    use super::{identity, is_alive};

    #[cfg(unix)]
    #[test]
    fn pid_1_init_is_alive() {
        // PID 1 exists on every Unix-like OS.
        assert!(is_alive(1));
    }

    #[cfg(unix)]
    #[test]
    fn our_own_pid_is_alive() {
        assert!(is_alive(std::process::id()));
    }

    #[cfg(unix)]
    #[test]
    fn out_of_range_pid_is_dead() {
        // Any value above the maximum PID is guaranteed not to exist.
        assert!(!is_alive(u32::MAX - 1));
    }

    #[cfg(any(target_os = "linux", target_os = "macos"))]
    #[test]
    fn identity_for_our_own_pid_is_stable() {
        // Two probes microseconds apart should return identical
        // identities for our own pid (binary path + start time don't
        // change). This is the equality the orphan reaper relies on.
        let a = identity(std::process::id()).expect("self identity");
        let b = identity(std::process::id()).expect("self identity (2nd)");
        assert_eq!(a, b);
        assert!(a.exe_path.is_absolute(), "exe_path must be absolute");
        assert!(a.start_time_secs > 0, "start_time must be non-zero");
    }

    #[cfg(any(target_os = "linux", target_os = "macos"))]
    #[test]
    fn identity_for_dead_pid_is_none() {
        // A pid in the kernel-impossible range cannot have an identity.
        assert!(identity(u32::MAX - 1).is_none());
    }

    #[cfg(any(target_os = "linux", target_os = "macos"))]
    #[test]
    fn identity_distinguishes_child_from_parent() {
        // Spawn `sleep 60`, capture its identity, then capture our own
        // identity. They must differ on at least one field (exe_path
        // or start_time) — without that the orphan reaper couldn't
        // tell a recycled pid from the original.
        let child = std::process::Command::new("sleep")
            .arg("60")
            .spawn()
            .expect("spawn sleep");
        let child_pid = child.id();
        // Give the kernel a microsecond to wire up /proc.
        std::thread::sleep(std::time::Duration::from_millis(5));
        let child_id = identity(child_pid).expect("child identity");
        let self_id = identity(std::process::id()).expect("self identity");
        // Either binary path or start time must distinguish them. In
        // practice both do, but assert the disjunction so the test
        // doesn't flake on machines where the test binary itself is
        // `/bin/sleep` (it isn't, but be defensive).
        assert!(
            child_id.exe_path != self_id.exe_path
                || child_id.start_time_secs != self_id.start_time_secs,
            "child and parent identities indistinguishable: {child_id:?} vs {self_id:?}"
        );
        // Clean up.
        let mut child = child;
        let _ = child.kill();
        let _ = child.wait();
    }
}
