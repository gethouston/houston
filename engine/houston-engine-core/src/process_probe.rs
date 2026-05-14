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

#[cfg(test)]
mod tests {
    use super::is_alive;

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
}
