//! Binding and superseding the native listener socket.
//!
//! Split from `mod.rs` so that file stays the two Tauri commands. The ordering
//! here is the fix for "every re-click burns the next port": the previous
//! listener is cancelled and WAITED ON before we bind, so a re-click reuses the
//! same port instead of stepping down the candidate list (four re-clicks used to
//! exhaust it for the rest of the run).

use std::time::Duration;

use tauri::{AppHandle, Manager};
use tokio::net::TcpListener;
use tokio::sync::oneshot;

use super::callback::serve_callback;
use super::state::{ActiveListener, OauthLoopbackState};

/// Loopback ports we try, in order. EVERY port here must be registered as an
/// authorized redirect URI on the **Desktop OAuth client**
/// (`http://127.0.0.1:<port>/auth/callback`), or the browser redirect is
/// rejected before it ever reaches us. We bind the first free one; the short
/// list survives the rare case where another process holds a port.
const CANDIDATE_PORTS: &[u16] = &[8975, 8976, 8977, 8978];

/// How long a new attempt waits for the superseded listener to actually release
/// its port. Short: on expiry we simply bind the next candidate port.
const SUPERSEDE_WAIT: Duration = Duration::from_secs(1);

/// Give up and free the socket if the browser never comes back (user closed
/// the consent tab, picked the wrong account and bailed, …). The frontend
/// calls `start_oauth_loopback` again for a fresh attempt.
const LISTEN_TIMEOUT: Duration = Duration::from_secs(300);

/// Everything one spawned listener task owns for the life of an attempt.
pub struct ListenerTask {
    pub app: AppHandle,
    pub socket: TcpListener,
    pub port: u16,
    pub attempt_id: u64,
    pub expected_state: String,
    pub cancel_rx: oneshot::Receiver<()>,
    pub freed_tx: oneshot::Sender<()>,
}

/// Run one attempt's listener in the background until its callback arrives, the
/// client cancels it, or it times out — then release the port and announce it.
pub fn spawn_listener(task: ListenerTask) {
    let ListenerTask {
        app,
        socket,
        port,
        attempt_id,
        expected_state,
        cancel_rx,
        freed_tx,
    } = task;
    tokio::spawn(async move {
        tokio::select! {
            _ = cancel_rx => {
                tracing::info!(
                    "[oauth-loopback] attempt {attempt_id} cancelled by client on port {port}; freeing port"
                );
            }
            result = tokio::time::timeout(
                LISTEN_TIMEOUT,
                serve_callback(&socket, &app, &expected_state),
            ) => {
                match result {
                    Ok(Ok(())) => {}
                    // The listener is a background task: the `start_oauth_loopback`
                    // command already returned, so there's no Result left to bubble
                    // up to a toast. This is the documented event-callback exception
                    // to the no-silent-failure rule. The user-visible safety net is
                    // the SignInScreen retry.
                    Ok(Err(e)) => tracing::error!("[oauth-loopback] listener error: {e}"),
                    Err(_) => tracing::info!(
                        "[oauth-loopback] attempt {attempt_id} timed out after {}s on port {port} with no callback; freeing port",
                        LISTEN_TIMEOUT.as_secs()
                    ),
                }
            }
        }
        // Release the port BEFORE announcing it: a superseding start is waiting
        // on `freed` so it can rebind this very port.
        drop(socket);
        // Leave the registry pointing at nothing rather than at a task that has
        // exited — but only if it still points at US (a newer generation may
        // have taken the slot already).
        if let Err(e) = app.state::<OauthLoopbackState>().clear_if(attempt_id) {
            tracing::error!("[oauth-loopback] could not clear the listener slot: {e}");
        }
        if freed_tx.send(()).is_err() {
            tracing::debug!("[oauth-loopback] nobody was waiting on attempt {attempt_id}'s port");
        }
    });
}

/// Cancel a superseded listener and wait (briefly) for it to release its port,
/// so the next bind can reuse the SAME port.
pub async fn supersede(prev: ActiveListener) {
    let id = prev.id;
    if prev.cancel.send(()).is_err() {
        tracing::debug!("[oauth-loopback] attempt {id} had already ended");
        return;
    }
    match tokio::time::timeout(SUPERSEDE_WAIT, prev.freed).await {
        Ok(Ok(())) => tracing::info!("[oauth-loopback] attempt {id} superseded; its port is free"),
        Ok(Err(_)) => tracing::debug!("[oauth-loopback] attempt {id} ended without signalling"),
        Err(_) => tracing::warn!(
            "[oauth-loopback] attempt {id} did not free its port within {}s; binding another",
            SUPERSEDE_WAIT.as_secs()
        ),
    }
}

/// Bind the first available candidate port on the loopback interface.
pub async fn bind_first_free() -> Result<(TcpListener, u16), String> {
    for &port in CANDIDATE_PORTS {
        match TcpListener::bind(("127.0.0.1", port)).await {
            Ok(listener) => return Ok((listener, port)),
            Err(e) => tracing::warn!("[oauth-loopback] port {port} unavailable: {e}"),
        }
    }
    Err(format!(
        "Could not start the sign-in listener: all loopback ports {CANDIDATE_PORTS:?} are in use."
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn bind_first_free_steps_past_a_squatted_port() {
        // Another process holding 8975 must not fail the sign-in: we fall
        // through to the next registered redirect URI.
        let squatter = TcpListener::bind(("127.0.0.1", CANDIDATE_PORTS[0])).await;
        let Ok(squatter) = squatter else {
            return; // the port is already busy on this machine; nothing to prove
        };
        let (listener, port) = bind_first_free().await.expect("a candidate is free");
        assert_ne!(port, CANDIDATE_PORTS[0]);
        assert!(CANDIDATE_PORTS.contains(&port));
        drop(listener);
        drop(squatter);
    }

    #[tokio::test]
    async fn supersede_returns_once_the_previous_listener_signals_freed() {
        let (cancel, cancel_rx) = tokio::sync::oneshot::channel::<()>();
        let (freed_tx, freed) = tokio::sync::oneshot::channel::<()>();
        tokio::spawn(async move {
            // Stand in for the listener task: wake on cancel, then announce.
            let _ = cancel_rx.await;
            freed_tx.send(()).expect("supersede is waiting");
        });
        supersede(ActiveListener {
            id: 1,
            cancel,
            freed,
        })
        .await;
    }

    #[tokio::test]
    async fn supersede_returns_immediately_when_the_listener_already_ended() {
        let (cancel, cancel_rx) = tokio::sync::oneshot::channel::<()>();
        let (_freed_tx, freed) = tokio::sync::oneshot::channel::<()>();
        drop(cancel_rx); // the task is gone; the cancel send fails
        supersede(ActiveListener {
            id: 1,
            cancel,
            freed,
        })
        .await;
    }
}
