//! Per-toolkit connection watcher — engine-side push for OAuth landings.
//!
//! When the user clicks "Connect" in the inline chat card or the
//! Integrations tab, the frontend asks the engine to watch for a
//! specific toolkit slug. This module polls
//! `cli::list_connected_toolkits` (which hits Composio's consumer
//! REST endpoint) on a tight cadence and emits
//! `HoustonEvent::ComposioConnectionAdded` exactly once when the
//! toolkit appears, then exits.
//!
//! Why engine-side, not pure frontend polling:
//!   - No browser lifecycle quirks (focus, visibility, tab switch,
//!     component remount). The watcher runs in a tokio task that
//!     doesn't care if the user is in the OAuth tab, on the dock, or
//!     looking at a different agent.
//!   - Composio's `connected_toolkits` endpoint exhibits propagation
//!     lag after authorization. The watcher retries for several
//!     minutes, far longer than any frontend polling loop tied to a
//!     visible card would survive.
//!   - Single in-flight request per toolkit globally (not per visible
//!     card), so 5 cards for the same slug = 1 request stream.
//!
//! Lifecycle: spawn-and-forget. The task self-terminates on success
//! (toolkit appeared), on idle deadline (`MAX_LIFETIME`), or when
//! `cancel` is called.

use crate::cli;
use crate::toolkits::{normalize_toolkit_slug, normalize_toolkit_slugs};
use houston_ui_events::{DynEventSink, HoustonEvent};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tokio::task::AbortHandle;

/// First-tick delay. The OAuth completion redirect happens nearly
/// instantly, but Composio's consumer endpoint takes a few seconds to
/// reflect it. Starting too eager just wastes calls; this gives the
/// backend a head start.
const FIRST_DELAY: Duration = Duration::from_secs(2);

/// Steady-state poll interval. Tight enough that the card flips
/// within ~2s of the connection landing; loose enough that 5 minutes
/// of misses is only ~150 requests, well within Composio's rate
/// limits.
const POLL_INTERVAL: Duration = Duration::from_secs(2);

/// Hard cap on how long a single watch runs before giving up.
/// Longer than any reasonable OAuth flow (browser auth, MFA, account
/// switch, etc.). The frontend separately surfaces a manual recovery
/// path when this expires without a hit.
const MAX_LIFETIME: Duration = Duration::from_secs(5 * 60);

struct WatcherRegistry {
    handles: HashMap<String, AbortHandle>,
}

fn registry() -> &'static Mutex<WatcherRegistry> {
    static REGISTRY: OnceLock<Mutex<WatcherRegistry>> = OnceLock::new();
    REGISTRY.get_or_init(|| {
        Mutex::new(WatcherRegistry {
            handles: HashMap::new(),
        })
    })
}

/// Start watching for `toolkit` to appear in the consumer connections
/// list. Idempotent: if a watch for the same normalized slug is
/// already running, this is a no-op.
///
/// Emits `HoustonEvent::ComposioConnectionAdded { toolkit }` on
/// success. Silently exits on timeout — the frontend has its own
/// fallback UX after the deadline.
pub fn watch(toolkit: &str, sink: DynEventSink) {
    let normalized = normalize_toolkit_slug(toolkit);
    if normalized.is_empty() {
        return;
    }

    {
        let reg = registry().lock().expect("watcher registry poisoned");
        if reg.handles.contains_key(&normalized) {
            tracing::debug!(
                "[composio:watch] {} already being watched — skipping",
                normalized
            );
            return;
        }
    }

    let slug = normalized.clone();
    let handle = tokio::spawn(async move {
        run_watch(slug, sink).await;
    });

    let abort_handle = handle.abort_handle();
    {
        let mut reg = registry().lock().expect("watcher registry poisoned");
        reg.handles.insert(normalized, abort_handle);
    }
}

/// Best-effort cancel. Used when the engine knows a watch is no
/// longer needed (e.g., a sign-out clears all state). The watch will
/// also self-cancel on `MAX_LIFETIME`, so callers don't strictly need
/// this.
pub fn cancel(toolkit: &str) {
    let normalized = normalize_toolkit_slug(toolkit);
    if normalized.is_empty() {
        return;
    }
    let mut reg = registry().lock().expect("watcher registry poisoned");
    if let Some(handle) = reg.handles.remove(&normalized) {
        handle.abort();
    }
}

async fn run_watch(slug: String, sink: DynEventSink) {
    let started = Instant::now();
    tokio::time::sleep(FIRST_DELAY).await;

    loop {
        if started.elapsed() >= MAX_LIFETIME {
            tracing::info!(
                "[composio:watch] {} timed out after {:?} without appearing in consumer list",
                slug,
                MAX_LIFETIME
            );
            break;
        }

        let connected = normalize_toolkit_slugs(cli::list_connected_toolkits().await);
        if connected.iter().any(|s| s == &slug) {
            tracing::info!(
                "[composio:watch] {} connection landed — emitting event",
                slug
            );
            sink.emit(HoustonEvent::ComposioConnectionAdded {
                toolkit: slug.clone(),
            });
            break;
        }

        tokio::time::sleep(POLL_INTERVAL).await;
    }

    let mut reg = registry().lock().expect("watcher registry poisoned");
    reg.handles.remove(&slug);
}

#[cfg(test)]
mod tests {
    use super::*;
    use houston_ui_events::BroadcastEventSink;
    use std::sync::Arc;

    #[tokio::test]
    async fn empty_slug_is_a_noop() {
        let sink: DynEventSink = Arc::new(BroadcastEventSink::new(8));
        watch("", sink);
        // Registry should still be empty — no crash, no entry.
        let reg = registry().lock().unwrap();
        assert!(!reg.handles.contains_key(""));
    }

    #[tokio::test]
    async fn second_watch_for_same_slug_is_idempotent() {
        let sink: BroadcastEventSink = BroadcastEventSink::new(8);
        let dyn_sink: DynEventSink = Arc::new(sink.clone());

        // Use a slug that will never resolve (no real API key set in tests).
        // Both calls should land on the same registry entry.
        watch("__test_idempotent_slug__", dyn_sink.clone());
        watch("__test_idempotent_slug__", dyn_sink);

        let reg = registry().lock().unwrap();
        // Exactly one handle, regardless of double-call.
        assert!(reg.handles.contains_key("__test_idempotent_slug__"));
        drop(reg);

        cancel("__test_idempotent_slug__");
        let reg = registry().lock().unwrap();
        assert!(!reg.handles.contains_key("__test_idempotent_slug__"));
    }
}
