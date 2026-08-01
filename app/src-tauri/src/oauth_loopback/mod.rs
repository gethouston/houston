//! One-shot localhost loopback listener for the OAuth sign-in redirect.
//!
//! Replaces the gethouston.ai relay page for the **desktop** app. After
//! provider consent (Google / Microsoft), the identity provider 302-redirects
//! the user's system browser straight to
//! `http://127.0.0.1:<port>/auth/callback?code=...&state=...`. Because that's a
//! plain HTTP navigation (not a custom `houston://` scheme), the browser shows
//! NO "open this app?" dialog — it just loads the page. We then:
//!   1. check the `state` is OURS (a foreign one gets the stale page and we
//!      keep listening — see `callback.rs`),
//!   2. hand the query to the webview via the `auth://deep-link` event so the
//!      PKCE exchange + GCIP (Firebase) sign-in run in JS with the in-memory
//!      verifier (see `app/src/lib/identity/*`),
//!   3. serve a "you're signed in, return to Houston" page,
//!   4. pull the app window to the front — the old macOS deep-link path never
//!      did this, which is a big part of why users thought sign-in "hung",
//!   5. shut the listener down.
//!
//! PKCE puts the authorization code in the query string, which reaches the
//! server. (The implicit-flow `#access_token` fragment never leaves the
//! browser — but our clients use the authorization-code + PKCE flow, so the
//! code always arrives as `?code=`.)
//!
//! **Generation-scoped lifecycle.** `start_oauth_loopback` mints a monotonic
//! generation at command entry (so concurrent clicks are ordered by when the
//! USER made them, not by which coroutine finishes binding first), supersedes
//! the previous listener BEFORE binding and waits for its port to be released
//! (so a re-click reuses the same port instead of burning the next candidate —
//! four re-clicks used to exhaust the list for the rest of the run), and bails
//! out with `Superseded` if a newer generation overtakes it. It returns an
//! `attemptId`, and `cancel_oauth_loopback` acts only on a matching one, so an
//! abandoned attempt's fire-and-forget cancel can never kill the NEXT attempt's
//! port. Rust holds NO client secret and performs NO token exchange: that all
//! lives in TS.
//!
//! Web / mobile clients are NOT co-located with a local listener, so they use
//! the firebase-js-sdk popup instead (see `packages/web/src/identity/`).

mod callback;
mod listener;
mod pages;
mod state;

use tauri::{AppHandle, State};
use tokio::sync::oneshot;

use callback::CALLBACK_PATH;
use listener::{bind_first_free, spawn_listener, supersede, ListenerTask};
pub use state::OauthLoopbackState;
use state::{ActiveListener, Claim, Installed};

/// What `start_oauth_loopback` hands back to the frontend.
#[derive(serde::Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum LoopbackStart {
    /// A listener is bound and waiting for this attempt's redirect.
    #[serde(rename_all = "camelCase")]
    Listening {
        /// The `redirect_uri` the frontend gives the provider.
        redirect_uri: String,
        /// Identifies this listener; `cancel_oauth_loopback` only acts on a match.
        attempt_id: u64,
    },
    /// A NEWER sign-in click already owns the loopback, so this (older)
    /// invocation bound nothing and released anything it had. The frontend
    /// treats it as a benign supersession — no error, no session: the newer
    /// attempt is the one the user is actually watching.
    Superseded,
}

/// Start a one-shot loopback listener for the attempt whose CSRF `state` is
/// `expected_state`. The listener runs in a background task and shuts itself
/// down after OUR callback, a matching client cancel, or the timeout.
///
/// Concurrency is ordered by USER INITIATION: the generation is minted at
/// command entry, and any invocation overtaken by a newer click bails out with
/// `Superseded` rather than stealing the loopback back from it.
#[tauri::command(rename_all = "snake_case")]
pub async fn start_oauth_loopback(
    app: AppHandle,
    state: State<'_, OauthLoopbackState>,
    expected_state: String,
) -> Result<LoopbackStart, String> {
    // Mint the generation FIRST: it records when the user clicked, not which
    // coroutine happens to reach `install` last.
    let attempt_id = state.mint_id();

    // Claim before binding, and supersede the previous listener BEFORE binding.
    // Binding first meant the old listener still held its port, so every
    // re-click moved to the next candidate and the fourth had nowhere to go.
    match state.claim(attempt_id)? {
        Claim::Stale { current } => {
            tracing::info!(
                "[oauth-loopback] attempt {attempt_id} was superseded by {current} before binding"
            );
            return Ok(LoopbackStart::Superseded);
        }
        Claim::Won(Some(prev)) => supersede(prev).await,
        Claim::Won(None) => {}
    }

    let (listener, port) = bind_first_free().await?;
    let redirect_uri = format!("http://127.0.0.1:{port}{CALLBACK_PATH}");
    tracing::info!("[oauth-loopback] attempt {attempt_id} listening on {redirect_uri}");

    let (cancel_tx, cancel_rx) = oneshot::channel::<()>();
    let (freed_tx, freed_rx) = oneshot::channel::<()>();
    match state.install(ActiveListener {
        id: attempt_id,
        cancel: cancel_tx,
        freed: freed_rx,
    })? {
        Installed::Ok(Some(orphan)) => {
            // A concurrent OLDER start installed between our claim and ours.
            tracing::warn!(
                "[oauth-loopback] a concurrent attempt {} was superseded",
                orphan.id
            );
            supersede(orphan).await;
        }
        Installed::Ok(None) => {}
        Installed::Stale { newest } => {
            // A newer click claimed the loopback while we were binding. Free
            // the socket we just bound (dropping it releases the port) and tell
            // the frontend this attempt lost — never install it as current.
            tracing::info!(
                "[oauth-loopback] attempt {attempt_id} lost to {newest} while binding; releasing port {port}"
            );
            drop(listener);
            return Ok(LoopbackStart::Superseded);
        }
    }

    spawn_listener(ListenerTask {
        app,
        socket: listener,
        port,
        attempt_id,
        expected_state,
        cancel_rx,
        freed_tx,
    });

    Ok(LoopbackStart::Listening {
        redirect_uri,
        attempt_id,
    })
}

/// Free a loopback listener's port immediately. The frontend calls this when an
/// attempt is cancelled (the sign-in screen unmounts, the user signs out) or
/// times out, so an abandoned listener does not hold its port for the full 300s
/// self-timeout. A no-op unless `attempt_id` is still the bound listener — a
/// late cancel from an abandoned attempt must never free a NEWER attempt's port.
#[tauri::command(rename_all = "snake_case")]
pub fn cancel_oauth_loopback(
    state: State<'_, OauthLoopbackState>,
    attempt_id: u64,
) -> Result<(), String> {
    match state.take_matching(attempt_id)? {
        Some(listener) => {
            if listener.cancel.send(()).is_err() {
                tracing::debug!("[oauth-loopback] cancel {attempt_id}: listener already ended");
            }
        }
        None => tracing::debug!(
            "[oauth-loopback] cancel {attempt_id}: not the current listener; ignored"
        ),
    }
    Ok(())
}
