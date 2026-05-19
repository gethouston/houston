//! Integration tests for `/v1/composio/*` REST slice.
//!
//! Composio CLI is detected via `~/.composio/composio` resolved against
//! `$HOME`. Tests point HOME at an empty tempdir so the CLI is reliably
//! reported as not installed — keeping the test hermetic.
//!
//! All checks live in a single test because `std::env::set_var` is
//! process-global and would race across parallel `#[tokio::test]`s.

use houston_engine_server::{build_router, ServerConfig, ServerState};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;

async fn spawn() -> (SocketAddr, String, tempfile::TempDir, tempfile::TempDir) {
    let token = "ctest".to_string();
    let docs = tempfile::TempDir::new().unwrap();
    let home = tempfile::TempDir::new().unwrap();
    // Point composio resolution at the empty tempdir so `is_installed()` is false.
    std::env::set_var("HOME", home.path());
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
    (addr, token, docs, home)
}

#[tokio::test]
async fn composio_routes_smoke() {
    let (addr, tok, _docs, _home) = spawn().await;
    let c = reqwest::Client::new();

    // Auth required.
    let unauth = c
        .get(format!("http://{addr}/v1/composio/status"))
        .send()
        .await
        .unwrap();
    assert_eq!(unauth.status(), 401);

    // CLI not installed.
    let ci: serde_json::Value = c
        .get(format!("http://{addr}/v1/composio/cli-installed"))
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(ci["installed"], false);

    // Status reports not_installed.
    let st: serde_json::Value = c
        .get(format!("http://{addr}/v1/composio/status"))
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(st["status"], "not_installed");

    // /composio/recommend: empty intent → 400.
    let bad = c
        .post(format!("http://{addr}/v1/composio/recommend"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({ "intent": "   " }))
        .send()
        .await
        .unwrap();
    assert_eq!(bad.status(), 400);

    // /composio/recommend: with stub catalog (no enriched toolkits in
    // this build) → 503 Unavailable. Once the enrichment script has run
    // and the bundled JSON is populated, the same call returns 200 with
    // a stack instead.
    let unavail = c
        .post(format!("http://{addr}/v1/composio/recommend"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({
            "intent": "validate leads from a form",
            "alreadyConnected": [],
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(unavail.status(), 503);
}
