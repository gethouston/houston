//! Shared map of session keys to running provider process PIDs.
//!
//! Beyond plain pid lookup, this map closes the cancel-before-spawn race
//! (issue #469): pressing Stop while a turn is still in prep (compaction,
//! resume-recovery, provider retry respawn) used to leave nothing to
//! kill — the CLI spawned moments later and ran to completion behind a
//! "Stopped by user" message. Cancelling now leaves a `Cancelled`
//! tombstone; a PID that arrives afterwards is reported back to the
//! caller (`PidInsert::AlreadyCancelled`) so it can be killed on the
//! spot. The tombstone is cleared when the turn finishes (`remove`).

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Outcome of registering a freshly spawned PID.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PidInsert {
    /// PID recorded; the session runs normally.
    Tracked,
    /// The session was cancelled before this PID arrived — the caller
    /// must terminate the process tree immediately.
    AlreadyCancelled,
}

#[derive(Debug, Clone, Copy)]
enum Slot {
    Running(u32),
    /// Stop was pressed while a turn was active but no PID existed yet
    /// (or a retry respawn is possible). Late PIDs must not survive.
    Cancelled,
}

/// Thread-safe map of session_key → process state for running sessions.
#[derive(Default, Clone)]
pub struct SessionPidMap(Arc<Mutex<HashMap<String, Slot>>>);

impl SessionPidMap {
    /// Register the PID of a freshly spawned provider process. Returns
    /// [`PidInsert::AlreadyCancelled`] when the session was cancelled
    /// first — the caller must kill `pid`'s tree right away.
    #[must_use]
    pub async fn insert(&self, session_key: String, pid: u32) -> PidInsert {
        let mut map = self.0.lock().await;
        match map.get(&session_key) {
            Some(Slot::Cancelled) => PidInsert::AlreadyCancelled,
            _ => {
                map.insert(session_key, Slot::Running(pid));
                PidInsert::Tracked
            }
        }
    }

    /// Drop tracking for a finished turn. Clears a cancel tombstone too,
    /// so the next turn for this key starts clean.
    pub async fn remove(&self, session_key: &str) -> Option<u32> {
        match self.0.lock().await.remove(session_key) {
            Some(Slot::Running(pid)) => Some(pid),
            _ => None,
        }
    }

    /// Begin cancelling a session: takes the running PID (if any) for
    /// the caller to kill. With `tombstone` set (a turn is still active
    /// or queued), leaves a `Cancelled` marker so late-arriving PIDs get
    /// flagged by [`Self::insert`]; without it, the entry is simply
    /// cleared.
    pub async fn begin_cancel(&self, session_key: &str, tombstone: bool) -> Option<u32> {
        let mut map = self.0.lock().await;
        let pid = match map.get(session_key) {
            Some(Slot::Running(pid)) => Some(*pid),
            _ => None,
        };
        if tombstone {
            map.insert(session_key.to_string(), Slot::Cancelled);
        } else {
            map.remove(session_key);
        }
        pid
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn insert_then_begin_cancel_returns_pid() {
        let map = SessionPidMap::default();
        assert_eq!(map.insert("k".into(), 42).await, PidInsert::Tracked);
        assert_eq!(map.begin_cancel("k", true).await, Some(42));
    }

    #[tokio::test]
    async fn pid_arriving_after_cancel_is_flagged() {
        let map = SessionPidMap::default();
        assert_eq!(map.begin_cancel("k", true).await, None);
        assert_eq!(map.insert("k".into(), 42).await, PidInsert::AlreadyCancelled);
        // Tombstone persists across retry respawns within the turn.
        assert_eq!(map.insert("k".into(), 43).await, PidInsert::AlreadyCancelled);
    }

    #[tokio::test]
    async fn remove_clears_tombstone_for_next_turn() {
        let map = SessionPidMap::default();
        assert_eq!(map.begin_cancel("k", true).await, None);
        assert_eq!(map.remove("k").await, None);
        assert_eq!(map.insert("k".into(), 7).await, PidInsert::Tracked);
    }

    #[tokio::test]
    async fn cancel_without_active_turn_leaves_no_tombstone() {
        let map = SessionPidMap::default();
        assert_eq!(map.begin_cancel("k", false).await, None);
        assert_eq!(map.insert("k".into(), 7).await, PidInsert::Tracked);
    }

    #[tokio::test]
    async fn cancel_without_tombstone_still_takes_pid() {
        let map = SessionPidMap::default();
        assert_eq!(map.insert("k".into(), 42).await, PidInsert::Tracked);
        assert_eq!(map.begin_cancel("k", false).await, Some(42));
        assert_eq!(map.insert("k".into(), 7).await, PidInsert::Tracked);
    }
}
