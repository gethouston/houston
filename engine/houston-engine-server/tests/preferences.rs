//! Integration tests for `/v1/preferences` REST slice.

use houston_engine_server::{build_router, ServerConfig, ServerState};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;

async fn spawn() -> (SocketAddr, String) {
    let token = "prefs-test".to_string();
    let home = tempfile::TempDir::new().unwrap();
    let docs = tempfile::TempDir::new().unwrap();
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
    let app = build_router(state);
    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    std::mem::forget(home);
    std::mem::forget(docs);
    (addr, token)
}

#[tokio::test]
async fn missing_preference_returns_null_value() {
    let (addr, tok) = spawn().await;
    let c = reqwest::Client::new();
    let body: serde_json::Value = c
        .get(format!("http://{addr}/v1/preferences/theme"))
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(body["value"].is_null(), "expected null got {body}");
}

#[tokio::test]
async fn put_then_get_roundtrip() {
    let (addr, tok) = spawn().await;
    let c = reqwest::Client::new();

    let put = c
        .put(format!("http://{addr}/v1/preferences/theme"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({ "value": "dark" }))
        .send()
        .await
        .unwrap();
    assert!(put.status().is_success(), "put failed {}", put.status());

    let body: serde_json::Value = c
        .get(format!("http://{addr}/v1/preferences/theme"))
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(body["value"], "dark");

    // Overwrite.
    c.put(format!("http://{addr}/v1/preferences/theme"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({ "value": "light" }))
        .send()
        .await
        .unwrap();

    let body: serde_json::Value = c
        .get(format!("http://{addr}/v1/preferences/theme"))
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(body["value"], "light");
}

#[tokio::test]
async fn unauthorized_without_token() {
    let (addr, _) = spawn().await;
    let res = reqwest::get(format!("http://{addr}/v1/preferences/theme"))
        .await
        .unwrap();
    assert_eq!(res.status(), 401);
}
