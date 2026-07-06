//! Local-model bridge: detect a locally-running OpenAI-compatible model server,
//! front it with a bearer-gated loopback proxy, and tunnel it out through a
//! bundled frpc so the user's CLOUD Houston agent can reach it at
//! `https://<subdomain>.tunnels.gethouston.ai`.
//!
//! Six Tauri commands (registered in `lib.rs` as `local_bridge::commands::*`,
//! kept callable in host/cloud mode): `detect_local_models`,
//! `start_local_bridge`, `stop_local_bridge`, `local_bridge_status`,
//! `saved_bridge_target`, `reconnect_local_bridge`. Status changes also emit a
//! `local-bridge-status` event with the same payload. The command bodies live
//! in [`commands`]; this module owns the process-global state, the
//! launch/teardown mechanics, and the wire types.

pub mod commands;
mod detection;
mod frpc;
mod keys;
mod log_sanitize;
mod pidfile;
mod proxy;
mod state;
mod types;
mod url;

use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter};

pub use detection::DetectedServer;
use types::StoredStatus;
pub use types::{BridgeStatusKind, BridgeStatusPayload, StartBridgeResult};
use url::origin_of;

/// The single live bridge, if any. A new `launch` tears down the previous one so
/// we never leak a proxy port or an frpc child.
static BRIDGE: Mutex<Option<RunningBridge>> = Mutex::new(None);

/// Serializes the WHOLE bridge lifecycle (start / reconnect / stop). Held across
/// the awaits inside [`launch`] so two concurrent starts can never interleave —
/// the frontend fires a boot auto-reconnect AND a manual connect at once, and
/// without this they raced on the single `frpc.toml`, leaving frpc forwarding to
/// a proxy port whose accept-task had already been torn down (turn hangs
/// forever). The std [`BRIDGE`] mutex stays the state cell; it must NEVER be held
/// across an await (that's the original bug / a deadlock), so this async mutex is
/// the operation serializer instead. Acquired by the three command entry points
/// in [`commands`] — [`launch`] assumes it is already held.
static BRIDGE_OP: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

/// Last known status, mirrored into the `local-bridge-status` event. Read by
/// [`local_bridge_status`] so the frontend can pull it without waiting for an
/// event.
static STATUS: Mutex<StoredStatus> = Mutex::new(StoredStatus {
    kind: BridgeStatusKind::Offline,
    detail: None,
});

struct RunningBridge {
    proxy: proxy::ProxyHandle,
    frpc: frpc::FrpcSupervisor,
}

/// Everything [`launch`] needs to stand up proxy + frpc. Built by the `start`
/// and `reconnect` commands from live args and/or the persisted descriptor.
struct LaunchParams {
    frpc_binary: std::path::PathBuf,
    /// `scheme://host[:port]` of the local server, no path.
    origin: String,
    transport: String,
    local_api_key: Option<String>,
    /// The auth-proxy bearer. On reconnect this is the PERSISTED key, reused so
    /// the cloud endpoint's registered apiKey stays valid.
    proxy_key: String,
    relay_host: String,
    relay_port: u16,
    subdomain: String,
    token: String,
}

/// Stand up the bearer-gated loopback proxy in front of `origin`, then spawn
/// frpc to publish it. Tears down any prior bridge first. Leaves the proxy port
/// unpublished if frpc fails to launch.
///
/// PRECONDITION: the caller MUST hold [`BRIDGE_OP`] for the whole call. That is
/// the only thing keeping `stop_internal` + the shared `frpc.toml` write + the
/// `BRIDGE` store atomic against a concurrent lifecycle op; the lock is acquired
/// in the command handlers (not here) so it also spans descriptor persistence.
async fn launch(app: &AppHandle, p: LaunchParams) -> Result<StartBridgeResult, String> {
    // Tear down any prior bridge first.
    stop_internal(app)?;

    let proxy = proxy::start_auth_proxy(p.origin, p.proxy_key.clone(), p.local_api_key).await?;
    let local_proxy_port = proxy.port;

    set_status(app, BridgeStatusKind::Connecting, None);

    let config_dir = crate::houston_dir().join("local-bridge");
    let app_for_cb = app.clone();
    let on_status: frpc::StatusCallback =
        Arc::new(move |kind, detail| set_status(&app_for_cb, kind, detail));

    let frpc = match frpc::FrpcSupervisor::spawn(
        frpc::FrpcParams {
            binary: p.frpc_binary,
            config_dir: &config_dir,
            relay_host: p.relay_host,
            relay_port: p.relay_port,
            subdomain: p.subdomain.clone(),
            token: p.token,
            transport: p.transport,
            local_port: local_proxy_port,
        },
        on_status,
    ) {
        Ok(f) => f,
        Err(e) => {
            // Don't leak the proxy if frpc failed to launch.
            proxy.shutdown();
            set_status(app, BridgeStatusKind::Error, Some(e.clone()));
            return Err(e);
        }
    };

    let public_url = format!("https://{}.tunnels.gethouston.ai", p.subdomain);
    {
        let mut guard = BRIDGE
            .lock()
            .map_err(|e| format!("local-bridge state poisoned: {e}"))?;
        *guard = Some(RunningBridge { proxy, frpc });
    }

    Ok(StartBridgeResult {
        public_url,
        local_proxy_port,
        proxy_key: p.proxy_key,
    })
}

/// Tear down the bridge (frpc + proxy) and mark it offline. Idempotent. Does NOT
/// delete the persisted descriptor — only the explicit `stop_local_bridge`
/// command does that.
fn stop_internal(app: &AppHandle) -> Result<(), String> {
    let taken = BRIDGE
        .lock()
        .map_err(|e| format!("local-bridge state poisoned: {e}"))?
        .take();
    if let Some(RunningBridge { proxy, frpc }) = taken {
        proxy.shutdown();
        drop(frpc); // Drop kills the frpc child (process group / job object).
    }
    set_status(app, BridgeStatusKind::Offline, None);
    Ok(())
}

/// Kill the live bridge's processes at app exit, WITHOUT deleting the persisted
/// descriptor or emitting status (no UI thread left). Rust never drops `static`s
/// at process exit, so this MUST be called explicitly from `RunEvent::Exit` —
/// otherwise frpc (own process group, null stdin) orphans and holds its
/// subdomain, auto-reconnecting.
///
/// Deliberately does NOT take [`BRIDGE_OP`]: it runs at process exit where no
/// command can still be racing, it must not block on a lock a stuck op might
/// hold, and it's a sync fn on the Tauri run-loop thread (no `.await`). It
/// touches `BRIDGE` directly, which is safe — that's a plain sync mutex.
pub fn shutdown() {
    if let Ok(mut guard) = BRIDGE.lock() {
        if let Some(RunningBridge { proxy, frpc }) = guard.take() {
            proxy.shutdown();
            drop(frpc);
        }
    }
}

/// Store `status` and emit `local-bridge-status` — but only when it actually
/// changed, so repeated identical frpc log lines don't spam the frontend.
fn set_status(app: &AppHandle, kind: BridgeStatusKind, detail: Option<String>) {
    if let Ok(mut g) = STATUS.lock() {
        if g.kind == kind && g.detail == detail {
            return;
        }
        *g = StoredStatus {
            kind,
            detail: detail.clone(),
        };
    }
    let payload = BridgeStatusPayload {
        status: kind,
        detail,
    };
    // Event-emit callback: no UI thread to toast on, so a failed emit is logged
    // (the documented exception to the no-silent-failure rule).
    if let Err(e) = app.emit("local-bridge-status", payload) {
        tracing::error!("[local-bridge] failed to emit status event: {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detected_server_serializes_camel_case() {
        use super::detection::ServerKind;
        let json = serde_json::to_string(&DetectedServer {
            kind: ServerKind::Lmstudio,
            base_url: "http://127.0.0.1:1234".to_string(),
            port: 1234,
            models: vec!["m".to_string()],
            reachable: true,
        })
        .unwrap();
        assert!(json.contains("\"kind\":\"lmstudio\""));
        assert!(json.contains("\"baseUrl\":\"http://127.0.0.1:1234\""));
        assert!(json.contains("\"reachable\":true"));
    }
}

/// Concurrency tests for the [`BRIDGE_OP`] lifecycle serializer.
///
/// These model `launch()`'s non-atomic sequence: allocate a loopback proxy port,
/// then (after awaits) record that port into the SINGLE shared `frpc.toml`. The
/// live-repro bug: two concurrent launches share one config file, so `BRIDGE`
/// ends up holding proxy A while frpc forwards to port B — frpc alive, nothing
/// listening on B, every tunneled request dead-ends and the turn hangs. The
/// pairing invariant is `proxy.port == frpc local_port`; `BRIDGE_OP` must keep
/// it true under concurrency by making the whole sequence mutually exclusive.
#[cfg(test)]
mod concurrency_tests {
    use super::BRIDGE_OP;
    use crate::local_bridge::proxy;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    /// A distinct temp path standing in for the single shared `frpc.toml`.
    fn shared_config_path(tag: &str) -> std::path::PathBuf {
        let unique = format!(
            "houston-bridge-race-{}-{}-{tag}.toml",
            std::process::id(),
            COUNTER.fetch_add(1, Ordering::Relaxed),
        );
        std::env::temp_dir().join(unique)
    }
    static COUNTER: AtomicUsize = AtomicUsize::new(0);

    /// Model the `localPort = N` line frpc would forward to.
    fn write_frpc_local_port(path: &std::path::Path, port: u16) {
        std::fs::write(path, format!("localPort = {port}\n")).expect("write frpc config");
    }
    fn read_frpc_local_port(path: &std::path::Path) -> u16 {
        let s = std::fs::read_to_string(path).expect("read frpc config");
        s.trim()
            .strip_prefix("localPort = ")
            .and_then(|n| n.parse().ok())
            .expect("parse localPort")
    }

    /// One serialized lifecycle: bind a REAL proxy, record its port into the
    /// shared config, yield (the await window where a rival op could clobber the
    /// file), then read back what frpc would forward to. Tracks peak concurrency
    /// so the test can prove the critical sections never overlap.
    async fn guarded_lifecycle(
        cfg: std::path::PathBuf,
        active: Arc<AtomicUsize>,
        peak: Arc<AtomicUsize>,
    ) -> (u16, u16) {
        let _op = BRIDGE_OP.lock().await;
        let now = active.fetch_add(1, Ordering::SeqCst) + 1;
        peak.fetch_max(now, Ordering::SeqCst);

        let bridge =
            proxy::start_auth_proxy("http://127.0.0.1:1".to_string(), "k".to_string(), None)
                .await
                .expect("proxy start");
        let proxy_port = bridge.port;
        write_frpc_local_port(&cfg, proxy_port);
        // Give the scheduler every chance to interleave a rival op here.
        tokio::task::yield_now().await;
        tokio::task::yield_now().await;
        let frpc_local = read_frpc_local_port(&cfg);

        bridge.shutdown();
        active.fetch_sub(1, Ordering::SeqCst);
        (proxy_port, frpc_local)
    }

    /// THE FIX: two concurrent lifecycles sharing one config file never overlap
    /// and each keeps `proxy.port == frpc local_port`. Would flake/fail without
    /// `BRIDGE_OP` (see `crossed_ports_without_serializer` for the mechanism).
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn bridge_op_serializes_and_keeps_ports_paired() {
        let cfg = shared_config_path("guarded");
        let active = Arc::new(AtomicUsize::new(0));
        let peak = Arc::new(AtomicUsize::new(0));

        let a = tokio::spawn(guarded_lifecycle(cfg.clone(), active.clone(), peak.clone()));
        let b = tokio::spawn(guarded_lifecycle(cfg.clone(), active.clone(), peak.clone()));
        let (pa, fa) = a.await.expect("task a");
        let (pb, fb) = b.await.expect("task b");

        assert_eq!(pa, fa, "op A: frpc must forward to A's proxy port");
        assert_eq!(pb, fb, "op B: frpc must forward to B's proxy port");
        assert_eq!(
            peak.load(Ordering::SeqCst),
            1,
            "BRIDGE_OP must keep the two lifecycles from ever overlapping"
        );
        let _ = std::fs::remove_file(&cfg);
    }

    /// REPRODUCES the bug deterministically: with NO serializer, op B slips into
    /// op A's await window and overwrites the shared `frpc.toml`, so A ends up
    /// paired with B's port — frpc forwards to B while BRIDGE holds proxy A. This
    /// is the crossed-port dead-end `BRIDGE_OP` closes.
    #[tokio::test]
    async fn crossed_ports_without_serializer() {
        let cfg = shared_config_path("unguarded");

        // Op A: bind proxy, write the shared config...
        let a = proxy::start_auth_proxy("http://127.0.0.1:1".to_string(), "k".to_string(), None)
            .await
            .expect("proxy a");
        write_frpc_local_port(&cfg, a.port);

        // ...but before A records the pairing, op B interleaves (the missing
        // guard) and clobbers the SAME file with its own port.
        let b = proxy::start_auth_proxy("http://127.0.0.1:1".to_string(), "k".to_string(), None)
            .await
            .expect("proxy b");
        write_frpc_local_port(&cfg, b.port);

        // A now reads what frpc forwards to — and gets B's port.
        let frpc_local = read_frpc_local_port(&cfg);
        assert_ne!(
            a.port, frpc_local,
            "reproduces the crossed pairing BRIDGE_OP must prevent"
        );
        assert_eq!(b.port, frpc_local, "frpc ends up bound to op B's port");

        a.shutdown();
        b.shutdown();
        let _ = std::fs::remove_file(&cfg);
    }
}
