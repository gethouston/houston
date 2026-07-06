//! Loopback auth reverse-proxy that fronts a local model server.
//!
//! Every request MUST carry `Authorization: Bearer <proxyKey>` (a random
//! high-entropy key minted per bridge); anything else gets a flat 401 before we
//! ever contact the upstream. Authorized requests are forwarded path-preserving
//! to the target server's origin, and the upstream response is streamed back
//! UNBUFFERED so Server-Sent Events (chat token streams) pass through live. If
//! the user supplied the local server's own API key it's attached to the
//! upstream request (the client only ever sees/holds the proxyKey).
//!
//! We own the inbound HTTP connection with hyper (reqwest is a client only) and
//! use reqwest for the outbound hop so the streaming body plumbing stays simple.

use std::convert::Infallible;
use std::io;
use std::sync::Arc;

use bytes::Bytes;
use futures_util::StreamExt;
use http_body_util::combinators::UnsyncBoxBody;
use http_body_util::{BodyExt, Full, LengthLimitError, Limited, StreamBody};
use hyper::body::{Frame, Incoming};
use hyper::header::{
    HeaderName, AUTHORIZATION, CONNECTION, CONTENT_LENGTH, CONTENT_TYPE, HOST, TRANSFER_ENCODING,
};
use hyper::service::service_fn;
use hyper::{Request, Response, StatusCode};
use hyper_util::rt::TokioIo;
use tokio::net::TcpListener;
use tokio::task::JoinHandle;

/// Streaming, Send response body (not required to be Sync — connections are
/// spawned, not shared across the runtime).
type ProxyBody = UnsyncBoxBody<Bytes, io::Error>;

/// Ceiling on how much request body we buffer before forwarding upstream (this
/// hop can't stream the request — reqwest needs the full body). 16 MiB is
/// generous for large chat payloads (long transcripts, base64 image inputs)
/// while capping post-auth memory a client could pin per request.
const MAX_REQUEST_BODY_BYTES: usize = 16 * 1024 * 1024;

/// Outcome of reading a (capped) request body.
enum BodyRead {
    Ok(Bytes),
    TooLarge,
    Failed(String),
}

struct ProxyConfig {
    /// Scheme + host(+port) of the local server, no path (e.g.
    /// `http://127.0.0.1:1234`).
    target_origin: String,
    /// The bearer the client must present.
    proxy_key: String,
    /// The local server's own key, attached to upstream requests when set.
    upstream_key: Option<String>,
    client: reqwest::Client,
}

/// A running proxy. Drop or [`shutdown`](ProxyHandle::shutdown) to stop
/// accepting connections.
pub struct ProxyHandle {
    pub port: u16,
    accept_task: JoinHandle<()>,
}

impl ProxyHandle {
    /// Stop accepting new connections. In-flight streamed responses are allowed
    /// to finish on their own tasks.
    pub fn shutdown(self) {
        self.accept_task.abort();
    }
}

/// Bind a loopback listener on a free port and start serving. No global request
/// timeout on the upstream client — SSE responses are long-lived by design.
pub async fn start_auth_proxy(
    target_origin: String,
    proxy_key: String,
    upstream_key: Option<String>,
) -> Result<ProxyHandle, String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("local-bridge proxy: bind failed: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("local-bridge proxy: local_addr failed: {e}"))?
        .port();

    let client = reqwest::Client::builder()
        .build()
        .map_err(|e| format!("local-bridge proxy: client build failed: {e}"))?;
    let cfg = Arc::new(ProxyConfig {
        target_origin,
        proxy_key,
        upstream_key,
        client,
    });

    let accept_task = tokio::spawn(async move {
        loop {
            match listener.accept().await {
                Ok((stream, _)) => {
                    let cfg = cfg.clone();
                    let io = TokioIo::new(stream);
                    tokio::spawn(async move {
                        let service = service_fn(move |req| handle(cfg.clone(), req));
                        if let Err(e) = hyper::server::conn::http1::Builder::new()
                            .serve_connection(io, service)
                            .await
                        {
                            tracing::debug!("[local-bridge:proxy] connection ended: {e}");
                        }
                    });
                }
                Err(e) => {
                    tracing::warn!("[local-bridge:proxy] accept error: {e}");
                    break;
                }
            }
        }
    });

    Ok(ProxyHandle { port, accept_task })
}

async fn handle(
    cfg: Arc<ProxyConfig>,
    req: Request<Incoming>,
) -> Result<Response<ProxyBody>, Infallible> {
    if !bearer_ok(req.headers().get(AUTHORIZATION), &cfg.proxy_key) {
        return Ok(text_response(
            StatusCode::UNAUTHORIZED,
            "Unauthorized: missing or invalid proxy bearer token",
        ));
    }

    let (parts, body) = req.into_parts();
    let path_and_query = parts
        .uri
        .path_and_query()
        .map(|pq| pq.as_str())
        .unwrap_or("/");
    let url = format!("{}{}", cfg.target_origin, path_and_query);

    let collected = match read_body_capped(body, MAX_REQUEST_BODY_BYTES).await {
        BodyRead::Ok(b) => b,
        BodyRead::TooLarge => {
            return Ok(text_response(
                StatusCode::PAYLOAD_TOO_LARGE,
                &format!("proxy: request body exceeds the {MAX_REQUEST_BODY_BYTES}-byte limit"),
            ))
        }
        BodyRead::Failed(e) => {
            return Ok(text_response(
                StatusCode::BAD_GATEWAY,
                &format!("proxy: failed to read request body: {e}"),
            ))
        }
    };

    let mut rb = cfg.client.request(parts.method, url).body(collected);
    for (name, value) in parts.headers.iter() {
        if skip_request_header(name) {
            continue;
        }
        rb = rb.header(name.clone(), value.clone());
    }
    if let Some(key) = &cfg.upstream_key {
        rb = rb.bearer_auth(key);
    }

    let upstream = match rb.send().await {
        Ok(r) => r,
        Err(e) => {
            return Ok(text_response(
                StatusCode::BAD_GATEWAY,
                &format!("proxy: upstream request failed: {e}"),
            ))
        }
    };

    let status = upstream.status();
    let headers = upstream.headers().clone();
    // Stream the upstream body straight through — no buffering, so SSE frames
    // reach the client as they arrive.
    let stream = upstream
        .bytes_stream()
        .map(|chunk| chunk.map(Frame::data).map_err(io::Error::other));
    let body = StreamBody::new(stream).boxed_unsync();

    let mut resp = Response::new(body);
    *resp.status_mut() = status;
    for (name, value) in headers.iter() {
        if skip_response_header(name) {
            continue;
        }
        resp.headers_mut().append(name.clone(), value.clone());
    }
    Ok(resp)
}

/// Read the request body with a hard byte cap. reqwest can't stream this hop's
/// request, so we must buffer — [`Limited`] bounds that buffer and reports
/// overflow distinctly (413) from a genuine read failure (502).
async fn read_body_capped<B>(body: B, max: usize) -> BodyRead
where
    B: hyper::body::Body<Data = Bytes>,
    B::Error: Into<Box<dyn std::error::Error + Send + Sync>>,
{
    match Limited::new(body, max).collect().await {
        Ok(c) => BodyRead::Ok(c.to_bytes()),
        Err(e) if e.downcast_ref::<LengthLimitError>().is_some() => BodyRead::TooLarge,
        Err(e) => BodyRead::Failed(e.to_string()),
    }
}

/// Bearer check. The auth SCHEME is matched case-insensitively per RFC 7235
/// (`Bearer` / `bearer` / `BEARER` all valid); the token VALUE is compared in
/// constant time so a timing side-channel can't leak it.
fn bearer_ok(header: Option<&hyper::header::HeaderValue>, key: &str) -> bool {
    let Some(value) = header else {
        return false;
    };
    let Ok(s) = value.to_str() else {
        return false;
    };
    let Some((scheme, token)) = s.trim_start().split_once(' ') else {
        return false;
    };
    if !scheme.eq_ignore_ascii_case("bearer") {
        return false;
    }
    constant_time_eq(token.trim().as_bytes(), key.as_bytes())
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

/// Request headers we must NOT forward: `Host`/`Content-Length` are recomputed
/// by reqwest, connection framing is per-hop, and the client's `Authorization`
/// carries the proxyKey (never the upstream's) so it's dropped and replaced.
fn skip_request_header(name: &HeaderName) -> bool {
    name == HOST
        || name == CONTENT_LENGTH
        || name == CONNECTION
        || name == TRANSFER_ENCODING
        || name == AUTHORIZATION
}

/// Response headers we must NOT copy: hyper sets its own framing for the
/// streamed (chunked) body. Everything else — crucially `Content-Type:
/// text/event-stream` — passes through.
fn skip_response_header(name: &HeaderName) -> bool {
    name == CONTENT_LENGTH || name == TRANSFER_ENCODING || name == CONNECTION
}

fn text_response(status: StatusCode, msg: &str) -> Response<ProxyBody> {
    let body = Full::new(Bytes::from(msg.to_string()))
        .map_err(|never| match never {})
        .boxed_unsync();
    let mut resp = Response::new(body);
    *resp.status_mut() = status;
    resp.headers_mut().insert(
        CONTENT_TYPE,
        hyper::header::HeaderValue::from_static("text/plain; charset=utf-8"),
    );
    resp
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    #[test]
    fn constant_time_eq_matches_and_rejects() {
        assert!(constant_time_eq(b"abc", b"abc"));
        assert!(!constant_time_eq(b"abc", b"abd"));
        assert!(!constant_time_eq(b"abc", b"abcd"));
    }

    #[test]
    fn bearer_gate_logic() {
        use hyper::header::HeaderValue;
        let key = "secret-key";
        assert!(bearer_ok(
            Some(&HeaderValue::from_static("Bearer secret-key")),
            key
        ));
        assert!(bearer_ok(
            Some(&HeaderValue::from_static("bearer secret-key")),
            key
        ));
        // Scheme is case-insensitive per RFC 7235.
        assert!(bearer_ok(
            Some(&HeaderValue::from_static("BEARER secret-key")),
            key
        ));
        assert!(bearer_ok(
            Some(&HeaderValue::from_static("BeArEr secret-key")),
            key
        ));
        assert!(!bearer_ok(
            Some(&HeaderValue::from_static("Bearer wrong")),
            key
        ));
        // Wrong scheme is rejected even with the right token.
        assert!(!bearer_ok(
            Some(&HeaderValue::from_static("Basic secret-key")),
            key
        ));
        assert!(!bearer_ok(
            Some(&HeaderValue::from_static("secret-key")),
            key
        ));
        assert!(!bearer_ok(None, key));
    }

    #[tokio::test]
    async fn read_body_capped_enforces_limit() {
        // Under the cap → forwarded verbatim.
        let small = Full::new(Bytes::from_static(b"hello"));
        match read_body_capped(small, 16).await {
            BodyRead::Ok(b) => assert_eq!(b, Bytes::from_static(b"hello")),
            other => panic!("expected Ok, got {}", body_read_name(&other)),
        }
        // Over the cap → TooLarge (→ 413), never buffered.
        let big = Full::new(Bytes::from(vec![0u8; 100]));
        assert!(
            matches!(read_body_capped(big, 16).await, BodyRead::TooLarge),
            "oversized body must be rejected"
        );
    }

    fn body_read_name(b: &BodyRead) -> &'static str {
        match b {
            BodyRead::Ok(_) => "Ok",
            BodyRead::TooLarge => "TooLarge",
            BodyRead::Failed(_) => "Failed",
        }
    }

    /// A canned upstream: accepts connections and replies 200 with a fixed body
    /// to any request. Returns its port.
    async fn stub_upstream() -> u16 {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            loop {
                let Ok((mut stream, _)) = listener.accept().await else {
                    break;
                };
                tokio::spawn(async move {
                    let mut buf = [0u8; 1024];
                    // Read (and discard) the request; we reply regardless.
                    let _ = stream.read(&mut buf).await;
                    let body = "UPSTREAM_OK";
                    let resp = format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        body.len(),
                        body
                    );
                    let _ = stream.write_all(resp.as_bytes()).await;
                    let _ = stream.flush().await;
                });
            }
        });
        port
    }

    #[tokio::test]
    async fn rejects_without_bearer_and_forwards_with_it() {
        let upstream_port = stub_upstream().await;
        let origin = format!("http://127.0.0.1:{upstream_port}");
        let handle = start_auth_proxy(origin, "the-key".to_string(), None)
            .await
            .expect("proxy start");
        let proxy_url = format!("http://127.0.0.1:{}/v1/models", handle.port);
        let client = reqwest::Client::new();

        // No bearer → 401, upstream never contacted.
        let unauth = client.get(&proxy_url).send().await.expect("send");
        assert_eq!(unauth.status(), reqwest::StatusCode::UNAUTHORIZED);

        // Wrong bearer → 401.
        let wrong = client
            .get(&proxy_url)
            .bearer_auth("nope")
            .send()
            .await
            .expect("send");
        assert_eq!(wrong.status(), reqwest::StatusCode::UNAUTHORIZED);

        // Correct bearer → forwarded, upstream body returned.
        let ok = client
            .get(&proxy_url)
            .bearer_auth("the-key")
            .send()
            .await
            .expect("send");
        assert!(ok.status().is_success());
        assert_eq!(ok.text().await.unwrap(), "UPSTREAM_OK");

        handle.shutdown();
    }
}
