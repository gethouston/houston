//! Integration tests for `/v1/health`, `/v1/version`, and auth.

use houston_engine_server::{build_router, ServerConfig, ServerState};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;

async fn spawn_test_server() -> (SocketAddr, String) {
    let token = "test-token-abc".to_string();
    let cfg = ServerConfig {
        bind: "127.0.0.1:0".parse().unwrap(),
        token: token.clone(),
        home_dir: std::env::temp_dir(),
        docs_dir: std::env::temp_dir(),
        app_system_prompt: String::new(),
        app_onboarding_prompt: String::new(),
        tunnel_url: "http://test.invalid".into(),
    };
    let listener = TcpListener::bind(cfg.bind).await.unwrap();
    let addr = listener.local_addr().unwrap();
    let state = Arc::new(ServerState::new_in_memory(cfg).await.unwrap());
    let app = build_router(state);
    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    (addr, token)
}

#[tokio::test]
async fn health_unauthorized_without_token() {
    let (addr, _) = spawn_test_server().await;
    let res = reqwest::get(format!("http://{addr}/v1/health"))
        .await
        .unwrap();
    assert_eq!(res.status(), 401);
}

#[tokio::test]
async fn health_authorized_with_bearer() {
    let (addr, token) = spawn_test_server().await;
    let res = reqwest::Client::new()
        .get(format!("http://{addr}/v1/health"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), 200);
    assert!(res.headers().get("x-houston-engine-version").is_some());
    let body: serde_json::Value = res.json().await.unwrap();
    assert_eq!(body["status"], "ok");
    assert_eq!(body["protocol"], 1);
}

#[tokio::test]
async fn version_endpoint() {
    let (addr, token) = spawn_test_server().await;
    let res = reqwest::Client::new()
        .get(format!("http://{addr}/v1/version"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), 200);
    let body: serde_json::Value = res.json().await.unwrap();
    assert_eq!(body["protocol"], 1);
}

#[tokio::test]
async fn query_token_also_works() {
    let (addr, token) = spawn_test_server().await;
    let res = reqwest::get(format!("http://{addr}/v1/health?token={token}"))
        .await
        .unwrap();
    assert_eq!(res.status(), 200);
}

// ---------------------------------------------------------------------------
// WebSocket topic routing
//
// Shared helpers for the WS tests live in the `ws_helpers` module below. The
// tests pin the guarantees the protocol makes to every client type:
//   - `firehose ("*")` receives every scoped event regardless of topic,
//   - explicit topic subscription receives that topic,
//   - a client with no subscription receives nothing — even for agent/session
//     events it might otherwise care about.
// Before this test suite existed, the filter silently dropped every scoped
// event for firehose subscribers, which made agent reactivity look broken
// for an entire release. Keep these tests honest — they are the guardrail.
// ---------------------------------------------------------------------------

mod ws_helpers {
    use super::*;
    use futures_util::{SinkExt, StreamExt};
    use houston_engine_protocol::{ClientRequest, EngineEnvelope, EnvelopeKind};
    use tokio_tungstenite::{
        connect_async,
        tungstenite::{client::IntoClientRequest, Message},
        MaybeTlsStream, WebSocketStream,
    };

    pub type Ws = WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>>;

    /// Spawn a fully wired server with an in-memory DB and return the bound
    /// address, bearer token, and a handle for emitting events directly into
    /// the broadcast channel (bypassing any REST route).
    pub async fn spawn_server() -> (SocketAddr, String, houston_ui_events::BroadcastEventSink) {
        let token = format!("ws-token-{}", uuid::Uuid::new_v4());
        let cfg = ServerConfig {
            bind: "127.0.0.1:0".parse().unwrap(),
            token: token.clone(),
            home_dir: std::env::temp_dir(),
            docs_dir: std::env::temp_dir(),
            app_system_prompt: String::new(),
            app_onboarding_prompt: String::new(),
            tunnel_url: "http://test.invalid".into(),
        };
        let listener = TcpListener::bind(cfg.bind).await.unwrap();
        let addr = listener.local_addr().unwrap();
        let state = Arc::new(ServerState::new_in_memory(cfg).await.unwrap());
        let events = state.events.clone();
        let app = build_router(state);
        tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        (addr, token, events)
    }

    pub async fn connect(addr: SocketAddr, token: &str) -> Ws {
        let url = format!("ws://{addr}/v1/ws?token={token}");
        let mut req = url.into_client_request().unwrap();
        req.headers_mut()
            .insert("authorization", format!("Bearer {token}").parse().unwrap());
        let (ws, _) = connect_async(req).await.unwrap();
        ws
    }

    /// Send a `Sub` request over the socket. The server applies it
    /// asynchronously via its read loop, so callers should give it a few
    /// milliseconds before emitting events.
    pub async fn sub(ws: &mut Ws, topics: &[&str]) {
        let env = EngineEnvelope {
            v: 1,
            id: uuid::Uuid::new_v4().to_string(),
            kind: EnvelopeKind::Req,
            ts: chrono::Utc::now().timestamp_millis(),
            payload: serde_json::to_value(ClientRequest::Sub {
                topics: topics.iter().map(|s| (*s).to_string()).collect(),
            })
            .unwrap(),
        };
        ws.send(Message::Text(serde_json::to_string(&env).unwrap()))
            .await
            .unwrap();
        // Give the server's read loop a tick to apply the subscription
        // before the caller races ahead and emits.
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }

    /// Wait up to 2s for the next non-ping frame whose payload `type` matches
    /// `expected_type`. Returns the full parsed envelope so assertions can
    /// inspect the payload shape.
    pub async fn expect_event(ws: &mut Ws, expected_type: &str) -> EngineEnvelope {
        let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(2);
        loop {
            let timeout = deadline.saturating_duration_since(tokio::time::Instant::now());
            let frame = tokio::time::timeout(timeout, ws.next())
                .await
                .unwrap_or_else(|_| panic!("timed out waiting for {expected_type}"))
                .unwrap()
                .unwrap();
            let txt = match frame {
                Message::Text(t) => t,
                _ => continue,
            };
            let env: EngineEnvelope = serde_json::from_str(&txt).unwrap();
            if env.kind == EnvelopeKind::Ping {
                continue;
            }
            if env.payload.get("type").and_then(|v| v.as_str()) == Some(expected_type) {
                return env;
            }
        }
    }

    /// Assert no event frame arrives within `ms`. Pings are ignored.
    pub async fn expect_no_event(ws: &mut Ws, ms: u64) {
        let deadline = tokio::time::Instant::now() + std::time::Duration::from_millis(ms);
        loop {
            let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
            if remaining.is_zero() {
                return;
            }
            match tokio::time::timeout(remaining, ws.next()).await {
                Err(_) => return, // timed out — no event, good
                Ok(Some(Ok(Message::Text(txt)))) => {
                    let env: EngineEnvelope = serde_json::from_str(&txt).unwrap();
                    if env.kind == EnvelopeKind::Ping {
                        continue;
                    }
                    panic!("unexpected event delivered: {}", env.payload);
                }
                Ok(_) => continue,
            }
        }
    }
}

#[tokio::test]
async fn ws_firehose_subscriber_receives_scoped_events() {
    use houston_ui_events::{EventSink, HoustonEvent};
    let (addr, token, events) = ws_helpers::spawn_server().await;
    let mut ws = ws_helpers::connect(addr, &token).await;

    ws_helpers::sub(&mut ws, &["*"]).await;

    // ActivityChanged routes to `agent:<path>`. Firehose must still receive it.
    events.emit(HoustonEvent::ActivityChanged {
        agent_path: "/tmp/some/agent".to_string(),
    });
    let env = ws_helpers::expect_event(&mut ws, "ActivityChanged").await;
    assert_eq!(
        env.payload["data"]["agent_path"].as_str(),
        Some("/tmp/some/agent"),
    );

    // SessionStatus routes to `session:<key>`. Same guarantee.
    events.emit(HoustonEvent::SessionStatus {
        agent_path: "/tmp/some/agent".to_string(),
        session_key: "activity-abc".to_string(),
        status: "completed".to_string(),
        error: None,
    });
    let env = ws_helpers::expect_event(&mut ws, "SessionStatus").await;
    assert_eq!(env.payload["data"]["status"].as_str(), Some("completed"));
}

#[tokio::test]
async fn ws_explicit_subscription_receives_only_matching_topic() {
    use houston_ui_events::{EventSink, HoustonEvent};
    let (addr, token, events) = ws_helpers::spawn_server().await;
    let mut ws = ws_helpers::connect(addr, &token).await;

    ws_helpers::sub(&mut ws, &["agent:/tmp/watched"]).await;

    // Unrelated event on a different scoped topic — must NOT arrive.
    events.emit(HoustonEvent::ActivityChanged {
        agent_path: "/tmp/other".to_string(),
    });
    // Matching event — must arrive.
    events.emit(HoustonEvent::ActivityChanged {
        agent_path: "/tmp/watched".to_string(),
    });

    let env = ws_helpers::expect_event(&mut ws, "ActivityChanged").await;
    assert_eq!(
        env.payload["data"]["agent_path"].as_str(),
        Some("/tmp/watched"),
    );
    ws_helpers::expect_no_event(&mut ws, 300).await;
}

#[tokio::test]
async fn ws_no_subscription_receives_nothing() {
    use houston_ui_events::{EventSink, HoustonEvent};
    let (addr, token, events) = ws_helpers::spawn_server().await;
    let mut ws = ws_helpers::connect(addr, &token).await;

    // Deliberately do NOT send any Sub request.
    events.emit(HoustonEvent::ComposioCliReady);
    events.emit(HoustonEvent::ActivityChanged {
        agent_path: "/tmp/x".to_string(),
    });

    ws_helpers::expect_no_event(&mut ws, 500).await;
}
