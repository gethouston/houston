//! One-shot localhost loopback listener for the OAuth sign-in redirect.
//!
//! Replaces the gethouston.ai relay page for the **desktop** app. After
//! Google consent, Supabase 302-redirects the user's system browser straight
//! to `http://127.0.0.1:<port>/auth/callback?code=...`. Because that's a
//! plain HTTP navigation (not a custom `houston://` scheme), the browser
//! shows NO "open this app?" dialog — it just loads the page. We then:
//!   1. capture the `?code=...` query,
//!   2. hand it to the webview via the existing `auth://deep-link` event so
//!      the PKCE exchange runs in JS with the Keychain-stored verifier,
//!      exactly as the `houston://` deep-link path did,
//!   3. serve a small "you're signed in, return to Houston" page,
//!   4. pull the app window to the front — the macOS deep-link path never
//!      did this, which is a big part of why users thought sign-in "hung",
//!   5. shut the listener down.
//!
//! PKCE puts the authorization code in the query string, which reaches the
//! server. (The implicit-flow `#access_token` fragment never leaves the
//! browser — but our client is configured `flowType: "pkce"`, so the code
//! always arrives as `?code=`.)
//!
//! Web / mobile-PWA clients are NOT co-located with a local listener, so
//! they keep using the https relay bridge (see `app/src/lib/auth.ts`).

use std::time::Duration;

use tauri::AppHandle;
use tokio::net::TcpListener;

use crate::loopback_util::{read_request_target, split_target, write_response};

/// Loopback ports we try, in order. EVERY port here must be registered in
/// the Supabase project's redirect allow-list as
/// `http://127.0.0.1:<port>/auth/callback`, or the browser redirect is
/// rejected before it ever reaches us. We bind the first free one; the short
/// list survives the rare case where another process holds a port.
const CANDIDATE_PORTS: &[u16] = &[8975, 8976, 8977, 8978];

/// Path Supabase redirects to. Kept narrow so a stray request to `/` or
/// `/favicon.ico` isn't mistaken for the callback.
const CALLBACK_PATH: &str = "/auth/callback";

/// Give up and free the socket if the browser never comes back (user closed
/// the consent tab, picked the wrong account and bailed, …). The frontend
/// calls `start_oauth_loopback` again for a fresh attempt.
const LISTEN_TIMEOUT: Duration = Duration::from_secs(300);

/// Start a one-shot loopback listener and return the redirect URI the
/// frontend hands to Supabase as `redirectTo`. The listener runs in a
/// background task and shuts itself down after the first callback (or the
/// timeout).
#[tauri::command(rename_all = "snake_case")]
pub async fn start_oauth_loopback(app: AppHandle) -> Result<String, String> {
    let (listener, port) = bind_first_free().await?;
    let redirect_uri = format!("http://127.0.0.1:{port}{CALLBACK_PATH}");
    tracing::info!("[oauth-loopback] listening on {redirect_uri}");

    tokio::spawn(async move {
        match tokio::time::timeout(LISTEN_TIMEOUT, serve_callback(&listener, &app)).await {
            Ok(Ok(())) => {}
            // The listener is a background task: the `start_oauth_loopback`
            // command already returned, so there's no Result left to bubble
            // up to a toast. This is the documented event-callback exception
            // to the no-silent-failure rule. The user-visible safety nets are
            // the `houston://` deep-link fallback and the SignInScreen retry.
            Ok(Err(e)) => tracing::error!("[oauth-loopback] listener error: {e}"),
            Err(_) => tracing::info!(
                "[oauth-loopback] timed out after {}s with no callback; freeing port",
                LISTEN_TIMEOUT.as_secs()
            ),
        }
    });

    Ok(redirect_uri)
}

/// Bind the first available candidate port on the loopback interface.
async fn bind_first_free() -> Result<(TcpListener, u16), String> {
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
                tracing::warn!("[oauth-loopback] unreadable request: {e}");
                let _ = write_response(&mut stream, "400 Bad Request", "Bad request").await;
                continue;
            }
        };

        let (path, query) = split_target(&target);

        if path != CALLBACK_PATH {
            let _ = write_response(&mut stream, "404 Not Found", "Not found").await;
            continue;
        }

        // Hand the code to the webview through the SAME event the `houston://`
        // deep link uses, so the JS PKCE exchange is unchanged.
        let deep_link = format!("houston://auth-callback?{query}");
        crate::auth::emit_deep_link(app, &deep_link);

        let _ = write_response(&mut stream, "200 OK", SUCCESS_PAGE).await;

        crate::window_focus::bring_to_front(app);

        return Ok(());
    }
}

/// Self-contained success page — the loopback serves no other assets, so the
/// Houston helmet is inlined as SVG (no `<img src>` to 404) and the "Open
/// Houston" button is a `houston://open` deep link that focuses the app
/// (handled in `lib.rs`). Copy matches the English-only sign-in flow; when
/// that flow gets i18n this page's strings move with it.
///
/// Uses the `r##"…"##` delimiter because the inlined SVG contains
/// `fill="#161615"` — the `"#` sequence would close a plain `r#"…"#`.
const SUCCESS_PAGE: &str = r##"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Houston — Signed in</title>
  <style>
    :root { color-scheme: light; }
    body {
      font-family: ui-sans-serif, -apple-system, system-ui, sans-serif;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; margin: 0; background: #fafafa; color: #0d0d0d;
    }
    .card { text-align: center; padding: 60px 40px; max-width: 420px; }
    .logo { width: 44px; height: auto; margin: 0 auto 24px; display: block; }
    h1 { font-size: 22px; font-weight: 600; margin: 0 0 12px; letter-spacing: -0.01em; }
    p { font-size: 14px; color: #555; margin: 0 0 24px; line-height: 1.5; }
    a.btn {
      display: inline-block; padding: 10px 24px; border-radius: 999px;
      background: #0d0d0d; color: #fff; text-decoration: none;
      font-size: 14px; font-weight: 500;
    }
    a.btn:hover { opacity: 0.9; }
  </style>
</head>
<body>
  <main class="card">
    <svg class="logo" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 412.248 448.898" role="img" aria-label="Houston">
      <defs>
        <clipPath id="clip-path">
          <rect width="412.248" height="448.898" fill="none"/>
        </clipPath>
      </defs>
      <g clip-path="url(#clip-path)">
        <path d="M54.438,370.05a372.979,372.979,0,0,0,36.546,16.539c42.934,16.457,81.036,26.955,127.045,32.718,38.952,4.879,98.013,6.119,133.934-9.694l.22-28.709,10.9-4.2.1,7.633c.131,9.532,10.175,10.024,10.111,16.564l-.19,19.454a10.892,10.892,0,0,1-5.271,8.79A125.921,125.921,0,0,1,333.1,442.267c-27.35,5.945-54.827,7.61-83.009,6.115A501.786,501.786,0,0,1,135.308,429.09C98.277,418.317,63.295,404.2,30.364,384.378c-1.82-1.1-4.62-4.1-4.586-5.833l.486-25.225,11.07-8.41c1.485-34.5-.533-22.947-14.764-49.9-27.447-52-29.2-106.518-8.847-163.015,9.56,20.2,21.153,38.25,37.42,52.877C37.675,162.726,27.2,139.979,22.078,114.644,58.63,40.233,137.3-5.66,220.15.562c51,3.831,94.258,25.571,130.394,61.982-11.956-3.184-22.192-5.554-33.74-6.752C275.709,24.666,227.275,10.9,176.055,19.538c-20.923,3.528-34,6.957-50.682,16.877L139.5,33.929l15.86-2.793c8.528-1.5,24.632-1.04,33.836-.192,22.661,2.088,53.554,13.706,71.674,28.987-12.6,3.789-24.839,7.031-37.177,12.526C168.9,96.859,123.836,137.377,92.651,188.4c-7.872-2.92-15.5-4.417-23.465-2.461,29.782,6.032,38.956,41.129,31.8,67.976-2.394,8.985-7.428,16.16-14.663,22.377a346.506,346.506,0,0,0,147.25,97.184l12.006,21.237c1.847,3.267.35,10.053.346,14.518C191.213,405.71,137.381,395,88.063,371.576L54.751,355.753a55.521,55.521,0,0,0-.313,14.3m15.8-103.638c8.757-2.088,12.715-9.164,15.688-16.5,3.95-12.971,2.434-27.431-5.321-38.706-5.394-7.843-14.789-12.194-23.84-9.339A20.8,20.8,0,0,0,43.4,214.587c8.355-7.946,19.246-8.317,27.089-.185,12.642,13.106,13.272,37.962-.251,52.01M56.2,335.674c19.3,9.688,37.093,17.6,57.609,25.556l.46-40.938c.063-5.627-7.1-8.159-10.894-7.39-13.274,2.69-5.888,17.088-7.963,29.218L55.617,322.693c-1,4.557-1.287,9.423.582,12.981m139.579,48.288c1.144-4.393,1.22-8.69-.783-11.451a512.739,512.739,0,0,1-66.018-17.972,16.313,16.313,0,0,0-.129,12.157c8.276,2.7,16.239,5.339,24.7,7.329Z" fill="#161615"/>
        <path d="M325.964,373.522c-78.683,7.33-171.286-41.71-224.763-98.653,20.982-21.383,19.582-56.385,1.375-79.483,14.126-22.058,29.682-42,48.543-59.74C194.08,95.233,252.771,65.207,312.936,67.539c31.512,1.812,71.082,11.318,70.475,49.792a215.176,215.176,0,0,1,7.448,201.107c3.547,38.249-33.525,51.774-64.9,55.084m-156.623-69.56c44.588,29.3,106.347,54.129,159.883,46.515,8.458-1.2,16.5-3.934,24.588-6.324,5-1.476,7.137-5.17,9.631-9.01,48.185-74.159,42.9-170.662-13.764-238.39C301.111,78.61,245.166,94.247,202.936,121.54c-16.981,10.974-32.909,23.164-46.245,38.481-14.795,16.993-20.759,39.234-21.865,61.356-1.175,23.493,5.307,45.09,17.461,64.8a53.6,53.6,0,0,0,17.054,17.788" fill="#161615"/>
        <path d="M298.533,409.094c-4.467.414-7.883-1.707-9.4-5.237a12.287,12.287,0,0,1,1.075-10.992c1.473-2.484,5.351-4.9,8.887-5.18l31.941-2.488a8.616,8.616,0,0,1,9.262,6.052c.913,3.365.494,9.3-3.5,10.617-12.359,4.06-24.719,5.973-38.264,7.228" fill="#161615"/>
        <rect width="15.334" height="16.211" transform="translate(258.6 409.939) rotate(-89.717)" fill="#161615"/>
        <path d="M370.408,283.292c-6.086,17.577-13.539,33.4-26.392,47.208,26.021-57.679,30.288-124.219,4.132-182.266-6.661-14.783-15.007-27.347-24.809-41.076,5.144.8,12.975.86,16.972,4.164,7.836,6.477,12.518,15.527,17.384,24.5,24.5,45.2,29.763,98.227,12.713,147.465" fill="#161615"/>
      </g>
    </svg>
    <h1>You're signed in</h1>
    <p>You can close this tab and return to Houston.</p>
    <a class="btn" href="houston://open">Open Houston</a>
  </main>
</body>
</html>"##;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_callback_target_with_query() {
        // Mirror what `serve_callback` does with a request line's target.
        let target = "/auth/callback?code=abc123&state=xyz";
        let (path, query) = target.split_once('?').unwrap();
        assert_eq!(path, CALLBACK_PATH);
        assert_eq!(query, "code=abc123&state=xyz");
    }

    #[test]
    fn non_callback_path_is_rejected() {
        let target = "/favicon.ico";
        let (path, _) = match target.split_once('?') {
            Some((p, q)) => (p, q),
            None => (target, ""),
        };
        assert_ne!(path, CALLBACK_PATH);
    }

    #[test]
    fn success_page_is_self_contained() {
        // The helmet is inlined SVG and there's no raster `<img>`, so nothing
        // gets fetched from the loopback (which serves only this one page).
        assert!(SUCCESS_PAGE.contains("<svg"));
        assert!(!SUCCESS_PAGE.contains("<img"));
    }

    #[test]
    fn success_page_has_open_houston_deep_link() {
        // The "Open Houston" button focuses the app via the `houston://`
        // scheme (handled in lib.rs), not an http URL.
        assert!(SUCCESS_PAGE.contains(r#"href="houston://open""#));
    }
}
