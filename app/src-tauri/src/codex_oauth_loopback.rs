//! One-shot localhost loopback listener for the OpenAI Codex OAuth redirect.
//!
//! OpenAI's Codex OAuth client has a SINGLE registered redirect URI —
//! `http://localhost:1455/auth/callback` — so unlike the Supabase sign-in
//! loopback (which picks the first free port from a small candidate list) this
//! listener MUST bind port 1455 exactly. There is no fallback: if 1455 is held
//! by another process the flow cannot complete, so we surface a clear error
//! instead of silently retrying elsewhere.
//!
//! On the callback we forward the RAW query string (`code=...&state=...`) to
//! the webview via the `codex-oauth://callback` Tauri event; the PKCE exchange
//! runs in JS exactly as it does for the browser relay. Then we serve a small
//! "you're connected" page, pull the app window to the front, and shut down.

use std::time::Duration;

use tauri::{AppHandle, Emitter};
use tokio::net::TcpListener;

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

/// Start a one-shot loopback listener on the fixed Codex redirect port. The
/// listener runs in a background task and shuts itself down after the first
/// callback (or the timeout). Returns `Err` immediately if the port can't be
/// bound so the frontend can toast the reason.
#[tauri::command(rename_all = "snake_case")]
pub async fn start_codex_oauth_loopback(app: AppHandle) -> Result<(), String> {
    let listener = TcpListener::bind(("127.0.0.1", CODEX_PORT))
        .await
        .map_err(|e| {
            format!(
                "Could not start the Codex sign-in listener: port {CODEX_PORT} is unavailable ({e}). \
                 OpenAI requires this exact port, so close whatever is using it and try again."
            )
        })?;
    tracing::info!(
        "[codex-oauth-loopback] listening on http://127.0.0.1:{CODEX_PORT}{CALLBACK_PATH}"
    );

    tokio::spawn(async move {
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

    Ok(())
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
}
