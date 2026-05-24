//! Outbound tunnel connection to the Houston relay.
//!
//! `TunnelClient::run` dials `{relay}/e/{tunnelId}/register` over WSS,
//! loops reading frames, and dispatches:
//!   - `HttpRequest` → loopback HTTP → `HttpResponse`
//!   - `WsOpen` → loopback WS + spawned pumps → `WsOpenAck` + forwarded messages
//!   - `WsMessage { dir: c2s }` → push into the matching leg
//!   - `WsClose` → drop the leg
//!   - `PairRequest` → [`PairingService::redeem`] → `PairResponse`
//!   - `Ping` → `Pong`
//!
//! Reconnects on drop with exponential backoff up to 60s.

use crate::frame::TunnelFrame;
use crate::pairing::PairingService;
use crate::proxy::EngineEndpoint;
use crate::runtime::TunnelRuntimeState;
use std::sync::Arc;
use std::time::Duration;

mod dispatch;
mod session;

/// Heartbeat cadence: desktop sends a `Ping` frame this often. The relay
/// DO mirrors with its own ~20s heartbeat, so the aggregate "a frame
/// passes in each direction" interval is ~10-15s — enough to keep any
/// reasonable CF / intermediary idle timeout far away.
const HEARTBEAT_EVERY: Duration = Duration::from_secs(30);

/// Watchdog: if no frame (pong, ping, or anything else) has been received
/// in this window, the tunnel is dead even if the OS hasn't noticed the
/// TCP FIN. Close + reconnect.
const WATCHDOG_SILENCE: Duration = Duration::from_secs(90);

/// Capacity of the persistent outbound-frame channel exposed via
/// [`TunnelClient::outbound_frame_sender`]. 64 is well above any
/// realistic per-second burst (the engine-level [`crate::NotifyPolicy`]
/// caps to ~5/day) and small enough that a wedged tunnel can't
/// accumulate unbounded backpressure. On `try_send` overflow producers
/// log + drop — these frames are advisory, not a delivery guarantee.
const OUTBOUND_CHANNEL_CAPACITY: usize = 64;

/// Internal classification of `run_once` outcomes. `Unauthorized` means
/// the relay explicitly rejected our tunnel token on the register
/// handshake (4xx auth); the outer loop triggers identity
/// re-allocation. `Other` is every transient — network blip, TLS
/// hiccup, DNS fail — handled by the normal backoff.
pub(super) enum RunError {
    Unauthorized,
    Other(anyhow::Error),
}

/// Detect whether a `tokio_tungstenite` connect error was a 401/403
/// handshake response (as opposed to a transport error). The relay
/// returns 401 when it can't verify our tunnel_token against the
/// TUNNEL_SHARED_SECRET — recoverable only via re-allocation.
pub(super) fn is_auth_failure(e: &tokio_tungstenite::tungstenite::Error) -> bool {
    use tokio_tungstenite::tungstenite::Error;
    if let Error::Http(resp) = e {
        let status = resp.status().as_u16();
        return status == 401 || status == 403;
    }
    false
}

#[derive(Clone, Debug)]
pub struct TunnelConfig {
    /// Houston home directory — holds `tunnel.json` so the client can
    /// persist / invalidate / re-allocate identity without bouncing the
    /// engine.
    pub home_dir: std::path::PathBuf,
    /// Relay base URL, e.g. `https://tunnel.gethouston.ai`. The client
    /// derives the register URL (`wss://.../e/<tunnelId>/register`)
    /// itself using the current identity.
    pub tunnel_url: String,
    /// Initial identity (loaded or allocated by `identity::ensure`). On
    /// persistent auth failure the client calls `identity::invalidate`
    /// + `identity::ensure` to mint a fresh one.
    pub identity: crate::identity::TunnelIdentity,
    /// The loopback engine this proxy fronts.
    pub endpoint: EngineEndpoint,
    /// Shared connection state read by engine HTTP status routes.
    pub runtime: TunnelRuntimeState,
}

/// Spawn once per process. Owns the persistent outbound-frame channel:
/// callers grab a sender via [`TunnelClient::outbound_frame_sender`]
/// *before* moving the client into [`TunnelClient::run`], then push
/// frames from anywhere in the engine without holding a reference to
/// the tunnel itself.
pub struct TunnelClient {
    cfg: tokio::sync::Mutex<TunnelConfig>,
    pairing: Arc<dyn PairingService>,
    /// Stable producer side of the outbound-frame channel. Cheap to
    /// clone; every producer (e.g. the engine-server notify dispatcher)
    /// holds a clone for the engine lifetime. Survives reconnects — the
    /// receiver is owned by [`Self::run`] and lives across `run_once`
    /// cycles, so a `TrySendError::Full` means the buffer is genuinely
    /// saturated (link wedged, or `OUTBOUND_CHANNEL_CAPACITY` frames
    /// queued faster than the writer can drain). `Closed` only happens
    /// when the engine is shutting down (the run task has exited and
    /// dropped the receiver).
    outbound_tx: tokio::sync::mpsc::Sender<TunnelFrame>,
    /// Consumer side, owned by the run task. `Some` until the first
    /// [`Self::run`] call; `None` thereafter. `run` takes `self` by
    /// value so this can only be `take`n once.
    outbound_rx: Option<tokio::sync::mpsc::Receiver<TunnelFrame>>,
}

impl TunnelClient {
    pub fn new(cfg: TunnelConfig, pairing: Arc<dyn PairingService>) -> Self {
        let (outbound_tx, outbound_rx) = tokio::sync::mpsc::channel(OUTBOUND_CHANNEL_CAPACITY);
        Self {
            cfg: tokio::sync::Mutex::new(cfg),
            pairing,
            outbound_tx,
            outbound_rx: Some(outbound_rx),
        }
    }

    /// Return a clone of the stable outbound-frame sender. Producers
    /// hold this for the engine lifetime and push via `try_send`
    /// (non-blocking). On [`tokio::sync::mpsc::error::TrySendError::Full`]
    /// the producer should log + drop — these frames are advisory and
    /// bounded by [`crate::NotifyPolicy`] upstream of the channel.
    ///
    /// The channel survives reconnects: while the tunnel is down, the
    /// next [`Self::run_once`] cycle continues draining from the same
    /// receiver. Only engine shutdown closes it (the run task exits and
    /// drops the receiver, after which producers see `TrySendError::Closed`).
    pub fn outbound_frame_sender(&self) -> tokio::sync::mpsc::Sender<TunnelFrame> {
        self.outbound_tx.clone()
    }

    /// Long-running task. Never returns (reconnect loop). Caller should
    /// `tokio::spawn` it.
    pub async fn run(mut self) {
        // Invariant: `outbound_rx` is `Some` in `new` and `take`n
        // exactly once here. `run` consumes `self`, so this method
        // cannot be called twice.
        let mut outbound_rx = self.outbound_rx.take().expect(
            "TunnelClient invariant: outbound_rx is Some on construction \
             and run() consumes self",
        );
        let mut backoff_ms = 500u64;
        let mut consecutive_failures: u32 = 0;
        loop {
            let run_result = self.run_once(&mut outbound_rx).await;
            match run_result {
                Ok(()) => {
                    tracing::info!(target: "houston_tunnel", "tunnel closed cleanly, reconnecting");
                    backoff_ms = 500;
                    consecutive_failures = 0;
                }
                Err(RunError::Unauthorized) => {
                    tracing::warn!(
                        target: "houston_tunnel",
                        "tunnel register rejected (401/403) — invalidating cached identity, re-allocating"
                    );
                    self.reallocate_identity().await;
                    backoff_ms = 500;
                    consecutive_failures = 0;
                }
                Err(RunError::Other(e)) => {
                    consecutive_failures += 1;
                    tracing::info!(
                        target: "houston_tunnel",
                        error = %e,
                        backoff_ms,
                        consecutive_failures,
                        "tunnel dropped, retrying"
                    );
                }
            }
            self.mark_disconnected().await;
            tokio::time::sleep(Duration::from_millis(backoff_ms)).await;
            backoff_ms = (backoff_ms * 2).min(60_000);
        }
    }

    /// Delete the cached `tunnel.json` and allocate a fresh identity
    /// from the relay. Used only when the relay explicitly rejects the
    /// cached tunnel token (401/403 on register). Normal network drops,
    /// laptop sleep, and app restarts must keep the same tunnel id so
    /// already-paired phones reconnect. Logs + swallows errors — the
    /// outer reconnect loop will keep trying with whatever identity we have.
    async fn reallocate_identity(&self) {
        let mut cfg = self.cfg.lock().await;
        crate::identity::invalidate(&cfg.home_dir);
        match crate::identity::ensure(&cfg.home_dir, &cfg.tunnel_url).await {
            Ok(fresh) => {
                tracing::info!(
                    target: "houston_tunnel",
                    tunnel_id = %fresh.tunnel_id,
                    host = %fresh.public_host,
                    "allocated fresh tunnel identity"
                );
                cfg.identity = fresh.clone();
                cfg.runtime.set_identity(fresh);
            }
            Err(e) => {
                tracing::error!(
                    target: "houston_tunnel",
                    error = %e,
                    "re-allocation failed — will keep retrying with current identity"
                );
            }
        }
    }

    /// Snapshot the current identity + register URL under the mutex,
    /// then release it so the long-running read loop doesn't hold it.
    pub(super) fn register_url_for(&self, cfg: &TunnelConfig) -> Option<String> {
        let base = cfg.tunnel_url.trim_end_matches('/');
        if let Some(rest) = base.strip_prefix("https://") {
            Some(format!(
                "wss://{rest}/e/{}/register",
                cfg.identity.tunnel_id
            ))
        } else if let Some(rest) = base.strip_prefix("http://") {
            Some(format!("ws://{rest}/e/{}/register", cfg.identity.tunnel_id))
        } else {
            tracing::warn!(
                target: "houston_tunnel",
                tunnel_url = %cfg.tunnel_url,
                "unexpected scheme — expected http:// or https://"
            );
            None
        }
    }

    async fn mark_disconnected(&self) {
        let runtime = self.cfg.lock().await.runtime.clone();
        runtime.mark_disconnected();
    }
}

pub(super) fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::OUTBOUND_CHANNEL_CAPACITY;
    use crate::frame::{NotifyFrame, NotifyKind, TunnelFrame};

    /// Documents the producer-side contract relied on by the engine-server
    /// notify dispatcher: a bounded `(Sender, Receiver)` pair with the
    /// chosen capacity, where pushed `TunnelFrame::Notify` payloads round-
    /// trip through `serde_json` to the wire shape the relay expects.
    #[tokio::test]
    async fn outbound_channel_serializes_notify_to_wire_shape() {
        let (tx, mut rx) = tokio::sync::mpsc::channel::<TunnelFrame>(OUTBOUND_CHANNEL_CAPACITY);
        tx.try_send(TunnelFrame::Notify(NotifyFrame {
            notify_kind: NotifyKind::NeedsYou,
            loc_args: vec!["docs-agent".into()],
            session_key: "sess-1".into(),
        }))
        .expect("fresh channel must accept first send");
        let frame = rx.recv().await.expect("receiver still open");
        let json = serde_json::to_string(&frame).expect("Notify frame serializes");
        // Outer discriminator is `kind`; inner event uses `notifyKind`.
        // Lockstep with `houston-relay/src/types.ts::TunnelFrame`.
        assert!(json.contains("\"kind\":\"notify\""), "got: {json}");
        assert!(json.contains("\"notifyKind\":\"needs_you\""), "got: {json}");
        assert!(json.contains("\"locArgs\":[\"docs-agent\"]"), "got: {json}");
        assert!(json.contains("\"sessionKey\":\"sess-1\""), "got: {json}");
    }

    /// Documents the "advisory delivery" semantic: when the buffer is
    /// saturated, `try_send` returns `Full`. The producer (dispatcher)
    /// is expected to log + drop, never block, never retry. Notifications
    /// are gated upstream by `NotifyPolicy` so the cap is reachable only
    /// during sustained disconnect — exactly when dropping is the
    /// right answer.
    #[test]
    fn outbound_channel_full_yields_try_send_full_error() {
        let (tx, _rx) = tokio::sync::mpsc::channel::<TunnelFrame>(1);
        tx.try_send(TunnelFrame::Notify(NotifyFrame {
            notify_kind: NotifyKind::Finished,
            loc_args: vec![],
            session_key: "a".into(),
        }))
        .expect("first send fits");
        let err = tx
            .try_send(TunnelFrame::Notify(NotifyFrame {
                notify_kind: NotifyKind::Finished,
                loc_args: vec![],
                session_key: "b".into(),
            }))
            .expect_err("second send must overflow");
        assert!(
            matches!(err, tokio::sync::mpsc::error::TrySendError::Full(_)),
            "expected Full, got {err:?}"
        );
    }
}
