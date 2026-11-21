use houston_local_model_bridge::{connect, BridgeConfig, BridgeError};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};

fn config(connect_url: String) -> BridgeConfig {
    BridgeConfig {
        connect_url,
        target_base_url: "http://127.0.0.1:9/v1".into(),
        ticket: "test-ticket".into(),
        model: "selected".into(),
        local_api_key: None,
    }
}

async fn refusing_relay(status: &'static str) -> String {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = format!("ws://{}/bridge", listener.local_addr().unwrap());
    tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.unwrap();
        let mut request = [0u8; 4096];
        assert!(stream.read(&mut request).await.unwrap() > 0);
        stream
            .write_all(format!("HTTP/1.1 {status}\r\nContent-Length: 0\r\n\r\n").as_bytes())
            .await
            .unwrap();
    });
    address
}

#[tokio::test]
async fn http_refusal_carries_its_status() {
    for (line, status) in [
        ("401 Unauthorized", 401),
        ("502 Bad Gateway", 502),
        ("503 Service Unavailable", 503),
    ] {
        let address = refusing_relay(line).await;
        let error = connect(config(address), |_| {}).await.err().unwrap();
        assert_eq!(error, BridgeError::Refused { status });
        assert_eq!(
            error.to_string(),
            format!("Bridge connection refused ({status})")
        );
    }
}

#[tokio::test]
async fn unreachable_relay_stays_a_connection_failure() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = format!("ws://{}/bridge", listener.local_addr().unwrap());
    drop(listener);
    let error = connect(config(address), |_| {}).await.err().unwrap();
    assert_eq!(error, BridgeError::Connection);
    assert_eq!(error.to_string(), "Bridge connection failed");
}
