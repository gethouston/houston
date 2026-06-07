//! Event types emitted from the Rust backend to the UI.
//!
//! Every variant is a message the frontend reacts to (feed updates, status
//! changes, toasts, file-change notifications for query invalidation, etc.).
//!
//! This crate is transport-neutral. Producers construct `HoustonEvent`
//! variants and hand them to an `EventSink` — the concrete sink (Tauri
//! emit, broadcast channel for the HTTP server, no-op for tests) is
//! injected at the top of the app. No Tauri dep here by design.

use houston_terminal_manager::FeedItem;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::broadcast;

/// Typed reason a Claude Code install attempt failed.
///
/// Mirrors the `ProviderError` taxonomy (see
/// `knowledge-base/provider-errors.md`): the engine is i18n-agnostic, so
/// instead of shipping an English sentence to the UI we emit a stable
/// `kind` slug and let the frontend localize it (en/es/pt). The
/// `Display` impl is the English wording, kept ONLY for engine logs and
/// the Report-bug bundle — never shown to a user verbatim. `detail`
/// carries the technical specifics (digest values, filesystem error,
/// raw transport error) for those diagnostics.
///
/// Serializes with a `kind` discriminant (snake_case) so the same JSON
/// flows over the WS `ClaudeCliFailed` event AND into the
/// `claude_code_last_install_error` preference the status route reads
/// back. Lives in this crate (not `houston-claude-installer`) because
/// the installer depends on this crate for `HoustonEvent` — putting the
/// type here keeps the dependency edge one-way.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ClaudeInstallError {
    /// Download timed out.
    Timeout,
    /// Couldn't reach Anthropic at all (DNS, refused connection, TLS, or
    /// any other request-level transport failure).
    NetworkUnreachable,
    /// The connection dropped mid-stream (truncated body / decode error).
    DownloadInterrupted,
    /// Anthropic's download server answered with a non-success status.
    HttpError { status: u16 },
    /// The downloaded bytes didn't match the pinned SHA-256.
    ChecksumMismatch { detail: String },
    /// No URL / checksum is pinned for the host platform.
    PlatformUnsupported { platform: String },
    /// A filesystem step failed (mkdir, temp file, write, flush, chmod,
    /// rename).
    WriteFailed { detail: String },
    /// `cli-deps.json` couldn't be resolved. Dev-only in practice —
    /// production bundles the manifest. Surfaced to the user as a
    /// generic "couldn't start the download" so we never leak the
    /// internal manifest hint.
    ManifestMissing,
    /// Manifest resolved but has no `claude-code` entry.
    ManifestEntryMissing,
    /// No classifier matched. `detail` carries the raw error so the bug
    /// report stays actionable.
    Unknown { detail: String },
}

impl std::fmt::Display for ClaudeInstallError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Timeout => write!(f, "Timed out while downloading Claude Code."),
            Self::NetworkUnreachable => {
                write!(f, "Couldn't reach Anthropic to download Claude Code.")
            }
            Self::DownloadInterrupted => {
                write!(f, "Download interrupted while fetching Claude Code.")
            }
            Self::HttpError { status } => {
                write!(f, "Anthropic's download server returned HTTP {status}.")
            }
            Self::ChecksumMismatch { detail } => {
                write!(f, "Downloaded Claude Code failed checksum verification ({detail}).")
            }
            Self::PlatformUnsupported { platform } => {
                write!(f, "No Claude Code download is pinned for platform '{platform}'.")
            }
            Self::WriteFailed { detail } => {
                write!(f, "Failed to write Claude Code to disk: {detail}")
            }
            Self::ManifestMissing => {
                write!(f, "cli-deps.json manifest not available; install the pinned manifest first.")
            }
            Self::ManifestEntryMissing => write!(f, "cli-deps.json has no 'claude-code' entry."),
            Self::Unknown { detail } => write!(f, "Claude Code install failed: {detail}"),
        }
    }
}

impl ClaudeInstallError {
    /// JSON form persisted to the `claude_code_last_install_error`
    /// preference and read back by the status route. Falls back to a
    /// valid `unknown` document if serialization ever fails so the
    /// stored value always round-trips.
    pub fn to_pref_json(&self) -> String {
        serde_json::to_string(self)
            .unwrap_or_else(|_| r#"{"kind":"unknown","detail":""}"#.to_string())
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", content = "data")]
pub enum HoustonEvent {
    /// A feed item from a running session.
    FeedItem {
        agent_path: String,
        session_key: String,
        item: FeedItem,
    },
    /// Session status changed (starting, running, completed, error).
    SessionStatus {
        agent_path: String,
        session_key: String,
        status: String,
        error: Option<String>,
    },
    /// Toast notification for the UI.
    Toast {
        message: String,
        variant: String,
    },
    /// CLI tool authentication required — provider session returned 401 or similar.
    AuthRequired {
        provider: String,
        message: String,
    },
    /// Activity completion notification.
    CompletionToast {
        title: String,
        issue_id: Option<String>,
    },

    // ----- Event system (houston-events) -----

    /// An input event was received and queued for processing.
    EventReceived {
        event_id: String,
        event_type: String,
        source_channel: String,
        source_identifier: String,
        summary: String,
    },
    /// An input event was processed.
    EventProcessed {
        event_id: String,
        status: String,
    },

    // ----- Scheduler (houston-scheduler) -----

    /// A heartbeat fired.
    HeartbeatFired {
        prompt: String,
        project_id: Option<String>,
    },
    /// A cron job fired.
    CronFired {
        job_id: String,
        job_name: String,
        prompt: String,
    },

    // ----- Routines -----

    /// Routines list changed (.houston/routines.json).
    RoutinesChanged {
        agent_path: String,
    },
    /// Routine runs changed (.houston/routine_runs.json).
    RoutineRunsChanged {
        agent_path: String,
    },

    // ----- Agent data changes (AI-native reactivity) -----
    // Emitted by agent_store writes AND by the file watcher.
    // Frontend uses these to invalidate TanStack Query caches.

    /// Activity list changed (.houston/activity.json).
    ActivityChanged {
        agent_path: String,
    },
    /// Skills changed (.agents/skills/ — skill.sh / Claude Code convention).
    SkillsChanged {
        agent_path: String,
    },
    /// Agent files changed (non-.houston files).
    FilesChanged {
        agent_path: String,
    },
    /// Config changed (.houston/config.json).
    ConfigChanged {
        agent_path: String,
    },
    /// Context files changed (CLAUDE.md, .houston/prompts/).
    ContextChanged {
        agent_path: String,
    },
    /// Conversations list changed.
    ConversationsChanged {
        project_id: String,
        agent_path: String,
    },
    /// Learnings changed (.houston/learnings/learnings.json).
    LearningsChanged {
        agent_path: String,
    },

    // ----- Composio CLI lifecycle -----

    /// Composio CLI is installed and ready. Frontend should invalidate
    /// the connections query so the integrations tab updates.
    ComposioCliReady,
    /// Composio CLI install or upgrade failed.
    ComposioCliFailed { message: String },
    /// A toolkit became visible in the consumer `connected_toolkits`
    /// endpoint after a `start_link` flow. Emitted at most once per
    /// watch by `houston_composio::connection_watcher`. Frontend
    /// invalidates the `connectedToolkits` query so the inline chat
    /// card and the Integrations tab flip to "Connected".
    ///
    /// Single source of truth for "connection landed" — replaces the
    /// frontend's focus/visibility/interval probing, which fights
    /// browser lifecycle and Composio's eventual-consistency lag on
    /// `GET /api/v3/org/consumer/connected_toolkits`.
    ComposioConnectionAdded { toolkit: String },

    // ----- Claude Code CLI lifecycle -----
    //
    // Claude Code can't be bundled (proprietary license) so the engine
    // downloads it on first launch via `houston-claude-installer`. The
    // frontend uses these events to render the install progress banner
    // and re-check provider auth status once ready.

    /// Claude Code CLI download in progress. `progress_pct` is 0-100;
    /// emitted at most every 10 percentage points so the channel isn't
    /// flooded during a ~120 MB download.
    ClaudeCliInstalling { progress_pct: u8 },
    /// Claude Code CLI is installed (either freshly downloaded or
    /// already at the pinned version). Frontend invalidates the
    /// `provider_status` query so the Anthropic provider chip updates.
    ClaudeCliReady,
    /// Claude Code CLI install or upgrade failed. Carries a typed
    /// [`ClaudeInstallError`] (`kind` + optional `detail`); the frontend
    /// localizes `kind` and the engine logs the English `Display`.
    ClaudeCliFailed { error: ClaudeInstallError },

    // ----- Provider OAuth login (URL relay) -----
    //
    // When the engine runs in a remote/headless context (container,
    // Always-On VPS, future Cloud), the CLI can't open the user's
    // browser — the browser is on a different machine entirely. The CLI
    // prints a sign-in URL to stdout; the user opens it on their own
    // machine. Two shapes of completion follow, depending on the
    // provider's flow:
    //   * Paste-back (Claude): the user copies a verification code from
    //     the browser and submits it via `POST /v1/providers/:name/login/code`.
    //   * Device-grant (codex `--device-auth`): the CLI also prints a
    //     one-time code; the user enters THAT code on the provider's page
    //     and the CLI polls + completes on its own (no paste-back).
    // These events surface the URL (and, for device-grant, the code) to
    // the UI.

    /// A provider's OAuth login subprocess produced a sign-in URL.
    /// Frontend should display it (and optionally `window.open` it).
    ///
    /// `user_code` is `None` for the paste-back flow (Claude) — the UI
    /// shows a paste-code input that submits to the code-relay route.
    /// For codex's device-grant flow it carries the one-time code the
    /// user must enter on the provider's verification page; the UI shows
    /// it (and no paste-code input, since the CLI self-completes). The
    /// relay may emit twice for one device sign-in: first URL-only the
    /// moment the URL appears, then again with `user_code` once the code
    /// line streams in.
    ProviderLoginUrl {
        provider: String,
        url: String,
        user_code: Option<String>,
    },
    /// The OAuth subprocess exited. `success` reflects the exit
    /// status; on failure, `error` is best-effort stderr/stdout.
    /// Frontend closes the dialog and re-fetches `providerStatus`.
    ProviderLoginComplete {
        provider: String,
        success: bool,
        error: Option<String>,
    },
    /// Provider credentials were synced from local to cloud (or restored).
    /// Frontend should invalidate `providerStatus` queries.
    ProviderCredentialsSynced {
        provider: String,
        auth_state: String,
        files_written: usize,
    },
}

// ---------------------------------------------------------------------------
// EventSink — transport-neutral event output.
//
// Fire-and-forget. All concrete sinks (Tauri emit, broadcast channel for the
// HTTP server, no-op for tests) implement this. Producers hold
// `Arc<dyn EventSink>` and never know which transport is wired behind it.
// ---------------------------------------------------------------------------

pub trait EventSink: Send + Sync + 'static {
    /// Emit an event. Implementations should not block.
    fn emit(&self, event: HoustonEvent);
}

/// Convenience alias — what producers hold.
pub type DynEventSink = Arc<dyn EventSink>;

/// No-op sink. Drops every event. Useful for tests and contexts where
/// no frontend is listening.
#[derive(Default, Clone)]
pub struct NoopEventSink;

impl EventSink for NoopEventSink {
    fn emit(&self, _event: HoustonEvent) {}
}

/// Broadcast sink — multi-consumer channel. Every connected client
/// (WebSocket subscriber, mobile bridge, etc.) gets its own `Receiver`.
/// Slow consumers that lag past the channel capacity lose events silently
/// (Tokio's broadcast semantics); sinks for hot sessions should use
/// per-connection bounded queues downstream.
#[derive(Clone)]
pub struct BroadcastEventSink {
    tx: broadcast::Sender<HoustonEvent>,
}

impl BroadcastEventSink {
    pub fn new(capacity: usize) -> Self {
        let (tx, _) = broadcast::channel(capacity);
        Self { tx }
    }

    /// Subscribe a new receiver. Each client calls this on connect.
    pub fn subscribe(&self) -> broadcast::Receiver<HoustonEvent> {
        self.tx.subscribe()
    }

    /// Current subscriber count. Used for metrics/observability.
    pub fn subscriber_count(&self) -> usize {
        self.tx.receiver_count()
    }
}

impl EventSink for BroadcastEventSink {
    fn emit(&self, event: HoustonEvent) {
        // `send` errors only when there are no subscribers — not a failure.
        let _ = self.tx.send(event);
    }
}

/// Fanout sink — emits to every inner sink. Used during transition
/// when we want both Tauri emit AND broadcast to run in parallel
/// (e.g., desktop shipping with the new WS path behind a feature flag).
pub struct FanoutEventSink {
    sinks: Vec<Arc<dyn EventSink>>,
}

impl FanoutEventSink {
    pub fn new(sinks: Vec<Arc<dyn EventSink>>) -> Self {
        Self { sinks }
    }
}

impl EventSink for FanoutEventSink {
    fn emit(&self, event: HoustonEvent) {
        for sink in &self.sinks {
            sink.emit(event.clone());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn noop_sink_drops_events() {
        let sink = NoopEventSink;
        sink.emit(HoustonEvent::Toast {
            message: "hi".into(),
            variant: "info".into(),
        });
        // No assertions — just ensure no panic / compile errors.
    }

    #[tokio::test]
    async fn broadcast_sink_delivers_to_subscribers() {
        let sink = BroadcastEventSink::new(16);
        let mut rx1 = sink.subscribe();
        let mut rx2 = sink.subscribe();

        sink.emit(HoustonEvent::Toast {
            message: "hello".into(),
            variant: "info".into(),
        });

        let e1 = rx1.recv().await.expect("rx1 receives");
        let e2 = rx2.recv().await.expect("rx2 receives");
        matches!(e1, HoustonEvent::Toast { .. });
        matches!(e2, HoustonEvent::Toast { .. });
    }

    #[test]
    fn broadcast_sink_no_subscribers_is_fine() {
        let sink = BroadcastEventSink::new(16);
        sink.emit(HoustonEvent::Toast {
            message: "into the void".into(),
            variant: "info".into(),
        });
    }

    #[tokio::test]
    async fn fanout_emits_to_all_inner_sinks() {
        let a = Arc::new(BroadcastEventSink::new(16));
        let b = Arc::new(BroadcastEventSink::new(16));
        let mut rx_a = a.subscribe();
        let mut rx_b = b.subscribe();

        let fanout = FanoutEventSink::new(vec![a.clone(), b.clone()]);
        fanout.emit(HoustonEvent::Toast {
            message: "to all".into(),
            variant: "info".into(),
        });

        rx_a.recv().await.expect("a receives");
        rx_b.recv().await.expect("b receives");
    }
}
