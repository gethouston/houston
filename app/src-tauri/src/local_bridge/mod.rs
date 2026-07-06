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
mod proxy;
mod state;
mod types;

use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter};

pub use detection::DetectedServer;
use types::StoredStatus;
pub use types::{BridgeStatusKind, BridgeStatusPayload, StartBridgeResult};

/// The single live bridge, if any. A new `launch` tears down the previous one so
/// we never leak a proxy port or an frpc child.
static BRIDGE: Mutex<Option<RunningBridge>> = Mutex::new(None);

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

/// Reduce a base URL to its `scheme://host[:port]` origin (drop any path), which
/// is what the proxy forwards against.
fn origin_of(base: &str) -> Result<String, String> {
    let base = base.trim();
    let scheme_end = base
        .find("://")
        .ok_or_else(|| format!("targetBaseUrl {base:?} is missing a scheme"))?;
    let authority_start = scheme_end + 3;
    let rest = &base[authority_start..];
    let authority_len = rest.find('/').unwrap_or(rest.len());
    if authority_len == 0 {
        return Err(format!("targetBaseUrl {base:?} has no host"));
    }
    Ok(format!(
        "{}{}",
        &base[..authority_start],
        &rest[..authority_len]
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn origin_strips_path() {
        assert_eq!(
            origin_of("http://127.0.0.1:1234/v1").unwrap(),
            "http://127.0.0.1:1234"
        );
        assert_eq!(
            origin_of("http://127.0.0.1:1234").unwrap(),
            "http://127.0.0.1:1234"
        );
        assert_eq!(
            origin_of("https://host:8443/a/b/c").unwrap(),
            "https://host:8443"
        );
    }

    #[test]
    fn origin_rejects_bad_input() {
        assert!(origin_of("127.0.0.1:1234").is_err()); // no scheme
        assert!(origin_of("http:///v1").is_err()); // no host
    }

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
