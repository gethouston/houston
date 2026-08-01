//! Serving the browser redirect: decide whether a request on the callback path
//! belongs to THIS attempt, and if so hand it to the webview.
//!
//! The listener used to be consumed by ANY request to `/auth/callback`. A
//! browser restoring an old consent tab therefore replayed a months-dead
//! redirect, ate the one-shot listener, and the real redirect that followed
//! found a dead port — the sign-in then sat silent for the full 300s. The
//! attempt's CSRF `state` is now handed down here so a foreign callback is
//! answered with the "stale tab" page and the listener KEEPS WAITING.

use tauri::AppHandle;
use tokio::net::TcpListener;

use super::pages::{stale_page, success_page};
use crate::loopback_util::{read_request_target, split_target, write_response};

/// Path the provider redirects to. Kept narrow so a stray request to `/` or
/// `/favicon.ico` isn't mistaken for the callback.
pub const CALLBACK_PATH: &str = "/auth/callback";

/// What to do with a request that hit the callback path.
#[derive(Debug, PartialEq, Eq)]
pub enum CallbackDecision {
    /// It is ours: emit it to the webview and shut the listener down.
    Accept,
    /// It carries somebody else's `state` (a restored tab replaying an old
    /// redirect). Tell that tab it is stale and keep waiting for ours.
    Stale,
}

/// Read one `key=value` out of a raw query string.
pub fn query_param<'a>(query: &'a str, key: &str) -> Option<&'a str> {
    query.split('&').find_map(|pair| {
        let (k, v) = pair.split_once('=')?;
        if k == key {
            Some(v)
        } else {
            None
        }
    })
}

/// Decide a callback by its `state` parameter.
///
/// **A missing `state` is treated exactly like a mismatched one.** No legitimate
/// loopback callback is state-less: `runLoopbackAuthorize` always puts `state`
/// on the authorize URL, and both providers that use this listener echo it back
/// on success AND on their error redirects (Google and Microsoft are OAuth 2.0
/// authorization-code + PKCE clients, and RFC 6749 §4.1.2.1 requires the `state`
/// to be echoed on the error response too). The one flow that omits it — Apple —
/// never touches this listener at all: GCIP brokers it through the gateway and it
/// returns as a `houston://auth-callback` OS deep link.
///
/// So a state-less request is a probe or an attack, and accepting it let a bare
/// `curl 127.0.0.1:8975/auth/callback?code=x` consume the one-shot listener and
/// stall the user's real sign-in for the full 300s. TS enforces the same rule
/// from the other side (`oauth-callback.ts` rejects a state-less payload), so
/// accepting here could only ever kill the listener for nothing.
///
/// Our `state` is base64url (`generateState`), so a raw string compare is exact —
/// no percent-decoding can apply to it.
pub fn decide(query: &str, expected_state: &str) -> CallbackDecision {
    match query_param(query, "state") {
        Some(state) if state == expected_state => CallbackDecision::Accept,
        _ => CallbackDecision::Stale,
    }
}

/// Build the `auth://deep-link` event payload the webview parses. The synthetic
/// `houston://auth-callback?<query>` shape is kept for parity with the TS
/// callback parser (`identity/oauth-callback.ts`), which reads `code`/`state`
/// off it. This is NOT an OS deep link — just the event payload string.
pub fn callback_deep_link(query: &str) -> String {
    format!("houston://auth-callback?{query}")
}

/// Write a response, logging (never propagating) a write failure: the browser
/// may have closed the socket already, and the sign-in outcome does not depend
/// on the page rendering. This is the documented event-callback exception to
/// the no-silent-failure rule — there is no UI thread here to toast on.
async fn respond(stream: &mut tokio::net::TcpStream, status: &str, body: &str) {
    if let Err(e) = write_response(stream, status, body).await {
        tracing::warn!("[oauth-loopback] could not write the {status} response: {e}");
    }
}

/// Accept connections until one carries THIS attempt's callback, then handle it
/// and return. Non-callback probes (favicon, etc.) get a 404 and stale callbacks
/// get the stale page; in both cases we keep waiting.
pub async fn serve_callback(
    listener: &TcpListener,
    app: &AppHandle,
    expected_state: &str,
) -> Result<(), String> {
    loop {
        let (mut stream, _) = listener
            .accept()
            .await
            .map_err(|e| format!("accept failed: {e}"))?;

        let target = match read_request_target(&mut stream).await {
            Ok(t) => t,
            Err(e) => {
                tracing::warn!("[oauth-loopback] unreadable request: {e}");
                respond(&mut stream, "400 Bad Request", "Bad request").await;
                continue;
            }
        };

        let (path, query) = split_target(&target);

        if path != CALLBACK_PATH {
            respond(&mut stream, "404 Not Found", "Not found").await;
            continue;
        }

        if decide(query, expected_state) == CallbackDecision::Stale {
            tracing::warn!(
                "[oauth-loopback] ignoring a callback whose state belongs to an older attempt; still listening"
            );
            respond(&mut stream, "200 OK", &stale_page()).await;
            continue;
        }

        // Hand the code to the webview through the `auth://deep-link` event so
        // the JS PKCE exchange + GCIP sign-in run with the in-memory verifier.
        crate::auth::emit_deep_link(app, &callback_deep_link(query));

        respond(&mut stream, "200 OK", &success_page()).await;

        crate::window_focus::bring_to_front(app);

        return Ok(());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn query_param_reads_a_value_or_none() {
        assert_eq!(query_param("code=abc&state=xyz", "state"), Some("xyz"));
        assert_eq!(query_param("code=abc&state=xyz", "code"), Some("abc"));
        assert_eq!(query_param("code=abc", "state"), None);
        assert_eq!(query_param("", "state"), None);
        // A bare flag with no `=` is not a value.
        assert_eq!(query_param("state", "state"), None);
    }

    #[test]
    fn a_matching_state_completes_the_listener() {
        assert_eq!(
            decide("code=abc123&state=mine", "mine"),
            CallbackDecision::Accept
        );
    }

    #[test]
    fn a_mismatched_state_keeps_the_listener_alive() {
        // The bug: a restored tab replaying an old redirect used to consume the
        // one-shot listener, and the real redirect then found a dead port.
        assert_eq!(
            decide("code=abc123&state=someone-elses", "mine"),
            CallbackDecision::Stale
        );
    }

    #[test]
    fn a_callback_without_state_keeps_the_listener_alive() {
        // No legitimate loopback callback is state-less (see `decide`), so a
        // state-less request is either a probe or an attack. Completing on it
        // let `curl 127.0.0.1:8975/auth/callback?code=x` kill the listener the
        // user's real sign-in was waiting on.
        assert_eq!(decide("code=abc123", "mine"), CallbackDecision::Stale);
        assert_eq!(decide("", "mine"), CallbackDecision::Stale);
        assert_eq!(
            decide("error=access_denied", "mine"),
            CallbackDecision::Stale
        );
    }

    #[test]
    fn a_provider_error_on_our_state_completes_the_listener() {
        // `error=access_denied` with OUR state is a real answer to this attempt:
        // the TS side turns it into a typed failure, so we must not keep waiting.
        assert_eq!(
            decide("error=access_denied&state=mine", "mine"),
            CallbackDecision::Accept
        );
    }

    #[test]
    fn parses_callback_target_with_query() {
        // Mirror what `serve_callback` does with a request line's target.
        let (path, query) = split_target("/auth/callback?code=abc123&state=xyz");
        assert_eq!(path, CALLBACK_PATH);
        assert_eq!(query, "code=abc123&state=xyz");
    }

    #[test]
    fn non_callback_path_is_rejected() {
        let (path, _) = split_target("/favicon.ico");
        assert_ne!(path, CALLBACK_PATH);
    }

    #[test]
    fn callback_deep_link_forwards_query_verbatim() {
        // The `auth://deep-link` payload keeps `code` + `state` intact for the
        // TS parser — this is the query-forward contract the frontend depends on.
        assert_eq!(
            callback_deep_link("code=abc123&state=xyz"),
            "houston://auth-callback?code=abc123&state=xyz"
        );
    }
}
