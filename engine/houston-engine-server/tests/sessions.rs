//! Phase 2-F integration tests — session REST + WS topic routing +
//! multi-client backpressure.

use futures_util::{SinkExt, StreamExt};
use houston_engine_protocol::{ClientRequest, EngineEnvelope, EnvelopeKind};
use houston_engine_server::{build_router, ServerConfig, ServerState};
use houston_terminal_manager::FeedItem;
use houston_ui_events::{EventSink, HoustonEvent};
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
use tokio::net::TcpListener;
use tokio_tungstenite::{
    connect_async, tungstenite::client::IntoClientRequest, tungstenite::Message,
};

async fn spawn_engine() -> (SocketAddr, String, Arc<ServerState>) {
    let token = "test-token".to_string();
    let docs = tempfile::tempdir().unwrap();
    let home = tempfile::tempdir().unwrap();
    let cfg = ServerConfig {
        bind: "127.0.0.1:0".parse().unwrap(),
        token: token.clone(),
        home_dir: home.path().to_path_buf(),
        docs_dir: docs.path().to_path_buf(),
        app_system_prompt: String::new(),
        app_onboarding_prompt: String::new(),
        tunnel_url: "http://test.invalid".into(),
    };
    let listener = TcpListener::bind(cfg.bind).await.unwrap();
    let addr = listener.local_addr().unwrap();
    let state = Arc::new(ServerState::new_in_memory(cfg).await.unwrap());
    let state_for_server = state.clone();
    let app = build_router(state_for_server);
    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    // Leak the tempdirs for the life of the test process — cheap.
    std::mem::forget(docs);
    std::mem::forget(home);
    (addr, token, state)
}

async fn ws_connect(
    addr: SocketAddr,
    token: &str,
) -> tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>> {
    let url = format!("ws://{addr}/v1/ws?token={token}");
    let mut req = url.into_client_request().unwrap();
    req.headers_mut()
        .insert("authorization", format!("Bearer {token}").parse().unwrap());
    let (ws, _) = connect_async(req).await.unwrap();
    ws
}

fn sub_frame(topics: &[&str]) -> String {
    let payload = ClientRequest::Sub {
        topics: topics.iter().map(|s| s.to_string()).collect(),
    };
    let env = EngineEnvelope {
        v: 1,
        id: "t".into(),
        kind: EnvelopeKind::Req,
        ts: 0,
        payload: serde_json::to_value(&payload).unwrap(),
    };
    serde_json::to_string(&env).unwrap()
}

/// Drain any frames queued on the socket for `ms` milliseconds, returning
/// them as parsed envelopes. Timeouts are normal — we just want to flush
/// whatever's pending (heartbeats, etc.).
async fn drain_for(
    ws: &mut tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
    ms: u64,
) -> Vec<EngineEnvelope> {
    let mut frames = Vec::new();
    let deadline = tokio::time::Instant::now() + Duration::from_millis(ms);
    loop {
        match tokio::time::timeout_at(deadline, ws.next()).await {
            Ok(Some(Ok(Message::Text(t)))) => {
                if let Ok(env) = serde_json::from_str::<EngineEnvelope>(&t) {
                    frames.push(env);
                }
            }
            _ => break,
        }
    }
    frames
}

// ---------------------------------------------------------------------------
// Topic filtering + backpressure
// ---------------------------------------------------------------------------

#[tokio::test]
async fn ws_only_delivers_subscribed_topics() {
    let (addr, token, state) = spawn_engine().await;
    let mut ws = ws_connect(addr, &token).await;

    ws.send(Message::Text(sub_frame(&["session:abc"])))
        .await
        .unwrap();
    // Let the server apply the subscription.
    tokio::time::sleep(Duration::from_millis(50)).await;

    // Emit one event on the subscribed topic and one on a different one.
    state.events.emit(HoustonEvent::FeedItem {
        agent_path: "/a".into(),
        session_key: "abc".into(),
        item: FeedItem::AssistantText("hello".into()),
    });
    state.events.emit(HoustonEvent::FeedItem {
        agent_path: "/a".into(),
        session_key: "xyz".into(),
        item: FeedItem::AssistantText("should not arrive".into()),
    });

    let events: Vec<_> = drain_for(&mut ws, 400)
        .await
        .into_iter()
        .filter(|e| e.kind == EnvelopeKind::Event)
        .filter(|e| e.payload.get("type").and_then(|v| v.as_str()) == Some("FeedItem"))
        .collect();
    assert_eq!(
        events.len(),
        1,
        "expected exactly one FeedItem, got {}",
        events.len()
    );
    let data = events[0].payload.get("data").unwrap();
    assert_eq!(data["session_key"], "abc");
}

#[tokio::test]
async fn ws_unsub_stops_delivery() {
    let (addr, token, state) = spawn_engine().await;
    let mut ws = ws_connect(addr, &token).await;

    ws.send(Message::Text(sub_frame(&["session:k"])))
        .await
        .unwrap();
    tokio::time::sleep(Duration::from_millis(50)).await;

    state.events.emit(HoustonEvent::SessionStatus {
        agent_path: "/a".into(),
        session_key: "k".into(),
        status: "running".into(),
        error: None,
    });
    let _ = drain_for(&mut ws, 200).await;

    let unsub = ClientRequest::Unsub {
        topics: vec!["session:k".into()],
    };
    let env = EngineEnvelope {
        v: 1,
        id: "t".into(),
        kind: EnvelopeKind::Req,
        ts: 0,
        payload: serde_json::to_value(&unsub).unwrap(),
    };
    ws.send(Message::Text(serde_json::to_string(&env).unwrap()))
        .await
        .unwrap();
    tokio::time::sleep(Duration::from_millis(50)).await;

    state.events.emit(HoustonEvent::SessionStatus {
        agent_path: "/a".into(),
        session_key: "k".into(),
        status: "completed".into(),
        error: None,
    });
    let frames: Vec<_> = drain_for(&mut ws, 300)
        .await
        .into_iter()
        .filter(|e| e.kind == EnvelopeKind::Event)
        .filter(|e| e.payload.get("type").and_then(|v| v.as_str()) == Some("SessionStatus"))
        .collect();
    assert!(
        frames.is_empty(),
        "expected no SessionStatus after unsub, got {}",
        frames.len()
    );
}

#[tokio::test]
async fn ws_multi_client_same_session_bounded_memory() {
    // N WS clients all subscribe to `session:hot`. Server floods 10_000
    // events (far exceeding per-conn capacity 1024). Without backpressure
    // this would balloon memory / deadlock. With per-conn mpsc + drop
    // policy, every client finishes reading a bounded amount and we see at
    // least one LagMarker per client when the drop path is exercised.
    const CLIENTS: usize = 8;
    const EVENTS: usize = 10_000;

    let (addr, token, state) = spawn_engine().await;
    let mut conns = Vec::with_capacity(CLIENTS);
    for _ in 0..CLIENTS {
        let mut ws = ws_connect(addr, &token).await;
        ws.send(Message::Text(sub_frame(&["session:hot"])))
            .await
            .unwrap();
        conns.push(ws);
    }
    tokio::time::sleep(Duration::from_millis(100)).await;

    // Emit finals (not streaming) so they DON'T fall under the low-sev drop
    // path. They'll collide with mpsc capacity and either coalesce (for
    // SessionStatus) or trigger LagMarker. Mixing both exercises the code.
    for i in 0..EVENTS {
        if i % 3 == 0 {
            state.events.emit(HoustonEvent::SessionStatus {
                agent_path: "/a".into(),
                session_key: "hot".into(),
                status: format!("step-{i}"),
                error: None,
            });
        } else {
            state.events.emit(HoustonEvent::FeedItem {
                agent_path: "/a".into(),
                session_key: "hot".into(),
                item: FeedItem::AssistantText(format!("msg-{i}")),
            });
        }
    }

    // Each client must make progress within a short deadline. That's the
    // deadlock / unbounded-memory canary: a stuck forwarder or unbounded
    // queue would either time out or OOM here. We drain until the stream
    // quiesces (gap > 250ms) instead of expecting a fixed count — the
    // exact delivered count depends on interleaving and drop policy.
    for (idx, mut ws) in conns.into_iter().enumerate() {
        let mut total = 0usize;
        let mut saw_lag = false;
        loop {
            match tokio::time::timeout(Duration::from_millis(250), ws.next()).await {
                Ok(Some(Ok(Message::Text(t)))) => {
                    if let Ok(env) = serde_json::from_str::<EngineEnvelope>(&t) {
                        if env.kind == EnvelopeKind::Event {
                            total += 1;
                            if env.payload.get("type").and_then(|v| v.as_str()) == Some("Lag") {
                                saw_lag = true;
                            }
                        }
                    }
                }
                Ok(Some(Ok(_))) => {}
                // Timeout — stream went quiet. Backpressure is working; we
                // stop draining and check invariants.
                Err(_) => break,
                Ok(None) | Ok(Some(Err(_))) => break,
            }
        }
        // Sanity: enough frames to prove the forwarder isn't wedged after
        // the first event.
        assert!(
            total >= 100,
            "client {idx}: expected some delivery, got {total}"
        );
        // Must stay bounded — never deliver more than per-conn capacity
        // plus a handful of LagMarkers + coalesced status flushes.
        assert!(
            total <= 1024 + 64,
            "client {idx}: expected bounded delivery, got {total}"
        );
        // With 10k events and a 1024-slot queue, we MUST have dropped some
        // and emitted at least one LagMarker.
        assert!(saw_lag, "client {idx}: expected at least one LagMarker");
    }
}

#[tokio::test]
async fn ws_low_severity_streaming_dropped_silently() {
    // Flood streaming deltas (low severity). The forwarder should drop them
    // under pressure WITHOUT emitting a LagMarker (that's the point — UI
    // doesn't need to refetch streaming deltas; finals will follow).
    let (addr, token, state) = spawn_engine().await;
    let mut ws = ws_connect(addr, &token).await;
    ws.send(Message::Text(sub_frame(&["session:k"])))
        .await
        .unwrap();
    tokio::time::sleep(Duration::from_millis(100)).await;

    for i in 0..5000 {
        state.events.emit(HoustonEvent::FeedItem {
            agent_path: "/a".into(),
            session_key: "k".into(),
            item: FeedItem::AssistantTextStreaming(format!("chunk-{i}")),
        });
    }

    // Drain for a short window — we just want to verify no deadlock and at
    // least some frames get through.
    let frames = drain_for(&mut ws, 500).await;
    let event_count = frames
        .iter()
        .filter(|e| e.kind == EnvelopeKind::Event)
        .filter(|e| e.payload.get("type").and_then(|v| v.as_str()) == Some("FeedItem"))
        .count();
    // Proves the queue keeps advancing (not wedged) and stayed bounded.
    assert!(event_count > 0, "expected some streaming frames to arrive");
    assert!(
        event_count < 5000,
        "expected backpressure to drop some streaming frames, got {event_count}"
    );
}

// ---------------------------------------------------------------------------
// REST routes
// ---------------------------------------------------------------------------

#[tokio::test]
async fn rest_cancel_nonexistent_session_returns_false() {
    let (addr, token, _state) = spawn_engine().await;
    let encoded_path = urlencoding::encode("/tmp/houston-test-agent");
    let url = format!("http://{addr}/v1/agents/{encoded_path}/sessions/no-such:cancel");
    let res = reqwest::Client::new()
        .post(&url)
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), 200);
    let body: serde_json::Value = res.json().await.unwrap();
    assert_eq!(body["cancelled"], false);
}

#[tokio::test]
async fn rest_cancel_existing_session_emits_events() {
    // Insert a fake PID into the pid map, then call cancel. The CLI kill
    // side-effect is tolerated (no real process) — we just verify the
    // emitted events land on the `session:{key}` WS topic.
    let (addr, token, state) = spawn_engine().await;
    state
        .engine
        .sessions
        .pid_map
        .insert("k1".into(), 999_999)
        .await;

    let mut ws = ws_connect(addr, &token).await;
    ws.send(Message::Text(sub_frame(&["session:k1"])))
        .await
        .unwrap();
    tokio::time::sleep(Duration::from_millis(80)).await;

    let encoded_path = urlencoding::encode("/tmp/houston-fake");
    let url = format!("http://{addr}/v1/agents/{encoded_path}/sessions/k1:cancel");
    let res = reqwest::Client::new()
        .post(&url)
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), 200);
    let body: serde_json::Value = res.json().await.unwrap();
    assert_eq!(body["cancelled"], true);

    let events: Vec<_> = drain_for(&mut ws, 500)
        .await
        .into_iter()
        .filter(|e| e.kind == EnvelopeKind::Event)
        .collect();
    let has_status_completed = events.iter().any(|e| {
        e.payload.get("type").and_then(|v| v.as_str()) == Some("SessionStatus")
            && e.payload
                .get("data")
                .and_then(|d| d.get("status"))
                .and_then(|s| s.as_str())
                == Some("completed")
    });
    assert!(
        has_status_completed,
        "expected completed status, got {events:?}"
    );
}

#[tokio::test]
async fn rest_cancel_requires_colon_cancel_suffix() {
    let (addr, token, _state) = spawn_engine().await;
    let encoded_path = urlencoding::encode("/tmp/x");
    let url = format!("http://{addr}/v1/agents/{encoded_path}/sessions/k:bogus");
    let res = reqwest::Client::new()
        .post(&url)
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), 400);
}
