//! Loopback listener for the gateway's return from a desktop-started Slack
//! or LinkedIn connect (`routes.rs`).
//!
//! The `houston://settings/channels` deep link makes the browser ask "Open
//! Houston?" before it follows. A plain `http://127.0.0.1` redirect does not,
//! so the desktop binds a listener, names its port and a fresh `state` in the
//! connect request, and the gateway 303s the approving browser to
//! `/channels/slack?state=<state>&slack=<ticket>`. The ticket still reaches
//! only the browser that approved: nothing here polls the gateway.
//!
//! The binding, state check, pages, emit and focus are the sign-in listener's
//! (`oauth_loopback`), but nothing is shared with a sign-in attempt. The port
//! is OS-assigned rather than one of the fixed sign-in candidates, and attempts
//! live in their own registry keyed by id, so a Slack connect and a sign-in
//! never supersede or cancel each other. Slack attempts do not supersede one
//! another either: an earlier tab the person finishes still lands.

mod copy;
mod registry;
mod routes;

use tauri::{AppHandle, State};
use tokio::net::TcpListener;
use tokio::sync::oneshot;

use crate::oauth_loopback::listener::{spawn_listener, BoundSockets, ListenerTask};
use crate::oauth_loopback::state::ActiveListener;
use copy::{slack_pages, SlackReturnCopy};
pub use registry::ChannelsLoopbackState;
use routes::ReturnProvider;

/// The nonce shape the gateway accepts (`^[A-Za-z0-9_-]{16,128}$`). Checked
/// here too, so an empty `state` can never make `state=` an accepted redirect.
pub fn is_valid_state(state: &str) -> bool {
    (16..=128).contains(&state.len())
        && state
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

/// What `start_channels_loopback` hands back: the port the connect request
/// names, and the id `cancel_channels_loopback` acts on.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelsLoopbackStart {
    port: u16,
    attempt_id: u64,
}

/// `127.0.0.1` only: the gateway redirects to that literal address, so no
/// browser resolves a name to `::1` on the way back.
async fn bind_ephemeral() -> Result<BoundSockets, String> {
    let v4 = TcpListener::bind(("127.0.0.1", 0))
        .await
        .map_err(|e| format!("could not bind a connect return listener: {e}"))?;
    let port = v4
        .local_addr()
        .map_err(|e| format!("could not read the connect return port: {e}"))?
        .port();
    Ok(BoundSockets { v4, v6: None, port })
}

/// Bind a listener that waits up to twelve minutes for the gateway's redirect
/// carrying `expected_state`, then emits the settings link and focuses the
/// app. `provider` names the return (Slack's when absent); `copy` is the two
/// pages' text in the person's language.
#[tauri::command(rename_all = "snake_case")]
pub async fn start_channels_loopback(
    app: AppHandle,
    state: State<'_, ChannelsLoopbackState>,
    expected_state: String,
    copy: SlackReturnCopy,
    provider: Option<ReturnProvider>,
) -> Result<ChannelsLoopbackStart, String> {
    let route = provider.unwrap_or_default().route();
    if !is_valid_state(&expected_state) {
        return Err("The return state must be a 16-128 character nonce.".into());
    }
    let sockets = bind_ephemeral().await?;
    let port = sockets.port;
    let attempt_id = state.mint_id();
    let (cancel_tx, cancel_rx) = oneshot::channel::<()>();
    let (freed_tx, freed_rx) = oneshot::channel::<()>();
    // Registered before the task starts, so a listener that ends at once still
    // finds its own entry to release.
    state.insert(ActiveListener {
        id: attempt_id,
        cancel: cancel_tx,
        freed: freed_rx,
    })?;
    tracing::info!(
        "[{}] attempt {attempt_id} listening on 127.0.0.1:{port}",
        route.tag
    );
    spawn_listener(ListenerTask {
        app,
        route,
        pages: slack_pages(&copy),
        sockets,
        attempt_id,
        expected_state,
        cancel_rx,
        freed_tx,
    });
    Ok(ChannelsLoopbackStart { port, attempt_id })
}

/// Free a Slack listener whose connect never reached the browser. A no-op for
/// an id that already ended.
#[tauri::command(rename_all = "snake_case")]
pub fn cancel_channels_loopback(
    state: State<'_, ChannelsLoopbackState>,
    attempt_id: u64,
) -> Result<(), String> {
    match state.take(attempt_id)? {
        Some(listener) => {
            if listener.cancel.send(()).is_err() {
                tracing::debug!("[channels-loopback] cancel {attempt_id}: listener already ended");
            }
        }
        None => tracing::debug!("[channels-loopback] cancel {attempt_id}: no such listener"),
    }
    Ok(())
}

#[cfg(test)]
mod tests;
