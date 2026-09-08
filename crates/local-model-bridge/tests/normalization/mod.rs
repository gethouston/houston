use super::*;
use std::time::Duration;

async fn read_request(stream: &mut TcpStream) -> String {
    let mut bytes = Vec::new();
    let mut byte = [0];
    while !bytes.ends_with(b"\r\n\r\n") {
        stream.read_exact(&mut byte).await.unwrap();
        bytes.push(byte[0]);
    }
    let headers = String::from_utf8(bytes).unwrap();
    let length = headers.lines().find_map(|line| {
        let (name, value) = line.split_once(':')?;
        name.eq_ignore_ascii_case("content-length")
            .then(|| value.trim().parse::<usize>().unwrap())
    });
    if let Some(length) = length {
        stream.read_exact(&mut vec![0; length]).await.unwrap();
    }
    headers
}

async fn request(socket: &mut Socket, operation: &str) -> Uuid {
    let id = Uuid::new_v4();
    start(socket, id, operation).await;
    if operation == "chat" {
        send(
            socket,
            json!({"type":"request_chunk","requestId":id,"sequence":0,
            "data":STANDARD.encode(br#"{"model":"selected","messages":[]}"#)}),
        )
        .await;
        assert_eq!(receive(socket).await["type"], "window");
    }
    send(socket, json!({"type":"request_end","requestId":id})).await;
    id
}

async fn completed(socket: &mut Socket, id: Uuid, content_type: &str) -> Vec<u8> {
    let start = receive(socket).await;
    assert_eq!(start["type"], "response_start", "{start}");
    assert_eq!(start["requestId"], id.to_string());
    assert_eq!(start["status"], 200);
    assert_eq!(start["contentType"], content_type);
    let mut body = Vec::new();
    let mut sequence = 0;
    loop {
        let frame = receive(socket).await;
        assert_eq!(frame["requestId"], id.to_string());
        if frame["type"] == "response_end" {
            return body;
        }
        assert_eq!(frame["type"], "response_chunk", "{frame}");
        assert_eq!(frame["sequence"], sequence);
        body.extend(STANDARD.decode(frame["data"].as_str().unwrap()).unwrap());
        sequence += 1;
    }
}

async fn target_paths(suffix: &str, prefix: &str, host: &str) {
    let http = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let target = format!(
        "http://{host}:{}{suffix}",
        http.local_addr().unwrap().port()
    );
    let prefix = prefix.to_owned();
    let local = tokio::spawn(async move {
        for (method, path, body) in [
            ("GET", "models", r#"{"data":[{"id":"selected"}]}"#),
            ("POST", "chat/completions", r#"{"choices":[]}"#),
        ] {
            let (mut stream, _) = http.accept().await.unwrap();
            let headers = read_request(&mut stream).await;
            assert!(
                headers.starts_with(&format!("{method} {prefix}/{path} HTTP/1.1")),
                "{headers}"
            );
            stream.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).as_bytes()).await.unwrap();
        }
    });
    let (address, relay_task) = relay().await;
    let mut handle = connect(config(address, target), |_| {}).await.unwrap();
    let mut socket = relay_task.await.unwrap();
    for operation in ["models", "chat"] {
        let id = request(&mut socket, operation).await;
        let body = completed(&mut socket, id, "application/json").await;
        assert!(serde_json::from_slice::<Value>(&body).is_ok());
    }
    handle.shutdown().await.unwrap();
    local.await.unwrap();
}

#[tokio::test]
async fn detection_and_legacy_origin_targets_use_v1() {
    // Detection and saved legacy targetBaseUrl both use this origin-only shape.
    for host in ["127.0.0.1", "localhost"] {
        for suffix in ["", "/"] {
            target_paths(suffix, "/v1", host).await;
        }
    }
}

#[tokio::test]
async fn explicit_api_prefixes_are_preserved() {
    for prefix in ["/v1", "/api/openai/v1", "/custom"] {
        for suffix in [prefix.to_owned(), format!("{prefix}/")] {
            target_paths(&suffix, prefix, "127.0.0.1").await;
        }
    }
}

#[tokio::test]
async fn parameterized_media_types_stream_and_reuse_connection() {
    let cases = [
        (
            "application/json; charset=utf-8",
            "application/json",
            "{\"choices\":[]}",
        ),
        (
            "text/event-stream; charset=utf-8",
            "text/event-stream",
            "data: done\n\n",
        ),
        (
            "Application/JSON; Charset=\"utf-8\"",
            "application/json",
            "{}",
        ),
        (
            "Text/Event-Stream ; charset=utf-8",
            "text/event-stream",
            "data: x\n\n",
        ),
    ];
    let http = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let target = format!("http://{}/v1", http.local_addr().unwrap());
    let (finish_tx, mut finish_rx) = mpsc::channel(1);
    let local = tokio::spawn(async move {
        for (header, _, body) in cases {
            let (mut stream, _) = http.accept().await.unwrap();
            read_request(&mut stream).await;
            stream.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: {header}\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n{:x}\r\n{body}\r\n", body.len()).as_bytes()).await.unwrap();
            // The bridge must deliver the first chunk before the upstream finishes.
            finish_rx.recv().await.unwrap();
            stream.write_all(b"0\r\n\r\n").await.unwrap();
        }
    });
    let (address, relay_task) = relay().await;
    let mut handle = connect(config(address, target), |_| {}).await.unwrap();
    let mut socket = relay_task.await.unwrap();
    for (_, media_type, body) in cases {
        let id = request(&mut socket, "chat").await;
        let frame = receive(&mut socket).await;
        assert_eq!(frame["type"], "response_start");
        // This is the Go session's allowlist; a parameter here closes the session.
        assert_eq!(frame["contentType"], media_type);
        assert_eq!(frame["requestId"], id.to_string());
        let frame = receive(&mut socket).await;
        assert_eq!(frame["type"], "response_chunk");
        assert_eq!(frame["sequence"], 0);
        assert_eq!(
            STANDARD.decode(frame["data"].as_str().unwrap()).unwrap(),
            body.as_bytes()
        );
        finish_tx.send(()).await.unwrap();
        let frame = receive(&mut socket).await;
        assert_eq!(frame["type"], "response_end");
        assert_eq!(frame["requestId"], id.to_string());
    }
    handle.shutdown().await.unwrap();
    local.await.unwrap();
}

#[tokio::test]
async fn origin_normalization_does_not_follow_redirects() {
    let redirected = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let destination = format!("http://{}/v1/models", redirected.local_addr().unwrap());
    for location in [destination, "http://192.0.2.1/v1/models".into()] {
        let http = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let target = format!("http://{}/", http.local_addr().unwrap());
        let local = tokio::spawn(async move {
            for _ in 0..2 {
                let (mut stream, _) = http.accept().await.unwrap();
                let headers = read_request(&mut stream).await;
                assert!(headers.starts_with("GET /v1/models HTTP/1.1"));
                stream.write_all(format!("HTTP/1.1 307 Temporary Redirect\r\nLocation: {location}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").as_bytes()).await.unwrap();
            }
        });
        let (address, relay_task) = relay().await;
        let mut handle = connect(config(address, target), |_| {}).await.unwrap();
        let mut socket = relay_task.await.unwrap();
        for _ in 0..2 {
            let id = request(&mut socket, "models").await;
            let frame = receive(&mut socket).await;
            assert_eq!(
                frame,
                json!({"type":"response_error","requestId":id,"code":"upstream_failed"})
            );
        }
        assert!(
            tokio::time::timeout(Duration::from_millis(100), redirected.accept())
                .await
                .is_err()
        );
        handle.shutdown().await.unwrap();
        local.await.unwrap();
    }
}

#[tokio::test]
async fn unsupported_media_types_fail_only_the_request() {
    let http = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let target = format!("http://{}/v1", http.local_addr().unwrap());
    let unsupported = [
        "text/plain",
        "text/html; charset=utf-8",
        "application/jsonp",
        "application/problem+json",
        "",
        "; charset=utf-8",
    ];
    let local = tokio::spawn(async move {
        for header in unsupported
            .into_iter()
            .chain(["application/json; charset=utf-8"])
        {
            let (mut stream, _) = http.accept().await.unwrap();
            read_request(&mut stream).await;
            stream.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: {header}\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{{}}").as_bytes()).await.unwrap();
        }
    });
    let (address, relay_task) = relay().await;
    let mut handle = connect(config(address, target), |_| {}).await.unwrap();
    let mut socket = relay_task.await.unwrap();
    for _ in unsupported {
        let id = request(&mut socket, "chat").await;
        let frame = receive(&mut socket).await;
        assert_eq!(
            frame,
            json!({"type":"response_error","requestId":id,"code":"upstream_failed"})
        );
    }
    let id = request(&mut socket, "chat").await;
    assert_eq!(completed(&mut socket, id, "application/json").await, b"{}");
    handle.shutdown().await.unwrap();
    local.await.unwrap();
}
