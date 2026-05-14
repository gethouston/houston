//! Periodic + boot-time sweep that ends the "stuck running forever"
//! bug class.
//!
//! The reaper walks every agent under `<docs_dir>/<workspace>/<agent>/`,
//! looks at each `activity.json`, and transitions any in-flight row
//! whose lease has expired (or never existed — legacy data) to
//! `Interrupted`. Two entry points share the same scan:
//!
//! - [`sweep_once`] — one full pass. Called by `houston-engine-server`
//!   at boot for fast reconciliation, and by [`run_reaper_loop`] on a
//!   timer so any death mid-mission heals within ~10s without a
//!   restart.
//! - [`run_reaper_loop`] — `tokio::spawn`-able forever-loop the engine
//!   `main()` keeps alive.
//!
use crate::agents::lease::REAPER_INTERVAL;
use crate::agents::lifecycle;
use crate::error::CoreResult;
use houston_ui_events::{DynEventSink, HoustonEvent};
use std::path::{Path, PathBuf};

/// One full sweep across every agent under `docs_dir`. Returns the
/// total number of activities transitioned to `Interrupted`. Per
/// transition, emits `ActivityChanged` so live UI subscribers
/// invalidate their caches without waiting for the file watcher.
///
/// Errors from individual agents are logged at `warn` and the sweep
/// continues — a poisoned activity.json on one agent must not block
/// recovery of every other agent's missions.
pub fn sweep_once(docs_dir: &Path, events: &DynEventSink) -> usize {
    let mut transitioned = 0usize;
    for agent_dir in walk_agent_dirs(docs_dir) {
        // Only walk agents that have actually been initialized.
        if !agent_dir.join(".houston").join("activity").is_dir() {
            continue;
        }
        match lifecycle::sweep_stale(&agent_dir) {
            Ok(transitions) if transitions.is_empty() => {}
            Ok(transitions) => {
                transitioned += transitions.len();
                let agent_path = agent_dir.to_string_lossy().to_string();
                for row in transitions {
                    tracing::info!(
                        target: "reaper",
                        agent_path = %agent_path,
                        activity_id = %row.id,
                        session_key = ?row.session_key,
                        "transitioned in-flight activity to interrupted"
                    );
                }
                events.emit(HoustonEvent::ActivityChanged { agent_path });
            }
            Err(e) => {
                tracing::warn!(
                    target: "reaper",
                    agent_dir = %agent_dir.display(),
                    error = %e,
                    "sweep_stale failed for agent — continuing"
                );
            }
        }
    }
    transitioned
}

/// Run [`sweep_once`] forever on `REAPER_INTERVAL`. Cancel by dropping
/// the join handle. Spawn from engine `main()` AFTER the boot
/// reconciliation sweep so the first iteration here is just
/// steady-state.
pub async fn run_reaper_loop(docs_dir: PathBuf, events: DynEventSink) {
    let interval_std = REAPER_INTERVAL
        .to_std()
        .unwrap_or(std::time::Duration::from_secs(10));
    let mut ticker = tokio::time::interval(interval_std);
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    // First tick fires immediately; let it run — costs ~one stat per
    // agent if there's nothing to clean up.
    loop {
        ticker.tick().await;
        let n = sweep_once(&docs_dir, &events);
        if n > 0 {
            tracing::info!(
                target: "reaper",
                count = n,
                "swept and transitioned interrupted activities"
            );
        }
    }
}

/// Yield every `<docs_dir>/<workspace>/<agent>/` path. Quietly skips
/// non-directories, hidden entries (`.foo`), and unreadable workspaces.
fn walk_agent_dirs(docs_dir: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let Ok(workspaces) = std::fs::read_dir(docs_dir) else {
        return out;
    };
    for ws in workspaces.flatten() {
        let ws_path = ws.path();
        if !ws_path.is_dir() {
            continue;
        }
        let ws_name = ws_path.file_name().and_then(|s| s.to_str()).unwrap_or("");
        if ws_name.starts_with('.') {
            continue;
        }
        let Ok(agents) = std::fs::read_dir(&ws_path) else {
            continue;
        };
        for agent in agents.flatten() {
            let p = agent.path();
            if !p.is_dir() {
                continue;
            }
            let n = p.file_name().and_then(|s| s.to_str()).unwrap_or("");
            if n.starts_with('.') {
                continue;
            }
            out.push(p);
        }
    }
    out
}

/// Run the reconciliation sweep that engine boot calls before serving
/// HTTP. Distinct entry point so callers see intent at the call site
/// and so we can add boot-only behavior (e.g. stale-Queued reaping) in
/// future without touching the periodic path.
pub fn reconcile_on_boot(docs_dir: &Path, events: &DynEventSink) -> CoreResult<usize> {
    let n = sweep_once(docs_dir, events);
    if n > 0 {
        tracing::info!(
            target: "reaper",
            count = n,
            "boot reconciliation transitioned stale activities"
        );
    }
    Ok(n)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agents::activity;
    use crate::agents::lifecycle::attach_lease;
    use crate::agents::status::ActivityStatus;
    use crate::agents::store::{ensure_houston_dir, read_json, write_json};
    use crate::agents::types::{Activity, NewActivity};
    use houston_ui_events::BroadcastEventSink;
    use std::sync::Arc;
    use tempfile::TempDir;

    fn make_agent(docs: &Path, workspace: &str, agent: &str) -> PathBuf {
        let p = docs.join(workspace).join(agent);
        std::fs::create_dir_all(&p).unwrap();
        ensure_houston_dir(&p).unwrap();
        p
    }

    fn make_running_activity_with_expired_lease(agent: &Path, title: &str) {
        let a = activity::create(
            agent,
            NewActivity {
                title: title.into(),
                description: String::new(),
                agent: None,
                worktree_path: None,
                provider: None,
                model: None,
            },
        )
        .unwrap();
        let sk = a.session_key.unwrap();
        attach_lease(agent, &sk).unwrap().unwrap();
        // Expire the lease AND rewrite owner_pid to an out-of-range value
        // so the sweep_stale rule reaches the Interrupt branch. Without
        // the pid rewrite, `decide_sweep` (rightly) skips self-owned
        // expired leases because that's the laptop-sleep/wake case.
        let mut items: Vec<Activity> = read_json(agent, "activity").unwrap();
        let lease = items[0].lease.as_mut().unwrap();
        lease.expires_at = chrono::Utc::now() - chrono::Duration::seconds(1);
        lease.owner_pid = u32::MAX - 1;
        write_json(agent, "activity", &items).unwrap();
    }

    #[test]
    fn sweep_once_transitions_across_workspaces() {
        let d = TempDir::new().unwrap();
        let docs = d.path();
        let a1 = make_agent(docs, "Personal", "alpha");
        let a2 = make_agent(docs, "Work", "beta");
        make_running_activity_with_expired_lease(&a1, "alpha-one");
        make_running_activity_with_expired_lease(&a2, "beta-one");

        let sink: DynEventSink = Arc::new(BroadcastEventSink::new(64));
        let n = sweep_once(docs, &sink);
        assert_eq!(n, 2);

        // Both should now be Interrupted.
        let listed_a1: Vec<Activity> = read_json(&a1, "activity").unwrap();
        let listed_a2: Vec<Activity> = read_json(&a2, "activity").unwrap();
        assert_eq!(listed_a1[0].status, ActivityStatus::Interrupted);
        assert_eq!(listed_a2[0].status, ActivityStatus::Interrupted);
    }

    #[test]
    fn sweep_once_skips_hidden_dirs_and_files() {
        let d = TempDir::new().unwrap();
        let docs = d.path();
        std::fs::create_dir_all(docs.join(".dotworkspace").join("agent")).unwrap();
        std::fs::write(docs.join("file.txt"), "").unwrap();
        let real = make_agent(docs, "Personal", "alpha");
        make_running_activity_with_expired_lease(&real, "x");

        let sink: DynEventSink = Arc::new(BroadcastEventSink::new(64));
        assert_eq!(sweep_once(docs, &sink), 1);
    }

    #[test]
    fn sweep_once_is_a_noop_when_no_stale_rows() {
        let d = TempDir::new().unwrap();
        let docs = d.path();
        make_agent(docs, "Personal", "alpha");
        let sink: DynEventSink = Arc::new(BroadcastEventSink::new(64));
        assert_eq!(sweep_once(docs, &sink), 0);
    }

    #[test]
    fn reconcile_on_boot_returns_count() {
        let d = TempDir::new().unwrap();
        let docs = d.path();
        let a = make_agent(docs, "Personal", "alpha");
        make_running_activity_with_expired_lease(&a, "x");
        let sink: DynEventSink = Arc::new(BroadcastEventSink::new(64));
        assert_eq!(reconcile_on_boot(docs, &sink).unwrap(), 1);
    }
}
