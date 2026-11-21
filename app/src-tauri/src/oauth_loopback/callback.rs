//! Serving the browser redirect: decide whether a request on the callback path
//! belongs to THIS attempt, and if so hand it to the webview.
//!
//! The listener used to be consumed by ANY request to `/auth/callback`. A
//! browser restoring an old consent tab therefore replayed a months-dead
//! redirect, ate the one-shot listener, and the real redirect that followed
//! found a dead port — the sign-in then sat silent for the full 300s. The
//! attempt's CSRF `state` is now handed down here so a foreign callback is
//! answered with the "stale tab" page and the listener KEEPS WAITING.

use std::time::Duration;

use tauri::{AppHandle, Manager};
use tokio::net::TcpStream;

use super::listener::BoundSockets;
use super::pages::LoopbackPages;
use super::state::OauthLoopbackState;
use crate::loopback_util::{read_request_target_within, split_target, write_response};

/// Path the provider redirects to. Kept narrow so a stray request to `/` or
/// `/favicon.ico` isn't mistaken for the callback.
pub const CALLBACK_PATH: &str = "/auth/callback";

/// How long one connection may take to send its request line. A local socket
/// that connects and says nothing (a preconnecting browser, a stray probe)
/// gets a 400 after this instead of holding the listener until it times out.
pub const READ_TIMEOUT: Duration = Duration::from_secs(5);

/// What one kind of loopback listens for and what it does with its callback.
/// Every route shares the state check, the emit, the page and the focus; only
/// these differ, so a route can never accept another route's redirect. The
/// pages are per attempt (`ListenerTask::pages`), since their copy may be
/// translated.
pub struct LoopbackRoute {
    /// Log prefix, so a sign-in line never reads as a Slack one.
    pub tag: &'static str,
    /// The only path whose requests are decided; everything else is a 404.
    pub path: &'static str,
    /// How long the listener waits before freeing its port.
    pub timeout: Duration,
    /// The `auth://deep-link` payload built from a query carrying this
    /// attempt's `state`. `None` when the query lacks what the route needs: it
    /// gets the stale page and the listener keeps waiting.
    pub deep_link: fn(&str) -> Option<String>,
    /// Drop the attempt from its registry once the listener has exited.
    pub release: fn(&AppHandle, u64) -> Result<(), String>,
}

/// The OAuth sign-in redirect (Google loopback+PKCE and the brokered flow).
pub static SIGN_IN: LoopbackRoute = LoopbackRoute {
    tag: "oauth-loopback",
    path: CALLBACK_PATH,
    timeout: Duration::from_secs(300),
    deep_link: |query| Some(callback_deep_link(query)),
    release: |app, id| app.state::<OauthLoopbackState>().clear_if(id),
};

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
async fn respond(tag: &str, stream: &mut tokio::net::TcpStream, status: &str, body: &str) {
    if let Err(e) = write_response(stream, status, body).await {
        tracing::warn!("[{tag}] could not write the {status} response: {e}");
    }
}

/// Accept one connection from whichever loopback stack the browser picked. The
/// redirect target may be `127.0.0.1` (Google) or `localhost` (the brokered
/// flow), and a browser resolving `localhost` may connect over `::1` — so both
/// bound listeners are served; `v6` is absent on IPv6-less machines.
async fn accept_any(sockets: &BoundSockets) -> Result<TcpStream, String> {
    let accepted = match &sockets.v6 {
        Some(v6) => tokio::select! {
            r = sockets.v4.accept() => r,
            r = v6.accept() => r,
        },
        None => sockets.v4.accept().await,
    };
    accepted
        .map(|(stream, _)| stream)
        .map_err(|e| format!("accept failed: {e}"))
}

/// Accept connections until one carries THIS attempt's callback, then handle it
/// and return. Non-callback probes (favicon, etc.) get a 404 and stale callbacks
/// get the stale page; in both cases we keep waiting.
pub async fn serve_callback(
    sockets: &BoundSockets,
    app: &AppHandle,
    expected_state: &str,
    route: &LoopbackRoute,
    pages: &LoopbackPages,
) -> Result<(), String> {
    let tag = route.tag;
    loop {
        let mut stream = accept_any(sockets).await?;

        let target = match read_request_target_within(&mut stream, READ_TIMEOUT).await {
            Ok(t) => t,
            Err(e) => {
                tracing::warn!("[{tag}] unreadable request: {e}");
                respond(tag, &mut stream, "400 Bad Request", "Bad request").await;
                continue;
            }
        };

        let (path, query) = split_target(&target);

        if path != route.path {
            respond(tag, &mut stream, "404 Not Found", "Not found").await;
            continue;
        }

        let link = match decide(query, expected_state) {
            CallbackDecision::Accept => (route.deep_link)(query),
            CallbackDecision::Stale => None,
        };
        let Some(link) = link else {
            tracing::warn!(
                "[{tag}] ignoring a callback that is not this attempt's; still listening"
            );
            respond(tag, &mut stream, "200 OK", &pages.stale).await;
            continue;
        };

        crate::auth::emit_deep_link(app, &link);

        respond(tag, &mut stream, "200 OK", &pages.success).await;

        crate::window_focus::bring_to_front(app);

        return Ok(());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn accept_any_takes_connections_from_either_stack() {
        use super::super::listener::{bind_exact, BindOutcome};
        let BindOutcome::Bound(sockets) = bind_exact(18975).await.expect("bind") else {
            return;
        };
        let _v4 = tokio::net::TcpStream::connect(("127.0.0.1", 18975))
            .await
            .expect("v4 connect");
        accept_any(&sockets).await.expect("accepts the v4 client");
        if sockets.v6.is_some() {
            let _v6 = tokio::net::TcpStream::connect(("::1", 18975))
                .await
                .expect("v6 connect");
            accept_any(&sockets).await.expect("accepts the v6 client");
        }
    }

    #[test]
    fn query_param_reads_a_value_or_none() {
        assert_eq!(query_param("code=abc&state=xyz", "state"), Some("xyz"));
        assert_eq!(query_param("code=abc&state=xyz", "code"), Some("abc"));
        assert_eq!(query_param("code=abc", "state"), None);
        assert_eq!(query_param("", "state"), None);
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
        assert_eq!(
            decide("code=abc123&state=someone-elses", "mine"),
            CallbackDecision::Stale
        );
    }

    #[test]
    fn a_callback_without_state_keeps_the_listener_alive() {
        assert_eq!(decide("code=abc123", "mine"), CallbackDecision::Stale);
        assert_eq!(decide("", "mine"), CallbackDecision::Stale);
        assert_eq!(
            decide("error=access_denied", "mine"),
            CallbackDecision::Stale
        );
    }

    #[test]
    fn a_provider_error_on_our_state_completes_the_listener() {
        assert_eq!(
            decide("error=access_denied&state=mine", "mine"),
            CallbackDecision::Accept
        );
    }

    #[test]
    fn parses_callback_target_with_query() {
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
        assert_eq!(
            callback_deep_link("code=abc123&state=xyz"),
            "houston://auth-callback?code=abc123&state=xyz"
        );
    }
}
