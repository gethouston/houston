//! User-initiated session cancellation.
//!
//! Kills the provider CLI process tree (verified, with SIGKILL
//! escalation — see `houston_agents_conversations::process_kill`),
//! dequeues pending turns, and leaves a tombstone in the pid map so a
//! process that spawns AFTER Stop was pressed still gets killed the
//! moment its PID is reported (issue #469).

use super::control::SessionIdentity;
use super::SessionRuntime;
use houston_agents_conversations::process_kill::terminate_process_tree;
use houston_terminal_manager::FeedItem;
use houston_ui_events::{DynEventSink, HoustonEvent};
use std::path::Path;

/// Cancel a running or queued session. Terminates the provider process
/// tree (TERM → KILL on Unix, `taskkill /T /F` on Windows) and verifies
/// it actually died. Emits a `Stopped by user` feed item + `completed`
/// session status so the UI can reconcile.
///
/// Returns `true` if a process or queued turn was found, `false` otherwise.
pub async fn cancel(
    rt: &SessionRuntime,
    events: &DynEventSink,
    agent_path: &str,
    session_key: &str,
) -> bool {
    let identity = SessionIdentity::new(agent_path.to_string(), session_key.to_string());
    // `had_active` also decides whether `begin_cancel` leaves a tombstone:
    // only an active/queued turn can still produce a late PID, and only an
    // active turn's end clears the tombstone again.
    let had_active = rt.control.cancel(&identity).await;
    let pid = rt.pid_map.begin_cancel(session_key, had_active).await;

    if let Some(pid) = pid {
        tracing::info!("[sessions] cancel session_key={session_key} pid={pid}");
        use tokio::time::{timeout, Duration};
        // terminate_process_tree is internally bounded (~2.5s worst case);
        // the outer timeout is a belt-and-braces guard against a wedged
        // pgrep/tasklist subprocess.
        match timeout(Duration::from_secs(5), terminate_process_tree(pid)).await {
            Ok(true) => {}
            Ok(false) => {
                tracing::error!(
                    "[sessions] could not confirm provider process tree exit for session_key={session_key} pid={pid}"
                );
            }
            Err(_) => {
                tracing::error!(
                    "[sessions] terminate timed out for session_key={session_key} pid={pid}"
                );
            }
        }
    } else if !had_active {
        match crate::agents::activity::clear_stale_running_by_session_key(
            Path::new(agent_path),
            session_key,
        ) {
            Ok(Some(_)) => {
                tracing::info!(
                    "[sessions] cleared stale running activity on cancel session_key={session_key}"
                );
                events.emit(HoustonEvent::ActivityChanged {
                    agent_path: agent_path.to_string(),
                });
            }
            Ok(None) => return false,
            Err(e) => {
                tracing::warn!(
                    "[sessions] failed to clear stale running activity on cancel: {e} (session_key={session_key})"
                );
                return false;
            }
        }
    }

    events.emit(HoustonEvent::FeedItem {
        agent_path: agent_path.to_string(),
        session_key: session_key.to_string(),
        item: FeedItem::SystemMessage("Stopped by user".into()),
    });
    events.emit(HoustonEvent::SessionStatus {
        agent_path: agent_path.to_string(),
        session_key: session_key.to_string(),
        status: "completed".into(),
        error: None,
    });
    true
}
