//! houston-tunnel — reverse tunnel client that brings the engine's
//! HTTP+WS surface to a public relay without opening a port on the
//! user's network.
//!
//! Flow:
//! 1. First boot: call [`identity::ensure`] → `{tunnel_id, tunnel_token,
//!    public_host}` cached in `<home_dir>/tunnel.json`.
//! 2. [`TunnelClient::new`] with the cached identity + a
//!    [`PairingService`] implementation (typically a struct backed by
//!    `houston_db::Database` + the durable phone-access secret).
//! 3. `tokio::spawn(client.run())` — runs forever with reconnect.
//!
//! The client proxies mobile traffic by calling back into the engine
//! over loopback (127.0.0.1:<port>), so there's zero coupling to any
//! specific router — it's just "whoever is listening on that port."

pub mod connection;
pub mod frame;
pub mod identity;
pub mod notify;
pub mod pairing;
pub mod proxy;
pub mod runtime;

pub use connection::{TunnelClient, TunnelConfig};
pub use frame::{NotifyFrame, NotifyKind, TunnelFrame};
pub use identity::{ensure, invalidate, load, save, TunnelIdentity};
pub use notify::{
    status_to_notify_kind, NotifyDecision, NotifyPolicy, SkipReason, DEFAULT_DAILY_CAP,
    DEFAULT_DEDUP_WINDOW_SECS,
};
pub use pairing::{PairError, PairOutcome, PairingService};
pub use proxy::EngineEndpoint;
pub use runtime::{TunnelRuntimeSnapshot, TunnelRuntimeState};
