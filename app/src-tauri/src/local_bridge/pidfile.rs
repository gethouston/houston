//! frpc orphan-reaper: pidfile write/read/remove + a liveness- and
//! identity-guarded kill of a previous frpc instance.
//!
//! WHY THIS EXISTS: frpc runs in its own process group (Unix) so it survives
//! the app being SIGKILLed — which is EVERY `tauri dev` recompile, and any
//! production crash — because `RunEvent::Exit` never fires to call
//! [`crate::local_bridge::shutdown`]. The orphaned frpc keeps auto-reconnecting
//! to the relay and fights the new app's frpc over the same subdomain (frps
//! new-proxy / proxy-closing churn), so the tunnel never stabilizes. There is
//! no OS-level parent-death signal we relied on, so we persist the live frpc's
//! pid to a file and reap it on the NEXT spawn.
//!
//! PID-REUSE GUARD: a pid is not unique over time — by the time we read the
//! pidfile the OS may have recycled that number for an unrelated process. So we
//! never kill on the pidfile alone: we (1) confirm the pid is alive and (2)
//! confirm the live process is actually an frpc (its command/image contains
//! `frpc`). Only then do we kill its whole process group. Everything here is
//! best-effort cleanup — a failure to reap must NEVER break a bridge start, so
//! callers ignore the outcome and we only log at debug.

use std::path::{Path, PathBuf};

/// Substring that identifies our frpc process in a `ps`/`tasklist` line. The
/// bundled binary is resolved from base name `frpc` (plain or `frpc-<triple>`),
/// so its command line / image name always contains this.
const FRPC_NEEDLE: &str = "frpc";

/// Absolute path of the pidfile inside the local-bridge config dir (the same
/// dir that holds `frpc.toml`).
fn pid_path(config_dir: &Path) -> PathBuf {
    config_dir.join("frpc.pid")
}

/// Persist `pid` to `<config_dir>/frpc.pid`. Best-effort: a write failure is
/// logged at warn (it only degrades the next reap, it never breaks this spawn).
pub fn write(config_dir: &Path, pid: u32) {
    let path = pid_path(config_dir);
    if let Err(e) = std::fs::write(&path, pid.to_string()) {
        tracing::warn!(
            "[local-bridge] failed to write frpc pidfile {}: {e}",
            path.display()
        );
    }
}

/// Remove the pidfile on a CLEAN stop so a subsequent spawn finds no stale pid.
/// Best-effort: a missing file (already gone) or IO error is logged at debug.
pub fn remove(config_dir: &Path) {
    let path = pid_path(config_dir);
    match std::fs::remove_file(&path) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => tracing::debug!(
            "[local-bridge] failed to remove frpc pidfile {}: {e}",
            path.display()
        ),
    }
}

/// Read a pid from the pidfile, or `None` if absent/empty/unparseable.
fn read(config_dir: &Path) -> Option<u32> {
    let s = std::fs::read_to_string(pid_path(config_dir)).ok()?;
    s.trim().parse::<u32>().ok()
}

/// Reap a previous frpc instance recorded in the pidfile, BEFORE spawning a new
/// one. Runs at the top of every [`super::frpc::FrpcSupervisor::spawn`], so it
/// covers boot auto-reconnect (first spawn after a restart reaps the
/// pre-restart orphan) and every reconnect. Best-effort: never returns / never
/// panics on failure — a lost reap must not block the bridge.
pub fn reap_orphan(config_dir: &Path) {
    let Some(pid) = read(config_dir) else {
        return; // No pidfile → clean prior exit, nothing to reap.
    };
    if !is_alive(pid) {
        // Stale pidfile from an already-dead frpc; nothing to kill.
        tracing::debug!("[local-bridge] frpc pidfile {pid} is not alive; skipping reap");
        return;
    }
    if !is_our_frpc(read_process_command, pid, FRPC_NEEDLE) {
        // PID-REUSE GUARD: the number is alive but belongs to some other
        // process now — leave it strictly alone.
        tracing::debug!("[local-bridge] pid {pid} is not an frpc (reused); not killing");
        return;
    }
    tracing::debug!("[local-bridge] reaping orphaned frpc pid {pid}");
    kill(pid);
}

/// Decide whether `pid` is one of our frpc processes, using `read_cmd` to fetch
/// its command line / image name. Split out (and generic over the reader) so the
/// pid-reuse decision is unit-testable without a real process. Returns false
/// when the reader yields nothing (process gone or unreadable) — fail closed, we
/// never kill on doubt.
fn is_our_frpc<F: Fn(u32) -> Option<String>>(read_cmd: F, pid: u32, needle: &str) -> bool {
    match read_cmd(pid) {
        Some(cmd) => cmd
            .to_ascii_lowercase()
            .contains(&needle.to_ascii_lowercase()),
        None => false,
    }
}

// ---- OS-specific liveness / identity / kill --------------------------------

/// Is `pid` a live process? Unix: `kill(pid, 0)` succeeds for a signalable live
/// process. Windows: presence in `tasklist`.
#[cfg(unix)]
fn is_alive(pid: u32) -> bool {
    // SAFETY: signal 0 sends no signal; it only probes existence/permission and
    // touches no Rust state. Returns 0 when the process exists and is
    // signalable by us (always true for our own child's pid).
    unsafe { libc_kill(pid as i32, 0) == 0 }
}

#[cfg(windows)]
fn is_alive(pid: u32) -> bool {
    // tasklist prints a data row only when the pid exists (see
    // `read_process_command`); no row → not alive.
    read_process_command(pid).is_some()
}

/// Read a live process's command line (Unix) / image name (Windows), or `None`
/// if the pid does not exist. Shelling out to `ps`/`tasklist` keeps this a
/// zero-dependency identity probe (no `sysinfo`); it runs at most once per
/// bridge start, so the process spawn cost is irrelevant.
#[cfg(unix)]
fn read_process_command(pid: u32) -> Option<String> {
    let out = std::process::Command::new("ps")
        .args(["-p", &pid.to_string(), "-o", "command="])
        .output()
        .ok()?;
    if !out.status.success() {
        return None; // `ps` exits non-zero when the pid is gone.
    }
    let cmd = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if cmd.is_empty() {
        None
    } else {
        Some(cmd)
    }
}

#[cfg(windows)]
fn read_process_command(pid: u32) -> Option<String> {
    // CSV, no header: a live pid yields e.g. `"frpc.exe","1234",...`; a dead pid
    // yields `INFO: No tasks are running ...` on stderr and no CSV row.
    let out = std::process::Command::new("tasklist")
        .args(["/FI", &format!("PID eq {pid}"), "/FO", "CSV", "/NH"])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&out.stdout);
    let line = text.lines().find(|l| l.trim_start().starts_with('"'))?;
    // First CSV field is the image name; strip the surrounding quotes.
    let image = line.split(',').next()?.trim().trim_matches('"').to_string();
    if image.is_empty() {
        None
    } else {
        Some(image)
    }
}

/// Kill the reaped frpc. Unix: its whole process group (it was placed in its own
/// group at spawn, so pid == pgid) via the shared [`crate::child_guard`] path.
/// Windows: a force tree-kill by pid.
#[cfg(unix)]
fn kill(pid: u32) {
    crate::child_guard::kill_process_group(pid as i32);
}

#[cfg(windows)]
fn kill(pid: u32) {
    // /T also takes any children; /F forces it. Best-effort — ignore outcome.
    let _ = std::process::Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .output();
}

#[cfg(unix)]
extern "C" {
    /// `kill(2)` — with signal 0 it performs only existence/permission checks.
    /// Named `libc_kill` to avoid colliding with the module-local [`kill`] reaper.
    #[link_name = "kill"]
    fn libc_kill(pid: i32, sig: i32) -> i32;
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "houston-frpc-pidfile-{}-{}-{tag}",
            std::process::id(),
            tag
        ));
        std::fs::create_dir_all(&dir).expect("create tmp dir");
        dir
    }

    #[test]
    fn write_read_remove_round_trip() {
        let dir = tmp_dir("roundtrip");

        // No file yet → None.
        assert_eq!(read(&dir), None);

        // Write then read back the exact pid.
        write(&dir, 4242);
        assert!(pid_path(&dir).exists());
        assert_eq!(read(&dir), Some(4242));

        // Remove clears it; a second remove is a no-op (best-effort).
        remove(&dir);
        assert!(!pid_path(&dir).exists());
        assert_eq!(read(&dir), None);
        remove(&dir); // must not panic on a missing file

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn read_ignores_garbage_pidfile() {
        let dir = tmp_dir("garbage");
        std::fs::write(pid_path(&dir), "not-a-pid").expect("write");
        assert_eq!(read(&dir), None);
        // Whitespace around a valid pid is tolerated.
        std::fs::write(pid_path(&dir), "  99 \n").expect("write");
        assert_eq!(read(&dir), Some(99));
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// The pid-reuse guard: kill ONLY when the live process really is an frpc.
    /// Uses a stubbed command-reader so no real process is required.
    #[test]
    fn is_our_frpc_matches_only_frpc_command() {
        // A matching command (our bundled binary, triple-suffixed) → kill.
        assert!(is_our_frpc(
            |_pid| Some("/opt/houston/frpc-aarch64-apple-darwin -c /x/frpc.toml".to_string()),
            1234,
            FRPC_NEEDLE,
        ));
        // Plain `frpc.exe` image name (Windows tasklist) → kill.
        assert!(is_our_frpc(
            |_pid| Some("frpc.exe".to_string()),
            1234,
            FRPC_NEEDLE,
        ));
        // A reused pid now running something unrelated → DO NOT kill.
        assert!(!is_our_frpc(
            |_pid| Some("/usr/bin/postgres -D /var/lib/pg".to_string()),
            1234,
            FRPC_NEEDLE,
        ));
        // Process gone / command unreadable → fail closed, DO NOT kill.
        assert!(!is_our_frpc(|_pid| None, 1234, FRPC_NEEDLE));
    }

    #[test]
    fn is_our_frpc_is_case_insensitive() {
        assert!(is_our_frpc(
            |_pid| Some("C:\\Program Files\\Houston\\FRPC.EXE".to_string()),
            7,
            FRPC_NEEDLE,
        ));
    }

    /// reap_orphan is a no-op (and never panics) when there is no pidfile — the
    /// clean-exit path.
    #[test]
    fn reap_orphan_without_pidfile_is_noop() {
        let dir = tmp_dir("noreap");
        remove(&dir); // ensure absent
        reap_orphan(&dir); // must not panic
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// A pidfile pointing at a dead pid is skipped (stale), not killed. Uses a
    /// pid that is almost certainly not live.
    #[test]
    fn reap_orphan_skips_dead_pid() {
        let dir = tmp_dir("deadpid");
        // A very high pid that is not alive on the test host.
        write(&dir, 2_000_000_000);
        assert!(!is_alive(2_000_000_000));
        reap_orphan(&dir); // takes the stale branch, no kill, no panic
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// The current test process IS alive — the liveness probe must agree.
    #[test]
    fn is_alive_true_for_self() {
        assert!(is_alive(std::process::id()));
    }
}
