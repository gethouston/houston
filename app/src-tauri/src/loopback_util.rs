//! Shared HTTP plumbing for the one-shot localhost loopback listeners used by
//! the browser-based OAuth flows.
//!
//! Both the Supabase/Google sign-in loopback (`oauth_loopback.rs`) and the
//! OpenAI Codex loopback (`codex_oauth_loopback.rs`) accept a single browser
//! redirect on `127.0.0.1`, read only the HTTP request line, and reply with a
//! tiny self-contained page. The request-line parsing and response writing are
//! identical, so they live here and both listeners call in.

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

/// Read just the HTTP request line and pull out the request target
/// (`/auth/callback?code=...`). We only need the first line, so stop as soon
/// as we've seen a `\r\n`.
pub async fn read_request_target(stream: &mut TcpStream) -> Result<String, String> {
    let mut buf = Vec::with_capacity(1024);
    let mut chunk = [0u8; 1024];
    loop {
        let n = stream
            .read(&mut chunk)
            .await
            .map_err(|e| format!("read failed: {e}"))?;
        if n == 0 {
            return Err("connection closed before request line".into());
        }
        buf.extend_from_slice(&chunk[..n]);
        if let Some(pos) = buf.windows(2).position(|w| w == b"\r\n") {
            let line = String::from_utf8_lossy(&buf[..pos]);
            let mut parts = line.split_whitespace();
            let _method = parts.next().ok_or("empty request line")?;
            let target = parts.next().ok_or("request line had no target")?;
            return Ok(target.to_string());
        }
        if buf.len() > 8192 {
            return Err("request line too long".into());
        }
    }
}

/// Split a request target into its `(path, query)` halves. The query is
/// everything after the first `?` (empty when there is none), returned raw so
/// the caller can forward it verbatim to the webview.
pub fn split_target(target: &str) -> (&str, &str) {
    match target.split_once('?') {
        Some((path, query)) => (path, query),
        None => (target, ""),
    }
}

/// Write a complete HTTP/1.1 response and close the connection.
pub async fn write_response(
    stream: &mut TcpStream,
    status: &str,
    body: &str,
) -> Result<(), String> {
    let response = format!(
        "HTTP/1.1 {status}\r\n\
         Content-Type: text/html; charset=utf-8\r\n\
         Content-Length: {len}\r\n\
         Connection: close\r\n\
         \r\n\
         {body}",
        len = body.len(),
    );
    stream
        .write_all(response.as_bytes())
        .await
        .map_err(|e| format!("write failed: {e}"))?;
    stream
        .flush()
        .await
        .map_err(|e| format!("flush failed: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn split_target_extracts_query() {
        let (path, query) = split_target("/auth/callback?code=abc123&state=xyz");
        assert_eq!(path, "/auth/callback");
        assert_eq!(query, "code=abc123&state=xyz");
    }

    #[test]
    fn split_target_empty_query_when_no_question_mark() {
        let (path, query) = split_target("/favicon.ico");
        assert_eq!(path, "/favicon.ico");
        assert_eq!(query, "");
    }
}
