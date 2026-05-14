//! Engine-owned activity lease store.
//!
//! Why this exists separately from `Activity.lease` (which it replaces):
//! activity.json lives inside `<agent_dir>/.houston/` which is *agent-
//! writable* — the CLI subprocess has shell access to its working tree
//! and can edit any file under it. A malicious or buggy agent could
//! write `expires_at: 9999-12-31` and become un-reapable, or write
//! `lease: null` and immediately self-interrupt. Engine-owned durability
//! must live outside agent-writable space.
//!
//! Location: `~/.houston/runtime/leases.json`. Same parent as
//! [`crate::runtime_pids`] — engine-only, never touched by agents.
//!
//! Schema:
//! ```json
//! [
//!   {
//!     "agent_path": "/Users/ja/.houston/workspaces/Personal/bookkeeping",
//!     "session_key": "activity-abc",
//!     "lease": { "lease_id": "...", "owner_pid": 1234, "expires_at": "..." }
//!   }
//! ]
//! ```
//!
//! All operations go through [`crate::file_mutex::with_file_lock`] keyed
//! on the file path, so the heartbeat / reaper / HTTP cancel paths
//! serialize.

use crate::agents::lease::Lease;
use crate::error::CoreResult;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

const RUNTIME_DIR: &str = "runtime";
const LEASE_FILE: &str = "leases.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LeaseEntry {
    pub agent_path: String,
    pub session_key: String,
    pub lease: Lease,
}

fn leases_file(home_dir: &Path) -> PathBuf {
    home_dir.join(RUNTIME_DIR).join(LEASE_FILE)
}

fn read(home_dir: &Path) -> CoreResult<Vec<LeaseEntry>> {
    let path = leases_file(home_dir);
    match std::fs::read_to_string(&path) {
        Ok(s) if s.trim().is_empty() => Ok(Vec::new()),
        Ok(s) => serde_json::from_str(&s).map_err(|e| {
            crate::CoreError::Internal(format!(
                "runtime_leases parse failed for {}: {e}",
                path.display()
            ))
        }),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(e) => Err(crate::CoreError::Internal(format!(
            "runtime_leases read failed: {e}"
        ))),
    }
}

fn write(home_dir: &Path, entries: &[LeaseEntry]) -> CoreResult<()> {
    let runtime_dir = home_dir.join(RUNTIME_DIR);
    std::fs::create_dir_all(&runtime_dir).map_err(|e| {
        crate::CoreError::Internal(format!(
            "runtime_leases mkdir failed for {}: {e}",
            runtime_dir.display()
        ))
    })?;
    let path = leases_file(home_dir);
    let tmp = path.with_extension("json.tmp");
    let body = serde_json::to_string(entries)
        .map_err(|e| crate::CoreError::Internal(format!("runtime_leases serialize: {e}")))?;
    std::fs::write(&tmp, body)
        .map_err(|e| crate::CoreError::Internal(format!("runtime_leases write tmp: {e}")))?;
    std::fs::rename(&tmp, &path)
        .map_err(|e| crate::CoreError::Internal(format!("runtime_leases rename: {e}")))?;
    Ok(())
}

/// Attach a fresh lease for `(agent_path, session_key)`. Replaces any
/// existing entry (e.g. a stale lease from a prior interrupted run).
pub fn attach(home_dir: &Path, agent_path: &str, session_key: &str) -> CoreResult<Lease> {
    let new_lease = Lease::fresh();
    let entry = LeaseEntry {
        agent_path: agent_path.to_string(),
        session_key: session_key.to_string(),
        lease: new_lease.clone(),
    };
    crate::file_mutex::with_file_lock(&leases_file(home_dir), || {
        let mut entries = read(home_dir)?;
        entries.retain(|e| !(e.agent_path == agent_path && e.session_key == session_key));
        entries.push(entry);
        write(home_dir, &entries)
    })?;
    Ok(new_lease)
}

/// Push the lease's `expires_at` forward iff the stored lease_id still
/// matches. Returns `Ok(false)` when ownership has rotated (caller
/// should stop heartbeating); `Ok(true)` on a successful extend; and
/// `Ok(false)` when the entry is missing (cleared by `clear` or
/// `sweep_stale`).
pub fn extend(
    home_dir: &Path,
    agent_path: &str,
    session_key: &str,
    lease_id: &str,
) -> CoreResult<bool> {
    crate::file_mutex::with_file_lock(&leases_file(home_dir), || {
        let mut entries = read(home_dir)?;
        let Some(entry) = entries
            .iter_mut()
            .find(|e| e.agent_path == agent_path && e.session_key == session_key)
        else {
            return Ok(false);
        };
        if entry.lease.lease_id != lease_id {
            return Ok(false);
        }
        entry.lease = entry.lease.extended();
        write(home_dir, &entries)?;
        Ok(true)
    })
}

/// Remove the lease for `(agent_path, session_key)`. No-op if absent.
pub fn clear(home_dir: &Path, agent_path: &str, session_key: &str) -> CoreResult<()> {
    crate::file_mutex::with_file_lock(&leases_file(home_dir), || {
        let mut entries = read(home_dir)?;
        let before = entries.len();
        entries.retain(|e| !(e.agent_path == agent_path && e.session_key == session_key));
        if entries.len() == before {
            return Ok(());
        }
        write(home_dir, &entries)
    })
}

/// Look up the lease for `(agent_path, session_key)`.
pub fn get(home_dir: &Path, agent_path: &str, session_key: &str) -> CoreResult<Option<Lease>> {
    crate::file_mutex::with_file_lock(&leases_file(home_dir), || {
        let entries = read(home_dir)?;
        Ok(entries
            .into_iter()
            .find(|e| e.agent_path == agent_path && e.session_key == session_key)
            .map(|e| e.lease))
    })
}

/// Snapshot of all current entries. Used by the reaper to walk every
/// in-flight lease once per sweep without re-reading per agent.
pub fn list(home_dir: &Path) -> CoreResult<Vec<LeaseEntry>> {
    crate::file_mutex::with_file_lock(&leases_file(home_dir), || read(home_dir))
}

/// Test-only: write a lease entry directly, bypassing the `Lease::fresh()`
/// path. Used by reaper / lifecycle integration tests to seed stale
/// leases (expired `expires_at`, non-self `owner_pid`) so the reaper's
/// Interrupt branch fires deterministically without spawning real
/// subprocesses.
#[cfg(test)]
pub fn write_for_test(
    home_dir: &Path,
    agent_path: &str,
    session_key: &str,
    lease: Lease,
) -> CoreResult<()> {
    crate::file_mutex::with_file_lock(&leases_file(home_dir), || {
        let mut entries = read(home_dir)?;
        entries.retain(|e| !(e.agent_path == agent_path && e.session_key == session_key));
        entries.push(LeaseEntry {
            agent_path: agent_path.to_string(),
            session_key: session_key.to_string(),
            lease,
        });
        write(home_dir, &entries)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn attach_extend_clear_round_trip() {
        let d = TempDir::new().unwrap();
        let l = attach(d.path(), "/agent/a", "session-1").unwrap();
        let got = get(d.path(), "/agent/a", "session-1").unwrap().unwrap();
        assert_eq!(got.lease_id, l.lease_id);

        let before = got.expires_at;
        std::thread::sleep(std::time::Duration::from_millis(5));
        assert!(extend(d.path(), "/agent/a", "session-1", &l.lease_id).unwrap());
        let extended = get(d.path(), "/agent/a", "session-1").unwrap().unwrap();
        assert!(extended.expires_at > before);

        clear(d.path(), "/agent/a", "session-1").unwrap();
        assert!(get(d.path(), "/agent/a", "session-1").unwrap().is_none());
    }

    #[test]
    fn extend_returns_false_on_id_mismatch() {
        let d = TempDir::new().unwrap();
        attach(d.path(), "/agent/a", "session-1").unwrap();
        assert!(!extend(d.path(), "/agent/a", "session-1", "wrong-id").unwrap());
    }

    #[test]
    fn attach_replaces_prior_lease_for_same_key() {
        let d = TempDir::new().unwrap();
        let l1 = attach(d.path(), "/agent/a", "session-1").unwrap();
        let l2 = attach(d.path(), "/agent/a", "session-1").unwrap();
        assert_ne!(l1.lease_id, l2.lease_id, "fresh attach must mint new id");
        let entries = list(d.path()).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].lease.lease_id, l2.lease_id);
    }

    #[test]
    fn separate_agents_have_separate_entries() {
        let d = TempDir::new().unwrap();
        attach(d.path(), "/agent/a", "session-1").unwrap();
        attach(d.path(), "/agent/b", "session-1").unwrap();
        let entries = list(d.path()).unwrap();
        assert_eq!(entries.len(), 2);
        assert!(
            entries.iter().any(|e| e.agent_path == "/agent/a"),
            "agent A entry missing"
        );
        assert!(
            entries.iter().any(|e| e.agent_path == "/agent/b"),
            "agent B entry missing"
        );
    }

    #[test]
    fn concurrent_attach_across_agents_does_not_lose_entries() {
        // 50 parallel attaches on 50 distinct (agent_path, session_key)
        // pairs. Per-file lock guarantees all 50 land.
        let d = TempDir::new().unwrap();
        let path = d.path().to_path_buf();
        let mut handles = Vec::new();
        for i in 0..50 {
            let path = path.clone();
            handles.push(std::thread::spawn(move || {
                attach(&path, &format!("/agent/{i}"), "session-1").unwrap();
            }));
        }
        for h in handles {
            h.join().unwrap();
        }
        let entries = list(&path).unwrap();
        assert_eq!(entries.len(), 50);
    }

    #[test]
    fn clear_missing_is_noop() {
        let d = TempDir::new().unwrap();
        clear(d.path(), "/agent/a", "session-1").unwrap();
        assert!(!leases_file(d.path()).exists());
    }
}
