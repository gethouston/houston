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
/// authorized redirect URI on BOTH desktop OAuth registrations: the Google
/// Desktop client (`http://127.0.0.1:<port>/auth/callback`, the loopback+PKCE
/// flow) and the Azure app's **Web** platform
/// (`http://localhost:<port>/auth/callback`, the GCIP-brokered flow — Entra
/// only allows `http` on the Web platform for `localhost`). We bind the first
/// free one (or, for the brokered flow, exactly the one its authorize URL was
/// minted for); the short list survives the rare case where another process
/// holds a port.
const CANDIDATE_PORTS: &[u16] = &[8975, 8976, 8977, 8978];

/// How long a new attempt waits for the superseded listener to actually release
/// its port. Short: on expiry we simply bind the next candidate port.
const SUPERSEDE_WAIT: Duration = Duration::from_secs(1);

/// Give up and free the socket if the browser never comes back (user closed
/// the consent tab, picked the wrong account and bailed, …). The frontend
/// calls `start_oauth_loopback` again for a fresh attempt.
const LISTEN_TIMEOUT: Duration = Duration::from_secs(300);

/// The sockets one attempt listens on. The redirect target may be spelled
/// `127.0.0.1` (Google) or `localhost` (the GCIP-brokered flow) — and a browser
/// resolving `localhost` may connect over IPv6 (`::1`) before falling back — so
/// every attempt binds BOTH loopback stacks on the same port. `v6` is `None`
/// only when this machine has no usable IPv6 loopback at all (bind refused for
/// a reason other than the port being taken).
pub struct BoundSockets {
    pub v4: TcpListener,
    pub v6: Option<TcpListener>,
    pub port: u16,
}

/// Outcome of trying to bind one exact port on both loopback stacks.
pub enum BindOutcome {
    Bound(BoundSockets),
    /// The port is held by another process on EITHER stack. A v6-only squatter
    /// still counts: a browser resolving `localhost` to `::1` would reach the
    /// squatter instead of us, silently eating the callback.
    Busy,
}

fn is_busy(e: &std::io::Error) -> bool {
    e.kind() == std::io::ErrorKind::AddrInUse
}

/// Bind `port` on `127.0.0.1` AND `::1`. `Busy` when either stack has the port
/// taken; errors only on a non-port failure of the required v4 bind.
pub async fn bind_exact(port: u16) -> Result<BindOutcome, String> {
    let v4 = match TcpListener::bind(("127.0.0.1", port)).await {
        Ok(l) => l,
        Err(e) if is_busy(&e) => return Ok(BindOutcome::Busy),
        Err(e) => return Err(format!("could not bind 127.0.0.1:{port}: {e}")),
    };
    let v6 = match TcpListener::bind(("::1", port)).await {
        Ok(l) => Some(l),
        Err(e) if is_busy(&e) => return Ok(BindOutcome::Busy),
        Err(e) => {
            // No IPv6 loopback on this machine — v4-only is fine: a browser
            // that can't connect `::1` falls back to `127.0.0.1`.
            tracing::info!("[oauth-loopback] no ::1 listener on port {port} ({e}); IPv4 only");
            None
        }
    };
    Ok(BindOutcome::Bound(BoundSockets { v4, v6, port }))
}

/// Everything one spawned listener task owns for the life of an attempt.
pub struct ListenerTask {
    pub app: AppHandle,
    pub sockets: BoundSockets,
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
        sockets,
        attempt_id,
        expected_state,
        cancel_rx,
        freed_tx,
    } = task;
    let port = sockets.port;
    tokio::spawn(async move {
        tokio::select! {
            _ = cancel_rx => {
                tracing::info!(
                    "[oauth-loopback] attempt {attempt_id} cancelled by client on port {port}; freeing port"
                );
            }
            result = tokio::time::timeout(
                LISTEN_TIMEOUT,
                serve_callback(&sockets, &app, &expected_state),
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
        drop(sockets);
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

/// Bind the first available candidate port on both loopback stacks.
pub async fn bind_first_free() -> Result<BoundSockets, String> {
    for &port in CANDIDATE_PORTS {
        match bind_exact(port).await? {
            BindOutcome::Bound(sockets) => return Ok(sockets),
            BindOutcome::Busy => tracing::warn!("[oauth-loopback] port {port} unavailable"),
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
        let sockets = bind_first_free().await.expect("a candidate is free");
        assert_ne!(sockets.port, CANDIDATE_PORTS[0]);
        assert!(CANDIDATE_PORTS.contains(&sockets.port));
        drop(sockets);
        drop(squatter);
    }

    #[tokio::test]
    async fn bind_exact_reports_a_squatted_port_as_busy() {
        // The brokered flow minted its authorize URL for ONE port, so a squat
        // must come back as `Busy` (step + re-mint), never as a bind of some
        // other port the provider would then refuse to redirect to.
        let squatter = TcpListener::bind(("127.0.0.1", CANDIDATE_PORTS[1])).await;
        let Ok(squatter) = squatter else {
            return;
        };
        match bind_exact(CANDIDATE_PORTS[1]).await.expect("no bind error") {
            BindOutcome::Busy => {}
            BindOutcome::Bound(_) => panic!("a squatted port must be Busy"),
        }
        drop(squatter);
    }

    #[tokio::test]
    async fn bind_exact_reports_a_v6_only_squatter_as_busy() {
        // A process holding only `[::1]:port` would receive the callbacks of
        // browsers that resolve `localhost` to IPv6 — the port is NOT usable.
        let squatter = TcpListener::bind(("::1", CANDIDATE_PORTS[2])).await;
        let Ok(squatter) = squatter else {
            return; // no IPv6 loopback on this machine; nothing to prove
        };
        match bind_exact(CANDIDATE_PORTS[2]).await.expect("no bind error") {
            BindOutcome::Busy => {}
            BindOutcome::Bound(_) => panic!("a v6-squatted port must be Busy"),
        }
        drop(squatter);
    }

    #[tokio::test]
    async fn bind_exact_listens_on_both_stacks() {
        let BindOutcome::Bound(sockets) = bind_exact(CANDIDATE_PORTS[3]).await.expect("bind")
        else {
            return; // the port is busy on this machine; nothing to prove
        };
        assert_eq!(sockets.port, CANDIDATE_PORTS[3]);
        // v4 is always required; v6 is best-effort but expected on CI machines.
        let v4 = tokio::net::TcpStream::connect(("127.0.0.1", sockets.port)).await;
        assert!(v4.is_ok(), "IPv4 loopback must accept");
        if sockets.v6.is_some() {
            let v6 = tokio::net::TcpStream::connect(("::1", sockets.port)).await;
            assert!(v6.is_ok(), "IPv6 loopback must accept when bound");
        }
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
