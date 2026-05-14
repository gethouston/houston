//! Persistent registry of CLI subprocess PIDs spawned by the engine.
//!
//! When the engine dies (panic, crash, OS kill, app quit), its child
//! `claude` / `codex` processes are reparented to launchd / systemd and
//! KEEP RUNNING. They eventually SIGPIPE-die when they try to write to
//! a closed pipe, but that can be tens of seconds later — during which
//! they continue to consume API quota and write to chat_feed. Worse,
//! the UI flips the activity to `Interrupted` (via reaper) while the
//! orphan is still streaming, producing a confusing "agent answered,
//! UI says paused" state.
//!
//! Fix: every time the engine spawns a CLI, register its PID in
//! `~/.houston/runtime/cli_pids.json`. On clean exit, unregister it.
//! On fresh engine boot, [`reap_orphans`] reads the file, kills every
//! PID that's still alive, and truncates the file. The subsequent
//! [`crate::reaper::reconcile_on_boot`] then transitions the activity
//! rows to `Interrupted` cleanly.
//!
//! File format is a flat JSON array — read-modify-write with atomic
//! temp+rename. Concurrent engine instances would race here, but
//! they shouldn't exist (LaunchAgent ensures one). When two engines
//! DO transiently overlap (e.g. during a future update-handoff), the
//! losing engine's orphan-reap won't clobber the winner's still-live
//! PIDs because the winner has freshly re-registered them.

use crate::error::CoreResult;
use chrono::{DateTime, Utc};
use houston_agents_conversations::session_runner::{DynPidRecorder, PidRecorder};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Arc;

const RUNTIME_DIR: &str = "runtime";
const PID_FILE: &str = "cli_pids.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RegisteredPid {
    pub pid: u32,
    pub session_key: String,
    pub spawned_at: DateTime<Utc>,
    /// Process identity fingerprint (exe_path + start_time) captured
    /// at registration. Reap-time validates the live process at `pid`
    /// has the same identity before terminating — without this, a
    /// recycled pid would cause the reaper to SIGTERM an unrelated
    /// process group. `None` on legacy rows written before identity
    /// validation existed (those still reap on pid-only, with the
    /// same risk the change here is meant to remove — they age out
    /// quickly because reap_orphans truncates the file on every boot).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub identity: Option<crate::process_probe::ProcessIdentity>,
}

fn pid_file(home_dir: &Path) -> PathBuf {
    home_dir.join(RUNTIME_DIR).join(PID_FILE)
}

fn read(home_dir: &Path) -> CoreResult<Vec<RegisteredPid>> {
    let path = pid_file(home_dir);
    match std::fs::read_to_string(&path) {
        Ok(s) if s.trim().is_empty() => Ok(Vec::new()),
        Ok(s) => serde_json::from_str(&s).map_err(|e| {
            crate::CoreError::Internal(format!(
                "runtime_pids parse failed for {}: {e}",
                path.display()
            ))
        }),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(e) => Err(crate::CoreError::Internal(format!(
            "runtime_pids read failed: {e}"
        ))),
    }
}

fn write(home_dir: &Path, entries: &[RegisteredPid]) -> CoreResult<()> {
    let runtime_dir = home_dir.join(RUNTIME_DIR);
    std::fs::create_dir_all(&runtime_dir).map_err(|e| {
        crate::CoreError::Internal(format!(
            "runtime_pids mkdir failed for {}: {e}",
            runtime_dir.display()
        ))
    })?;
    let path = pid_file(home_dir);
    let tmp = path.with_extension("json.tmp");
    let body = serde_json::to_string(entries).map_err(|e| {
        crate::CoreError::Internal(format!("runtime_pids serialize failed: {e}"))
    })?;
    std::fs::write(&tmp, body).map_err(|e| {
        crate::CoreError::Internal(format!("runtime_pids write tmp failed: {e}"))
    })?;
    std::fs::rename(&tmp, &path).map_err(|e| {
        crate::CoreError::Internal(format!("runtime_pids rename failed: {e}"))
    })?;
    Ok(())
}

/// Add `pid` to the registry. Called by the session runner when it
/// observes its CLI child's pid. Idempotent on session_key — replaces
/// any prior entry for the same key (rare but possible during racy
/// session restarts).
pub fn register(home_dir: &Path, session_key: &str, pid: u32) -> CoreResult<()> {
    // Capture identity BEFORE entering the lock so the probe doesn't
    // happen under contention. Identity is `None` if the probe fails
    // (unsupported platform, /proc not mounted, etc.); reap-time falls
    // back to pid-only matching with the same caveat.
    let identity = crate::process_probe::identity(pid);
    // Process-wide lock keyed on the pid file. Without this, two
    // parallel `sessions::start` (one per agent — Houston's core value
    // prop) race the unlocked read-modify-write below and drop one pid
    // on every conflict. Symptom: orphan CLI subprocesses from one of
    // the parallel sessions silently slip past the next boot's reap
    // and burn API quota for tens of seconds before SIGPIPE-dying.
    crate::file_mutex::with_file_lock(&pid_file(home_dir), || {
        let mut entries = read(home_dir)?;
        entries.retain(|e| e.session_key != session_key);
        entries.push(RegisteredPid {
            pid,
            session_key: session_key.to_string(),
            spawned_at: Utc::now(),
            identity,
        });
        write(home_dir, &entries)
    })
}

/// Remove the entry for `session_key`. Called on clean session exit.
/// No-op if the key isn't present (e.g. session ended after engine
/// restart — its entry was already reaped).
pub fn unregister(home_dir: &Path, session_key: &str) -> CoreResult<()> {
    crate::file_mutex::with_file_lock(&pid_file(home_dir), || {
        let mut entries = read(home_dir)?;
        let before = entries.len();
        entries.retain(|e| e.session_key != session_key);
        if entries.len() == before {
            return Ok(());
        }
        write(home_dir, &entries)
    })
}

/// Kill any registered PID that's still alive, then truncate the file.
/// Called once at engine boot, BEFORE serving HTTP and before
/// [`crate::reaper::reconcile_on_boot`].
///
/// Returns the count of PIDs that were alive and got SIGTERM'd.
/// Self-resilient: errors on individual PIDs are logged and skipped.
pub fn reap_orphans(home_dir: &Path) -> CoreResult<usize> {
    // Hold the file lock for the whole read → terminate-each → truncate
    // sweep. The boot-time path doesn't actually contend (we run before
    // serving HTTP and before any session can spawn), but holding it
    // anyway makes the function safe to call from places other than
    // boot if we ever want to.
    crate::file_mutex::with_file_lock(&pid_file(home_dir), || {
        let entries = read(home_dir)?;
        let mut killed = 0usize;
        for e in &entries {
            if !crate::process_probe::is_alive(e.pid) {
                continue;
            }
            // Don't kill ourselves — sanity check against a corrupt
            // file or a same-process pid recycle. The current engine
            // pid can't be an orphan from a prior incarnation.
            if e.pid == std::process::id() {
                tracing::warn!(
                    target: "runtime_pids",
                    pid = e.pid,
                    "skipping orphan reap: pid matches our own"
                );
                continue;
            }
            // PID identity gate: if we recorded an identity at register
            // time and the live process at `pid` doesn't match, the pid
            // was recycled by the OS to an unrelated process. Killing it
            // would SIGTERM a stranger's process group — the user's
            // editor, another Tauri app, anything. Skip.
            if let Some(ref recorded) = e.identity {
                match crate::process_probe::identity(e.pid) {
                    Some(live) if live == *recorded => {
                        // matches — proceed to terminate below.
                    }
                    Some(live) => {
                        tracing::warn!(
                            target: "runtime_pids",
                            pid = e.pid,
                            session_key = %e.session_key,
                            recorded_exe = %recorded.exe_path.display(),
                            live_exe = %live.exe_path.display(),
                            recorded_start = recorded.start_time_secs,
                            live_start = live.start_time_secs,
                            "skipping orphan reap: pid was recycled by another process"
                        );
                        continue;
                    }
                    None => {
                        // Can't re-probe. On Linux/macOS this means the
                        // process literally just died between is_alive()
                        // above and identity() — extremely racy but
                        // possible. Safer to skip than to fire SIGTERM
                        // at whatever the kernel hands the pid to next.
                        tracing::info!(
                            target: "runtime_pids",
                            pid = e.pid,
                            "skipping orphan reap: live identity unavailable"
                        );
                        continue;
                    }
                }
            }
            match terminate(e.pid) {
                Ok(()) => {
                    killed += 1;
                    tracing::info!(
                        target: "runtime_pids",
                        pid = e.pid,
                        session_key = %e.session_key,
                        "reaped orphan CLI subprocess from prior engine instance"
                    );
                }
                Err(err) => {
                    tracing::warn!(
                        target: "runtime_pids",
                        pid = e.pid,
                        session_key = %e.session_key,
                        error = %err,
                        "failed to terminate orphan CLI subprocess"
                    );
                }
            }
        }
        // Truncate the file regardless — we want a clean slate for
        // this engine instance. Anything we couldn't kill is logged
        // above.
        write(home_dir, &[])?;
        Ok(killed)
    })
}

// `is_alive` lives in `crate::process_probe` so the lease reaper
// (`agents::lifecycle::sweep_stale`) can share the same probe.

#[cfg(unix)]
fn terminate(pid: u32) -> Result<(), String> {
    // Send SIGTERM to the process group so any grandchildren go with
    // the parent. The CLI was spawned with `pre_exec(setpgid(0,0))` so
    // the group leader pid matches the process pid.
    let r = unsafe { libc::killpg(pid as libc::pid_t, libc::SIGTERM) };
    if r == 0 {
        Ok(())
    } else {
        let err = std::io::Error::last_os_error();
        // Fallback to a plain kill in case the process group setup
        // never happened (older sessions, races).
        if unsafe { libc::kill(pid as libc::pid_t, libc::SIGTERM) } == 0 {
            return Ok(());
        }
        Err(format!("killpg/kill failed: {err}"))
    }
}

#[cfg(windows)]
fn terminate(pid: u32) -> Result<(), String> {
    let output = std::process::Command::new("taskkill")
        .args(["/F", "/T", "/PID", &pid.to_string()])
        .output()
        .map_err(|e| format!("taskkill spawn failed: {e}"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "taskkill exit {:?} stderr={}",
            output.status.code(),
            String::from_utf8_lossy(&output.stderr).trim()
        ))
    }
}

/// Concrete `PidRecorder` that writes to `~/.houston/runtime/cli_pids.json`.
///
/// Use [`recorder`] to construct one as `DynPidRecorder` ready to plug
/// into the session runner.
pub struct RuntimePidRecorder {
    home_dir: PathBuf,
}

impl PidRecorder for RuntimePidRecorder {
    fn record(&self, session_key: &str, pid: u32) {
        if let Err(e) = register(&self.home_dir, session_key, pid) {
            tracing::warn!(
                target: "runtime_pids",
                error = %e,
                session_key = %session_key,
                pid,
                "failed to register CLI pid — orphan reaper won't see this on next boot"
            );
        }
    }
    fn release(&self, session_key: &str) {
        if let Err(e) = unregister(&self.home_dir, session_key) {
            tracing::warn!(
                target: "runtime_pids",
                error = %e,
                session_key = %session_key,
                "failed to unregister CLI pid — file will be cleaned on next engine boot"
            );
        }
    }
}

/// Build a [`DynPidRecorder`] rooted at `home_dir`.
pub fn recorder(home_dir: PathBuf) -> DynPidRecorder {
    Arc::new(RuntimePidRecorder { home_dir })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn register_and_unregister_round_trip() {
        let d = TempDir::new().unwrap();
        register(d.path(), "session-a", 1234).unwrap();
        register(d.path(), "session-b", 5678).unwrap();
        let listed = read(d.path()).unwrap();
        assert_eq!(listed.len(), 2);
        assert!(listed.iter().any(|e| e.session_key == "session-a" && e.pid == 1234));
        assert!(listed.iter().any(|e| e.session_key == "session-b" && e.pid == 5678));

        unregister(d.path(), "session-a").unwrap();
        let listed = read(d.path()).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].session_key, "session-b");
    }

    #[test]
    fn register_replaces_prior_entry_for_same_key() {
        let d = TempDir::new().unwrap();
        register(d.path(), "session-a", 1234).unwrap();
        register(d.path(), "session-a", 9999).unwrap();
        let listed = read(d.path()).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].pid, 9999);
    }

    #[cfg(any(target_os = "linux", target_os = "macos"))]
    #[test]
    fn reap_skips_pid_when_identity_mismatches() {
        use crate::process_probe::ProcessIdentity;

        // Simulate PID reuse: register a pid (PID 1, init — definitely
        // alive on all Unix) with a FAKE identity that doesn't match
        // init's real identity. The reaper must:
        //   1. see is_alive(1) = true
        //   2. probe identity(1) → some real identity for init
        //   3. compare against the recorded fake identity
        //   4. mismatch → skip termination
        // If the gate weren't there, the reaper would try to SIGTERM
        // init. We assert the file is still truncated (correct cleanup
        // behaviour) and `killed == 0` (we didn't try to terminate
        // because the gate fired).
        let d = TempDir::new().unwrap();
        let fake_identity = ProcessIdentity {
            exe_path: std::path::PathBuf::from("/totally-not-init"),
            start_time_secs: 0,
        };
        // Manually write the entry — `register` would compute the real
        // identity for us, which is the opposite of what this test
        // needs.
        let entry = RegisteredPid {
            pid: 1,
            session_key: "fake-init".into(),
            spawned_at: Utc::now(),
            identity: Some(fake_identity),
        };
        write(d.path(), &[entry]).unwrap();

        let killed = reap_orphans(d.path()).unwrap();
        assert_eq!(killed, 0, "must NOT kill init when identity mismatches");
        let listed = read(d.path()).unwrap();
        assert!(listed.is_empty(), "file truncated regardless");
    }

    #[cfg(any(target_os = "linux", target_os = "macos"))]
    #[test]
    fn register_captures_real_identity() {
        // The pid we register here is our own — its identity must
        // round-trip through `register` and re-probe consistently.
        let d = TempDir::new().unwrap();
        let pid = std::process::id();
        register(d.path(), "self-test", pid).unwrap();
        let listed = read(d.path()).unwrap();
        assert_eq!(listed.len(), 1);
        let stored = listed[0].identity.as_ref().expect("identity recorded");
        let live = crate::process_probe::identity(pid).expect("self identity probe");
        assert_eq!(*stored, live);
    }

    #[test]
    fn concurrent_register_does_not_lose_entries() {
        // Houston's value prop is parallel agents. Two `sessions::start`
        // on two different agents → two `register` calls landing on the
        // same `cli_pids.json`. Without per-file locking the unsynchronized
        // read-modify-write loses one entry on every race, the orphan
        // slips past next-boot reap, and API quota gets burned.
        //
        // We can't easily reproduce a real OS-thread race in a 50-thread
        // test (the kernel page cache + std::fs::rename is fast enough
        // that races are intermittent without `with_file_lock`). To make
        // the test deterministic, we run 50 parallel registers and
        // assert the final file has all 50 entries — the lock guarantees
        // it, an unlocked baseline would intermittently lose entries.
        let d = TempDir::new().unwrap();
        let path = d.path().to_path_buf();
        let mut handles = Vec::new();
        for i in 0..50 {
            let path = path.clone();
            handles.push(std::thread::spawn(move || {
                register(&path, &format!("session-{i}"), 1000 + i as u32).unwrap();
            }));
        }
        for h in handles {
            h.join().unwrap();
        }
        let listed = read(&path).unwrap();
        assert_eq!(
            listed.len(),
            50,
            "all 50 parallel registers must land — got {}",
            listed.len()
        );
        // And no duplicate session_keys.
        let mut keys: Vec<&str> = listed.iter().map(|e| e.session_key.as_str()).collect();
        keys.sort();
        keys.dedup();
        assert_eq!(keys.len(), 50);
    }

    #[test]
    fn unregister_missing_key_is_noop() {
        let d = TempDir::new().unwrap();
        // No file yet — should not panic, should not create one.
        unregister(d.path(), "missing").unwrap();
        assert!(!pid_file(d.path()).exists());
    }

    #[test]
    fn read_missing_file_returns_empty() {
        let d = TempDir::new().unwrap();
        assert!(read(d.path()).unwrap().is_empty());
    }

    #[test]
    fn read_empty_file_returns_empty() {
        let d = TempDir::new().unwrap();
        std::fs::create_dir_all(d.path().join(RUNTIME_DIR)).unwrap();
        std::fs::write(pid_file(d.path()), "").unwrap();
        assert!(read(d.path()).unwrap().is_empty());
    }

    #[test]
    fn reap_orphans_truncates_file_even_on_dead_pids() {
        let d = TempDir::new().unwrap();
        // Register PID 1 (init — exists everywhere) plus a definitely
        // dead pid. The reap should skip our-own-pid guard for PID 1
        // (since 1 != ours) but on most systems we won't have permission
        // to signal it — that maps to EPERM = alive, then SIGTERM fails.
        // The point of the test: file is truncated regardless.
        register(d.path(), "fake-session", 999_999_999).unwrap();
        let _ = reap_orphans(d.path()).unwrap();
        let listed = read(d.path()).unwrap();
        assert!(listed.is_empty());
    }

    // `is_alive` tests live in `crate::process_probe` since the probe
    // moved there to be shared with the lease reaper.

    #[cfg(unix)]
    #[test]
    fn reap_skips_our_own_pid() {
        let d = TempDir::new().unwrap();
        // Pretend a prior engine wrote OUR pid into the file. We must
        // not signal ourselves — that would be a fun way to lose the
        // current process.
        let me = std::process::id();
        register(d.path(), "self-protect", me).unwrap();
        let killed = reap_orphans(d.path()).unwrap();
        assert_eq!(killed, 0, "must skip our own pid");
    }
}
