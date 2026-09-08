use base64::{engine::general_purpose::STANDARD, Engine};
use futures_util::{SinkExt, StreamExt};
use houston_local_model_bridge::{connect, BridgeConfig, BridgeError, BridgeStatus};
use serde_json::{json, Value};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
    sync::mpsc,
};
use tokio_tungstenite::{
    accept_hdr_async,
    tungstenite::{
        handshake::server::{Request, Response},
        Message,
    },
    WebSocketStream,
};
use uuid::Uuid;

type Socket = WebSocketStream<TcpStream>;
#[allow(clippy::result_large_err)] // Tungstenite fixes the handshake callback error type.
async fn relay() -> (String, tokio::task::JoinHandle<Socket>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = format!("ws://{}/bridge", listener.local_addr().unwrap());
    let task = tokio::spawn(async move {
        let (stream, _) = listener.accept().await.unwrap();
        let mut socket = accept_hdr_async(stream, |req: &Request, mut response: Response| {
            assert_eq!(req.headers()["authorization"], "Bearer test-ticket");
            response.headers_mut().insert(
                "Sec-WebSocket-Protocol",
                "houston-local-model.v1".parse().unwrap(),
            );
            Ok(response)
        })
        .await
        .unwrap();
        send(
            &mut socket,
            json!({"type":"ready","version":1,"generation":1,
            "sessionExpiresAt":(chrono::Utc::now()+chrono::Duration::minutes(10)).to_rfc3339()}),
        )
        .await;
        socket
    });
    (address, task)
}
fn config(address: String, target: String) -> BridgeConfig {
    BridgeConfig {
        connect_url: address,
        target_base_url: target,
        ticket: "test-ticket".into(),
        model: "selected".into(),
        local_api_key: Some("only-local".into()),
    }
}
async fn send(socket: &mut Socket, value: Value) {
    socket
        .send(Message::Text(value.to_string().into()))
        .await
        .unwrap();
}
async fn receive(socket: &mut Socket) -> Value {
    loop {
        match tokio::time::timeout(std::time::Duration::from_secs(3), socket.next())
            .await
            .unwrap()
            .unwrap()
            .unwrap()
        {
            Message::Text(text) => return serde_json::from_str(&text).unwrap(),
            Message::Ping(bytes) => socket.send(Message::Pong(bytes)).await.unwrap(),
            other => panic!("unexpected {other:?}"),
        }
    }
}
async fn start(socket: &mut Socket, id: Uuid, operation: &str) {
    send(
        socket,
        json!({"type":"request_start","requestId":id,"operation":operation,"model":"selected"}),
    )
    .await;
}
#[tokio::test]
async fn forwards_streamed_first_bytes_and_cancels_only_one_request() {
    let http = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let target = format!("http://{}/v1", http.local_addr().unwrap());
    let (closed_tx, mut closed_rx) = mpsc::channel(2);
    let local = tokio::spawn(async move {
        let mut tasks = tokio::task::JoinSet::new();
        for _ in 0..2 {
            let (mut stream, _) = http.accept().await.unwrap();
            let closed_tx = closed_tx.clone();
            tasks.spawn(async move {
                let mut request = [0u8; 4096];
                let size = stream.read(&mut request).await.unwrap();
                let request = String::from_utf8_lossy(&request[..size]);
                assert!(request.starts_with("POST /v1/chat/completions HTTP/1.1"));
                assert!(request.contains("authorization: Bearer only-local"));
                assert!(!request.contains("test-ticket"));
                stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nTransfer-Encoding: chunked\r\n\r\n6\r\ndata:x\r\n").await.unwrap();
                let mut byte = [0];
                let size = stream.read(&mut byte).await.unwrap();
                assert_eq!(size, 0);
                closed_tx.send(()).await.unwrap();
            });
        }
        while let Some(result) = tasks.join_next().await {
            result.unwrap();
        }
    });
    let (address, relay_task) = relay().await;
    let mut handle = connect(config(address, target), |_| {}).await.unwrap();
    let mut socket = relay_task.await.unwrap();
    let ids = [Uuid::new_v4(), Uuid::new_v4()];
    for id in ids {
        start(&mut socket, id, "chat").await;
        send(&mut socket, json!({"type":"request_chunk","requestId":id,"sequence":0,"data":STANDARD.encode(br#"{"model":"selected","messages":[]}"#)})).await;
        send(&mut socket, json!({"type":"request_end","requestId":id})).await;
    }
    let mut chunks = 0;
    while chunks < 2 {
        let packet = receive(&mut socket).await;
        if packet["type"] == "response_chunk" {
            assert_eq!(
                STANDARD.decode(packet["data"].as_str().unwrap()).unwrap(),
                b"data:x"
            );
            chunks += 1;
        }
    }
    send(&mut socket, json!({"type":"cancel","requestId":ids[0]})).await;
    let error = receive(&mut socket).await;
    assert_eq!(error["code"], "cancelled");
    tokio::time::timeout(std::time::Duration::from_secs(2), closed_rx.recv())
        .await
        .unwrap()
        .unwrap();
    assert!(closed_rx.try_recv().is_err(), "other inference stays open");
    handle.shutdown().await.unwrap();
    tokio::time::timeout(std::time::Duration::from_secs(2), closed_rx.recv())
        .await
        .unwrap()
        .unwrap();
    local.await.unwrap();
}
#[tokio::test]
async fn rejects_model_mismatch_without_contacting_local_server() {
    let http = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let (address, relay_task) = relay().await;
    let mut handle = connect(
        config(address, format!("http://{}/v1", http.local_addr().unwrap())),
        |_| {},
    )
    .await
    .unwrap();
    let mut socket = relay_task.await.unwrap();
    let id = Uuid::new_v4();
    start(&mut socket, id, "chat").await;
    send(&mut socket, json!({"type":"request_chunk","requestId":id,"sequence":0,"data":STANDARD.encode(br#"{"model":"foreign"}"#)})).await;
    assert_eq!(receive(&mut socket).await["type"], "window");
    send(&mut socket, json!({"type":"request_end","requestId":id})).await;
    assert_eq!(receive(&mut socket).await["code"], "invalid_request");
    assert!(
        tokio::time::timeout(std::time::Duration::from_millis(100), http.accept())
            .await
            .is_err()
    );
    handle.shutdown().await.unwrap();
}
#[tokio::test]
async fn rejects_bad_sequence_and_bounds_admission() {
    let (address, relay_task) = relay().await;
    let (events, mut statuses) = mpsc::unbounded_channel();
    let mut handle = connect(
        config(address, "http://127.0.0.1:1/v1".into()),
        move |event| {
            events.send(event).unwrap();
        },
    )
    .await
    .unwrap();
    let mut socket = relay_task.await.unwrap();
    let mut ids = Vec::new();
    for _ in 0..5 {
        let id = Uuid::new_v4();
        ids.push(id);
        start(&mut socket, id, "chat").await;
    }
    assert_eq!(receive(&mut socket).await["code"], "busy");
    // Frames already in flight for a rejected fifth upload cannot kill the four admitted requests.
    send(
        &mut socket,
        json!({"type":"request_chunk","requestId":ids[4],"sequence":0,"data":"eA=="}),
    )
    .await;
    send(
        &mut socket,
        json!({"type":"request_end","requestId":ids[4]}),
    )
    .await;
    send(&mut socket, json!({"type":"cancel","requestId":ids[1]})).await;
    assert_eq!(receive(&mut socket).await["code"], "cancelled");

    send(
        &mut socket,
        json!({"type":"request_chunk","requestId":ids[0],"sequence":1,"data":"eA=="}),
    )
    .await;
    loop {
        if let BridgeStatus::Offline { error } = statuses.recv().await.unwrap() {
            assert_eq!(error, Some(BridgeError::Protocol));
            break;
        }
    }
    handle.shutdown().await.unwrap();
}
#[tokio::test]
async fn rejects_non_loopback_and_noncanonical_targets() {
    for target in [
        "http://example.com/v1",
        "http://127.1/v1",
        "http://2130706433/v1",
        "http://user@127.0.0.1/v1",
        "http://127.0.0.1/v1?x=1",
        "file:///tmp",
    ] {
        assert!(
            matches!(
                connect(config("ws://127.0.0.1:1".into(), target.into()), |_| {}).await,
                Err(BridgeError::InvalidTarget)
            ),
            "{target}"
        );
    }
}

#[tokio::test]
async fn renews_drains_and_drop_closes_the_socket() {
    let (address, relay_task) = relay().await;
    let (events, mut statuses) = mpsc::unbounded_channel();
    let handle = connect(
        config(address, "http://127.0.0.1:1/v1".into()),
        move |event| {
            events.send(event).unwrap();
        },
    )
    .await
    .unwrap();
    let mut socket = relay_task.await.unwrap();
    let renewal_task = tokio::spawn(async move {
        handle.renew("renewal-ticket".into()).await.unwrap();
        handle
    });
    let renewal = receive(&mut socket).await;
    assert_eq!(renewal["type"], "renew");
    assert_eq!(renewal["ticket"], "renewal-ticket");
    send(&mut socket, json!({"type":"renewed","sessionExpiresAt":(chrono::Utc::now()+chrono::Duration::seconds(630)).to_rfc3339()})).await;
    loop {
        if matches!(statuses.recv().await.unwrap(), BridgeStatus::Renewed { .. }) {
            break;
        }
    }
    send(&mut socket, json!({"type":"drain"})).await;
    start(&mut socket, Uuid::new_v4(), "chat").await;
    assert_eq!(receive(&mut socket).await["code"], "busy");
    let handle = renewal_task.await.unwrap();
    drop(handle);
    tokio::time::timeout(std::time::Duration::from_secs(2), async {
        loop {
            match socket.next().await {
                None | Some(Err(_)) | Some(Ok(Message::Close(_))) => break,
                Some(Ok(Message::Ping(_) | Message::Pong(_))) => continue,
                other => panic!("Unexpected data after bridge shutdown: {other:?}"),
            }
        }
    })
    .await
    .unwrap();
}

#[tokio::test]
async fn response_window_bounds_slow_consumer_without_blocking_cancel() {
    let http = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let target = format!("http://{}/v1", http.local_addr().unwrap());
    let local = tokio::spawn(async move {
        let (mut stream, _) = http.accept().await.unwrap();
        let mut request = [0; 4096];
        assert!(stream.read(&mut request).await.unwrap() > 0);
        stream
            .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 524288\r\n\r\n")
            .await
            .unwrap();
        stream.write_all(&vec![b'x'; 524288]).await.unwrap();
    });
    let (address, relay_task) = relay().await;
    let mut handle = connect(config(address, target), |_| {}).await.unwrap();
    let mut socket = relay_task.await.unwrap();
    let id = Uuid::new_v4();
    start(&mut socket, id, "chat").await;
    send(&mut socket,json!({"type":"request_chunk","requestId":id,"sequence":0,"data":STANDARD.encode(br#"{"model":"selected"}"#)})).await;
    send(&mut socket, json!({"type":"request_end","requestId":id})).await;
    let mut total = 0;
    loop {
        let next = tokio::time::timeout(std::time::Duration::from_millis(200), socket.next()).await;
        let Ok(Some(Ok(message))) = next else {
            break;
        };
        match message {
            Message::Ping(bytes) => socket.send(Message::Pong(bytes)).await.unwrap(),
            Message::Text(text) => {
                let value: Value = serde_json::from_str(&text).unwrap();
                if value["type"] == "response_chunk" {
                    total += STANDARD
                        .decode(value["data"].as_str().unwrap())
                        .unwrap()
                        .len();
                }
                assert_ne!(value["type"], "response_end");
            }
            other => panic!("unexpected {other:?}"),
        }
    }
    assert!(total > 0 && total <= 262144);
    send(&mut socket, json!({"type":"cancel","requestId":id})).await;
    assert_eq!(receive(&mut socket).await["code"], "cancelled");
    handle.shutdown().await.unwrap();
    local.await.unwrap();
}
