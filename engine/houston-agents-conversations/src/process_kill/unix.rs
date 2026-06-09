//! Unix termination: SIGTERM the process group + a descendant snapshot,
//! poll for death, escalate to SIGKILL, poll again.
//!
//! Provider CLIs are spawned with `setpgid(0, 0)` (see
//! `houston-terminal-manager::cli_process`), so group id == root pid and
//! one group signal reaches every in-group child. The `pgrep -P` BFS
//! additionally catches processes that left the group (setsid daemons,
//! double-forked MCP servers).

use super::{Duration, POLL_INTERVAL};

const SIGTERM: i32 = 15;
const SIGKILL: i32 = 9;

extern "C" {
    fn kill(pid: i32, sig: i32) -> i32;
}

fn send_signal(pid: i32, sig: i32) -> bool {
    unsafe { kill(pid, sig) == 0 }
}

fn alive(pid: u32) -> bool {
    // Signal 0 = liveness probe. Provider processes run as the same
    // user, so EPERM (alive but not ours) does not apply here.
    unsafe { kill(pid as i32, 0) == 0 }
}

/// BFS over `pgrep -P` to find every descendant of `root`. Best effort:
/// a missing `pgrep` just yields fewer pids (the group signal still
/// covers in-group children). Bounded to keep a pathological tree from
/// looping forever.
async fn collect_descendants(root: u32) -> Vec<u32> {
    const MAX_PIDS: usize = 256;
    let mut all: Vec<u32> = Vec::new();
    let mut frontier = vec![root];
    while let Some(parent) = frontier.pop() {
        let output = tokio::process::Command::new("pgrep")
            .arg("-P")
            .arg(parent.to_string())
            .output()
            .await;
        let output = match output {
            Ok(o) => o,
            Err(e) => {
                tracing::warn!(
                    "[process_kill] pgrep unavailable, descendant sweep limited to the process group: {e}"
                );
                return all;
            }
        };
        for line in String::from_utf8_lossy(&output.stdout).lines() {
            if let Ok(child) = line.trim().parse::<u32>() {
                if child != root && !all.contains(&child) {
                    all.push(child);
                    frontier.push(child);
                }
            }
        }
        if all.len() >= MAX_PIDS {
            tracing::warn!(
                "[process_kill] descendant sweep hit the {MAX_PIDS}-pid bound for root {root}"
            );
            break;
        }
    }
    all
}

async fn wait_dead(root: u32, descendants: &[u32], grace: Duration) -> bool {
    let deadline = tokio::time::Instant::now() + grace;
    loop {
        let any_alive = alive(root) || descendants.iter().any(|&d| alive(d));
        if !any_alive {
            return true;
        }
        if tokio::time::Instant::now() >= deadline {
            return false;
        }
        tokio::time::sleep(POLL_INTERVAL).await;
    }
}

pub(super) async fn terminate(root: u32, term_grace: Duration, kill_grace: Duration) -> bool {
    let descendants = collect_descendants(root).await;
    let group = -(root as i32);

    // Phase 1: graceful TERM — group first, root as fallback, snapshot
    // pids for anything that escaped the group.
    if !send_signal(group, SIGTERM) {
        send_signal(root as i32, SIGTERM);
    }
    for &d in &descendants {
        send_signal(d as i32, SIGTERM);
    }
    if wait_dead(root, &descendants, term_grace).await {
        return true;
    }

    // Phase 2: forced KILL. Re-snapshot to catch children spawned
    // between the first sweep and now.
    tracing::warn!(
        "[process_kill] SIGTERM did not stop pid {root} (or a descendant) — escalating to SIGKILL"
    );
    send_signal(group, SIGKILL);
    send_signal(root as i32, SIGKILL);
    for &d in &descendants {
        if alive(d) {
            send_signal(d as i32, SIGKILL);
        }
    }
    let late = collect_descendants(root).await;
    for &d in &late {
        send_signal(d as i32, SIGKILL);
    }
    if wait_dead(root, &descendants, kill_grace).await {
        return true;
    }
    tracing::error!(
        "[process_kill] process tree for pid {root} survived SIGKILL — manual cleanup may be required"
    );
    false
}
