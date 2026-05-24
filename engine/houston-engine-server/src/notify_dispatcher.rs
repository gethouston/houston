//! Notify dispatcher — bridge the in-engine `HoustonEvent` stream to
//! the outbound tunnel frame channel as `TunnelFrame::Notify` payloads.
//!
//! Pipeline (one task, spawned at engine startup):
//!
//! ```text
//!   BroadcastEventSink         NotifyPolicy             TunnelClient
//!   (broadcast::Receiver)  →   (cap + dedup)        →   (mpsc::Sender<TunnelFrame>)
//!         │                       │                            │
//!   SessionStatus{status}    status_to_notify_kind          try_send
//!         │                       │                       (advisory; Full → drop)
//!         └── ignore others ──────┘
//! ```
//!
//! All policy lives in [`houston_tunnel::NotifyPolicy`]; this module is
//! pure glue. Non-`SessionStatus` event variants and statuses that
//! [`houston_tunnel::status_to_notify_kind`] doesn't recognise are
//! silently ignored — the engine fans out many event types and only
//! lifecycle transitions ([`needs_you`, `completed`, `done`, `error`,
//! `failed`]) should ever surface as push.
//!
//! See `docs/specs/2026-05-23-houston-mobile-capacitor.html` §5
//! (the `Notify` frame is the only new wire surface) and `docs/specs/
//! 2026-05-24-houston-mobile-session-handoff.html` (the chunk this
//! dispatcher closes — the engine-side "consumer" that PRs #40 + #42
//! left missing).

use houston_tunnel::{
    status_to_notify_kind, NotifyDecision, NotifyFrame, NotifyPolicy, TunnelFrame,
};
use houston_ui_events::HoustonEvent;
use std::path::Path;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::{broadcast, mpsc, Mutex};
use tokio::task::JoinHandle;

/// Spawn the long-running dispatcher task. The returned handle is owned
/// by the caller; the engine's startup path drops it on the floor (the
/// task runs until the broadcast channel closes, which only happens on
/// process exit). Tests use the handle to `abort()` after assertions.
pub fn spawn_notify_dispatcher(
    mut events: broadcast::Receiver<HoustonEvent>,
    policy: Arc<Mutex<NotifyPolicy>>,
    tunnel_tx: mpsc::Sender<TunnelFrame>,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        loop {
            match events.recv().await {
                Ok(HoustonEvent::SessionStatus {
                    agent_path,
                    session_key,
                    status,
                    ..
                }) => {
                    handle_session_status(&policy, &tunnel_tx, agent_path, session_key, status)
                        .await;
                }
                Ok(_other) => {
                    // Every other variant — FeedItem, Toast, *Changed,
                    // CLI lifecycle, scheduler — is intentionally
                    // ignored. Only lifecycle status transitions
                    // warrant a push.
                }
                Err(broadcast::error::RecvError::Lagged(skipped)) => {
                    // Tokio's broadcast channel drops oldest events on
                    // a slow consumer. `decide()` is in-memory and
                    // microseconds, so this lag should never happen
                    // under load — surface it loudly if it does.
                    tracing::warn!(
                        target: "houston_engine_server::notify_dispatcher",
                        skipped,
                        "broadcast receiver lagged; missed status events will not push"
                    );
                }
                Err(broadcast::error::RecvError::Closed) => {
                    tracing::info!(
                        target: "houston_engine_server::notify_dispatcher",
                        "broadcast channel closed; dispatcher exiting"
                    );
                    return;
                }
            }
        }
    })
}

async fn handle_session_status(
    policy: &Arc<Mutex<NotifyPolicy>>,
    tunnel_tx: &mpsc::Sender<TunnelFrame>,
    agent_path: String,
    session_key: String,
    status: String,
) {
    let Some(kind) = status_to_notify_kind(&status) else {
        return;
    };
    let Some(now_ms) = current_unix_ms() else {
        // System clock is before UNIX_EPOCH; the host is broken.
        // Skip rather than send a frame with a meaningless timestamp.
        return;
    };
    let decision = {
        let mut guard = policy.lock().await;
        guard.decide(kind, &session_key, now_ms)
    };
    match decision {
        NotifyDecision::Emit => {}
        NotifyDecision::Skip(reason) => {
            tracing::debug!(
                target: "houston_engine_server::notify_dispatcher",
                ?reason,
                ?kind,
                %session_key,
                "notify skipped by policy"
            );
            return;
        }
    }
    // Agent-name extraction: the cheaper path is basename(agent_path).
    // The alternative (looking up the activity row) would add a DB hit
    // on every notify-worthy transition; we settled for the path
    // basename. When the bundled `Localizable.strings` lands and we
    // know the user-visible label per agent, swap this for the
    // activity-row lookup or pass `agent_label` directly on the event.
    let agent_name = agent_name_from_path(&agent_path);
    let frame = TunnelFrame::Notify(NotifyFrame {
        notify_kind: kind,
        loc_args: vec![agent_name],
        session_key,
    });
    match tunnel_tx.try_send(frame) {
        Ok(()) => {}
        Err(mpsc::error::TrySendError::Full(_)) => {
            // Buffer saturated — tunnel is wedged or disconnected and
            // the policy-allowed bursts haven't drained. Drop +
            // continue: these are advisory.
            tracing::warn!(
                target: "houston_engine_server::notify_dispatcher",
                ?kind,
                "tunnel outbound channel full; notify dropped"
            );
        }
        Err(mpsc::error::TrySendError::Closed(_)) => {
            // The tunnel's run task has dropped the receiver — the
            // engine is shutting down. The dispatcher task will exit
            // on the next `events.recv()` returning `Closed`; until
            // then, log and continue.
            tracing::warn!(
                target: "houston_engine_server::notify_dispatcher",
                ?kind,
                "tunnel outbound channel closed; notify dropped"
            );
        }
    }
}

fn current_unix_ms() -> Option<i64> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|d| d.as_millis() as i64)
}

/// Literal fallback when [`agent_name_from_path`] cannot extract a
/// non-empty basename. Picked over the full input string because it
/// renders as one localized arg on the device — empty here would
/// produce a stray separator on iOS (e.g. `"Done — "` for a `Finished`
/// title that interpolates `%@`).
const UNKNOWN_AGENT_FALLBACK: &str = "agent";

/// Extract the last path segment from an agent path
/// (`/Users/x/.houston/workspaces/W/docs-agent` → `docs-agent`).
/// Falls back to `"agent"` when the input has no basename (empty
/// string, root-only path) — engines only emit well-formed agent
/// paths today, but a stray empty `loc_args[0]` would surface as a
/// dangling separator in the user-visible push title. The literal
/// fallback keeps the notification rendering legible regardless.
fn agent_name_from_path(agent_path: &str) -> String {
    Path::new(agent_path)
        .file_name()
        .and_then(|os| os.to_str())
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
        .unwrap_or_else(|| UNKNOWN_AGENT_FALLBACK.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use houston_tunnel::NotifyKind;
    // `EventSink` is the trait that provides `.emit(...)` on
    // `BroadcastEventSink`; the test sink calls it directly to inject
    // synthetic events. Production callers go through the trait object
    // (`DynEventSink`) and don't need this import.
    use houston_ui_events::{BroadcastEventSink, EventSink};
    use std::time::Duration;

    fn session_status(status: &str, session_key: &str, agent_path: &str) -> HoustonEvent {
        HoustonEvent::SessionStatus {
            agent_path: agent_path.to_owned(),
            session_key: session_key.to_owned(),
            status: status.to_owned(),
            error: None,
        }
    }

    async fn recv_frame_within(
        rx: &mut mpsc::Receiver<TunnelFrame>,
        timeout: Duration,
    ) -> Option<TunnelFrame> {
        tokio::time::timeout(timeout, rx.recv())
            .await
            .ok()
            .flatten()
    }

    #[tokio::test]
    async fn emits_notify_for_needs_you() {
        let sink = BroadcastEventSink::new(16);
        let events = sink.subscribe();
        let policy = Arc::new(Mutex::new(NotifyPolicy::default()));
        let (tunnel_tx, mut tunnel_rx) = mpsc::channel::<TunnelFrame>(8);
        let handle = spawn_notify_dispatcher(events, policy, tunnel_tx);

        sink.emit(session_status(
            "needs_you",
            "sess-1",
            "/agents/workspaces/W/docs-agent",
        ));

        let frame = recv_frame_within(&mut tunnel_rx, Duration::from_secs(1))
            .await
            .expect("dispatcher should emit Notify within 1s");
        match frame {
            TunnelFrame::Notify(n) => {
                assert_eq!(n.notify_kind, NotifyKind::NeedsYou);
                assert_eq!(n.loc_args, vec!["docs-agent".to_owned()]);
                assert_eq!(n.session_key, "sess-1");
            }
            other => panic!("expected Notify, got {other:?}"),
        }
        handle.abort();
    }

    #[tokio::test]
    async fn maps_terminal_statuses_to_finished_and_failed() {
        let sink = BroadcastEventSink::new(16);
        let events = sink.subscribe();
        let policy = Arc::new(Mutex::new(NotifyPolicy::default()));
        let (tunnel_tx, mut tunnel_rx) = mpsc::channel::<TunnelFrame>(8);
        let handle = spawn_notify_dispatcher(events, policy, tunnel_tx);

        sink.emit(session_status("completed", "s-ok", "/agents/W/finisher"));
        sink.emit(session_status("failed", "s-err", "/agents/W/breaker"));

        let mut kinds = Vec::new();
        for _ in 0..2 {
            let frame = recv_frame_within(&mut tunnel_rx, Duration::from_secs(1))
                .await
                .expect("dispatcher should emit both Notify frames");
            if let TunnelFrame::Notify(n) = frame {
                kinds.push((n.notify_kind, n.session_key));
            }
        }
        kinds.sort_by(|a, b| a.1.cmp(&b.1));
        assert_eq!(
            kinds,
            vec![
                (NotifyKind::Failed, "s-err".to_owned()),
                (NotifyKind::Finished, "s-ok".to_owned()),
            ]
        );
        handle.abort();
    }

    #[tokio::test]
    async fn skips_non_notify_worthy_status() {
        let sink = BroadcastEventSink::new(16);
        let events = sink.subscribe();
        let policy = Arc::new(Mutex::new(NotifyPolicy::default()));
        let (tunnel_tx, mut tunnel_rx) = mpsc::channel::<TunnelFrame>(8);
        let handle = spawn_notify_dispatcher(events, policy, tunnel_tx);

        sink.emit(session_status("running", "sess-1", "/agents/W/a"));
        sink.emit(session_status("starting", "sess-2", "/agents/W/b"));
        sink.emit(session_status("queued", "sess-3", "/agents/W/c"));

        let no_frame = recv_frame_within(&mut tunnel_rx, Duration::from_millis(150)).await;
        assert!(
            no_frame.is_none(),
            "non-notify-worthy statuses must not emit; got {no_frame:?}"
        );
        handle.abort();
    }

    #[tokio::test]
    async fn ignores_non_session_status_variants() {
        let sink = BroadcastEventSink::new(16);
        let events = sink.subscribe();
        let policy = Arc::new(Mutex::new(NotifyPolicy::default()));
        let (tunnel_tx, mut tunnel_rx) = mpsc::channel::<TunnelFrame>(8);
        let handle = spawn_notify_dispatcher(events, policy, tunnel_tx);

        sink.emit(HoustonEvent::Toast {
            message: "ignored".into(),
            variant: "info".into(),
        });
        sink.emit(HoustonEvent::ActivityChanged {
            agent_path: "/agents/W/a".into(),
        });

        let no_frame = recv_frame_within(&mut tunnel_rx, Duration::from_millis(150)).await;
        assert!(no_frame.is_none(), "non-status events must not push");
        handle.abort();
    }

    #[tokio::test]
    async fn dedups_repeated_status_via_policy() {
        let sink = BroadcastEventSink::new(16);
        let events = sink.subscribe();
        // Default policy: 60s dedup window.
        let policy = Arc::new(Mutex::new(NotifyPolicy::default()));
        let (tunnel_tx, mut tunnel_rx) = mpsc::channel::<TunnelFrame>(8);
        let handle = spawn_notify_dispatcher(events, policy, tunnel_tx);

        sink.emit(session_status("needs_you", "sess-1", "/agents/W/dup"));
        sink.emit(session_status("needs_you", "sess-1", "/agents/W/dup"));

        let first = recv_frame_within(&mut tunnel_rx, Duration::from_secs(1)).await;
        assert!(first.is_some(), "first emission must fire");
        let second = recv_frame_within(&mut tunnel_rx, Duration::from_millis(150)).await;
        assert!(
            second.is_none(),
            "second identical emission within the dedup window must be skipped; got {second:?}"
        );
        handle.abort();
    }

    #[tokio::test]
    async fn drops_when_outbound_channel_full() {
        // Genuinely saturate the channel: capacity 1, receiver never
        // drained while the dispatcher is producing. The first event
        // occupies the only slot; subsequent events must hit
        // `TrySendError::Full` inside the dispatcher and be silently
        // dropped (logged at warn — not observable from the test, but
        // the survive-and-drop behavior is).
        let sink = BroadcastEventSink::new(16);
        let events = sink.subscribe();
        let policy = Arc::new(Mutex::new(NotifyPolicy::default()));
        let (tunnel_tx, mut tunnel_rx) = mpsc::channel::<TunnelFrame>(1);
        let handle = spawn_notify_dispatcher(events, policy, tunnel_tx);

        // Three distinct events — distinct `(kind, session_key)`
        // pairs so the NotifyPolicy dedup window doesn't pre-emptively
        // skip the second/third.
        sink.emit(session_status("needs_you", "s1", "/agents/W/a"));
        sink.emit(session_status("completed", "s2", "/agents/W/b"));
        sink.emit(session_status("failed", "s3", "/agents/W/c"));

        // Give the dispatcher enough scheduler time to process all
        // three broadcast events.
        tokio::time::sleep(Duration::from_millis(200)).await;

        // Exactly one frame should be sitting in the channel.
        assert!(
            tunnel_rx.try_recv().is_ok(),
            "the first frame must have landed in the 1-slot channel"
        );
        assert!(
            matches!(tunnel_rx.try_recv(), Err(mpsc::error::TryRecvError::Empty)),
            "subsequent frames must have been dropped at try_send, not queued"
        );
        // Dispatcher must survive the Full drops and remain ready for
        // future events.
        assert!(
            !handle.is_finished(),
            "dispatcher must survive TrySendError::Full and keep running"
        );
        handle.abort();
    }

    #[test]
    fn agent_name_extracts_basename() {
        assert_eq!(
            agent_name_from_path("/Users/x/.houston/workspaces/W/docs-agent"),
            "docs-agent"
        );
        assert_eq!(agent_name_from_path("docs-agent"), "docs-agent");
        // Trailing slash: `Path::file_name()` returns the segment
        // before the slash on Unix.
        assert_eq!(agent_name_from_path("/a/b/c/"), "c");
        // Empty input: `Path::new("").file_name()` is None — the
        // literal fallback prevents a stray separator on the device.
        assert_eq!(agent_name_from_path(""), UNKNOWN_AGENT_FALLBACK);
        // Root-only / no basename: same fallback.
        assert_eq!(agent_name_from_path("/"), UNKNOWN_AGENT_FALLBACK);
    }
}
