//! HTTP callback listener for Linear's OAuth redirect.
//!
//! Linear redirects the browser to
//! `http://localhost:<port>/callback?code=...&state=...` after the user
//! consents. The engine binds a single-shot TCP listener on the fixed
//! callback port (see [`crate::auth::LINEAR_OAUTH_CALLBACK_PORT`]),
//! accepts one connection, parses the query string, sends a friendly
//! HTML "you can close this tab" page, and returns the params for the
//! caller to feed into [`crate::auth::exchange_code`].
//!
//! Lives in its own module so [`crate::auth`] stays focused on the
//! pure OAuth dance (URL building, token exchange, refresh).

use crate::auth::LINEAR_OAUTH_CALLBACK_PORT;
use crate::error::LinearError;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

/// Parameters Linear sends back to the callback URL.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CallbackParams {
    pub code: String,
    pub state: String,
}

/// Listen for a single OAuth callback on
/// [`LINEAR_OAUTH_CALLBACK_PORT`], extract `code` + `state`, and
/// respond with an HTML success page.
///
/// Cancellation: caller should race this against a timeout
/// (`tokio::time::timeout`, typically 5 minutes — long enough for
/// real user consent, short enough to free the port).
pub async fn run_callback_listener() -> Result<CallbackParams, LinearError> {
    let listener = tokio::net::TcpListener::bind(format!("127.0.0.1:{LINEAR_OAUTH_CALLBACK_PORT}"))
        .await
        .map_err(|e| {
            LinearError::Oauth(format!(
                "bind callback port {LINEAR_OAUTH_CALLBACK_PORT}: {e}"
            ))
        })?;

    let (mut stream, _) = listener
        .accept()
        .await
        .map_err(|e| LinearError::Oauth(format!("accept callback: {e}")))?;

    let mut buf = vec![0u8; 8192];
    let n = stream
        .read(&mut buf)
        .await
        .map_err(|e| LinearError::Oauth(format!("read callback request: {e}")))?;
    let request = String::from_utf8_lossy(&buf[..n]);
    let path = request
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .unwrap_or("");

    if let Some(error_code) = query_param(path, "error") {
        let description = query_param(path, "error_description").unwrap_or(error_code.clone());
        send_response(&mut stream, "Linear connection failed", &description).await;
        return Err(LinearError::Oauth(format!(
            "Linear returned error during OAuth: {description}"
        )));
    }

    let code = query_param(path, "code")
        .ok_or_else(|| LinearError::Oauth("callback missing ?code".into()))?;
    let state = query_param(path, "state")
        .ok_or_else(|| LinearError::Oauth("callback missing ?state".into()))?;

    send_response(
        &mut stream,
        "Connected to Linear",
        "You can close this tab and return to Houston.",
    )
    .await;

    Ok(CallbackParams { code, state })
}

// -- internal helpers --

fn query_param(url_or_path: &str, key: &str) -> Option<String> {
    let query = url_or_path.split('?').nth(1)?;
    query.split('&').find_map(|kv| {
        let mut it = kv.splitn(2, '=');
        let k = it.next()?;
        let v = it.next()?;
        if k == key {
            Some(pct_decode(v))
        } else {
            None
        }
    })
}

fn pct_decode(s: &str) -> String {
    // url::form_urlencoded handles + → space + %XX decoding.
    url::form_urlencoded::parse(format!("k={s}").as_bytes())
        .next()
        .map(|(_, v)| v.into_owned())
        .unwrap_or_default()
}

async fn send_response(stream: &mut tokio::net::TcpStream, title: &str, message: &str) {
    let html = format!(
        concat!(
            "<!DOCTYPE html><html><head><meta charset='utf-8'><title>{}</title><style>",
            "body{{font-family:ui-sans-serif,-apple-system,system-ui,sans-serif;",
            "display:flex;align-items:center;justify-content:center;height:100vh;margin:0;",
            "background:#fff;color:#0d0d0d;flex-direction:column;gap:12px}}",
            "h1{{font-size:20px;font-weight:500;margin:0}}",
            "p{{font-size:14px;color:#676767;margin:0}}",
            "</style></head><body><h1>{}</h1><p>{}</p></body></html>"
        ),
        title, title, message,
    );
    let resp = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        html.len(),
        html
    );
    // Best-effort write — browser may have closed the connection
    // already; the token exchange that follows is what materially
    // matters.
    let _ = stream.write_all(resp.as_bytes()).await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn query_param_extracts_simple_values() {
        let path = "/callback?code=abc123&state=xyz";
        assert_eq!(query_param(path, "code"), Some("abc123".into()));
        assert_eq!(query_param(path, "state"), Some("xyz".into()));
        assert_eq!(query_param(path, "missing"), None);
    }

    #[test]
    fn query_param_decodes_url_encoding() {
        let path = "/callback?code=a%20b%26c";
        assert_eq!(query_param(path, "code"), Some("a b&c".into()));
    }
}
