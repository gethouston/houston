//! HTTP + WS proxy: inbound framed tunnel requests → loopback call to
//! the engine on 127.0.0.1:<port>. We go through the real HTTP stack
//! (not router::oneshot) so middleware, auth, CORS all just work.

use crate::frame::{
    HttpRequestFrame, HttpResponseFrame, TunnelFrame, WsMessageFrame, WsOpenAckFrame, WsOpenFrame,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use futures_util::{SinkExt, StreamExt};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::net::TcpStream;
use tokio::sync::Mutex;
use tokio_tungstenite::{tungstenite::Message as WsMsg, MaybeTlsStream, WebSocketStream};

/// Where the engine is listening. Loopback; no TLS.
#[derive(Clone, Debug)]
pub struct EngineEndpoint {
    pub host: String,
    pub port: u16,
}

impl EngineEndpoint {
    pub fn new(port: u16) -> Self {
        Self {
            host: "127.0.0.1".into(),
            port,
        }
    }

    fn http_base(&self) -> String {
        format!("http://{}:{}", self.host, self.port)
    }

    fn ws_url(&self, path: &str) -> String {
        format!("ws://{}:{}{}", self.host, self.port, path)
    }
}

/// Type of a sender the proxy can push outbound frames onto.
pub type FrameSender = tokio::sync::mpsc::UnboundedSender<TunnelFrame>;

/// Proxy an HTTP frame. Returns the response frame.
pub async fn proxy_http(
    http: &reqwest::Client,
    endpoint: &EngineEndpoint,
    req: HttpRequestFrame,
) -> HttpResponseFrame {
    let url = format!("{}{}", endpoint.http_base(), req.path);
    let method = match reqwest::Method::from_bytes(req.method.as_bytes()) {
        Ok(m) => m,
        Err(_) => {
            return HttpResponseFrame {
                req_id: req.req_id,
                status: 400,
                headers: HashMap::new(),
                body: None,
            };
        }
    };

    let mut rb = http.request(method, &url);
    for (k, v) in &req.headers {
        // Strip hop-by-hop + host (reqwest manages).
        let lc = k.to_ascii_lowercase();
        if matches!(
            lc.as_str(),
            "host"
                | "connection"
                | "upgrade"
                | "keep-alive"
                | "transfer-encoding"
                | "te"
                | "trailer"
                | "proxy-connection"
        ) {
            continue;
        }
        rb = rb.header(k, v);
    }
    if let Some(b64) = req.body.as_deref() {
        if let Ok(bytes) = BASE64.decode(b64) {
            rb = rb.body(bytes);
        }
    }

    match rb.send().await {
        Ok(res) => {
            let status = res.status().as_u16();
            let mut headers = HashMap::new();
            for (k, v) in res.headers().iter() {
                if let Ok(s) = v.to_str() {
                    headers.insert(k.as_str().to_string(), s.to_string());
                }
            }
            let bytes = res.bytes().await.unwrap_or_default();
            let body = if bytes.is_empty() {
                None
            } else {
                Some(BASE64.encode(&bytes))
            };
            HttpResponseFrame {
                req_id: req.req_id,
                status,
                headers,
                body,
            }
        }
        Err(e) => {
            tracing::warn!(target: "houston_tunnel::proxy", error = %e, "loopback request failed");
            HttpResponseFrame {
                req_id: req.req_id,
                status: 502,
                headers: HashMap::new(),
                body: Some(BASE64.encode(e.to_string().as_bytes())),
            }
        }
    }
}

/// Open a local WS leg to the engine. On success, spawn a pump that
/// forwards `s2c` messages back up the tunnel; stores the outbound end
/// in `legs` so `c2s` frames can push into it. Returns the ack frame.
pub async fn proxy_ws_open(
    endpoint: &EngineEndpoint,
    frame: WsOpenFrame,
    outbound: FrameSender,
    legs: LegsMap,
) -> WsOpenAckFrame {
    let url = endpoint.ws_url(&frame.path);
    use tokio_tungstenite::tungstenite::client::IntoClientRequest;
    use tokio_tungstenite::tungstenite::http::HeaderValue;
    let mut request = match url.as_str().into_client_request() {
        Ok(r) => r,
        Err(e) => {
            return WsOpenAckFrame {
                ws_id: frame.ws_id,
                ok: false,
                status: None,
                error: Some(format!("bad request: {e}")),
            };
        }
    };
    for (k, v) in &frame.headers {
        let lc = k.to_ascii_lowercase();
        if matches!(
            lc.as_str(),
            "host"
                | "connection"
                | "upgrade"
                | "sec-websocket-key"
                | "sec-websocket-version"
                | "sec-websocket-extensions"
        ) {
            continue;
        }
        if let Ok(hv) = HeaderValue::from_str(v) {
            if let Ok(hn) =
                tokio_tungstenite::tungstenite::http::HeaderName::from_bytes(k.as_bytes())
            {
                request.headers_mut().insert(hn, hv);
            }
        }
    }

    match tokio_tungstenite::connect_async(request).await {
        Ok((stream, _res)) => {
            let ws_id = frame.ws_id.clone();
            let (tx_local, mut rx_local) = tokio::sync::mpsc::unbounded_channel::<WsMsg>();
            legs.lock().await.insert(ws_id.clone(), tx_local);

            let (mut sink, mut src) = stream.split();
            // Pump local → remote messages (c2s): spawned task reads from rx_local.
            tokio::spawn(async move {
                while let Some(msg) = rx_local.recv().await {
                    if sink.send(msg).await.is_err() {
                        break;
                    }
                }
            });
            // Pump remote → tunnel (s2c).
            let outbound2 = outbound.clone();
            let ws_id2 = ws_id.clone();
            let legs2 = legs.clone();
            tokio::spawn(async move {
                while let Some(Ok(msg)) = src.next().await {
                    let (text, binary) = match &msg {
                        WsMsg::Text(t) => (Some(t.to_string()), None),
                        WsMsg::Binary(b) => (None, Some(BASE64.encode(b))),
                        WsMsg::Close(_) => break,
                        _ => continue,
                    };
                    let _ = outbound2.send(TunnelFrame::WsMessage(WsMessageFrame {
                        ws_id: ws_id2.clone(),
                        dir: "s2c".into(),
                        text,
                        binary,
                    }));
                }
                let _ = outbound2.send(TunnelFrame::WsClose(crate::frame::WsCloseFrame {
                    ws_id: ws_id2.clone(),
                    code: None,
                    reason: None,
                }));
                legs2.lock().await.remove(&ws_id2);
            });

            WsOpenAckFrame {
                ws_id: frame.ws_id,
                ok: true,
                status: Some(101),
                error: None,
            }
        }
        Err(e) => WsOpenAckFrame {
            ws_id: frame.ws_id,
            ok: false,
            status: None,
            error: Some(e.to_string()),
        },
    }
}

/// Map `ws_id` → channel that delivers messages into the local engine WS.
pub type LegsMap = Arc<Mutex<HashMap<String, tokio::sync::mpsc::UnboundedSender<WsMsg>>>>;

/// Forward a c2s (mobile → engine) message onto the local leg.
pub async fn forward_c2s(legs: &LegsMap, frame: WsMessageFrame) {
    let guard = legs.lock().await;
    let Some(tx) = guard.get(&frame.ws_id) else {
        return;
    };
    let msg = if let Some(t) = frame.text {
        WsMsg::Text(t.into())
    } else if let Some(b) = frame.binary.and_then(|s| BASE64.decode(s).ok()) {
        WsMsg::Binary(b.into())
    } else {
        return;
    };
    let _ = tx.send(msg);
}

/// Close a local leg from a remote `ws_close`.
pub async fn close_leg(legs: &LegsMap, ws_id: &str) {
    legs.lock().await.remove(ws_id);
}

// Silence unused-import warnings in stripped-down builds.
#[allow(dead_code)]
type _Unused = (TcpStream, WebSocketStream<MaybeTlsStream<TcpStream>>);
