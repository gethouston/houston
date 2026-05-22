//! Integration tests for `/v1/skills` REST slice.

use houston_engine_server::{build_router, ServerConfig, ServerState};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;

async fn spawn() -> (SocketAddr, String, tempfile::TempDir) {
    let token = "sktest".to_string();
    let docs = tempfile::TempDir::new().unwrap();
    let home = tempfile::TempDir::new().unwrap();
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
    (addr, token, docs)
}

#[tokio::test]
async fn list_create_load_save_delete_skill() {
    let (addr, tok, docs) = spawn().await;
    let ws_dir = docs.path().join("ws-a");
    std::fs::create_dir_all(&ws_dir).unwrap();
    let ws = ws_dir.to_string_lossy().to_string();
    let c = reqwest::Client::new();

    // Empty list.
    let list: serde_json::Value = c
        .get(format!("http://{addr}/v1/skills"))
        .query(&[("workspacePath", &ws)])
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(list.as_array().unwrap().len(), 0);

    // Create.
    let create_res = c
        .post(format!("http://{addr}/v1/skills"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({
            "workspacePath": ws,
            "name": "my-skill",
            "description": "Test skill",
            "content": "## Procedure\n\n1. Do stuff\n",
        }))
        .send()
        .await
        .unwrap();
    assert!(
        create_res.status().is_success(),
        "create: {}",
        create_res.status()
    );

    // Duplicate → 409.
    let dup = c
        .post(format!("http://{addr}/v1/skills"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({
            "workspacePath": ws,
            "name": "my-skill",
            "description": "Test",
            "content": "body",
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(dup.status(), 409);

    // List — sees the skill.
    let list: serde_json::Value = c
        .get(format!("http://{addr}/v1/skills"))
        .query(&[("workspacePath", &ws)])
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let arr = list.as_array().unwrap();
    assert_eq!(arr.len(), 1);
    assert_eq!(arr[0]["name"], "my-skill");

    // Load.
    let loaded: serde_json::Value = c
        .get(format!("http://{addr}/v1/skills/my-skill"))
        .query(&[("workspacePath", &ws)])
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(loaded["name"], "my-skill");
    assert!(loaded["content"].as_str().unwrap().contains("Do stuff"));

    // Save.
    let save_res = c
        .put(format!("http://{addr}/v1/skills/my-skill"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({
            "workspacePath": ws,
            "content": "## Procedure\nrewritten",
        }))
        .send()
        .await
        .unwrap();
    assert!(save_res.status().is_success());

    let reloaded: serde_json::Value = c
        .get(format!("http://{addr}/v1/skills/my-skill"))
        .query(&[("workspacePath", &ws)])
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(reloaded["version"], 2);
    assert!(reloaded["content"].as_str().unwrap().contains("rewritten"));

    // Claude symlink exists.
    assert!(
        ws_dir
            .join(".claude/skills/my-skill")
            .symlink_metadata()
            .is_ok(),
        ".claude/skills/<name> symlink must be created"
    );

    // Delete.
    let del = c
        .delete(format!("http://{addr}/v1/skills/my-skill"))
        .query(&[("workspacePath", &ws)])
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap();
    assert!(del.status().is_success());
    assert!(!ws_dir.join(".agents/skills/my-skill").exists());
    assert!(ws_dir
        .join(".claude/skills/my-skill")
        .symlink_metadata()
        .is_err());

    // Load missing → 404.
    let nf = c
        .get(format!("http://{addr}/v1/skills/nope"))
        .query(&[("workspacePath", &ws)])
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap();
    assert_eq!(nf.status(), 404);
}
