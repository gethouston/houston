//! The local-bridge Tauri commands. The mechanics (launch/teardown, statics,
//! status) live in the parent module; this file is just the IPC surface plus
//! descriptor persistence wiring.

use tauri::{AppHandle, Manager};

use super::state::{self, SavedBridgeTarget};
use super::{
    detection, keys, launch, origin_of, stop_internal, BridgeStatusKind, BridgeStatusPayload,
    DetectedServer, LaunchParams, StartBridgeResult, BRIDGE_OP, STATUS,
};

/// Probe the well-known local model-server ports and report what's running.
/// Never errors — unreachable ports come back with `reachable: false`.
#[tauri::command]
pub async fn detect_local_models() -> Vec<DetectedServer> {
    detection::detect().await
}

/// Start (or restart) the bridge: mint a proxy key, stand up the bearer-gated
/// loopback proxy in front of `targetBaseUrl`, then spawn frpc to publish it. On
/// success PERSISTS a private descriptor (0600) so the bridge can be
/// re-established after a restart without re-minting the proxy key.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn start_local_bridge(
    app: AppHandle,
    target_base_url: String,
    relay_host: String,
    relay_port: u16,
    subdomain: String,
    token: String,
    transport: String,
    // Optional, additive: the local server's own API key, attached to upstream
    // requests when the server requires auth (LM Studio/Jan/Ollama usually
    // don't). Absent from JS → `None`.
    local_api_key: Option<String>,
    // Optional, additive: a human label for the tunnelled server, persisted and
    // handed back by `saved_bridge_target`. Absent → derived from the origin.
    app_name: Option<String>,
) -> Result<StartBridgeResult, String> {
    // Serialize the whole lifecycle: hold BRIDGE_OP across launch AND the
    // descriptor write so no concurrent reconnect/stop can interleave (see the
    // static's doc for the crossed-port hang this prevents).
    let _op = BRIDGE_OP.lock().await;
    // Resolve the bundled frpc BEFORE starting anything, so a missing binary
    // fails fast without leaking a listener.
    let frpc_binary = resolve_frpc(&app)?;
    let origin = origin_of(&target_base_url)?;
    let proxy_key = keys::generate_proxy_key();
    let resolved_app_name = app_name.unwrap_or_else(|| derive_app_name(&origin));

    let result = launch(
        &app,
        LaunchParams {
            frpc_binary,
            origin,
            transport: transport.clone(),
            local_api_key: local_api_key.clone(),
            proxy_key: proxy_key.clone(),
            relay_host,
            relay_port,
            subdomain,
            token,
        },
    )
    .await?;

    // Persist ONLY after a successful launch, so a failed start never leaves a
    // descriptor claiming a live bridge.
    state::save(&state::BridgeDescriptor {
        target_base_url,
        transport,
        local_api_key,
        proxy_key,
        app_name: resolved_app_name,
    })?;

    Ok(result)
}

/// Re-establish a previously-configured bridge with fresh relay credentials,
/// REUSING the persisted proxy key (so the cloud endpoint's apiKey stays valid).
/// Errs if no descriptor was saved.
#[tauri::command]
pub async fn reconnect_local_bridge(
    app: AppHandle,
    relay_host: String,
    relay_port: u16,
    subdomain: String,
    token: String,
) -> Result<StartBridgeResult, String> {
    // Serialize against a concurrent start/stop — a boot auto-reconnect and a
    // manual connect must not run launch() at the same time (see BRIDGE_OP).
    let _op = BRIDGE_OP.lock().await;
    let desc = state::load()?
        .ok_or_else(|| "no saved local-bridge to reconnect — start one first".to_string())?;
    let frpc_binary = resolve_frpc(&app)?;
    let origin = origin_of(&desc.target_base_url)?;

    launch(
        &app,
        LaunchParams {
            frpc_binary,
            origin,
            transport: desc.transport,
            local_api_key: desc.local_api_key,
            // Reuse the persisted key — the cloud agent registered THIS value.
            proxy_key: desc.proxy_key,
            relay_host,
            relay_port,
            subdomain,
            token,
        },
    )
    .await
}

/// The saved target's redacted subset (never the proxy/local keys), or `None`
/// if nothing is persisted.
#[tauri::command]
pub fn saved_bridge_target() -> Result<Option<SavedBridgeTarget>, String> {
    Ok(state::load()?.map(|d| d.to_saved()))
}

/// Tear down the bridge (frpc + proxy) AND delete the persisted descriptor, so
/// we never auto-reconnect after an explicit disconnect. Idempotent.
#[tauri::command]
pub async fn stop_local_bridge(app: AppHandle) -> Result<(), String> {
    // Same serializer: a stop must not race a concurrent start/reconnect, or it
    // could tear down a bridge the other op is mid-way through standing up.
    let _op = BRIDGE_OP.lock().await;
    stop_internal(&app)?;
    state::delete()
}

/// Current bridge status. Also delivered live via the `local-bridge-status`
/// event on every change.
#[tauri::command]
pub fn local_bridge_status() -> BridgeStatusPayload {
    match STATUS.lock() {
        Ok(g) => BridgeStatusPayload {
            status: g.kind,
            detail: g.detail.clone(),
        },
        // A poisoned status lock shouldn't wedge the UI — report offline.
        Err(_) => BridgeStatusPayload {
            status: BridgeStatusKind::Offline,
            detail: None,
        },
    }
}

fn resolve_frpc(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let resource_dir = app.path().resource_dir().ok();
    crate::child_guard::resolve_bundled_binary("frpc", resource_dir.as_ref(), "HOUSTON_FRPC_BIN")
}

/// Fall back to the origin's authority (`host:port`) as a label when the caller
/// gave no `appName`.
fn derive_app_name(origin: &str) -> String {
    origin
        .split_once("://")
        .map(|(_, rest)| rest)
        .unwrap_or(origin)
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derive_app_name_strips_scheme() {
        assert_eq!(derive_app_name("http://127.0.0.1:1234"), "127.0.0.1:1234");
        assert_eq!(derive_app_name("https://box:8443"), "box:8443");
        // No scheme → passthrough (origin_of guarantees a scheme in practice).
        assert_eq!(derive_app_name("weird"), "weird");
    }
}
