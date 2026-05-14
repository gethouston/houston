//! Lease-aware activity lifecycle transitions.
//!
//! Pulled out of `activity.rs` so that file stays a CRUD-only surface
//! and so the lease invariants live next to each other.
//!
//! ## Lease storage
//!
//! Lease state lives in [`crate::runtime_leases`] (engine-owned
//! `~/.houston/runtime/leases.json`), NOT in `activity.json`. Earlier
//! drafts of this code carried `Activity.lease` directly on the board
//! row, but `activity.json` is inside `<agent_dir>/.houston/` which is
//! *agent-writable* — a malicious or buggy CLI subprocess could rewrite
//! `expires_at: 9999-12-31` and become un-reapable. Engine-owned
//! durability metadata must live outside agent-writable space.
//!
//! Activity rows still carry status. Lease ↔ activity pairing is by
//! `(agent_path, session_key)`.
//!
//! ## Callers
//! - [`attach_lease`] — `sessions::start`, on CLI spawn. Writes the
//!   lease to the runtime store AND flips status → Running.
//! - [`extend_lease`] — the heartbeat task. Touches the runtime store
//!   only. Returns `false` if the stored lease_id no longer matches.
//! - [`clear_lease_and_set_status`] — end-of-session or cancel. Removes
//!   the runtime-store lease AND flips status to the terminal value.
//! - [`sweep_stale`] — the engine's reaper task. Consults the runtime
//!   store for the agent and transitions stale activities.

use super::status::ActivityStatus;
use super::store::{file_path, read_json, write_json};
use super::types::Activity;
use crate::agents::lease::Lease;
use crate::error::CoreResult;
use crate::file_mutex::with_file_lock;
use crate::runtime_leases;
use chrono::Utc;
use std::path::Path;

const FILE: &str = "activity";

/// Find the activity matching `session_key`, then run `mutate` on it
/// and persist iff `mutate` returns `true`. Returns the post-mutation
/// row (regardless of whether we wrote), or `None` if no activity
/// matches (legitimate for ad-hoc sessions that have no board row).
///
/// The bool return from `mutate` lets callers avoid spurious file
/// writes — e.g. `clear_lease_and_set_status` setting status to the
/// value it already holds, or a heartbeat-style no-op. Each avoided
/// write spares one ActivityChanged event from fanning out to every
/// WS subscriber and one `updated_at` bump from the file watcher.
///
/// Matching: exact `session_key` field, or the `activity-{id}` legacy
/// convention. Backfills the `session_key` field on the row when matched
/// via the legacy path so future lookups hit the fast path (this
/// backfill counts as a mutation and forces the write).
fn mutate_by_session_key<F: FnOnce(&mut Activity) -> bool>(
    root: &Path,
    session_key: &str,
    mutate: F,
) -> CoreResult<Option<Activity>> {
    // Hold the per-file lock for the whole read-modify-write so the
    // heartbeat / reaper / HTTP update handler / cancel path can't
    // interleave. Without this, two callers reading the same prior
    // state and writing back different mutations produce a lost-update:
    // the later writer's full list overwrites the earlier writer's row
    // mutation. Concrete bug it fixes: heartbeat extends a lease while
    // the user clicks Delete on the same card; heartbeat's stale
    // in-memory list resurrects the deleted row.
    with_file_lock(&file_path(root, FILE), || {
        let mut items: Vec<Activity> = read_json(root, FILE)?;
        let implied_id = session_key.strip_prefix("activity-");
        let Some(item) = items.iter_mut().find(|t| {
            t.session_key.as_deref() == Some(session_key)
                || implied_id.is_some_and(|id| t.id == id)
        }) else {
            return Ok(None);
        };
        let backfilled = if item.session_key.as_deref() != Some(session_key) {
            item.session_key = Some(session_key.to_string());
            true
        } else {
            false
        };
        let mutated = mutate(item);
        if backfilled || mutated {
            item.updated_at = Some(Utc::now().to_rfc3339());
            let result = item.clone();
            write_json(root, FILE, &items)?;
            Ok(Some(result))
        } else {
            Ok(Some(item.clone()))
        }
    })
}

/// Promote the activity bound to `session_key` to `Running` and mint a
/// fresh lease in the engine-owned runtime store. Returns the activity
/// row plus the lease so the heartbeat task can claim ownership by id.
///
/// Called by `sessions::start` immediately before the CLI subprocess
/// spawns. Any prior lease for the same `(agent_path, session_key)` is
/// replaced — the new session owns this activity now.
pub fn attach_lease(
    home_dir: &Path,
    agent_dir: &Path,
    session_key: &str,
) -> CoreResult<Option<(Activity, Lease)>> {
    let agent_path = agent_dir.to_string_lossy().to_string();
    let lease = runtime_leases::attach(home_dir, &agent_path, session_key)?;
    let updated = mutate_by_session_key(agent_dir, session_key, |item| {
        let changed = item.status != ActivityStatus::Running;
        item.status = ActivityStatus::Running;
        changed
    })?;
    Ok(updated.map(|a| (a, lease)))
}

/// Push the lease's `expires_at` forward by another TTL. The caller
/// supplies the `lease_id` it expects to own; if the stored lease no
/// longer matches (e.g. the reaper transitioned the row, or another
/// process took over) this returns `Ok(false)` and the caller should
/// stop pumping. `Ok(true)` means heartbeat applied.
pub fn extend_lease(
    home_dir: &Path,
    agent_dir: &Path,
    session_key: &str,
    lease_id: &str,
) -> CoreResult<bool> {
    let agent_path = agent_dir.to_string_lossy().to_string();
    runtime_leases::extend(home_dir, &agent_path, session_key, lease_id)
}

/// Clear the lease and set the activity to a (typically terminal)
/// status. Used at end-of-session: status flips to `NeedsYou` /
/// `Error` / `Done` / `Cancelled` and the lease is released from the
/// engine-owned runtime store.
pub fn clear_lease_and_set_status(
    home_dir: &Path,
    agent_dir: &Path,
    session_key: &str,
    status: ActivityStatus,
) -> CoreResult<Option<Activity>> {
    let agent_path = agent_dir.to_string_lossy().to_string();
    runtime_leases::clear(home_dir, &agent_path, session_key)?;
    mutate_by_session_key(agent_dir, session_key, |item| {
        let changed = item.status != status;
        item.status = status;
        changed
    })
}

/// Decide what to do with a single in-flight activity row at sweep time.
///
/// Split out from [`sweep_stale`] so the rule can be unit-tested in
/// isolation without touching the filesystem.
///
/// The rule has three branches:
/// - No lease at all → interrupt. This is the legacy-data path: a row
///   that was already `Running` when the engine started before leases
///   existed. Heals on first sweep after upgrade.
/// - Lease present and not yet expired → leave alone.
/// - Lease expired:
///   - Owned by **us** (`owner_pid == self_pid`) → leave alone. The
///     heartbeat task that owns this lease is just delayed. Concrete
///     cause: laptop sleep/wake — tokio's `interval` ticker was paused
///     while the wall clock advanced past `expires_at`, so we observe
///     "expired" at the reaper's first wake-up tick microseconds before
///     the heartbeat's first wake-up tick. False-positive interrupting
///     here makes every sleep/wake a mission loss, which is the bug
///     this branch fixes.
///   - Owned by another process that is **alive** (`is_alive(pid)
///     == true`) → leave alone. Some other engine instance owns it
///     (multi-engine handoff, e.g. during update). Two engines stealing
///     leases from each other is worse than letting a stranger's
///     mission run.
///   - Owned by another process that is **dead** → interrupt. The
///     classic orphan case: prior engine died, its mission can't
///     progress, user needs the Resume affordance.
///
/// `is_alive` is plumbed via a fn pointer so tests can inject a stub —
/// otherwise we'd have to spawn real processes to exercise the
/// "lease owned by an alive non-us process" branch.
fn decide_sweep(
    lease: Option<&Lease>,
    self_pid: u32,
    is_alive: fn(u32) -> bool,
) -> SweepAction {
    let Some(lease) = lease else {
        return SweepAction::Interrupt;
    };
    if !lease.is_expired() {
        return SweepAction::Skip;
    }
    if lease.owner_pid == self_pid {
        return SweepAction::Skip;
    }
    if is_alive(lease.owner_pid) {
        return SweepAction::Skip;
    }
    SweepAction::Interrupt
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SweepAction {
    Skip,
    Interrupt,
}

/// Sweep the agent's activity file for in-flight rows whose lease is
/// stale per [`decide_sweep`]. Each transitioned row gets `status =
/// Interrupted` and `lease = None`, the row's `updated_at` bumped, and
/// is returned so the caller can emit `ActivityChanged` for the agent.
pub fn sweep_stale(home_dir: &Path, agent_dir: &Path) -> CoreResult<Vec<Activity>> {
    let self_pid = std::process::id();
    let agent_path = agent_dir.to_string_lossy().to_string();
    // We hold the activity-file lock for the whole sweep AND consult
    // the runtime lease store inside. The runtime store has its own
    // lock so the nested acquisition order is: activity.json then
    // leases.json. Every other writer that touches both files acquires
    // them in the same order (`attach_lease` does runtime first then
    // activity — opposite order — but it's a fresh attach with no risk
    // of contention against the sweep). If we ever introduce a third
    // writer touching both, follow the activity→leases order here.
    with_file_lock(&file_path(agent_dir, FILE), || {
        let mut items: Vec<Activity> = read_json(agent_dir, FILE)?;
        let mut transitioned = Vec::new();
        let mut leases_to_clear: Vec<String> = Vec::new();
        for item in items.iter_mut() {
            if !item.status.is_in_flight() {
                continue;
            }
            // Pair the activity to its runtime lease by session_key.
            // Activities created before the session_key field shipped
            // still use the `activity-{id}` convention.
            let key = item
                .session_key
                .clone()
                .unwrap_or_else(|| format!("activity-{}", item.id));
            let lease = runtime_leases::get(home_dir, &agent_path, &key)?;
            if decide_sweep(lease.as_ref(), self_pid, crate::process_probe::is_alive)
                != SweepAction::Interrupt
            {
                continue;
            }
            item.status = ActivityStatus::Interrupted;
            item.updated_at = Some(Utc::now().to_rfc3339());
            transitioned.push(item.clone());
            leases_to_clear.push(key);
        }
        if !transitioned.is_empty() {
            write_json(agent_dir, FILE, &items)?;
        }
        // Clear the now-stale leases. Done after the activity write so
        // a crash in between leaves the activity Interrupted with a
        // stale lease that the next sweep will just re-clear (idempotent).
        for key in leases_to_clear {
            runtime_leases::clear(home_dir, &agent_path, &key)?;
        }
        Ok(transitioned)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agents::activity;
    use crate::agents::types::NewActivity;
    use crate::runtime_leases;
    use tempfile::TempDir;

    /// Returns (TempDir, home_dir, agent_dir). home_dir and agent_dir
    /// share the tempdir for simplicity — the engine doesn't require
    /// them to be the same in production, but the test only cares
    /// about co-located file isolation.
    fn make_env() -> (TempDir, std::path::PathBuf, std::path::PathBuf) {
        let dir = TempDir::new().unwrap();
        let agent_dir = dir.path().join("agent");
        std::fs::create_dir_all(&agent_dir).unwrap();
        crate::agents::store::ensure_houston_dir(&agent_dir).unwrap();
        let home_dir = dir.path().join("home");
        std::fs::create_dir_all(&home_dir).unwrap();
        (dir, home_dir, agent_dir)
    }

    fn make_activity(root: &Path, title: &str) -> Activity {
        activity::create(
            root,
            NewActivity {
                title: title.into(),
                description: String::new(),
                agent: None,
                worktree_path: None,
                provider: None,
                model: None,
            },
        )
        .unwrap()
    }

    #[test]
    fn attach_lease_flips_to_running_and_writes_lease() {
        let (_d, home, agent) = make_env();
        let a = make_activity(&agent, "x");
        let sk = a.session_key.clone().unwrap();
        let (after, lease) = attach_lease(&home, &agent, &sk).unwrap().unwrap();
        assert_eq!(after.status, ActivityStatus::Running);
        // Lease lives in the engine-owned runtime store, not on the activity.
        let stored = runtime_leases::get(&home, &agent.to_string_lossy(), &sk)
            .unwrap()
            .unwrap();
        assert_eq!(stored.lease_id, lease.lease_id);
        assert_eq!(lease.owner_pid, std::process::id());
    }

    #[test]
    fn attach_lease_no_match_returns_none() {
        let (_d, home, agent) = make_env();
        make_activity(&agent, "x");
        assert!(attach_lease(&home, &agent, "activity-not-real")
            .unwrap()
            .is_none());
    }

    #[test]
    fn extend_lease_pushes_expiry_when_id_matches() {
        let (_d, home, agent) = make_env();
        let a = make_activity(&agent, "x");
        let sk = a.session_key.clone().unwrap();
        let (_a2, l) = attach_lease(&home, &agent, &sk).unwrap().unwrap();
        let before = l.expires_at;
        std::thread::sleep(std::time::Duration::from_millis(5));
        assert!(extend_lease(&home, &agent, &sk, &l.lease_id).unwrap());
        let stored = runtime_leases::get(&home, &agent.to_string_lossy(), &sk)
            .unwrap()
            .unwrap();
        assert!(stored.expires_at > before);
    }

    #[test]
    fn extend_lease_returns_false_on_id_mismatch() {
        let (_d, home, agent) = make_env();
        let a = make_activity(&agent, "x");
        let sk = a.session_key.clone().unwrap();
        attach_lease(&home, &agent, &sk).unwrap().unwrap();
        assert!(!extend_lease(&home, &agent, &sk, "not-the-real-id").unwrap());
    }

    #[test]
    fn clear_lease_and_set_status_releases_ownership() {
        let (_d, home, agent) = make_env();
        let a = make_activity(&agent, "x");
        let sk = a.session_key.clone().unwrap();
        attach_lease(&home, &agent, &sk).unwrap();
        let after = clear_lease_and_set_status(&home, &agent, &sk, ActivityStatus::NeedsYou)
            .unwrap()
            .unwrap();
        assert_eq!(after.status, ActivityStatus::NeedsYou);
        assert!(runtime_leases::get(&home, &agent.to_string_lossy(), &sk)
            .unwrap()
            .is_none());
    }

    #[test]
    fn sweep_stale_transitions_expired_running_to_interrupted() {
        let (_d, home, agent) = make_env();
        let a = make_activity(&agent, "x");
        let sk = a.session_key.clone().unwrap();
        // Flip status to Running and plant a stale lease (out-of-range
        // owner_pid so it reaches the Interrupt branch — self-owned
        // and live-other-owned leases are intentionally skipped now).
        use crate::agents::types::ActivityUpdate;
        activity::update(
            &agent,
            &a.id,
            ActivityUpdate {
                status: Some(ActivityStatus::Running),
                ..Default::default()
            },
        )
        .unwrap();
        let stale = Lease {
            lease_id: "stale".into(),
            owner_pid: u32::MAX - 1,
            expires_at: Utc::now() - chrono::Duration::seconds(1),
        };
        runtime_leases::write_for_test(&home, &agent.to_string_lossy(), &sk, stale).unwrap();

        let transitioned = sweep_stale(&home, &agent).unwrap();
        assert_eq!(transitioned.len(), 1);
        assert_eq!(transitioned[0].status, ActivityStatus::Interrupted);
        // Lease cleared from the runtime store after the transition.
        assert!(runtime_leases::get(&home, &agent.to_string_lossy(), &sk)
            .unwrap()
            .is_none());
    }

    #[test]
    fn sweep_stale_transitions_running_row_with_no_lease() {
        // Legacy data path: a Running row in activity.json with no
        // corresponding entry in the runtime lease store.
        let (_d, home, agent) = make_env();
        let a = make_activity(&agent, "x");
        use crate::agents::types::ActivityUpdate;
        activity::update(
            &agent,
            &a.id,
            ActivityUpdate {
                status: Some(ActivityStatus::Running),
                ..Default::default()
            },
        )
        .unwrap();
        let transitioned = sweep_stale(&home, &agent).unwrap();
        assert_eq!(transitioned.len(), 1);
        assert_eq!(transitioned[0].status, ActivityStatus::Interrupted);
    }

    #[test]
    fn sweep_stale_ignores_terminal_and_queued_rows() {
        let (_d, home, agent) = make_env();
        let a = make_activity(&agent, "x");
        // Activity defaults to Queued — sweep must not touch it.
        let _ = a;
        let transitioned = sweep_stale(&home, &agent).unwrap();
        assert!(transitioned.is_empty(), "Queued is not in-flight");
    }

    fn make_expired_lease(owner_pid: u32) -> Lease {
        Lease {
            lease_id: "test".into(),
            owner_pid,
            expires_at: Utc::now() - chrono::Duration::seconds(1),
        }
    }

    fn make_fresh_lease(owner_pid: u32) -> Lease {
        Lease {
            lease_id: "test".into(),
            owner_pid,
            expires_at: Utc::now() + chrono::Duration::seconds(30),
        }
    }

    fn never_alive(_: u32) -> bool {
        false
    }
    fn always_alive(_: u32) -> bool {
        true
    }

    #[test]
    fn decide_sweep_no_lease_interrupts() {
        assert_eq!(
            decide_sweep(None, 100, never_alive),
            SweepAction::Interrupt
        );
    }

    #[test]
    fn decide_sweep_fresh_lease_skips_regardless_of_owner() {
        let l = make_fresh_lease(999);
        assert_eq!(decide_sweep(Some(&l), 100, never_alive), SweepAction::Skip);
    }

    #[test]
    fn decide_sweep_expired_lease_owned_by_self_skips() {
        // The sleep/wake fix: when our own heartbeat task is delayed and
        // the lease ticked past expires_at, we must NOT interrupt — the
        // heartbeat is microseconds from catching up.
        let l = make_expired_lease(100);
        assert_eq!(
            decide_sweep(Some(&l), 100, never_alive),
            SweepAction::Skip,
            "expired lease owned by self must not interrupt the live mission"
        );
    }

    #[test]
    fn decide_sweep_expired_lease_owned_by_alive_other_skips() {
        // Multi-engine handoff: some other live engine owns this lease.
        // Don't steal its mission.
        let l = make_expired_lease(999);
        assert_eq!(
            decide_sweep(Some(&l), 100, always_alive),
            SweepAction::Skip
        );
    }

    #[test]
    fn decide_sweep_expired_lease_owned_by_dead_other_interrupts() {
        // The classic orphan: prior engine crashed, mission stuck.
        // Surface Resume to the user.
        let l = make_expired_lease(999);
        assert_eq!(
            decide_sweep(Some(&l), 100, never_alive),
            SweepAction::Interrupt
        );
    }

    #[test]
    fn sweep_stale_skips_when_lease_owned_by_self() {
        // End-to-end version: build a real activity with a self-owned
        // expired lease and assert sweep_stale leaves it untouched.
        // This is the laptop-sleep-wake scenario in integration form.
        let (_d, home, agent) = make_env();
        let a = make_activity(&agent, "x");
        let sk = a.session_key.clone().unwrap();
        attach_lease(&home, &agent, &sk).unwrap().unwrap();
        // Force expiry while keeping owner_pid = ours.
        let stale = Lease {
            lease_id: "self-stale".into(),
            owner_pid: std::process::id(),
            expires_at: Utc::now() - chrono::Duration::seconds(60),
        };
        runtime_leases::write_for_test(&home, &agent.to_string_lossy(), &sk, stale).unwrap();

        let transitioned = sweep_stale(&home, &agent).unwrap();
        assert!(
            transitioned.is_empty(),
            "self-owned expired lease must not be interrupted (sleep/wake)"
        );
        // Row still Running, lease still in runtime store (heartbeat will refresh).
        let after: Vec<Activity> = read_json(&agent, FILE).unwrap();
        assert_eq!(after[0].status, ActivityStatus::Running);
        assert!(runtime_leases::get(&home, &agent.to_string_lossy(), &sk)
            .unwrap()
            .is_some());
    }
}
