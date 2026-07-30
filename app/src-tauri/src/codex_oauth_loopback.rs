//! One-shot localhost loopback listener for the OpenAI Codex OAuth redirect.
//!
//! OpenAI's Codex OAuth client has a SINGLE registered redirect URI —
//! `http://localhost:1455/auth/callback` — so unlike the GCIP sign-in
//! loopback (which picks the first free port from a small candidate list) this
//! listener MUST bind port 1455 exactly. There is no fallback: if 1455 is held
//! by another process the flow cannot complete, so we surface a clear error
//! instead of silently retrying elsewhere.
//!
//! On the callback we forward the RAW query string (`code=...&state=...`) to
//! the webview via the `codex-oauth://callback` Tauri event; the PKCE exchange
//! runs in JS exactly as it does for the browser relay. Then we serve a small
//! "you're connected" page, pull the app window to the front, and shut down.

use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Emitter};
use tokio::net::TcpListener;
use tokio::task::JoinHandle;

use crate::loopback_util::{read_request_target, split_target, write_response};

/// OpenAI's registered redirect port. FIXED — the redirect URI is baked into
/// the Codex OAuth client, so we cannot choose another.
const CODEX_PORT: u16 = 1455;

/// Path OpenAI redirects to. Kept narrow so a stray `/` or `/favicon.ico`
/// probe isn't mistaken for the callback.
const CALLBACK_PATH: &str = "/auth/callback";

/// Tauri event the webview listens on to receive the raw callback query.
const CALLBACK_EVENT: &str = "codex-oauth://callback";

/// Give up and free the socket if the browser never comes back (user closed
/// the consent tab, bailed on the login, …). The frontend calls
/// `start_codex_oauth_loopback` again for a fresh attempt.
const LISTEN_TIMEOUT: Duration = Duration::from_secs(300);

/// The live listener task, if any. A retry click within the previous attempt's
/// 5-minute window used to find port 1455 still held by our OWN one-shot
/// listener and fail with "close whatever is using it" (Sentry issue
/// 7639120568) — the abandoned listener had no teardown short of its timeout.
/// A new start now aborts the previous task (dropping its socket) and rebinds,
/// so the latest click always gets a fresh listener and a fresh window.
static ACTIVE_LISTENER: Mutex<Option<JoinHandle<()>>> = Mutex::new(None);

/// How long to keep retrying the bind while an aborted predecessor's socket is
/// being dropped by the runtime. A genuinely foreign squatter (a real Codex
/// CLI mid-login) still errors, just ~half a second later.
const BIND_RETRIES: u32 = 20;
const BIND_RETRY_DELAY: Duration = Duration::from_millis(25);

/// Start a one-shot loopback listener on the fixed Codex redirect port,
/// replacing any listener a previous (abandoned) attempt left running. The
/// listener runs in a background task and shuts itself down after the first
/// callback (or the timeout). Returns `Err` if the port is held by another
/// process so the frontend can toast the reason.
#[tauri::command(rename_all = "snake_case")]
pub async fn start_codex_oauth_loopback(app: AppHandle) -> Result<(), String> {
    abort_active_listener();
    let listener = bind_codex_port(CODEX_PORT).await?;
    tracing::info!(
        "[codex-oauth-loopback] listening on http://127.0.0.1:{CODEX_PORT}{CALLBACK_PATH}"
    );

    let handle = tokio::spawn(async move {
        match tokio::time::timeout(LISTEN_TIMEOUT, serve_callback(&listener, &app)).await {
            Ok(Ok(())) => {}
            // The listener is a background task: the command already returned,
            // so there's no Result left to bubble up to a toast. This is the
            // documented event-callback exception to the no-silent-failure
            // rule (no UI thread here). The frontend's retry is the safety net.
            Ok(Err(e)) => tracing::error!("[codex-oauth-loopback] listener error: {e}"),
            Err(_) => tracing::error!(
                "[codex-oauth-loopback] timed out after {}s with no callback; freeing port",
                LISTEN_TIMEOUT.as_secs()
            ),
        }
    });
    *ACTIVE_LISTENER.lock().unwrap() = Some(handle);

    Ok(())
}

/// Abort the previous attempt's listener task, if one is still running.
/// Aborting a task that already finished (callback served / timed out) is a
/// no-op, so this needs no liveness check.
fn abort_active_listener() {
    if let Some(prev) = ACTIVE_LISTENER.lock().unwrap().take() {
        prev.abort();
    }
}

/// Bind the fixed redirect port, absorbing the short window in which an
/// aborted predecessor's socket is still being torn down. Every retry
/// exhausted means a foreign process owns the port for real.
async fn bind_codex_port(port: u16) -> Result<TcpListener, String> {
    let mut last_err = None;
    for attempt in 0..BIND_RETRIES {
        if attempt > 0 {
            tokio::time::sleep(BIND_RETRY_DELAY).await;
        }
        match TcpListener::bind(("127.0.0.1", port)).await {
            Ok(listener) => return Ok(listener),
            Err(e) => last_err = Some(e),
        }
    }
    let e = last_err.expect("BIND_RETRIES > 0 guarantees an error was recorded");
    Err(format!(
        "Could not start the Codex sign-in listener: port {port} is unavailable ({e}). \
         OpenAI requires this exact port, so close other AI coding tools \
         (or wait a few minutes) and try again."
    ))
}

/// Accept connections until one hits the callback path, then handle it and
/// return. Non-callback probes (favicon, etc.) get a 404 and we keep waiting.
async fn serve_callback(listener: &TcpListener, app: &AppHandle) -> Result<(), String> {
    loop {
        let (mut stream, _) = listener
            .accept()
            .await
            .map_err(|e| format!("accept failed: {e}"))?;

        let target = match read_request_target(&mut stream).await {
            Ok(t) => t,
            Err(e) => {
                tracing::warn!("[codex-oauth-loopback] unreadable request: {e}");
                let _ = write_response(&mut stream, "400 Bad Request", "Bad request").await;
                continue;
            }
        };

        let (path, query) = split_target(&target);

        if path != CALLBACK_PATH {
            let _ = write_response(&mut stream, "404 Not Found", "Not found").await;
            continue;
        }

        // Forward the raw query verbatim; the JS side owns parsing + the PKCE
        // exchange. Emitting is fallible but there's no user action left to
        // toast against here, so a failure is logged, not surfaced.
        if let Err(e) = app.emit(CALLBACK_EVENT, query.to_string()) {
            tracing::error!("[codex-oauth-loopback] failed to emit callback event: {e}");
        }

        let _ = write_response(&mut stream, "200 OK", SUCCESS_PAGE).await;

        crate::window_focus::bring_to_front(app);

        return Ok(());
    }
}

/// Self-contained success page — the loopback serves no other assets, so there
/// are no external references to 404. Copy matches the English-only connect
/// flow.
const SUCCESS_PAGE: &str = r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Houston — Connected</title>
  <style>
    :root { color-scheme: light; }
    body {
      font-family: ui-sans-serif, -apple-system, system-ui, sans-serif;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; margin: 0; background: #fafafa; color: #0d0d0d;
    }
    .card { text-align: center; padding: 60px 40px; max-width: 420px; }
    h1 { font-size: 22px; font-weight: 600; margin: 0 0 12px; letter-spacing: -0.01em; }
    p { font-size: 14px; color: #555; margin: 0; line-height: 1.5; }
  </style>
</head>
<body>
  <main class="card">
    <h1>You're connected</h1>
    <p>You can close this tab and return to Houston.</p>
  </main>
</body>
</html>"#;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn callback_path_matches_and_query_is_extracted() {
        // Mirror what `serve_callback` does with a request line's target.
        let target = "/auth/callback?code=abc123&state=xyz";
        let (path, query) = split_target(target);
        assert_eq!(path, CALLBACK_PATH);
        assert_eq!(query, "code=abc123&state=xyz");
    }

    #[test]
    fn non_callback_path_is_a_404_and_keeps_listening() {
        // `/favicon.ico` and friends must not be mistaken for the callback;
        // `serve_callback` writes a 404 and continues the accept loop.
        let (path, _) = split_target("/favicon.ico");
        assert_ne!(path, CALLBACK_PATH);
    }

    #[test]
    fn callback_with_no_query_yields_empty_string() {
        // A bare `/auth/callback` (no `?`) still matches the path; the query
        // is empty rather than panicking, and the empty payload is emitted.
        let (path, query) = split_target("/auth/callback");
        assert_eq!(path, CALLBACK_PATH);
        assert_eq!(query, "");
    }

    #[test]
    fn success_page_is_self_contained() {
        // The loopback serves only this one page, so nothing may be fetched.
        assert!(!SUCCESS_PAGE.contains("<img"));
        assert!(!SUCCESS_PAGE.contains("src="));
    }

    #[tokio::test]
    async fn bind_fails_with_actionable_error_when_a_foreign_process_holds_the_port() {
        // A real squatter (e.g. an actual Codex CLI mid-login) never releases
        // the port, so the retry loop must exhaust and surface the remedy.
        // Ephemeral port: tests must never touch the real 1455.
        let squatter = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let port = squatter.local_addr().unwrap().port();

        let err = bind_codex_port(port).await.unwrap_err();
        assert!(err.contains("close other AI coding tools"), "err: {err}");
        assert!(err.contains(&port.to_string()), "err: {err}");
    }

    #[tokio::test]
    async fn bind_succeeds_after_the_previous_listener_task_is_aborted() {
        // The Sentry-7639120568 shape: a prior sign-in attempt's one-shot
        // listener still owns the port when the user retries. Aborting the old
        // task and rebinding must succeed within the retry window — the abort
        // drops the socket asynchronously, which is exactly the latency the
        // bind retries exist to absorb.
        let holder = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let port = holder.local_addr().unwrap().port();
        let task = tokio::spawn(async move {
            // Hold the socket like an abandoned serve_callback would.
            let _ = holder.accept().await;
        });

        // Sanity: while the task lives, the port really is taken.
        assert!(TcpListener::bind(("127.0.0.1", port)).await.is_err());

        task.abort();
        let rebound = bind_codex_port(port).await.expect("rebind after abort");
        assert_eq!(rebound.local_addr().unwrap().port(), port);
    }
}
