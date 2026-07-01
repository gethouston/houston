//! Integration tests for `/v1/agents/files/*` REST slice.

use base64::Engine as _;
use houston_engine_server::{build_router, ServerConfig, ServerState};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;

async fn spawn_with_agent() -> (SocketAddr, String, String, tempfile::TempDir) {
    let token = "ftoken".to_string();
    let docs = tempfile::TempDir::new().unwrap();
    let home = tempfile::TempDir::new().unwrap();
    let agent_dir = docs.path().join("alpha");
    std::fs::create_dir_all(&agent_dir).unwrap();

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
    (addr, token, agent_dir.to_string_lossy().to_string(), docs)
}

#[tokio::test]
async fn read_missing_returns_empty_string() {
    let (addr, tok, agent_path, _docs) = spawn_with_agent().await;
    let c = reqwest::Client::new();

    let body: serde_json::Value = c
        .post(format!("http://{addr}/v1/agents/files/read"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({
            "agent_path": agent_path,
            "rel_path": ".houston/activity/activity.json"
        }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(body["content"], "");
}

#[tokio::test]
async fn write_then_read_round_trip() {
    let (addr, tok, agent_path, _docs) = spawn_with_agent().await;
    let c = reqwest::Client::new();

    let res = c
        .post(format!("http://{addr}/v1/agents/files/write"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({
            "agent_path": agent_path,
            "rel_path": ".houston/activity/activity.json",
            "content": "[]"
        }))
        .send()
        .await
        .unwrap();
    assert!(res.status().is_success());

    let body: serde_json::Value = c
        .post(format!("http://{addr}/v1/agents/files/read"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({
            "agent_path": agent_path,
            "rel_path": ".houston/activity/activity.json"
        }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(body["content"], "[]");
}

#[tokio::test]
async fn write_traversal_rejected_400() {
    let (addr, tok, agent_path, _docs) = spawn_with_agent().await;
    let c = reqwest::Client::new();

    let res = c
        .post(format!("http://{addr}/v1/agents/files/write"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({
            "agent_path": agent_path,
            "rel_path": "../escape.txt",
            "content": "x"
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), 400);
}

#[tokio::test]
async fn project_files_listing_and_mutations() {
    let (addr, tok, agent_path, _docs) = spawn_with_agent().await;
    let c = reqwest::Client::new();

    // Empty.
    let list: Vec<serde_json::Value> = c
        .get(format!("http://{addr}/v1/agents/files"))
        .query(&[("agent_path", &agent_path)])
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(list.len(), 0);

    // Create folder.
    let folder: serde_json::Value = c
        .post(format!("http://{addr}/v1/agents/files/folder"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({
            "agent_path": agent_path,
            "folder_name": "docs"
        }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(folder["created"], "docs");

    // Import bytes (base64).
    let png_bytes = b"fake-png";
    let b64 = base64::engine::general_purpose::STANDARD.encode(png_bytes);
    let imported: serde_json::Value = c
        .post(format!("http://{addr}/v1/agents/files/import-bytes"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({
            "agent_path": agent_path,
            "file_name": "snap.png",
            "data_base64": b64,
        }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(imported["name"], "snap.png");
    assert_eq!(imported["extension"], "png");

    // List now shows the docs folder + snap.png.
    let list: Vec<serde_json::Value> = c
        .get(format!("http://{addr}/v1/agents/files"))
        .query(&[("agent_path", &agent_path)])
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let names: Vec<&str> = list.iter().map(|f| f["name"].as_str().unwrap()).collect();
    assert!(names.contains(&"docs"));
    assert!(names.contains(&"snap.png"));

    // Rename.
    let rn = c
        .post(format!("http://{addr}/v1/agents/files/rename"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({
            "agent_path": agent_path,
            "rel_path": "snap.png",
            "new_name": "renamed.png"
        }))
        .send()
        .await
        .unwrap();
    assert!(rn.status().is_success());

    // Delete.
    let del = c
        .delete(format!("http://{addr}/v1/agents/files"))
        .query(&[
            ("agent_path", agent_path.as_str()),
            ("rel_path", "renamed.png"),
        ])
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap();
    assert!(del.status().is_success());

    // Delete missing → 404.
    let miss = c
        .delete(format!("http://{addr}/v1/agents/files"))
        .query(&[("agent_path", agent_path.as_str()), ("rel_path", "ghost.png")])
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap();
    assert_eq!(miss.status(), 404);
}

#[tokio::test]
async fn seed_schemas_and_migrate() {
    let (addr, tok, agent_path, _docs) = spawn_with_agent().await;
    let c = reqwest::Client::new();

    let s = c
        .post(format!("http://{addr}/v1/agents/files/seed-schemas"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({ "agent_path": agent_path }))
        .send()
        .await
        .unwrap();
    assert!(s.status().is_success());

    let m = c
        .post(format!("http://{addr}/v1/agents/files/migrate"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({ "agent_path": agent_path }))
        .send()
        .await
        .unwrap();
    assert!(m.status().is_success());
}

#[tokio::test]
async fn download_returns_raw_bytes_with_headers() {
    let (addr, tok, agent_path, _docs) = spawn_with_agent().await;
    let c = reqwest::Client::new();

    let payload: Vec<u8> = vec![0x50, 0x4b, 0x03, 0x04, 0xff, 0x00, 0x80];
    std::fs::write(std::path::Path::new(&agent_path).join("deck.pptx"), &payload).unwrap();

    let res = c
        .get(format!("http://{addr}/v1/agents/files/download"))
        .query(&[("agent_path", agent_path.as_str()), ("rel_path", "deck.pptx")])
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap();
    assert!(res.status().is_success());
    assert_eq!(
        res.headers()["content-type"],
        "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    );
    let dispo = res.headers()["content-disposition"].to_str().unwrap().to_string();
    assert!(dispo.contains("attachment"));
    assert!(dispo.contains("deck.pptx"));
    assert_eq!(res.bytes().await.unwrap().to_vec(), payload);
}

#[tokio::test]
async fn download_traversal_rejected_and_missing_404() {
    let (addr, tok, agent_path, _docs) = spawn_with_agent().await;
    let c = reqwest::Client::new();

    let bad = c
        .get(format!("http://{addr}/v1/agents/files/download"))
        .query(&[("agent_path", agent_path.as_str()), ("rel_path", "../escape.txt")])
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap();
    assert_eq!(bad.status(), 400);

    let miss = c
        .get(format!("http://{addr}/v1/agents/files/download"))
        .query(&[("agent_path", agent_path.as_str()), ("rel_path", "nope.pdf")])
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap();
    assert_eq!(miss.status(), 404);
}
