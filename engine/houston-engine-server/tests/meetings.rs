//! Integration tests for `/v1/meetings` REST slice.

use houston_engine_server::{build_router, ServerConfig, ServerState};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;

async fn spawn() -> (SocketAddr, String, tempfile::TempDir) {
    let token = "meetingtest".to_string();
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
async fn crud_meeting_lifecycle() {
    let (addr, tok, docs) = spawn().await;
    let agent = docs.path().join("ws").join("sales");
    std::fs::create_dir_all(&agent).unwrap();
    let agent_path = agent.to_string_lossy().to_string();
    let c = reqwest::Client::new();

    // Empty list.
    let list: serde_json::Value = c
        .get(format!("http://{addr}/v1/meetings"))
        .query(&[("agentPath", &agent_path)])
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(list.as_array().unwrap().len(), 0);

    // Create — default status upcoming.
    let m: serde_json::Value = c
        .post(format!("http://{addr}/v1/meetings"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({
            "agentPath": agent_path,
            "title": "Weekly Sync",
            "meet_url": "https://meet.google.com/abc-def-ghi",
            "bot_name": "Houston",
            "context": "Discuss roadmap",
        }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(m["title"], "Weekly Sync");
    assert_eq!(m["status"], "upcoming");
    assert_eq!(m["bot_name"], "Houston");
    let id = m["id"].as_str().unwrap().to_string();

    // List now has one item.
    let list2: serde_json::Value = c
        .get(format!("http://{addr}/v1/meetings"))
        .query(&[("agentPath", &agent_path)])
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(list2.as_array().unwrap().len(), 1);

    // Update status to live.
    let u: serde_json::Value = c
        .patch(format!("http://{addr}/v1/meetings/{id}"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({
            "agentPath": agent_path,
            "status": "live",
        }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(u["status"], "live");

    // Update caption_count and participants.
    let u2: serde_json::Value = c
        .patch(format!("http://{addr}/v1/meetings/{id}"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({
            "agentPath": agent_path,
            "caption_count": 10,
            "participants": ["Alice", "Bob"],
        }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(u2["caption_count"], 10);
    assert_eq!(u2["participants"].as_array().unwrap().len(), 2);

    // Delete.
    let del = c
        .delete(format!("http://{addr}/v1/meetings/{id}"))
        .query(&[("agentPath", &agent_path)])
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap();
    assert!(del.status().is_success());

    // List is empty again.
    let list3: serde_json::Value = c
        .get(format!("http://{addr}/v1/meetings"))
        .query(&[("agentPath", &agent_path)])
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(list3.as_array().unwrap().len(), 0);
}

#[tokio::test]
async fn create_with_explicit_live_status() {
    let (addr, tok, docs) = spawn().await;
    let agent = docs.path().join("ws").join("ops");
    std::fs::create_dir_all(&agent).unwrap();
    let agent_path = agent.to_string_lossy().to_string();
    let c = reqwest::Client::new();

    let m: serde_json::Value = c
        .post(format!("http://{addr}/v1/meetings"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({
            "agentPath": agent_path,
            "title": "Live call",
            "meet_url": "https://meet.google.com/xyz-xyz-xyz",
            "status": "live",
        }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(m["status"], "live");
    assert_eq!(m["caption_count"], 0);
    assert_eq!(m["summary_ready"], false);
}

#[tokio::test]
async fn update_missing_returns_404() {
    let (addr, tok, docs) = spawn().await;
    let agent = docs.path().join("ws").join("agent404");
    std::fs::create_dir_all(&agent).unwrap();
    let agent_path = agent.to_string_lossy().to_string();
    let c = reqwest::Client::new();

    let res = c
        .patch(format!("http://{addr}/v1/meetings/does-not-exist"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({
            "agentPath": agent_path,
            "status": "completed",
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), 404);
}

#[tokio::test]
async fn delete_missing_returns_404() {
    let (addr, tok, docs) = spawn().await;
    let agent = docs.path().join("ws").join("agentdel");
    std::fs::create_dir_all(&agent).unwrap();
    let agent_path = agent.to_string_lossy().to_string();
    let c = reqwest::Client::new();

    let res = c
        .delete(format!("http://{addr}/v1/meetings/does-not-exist"))
        .query(&[("agentPath", &agent_path)])
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), 404);
}

#[tokio::test]
async fn multiple_agents_have_isolated_meeting_lists() {
    let (addr, tok, docs) = spawn().await;
    let agent_a = docs.path().join("ws").join("agent-a");
    let agent_b = docs.path().join("ws").join("agent-b");
    std::fs::create_dir_all(&agent_a).unwrap();
    std::fs::create_dir_all(&agent_b).unwrap();
    let path_a = agent_a.to_string_lossy().to_string();
    let path_b = agent_b.to_string_lossy().to_string();
    let c = reqwest::Client::new();

    // Create a meeting in agent A.
    c.post(format!("http://{addr}/v1/meetings"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({
            "agentPath": path_a,
            "title": "A-only meeting",
            "meet_url": "https://meet.google.com/a-a-a",
        }))
        .send()
        .await
        .unwrap();

    // Agent B's list must be empty.
    let list_b: serde_json::Value = c
        .get(format!("http://{addr}/v1/meetings"))
        .query(&[("agentPath", &path_b)])
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(list_b.as_array().unwrap().len(), 0);

    // Agent A's list has one.
    let list_a: serde_json::Value = c
        .get(format!("http://{addr}/v1/meetings"))
        .query(&[("agentPath", &path_a)])
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(list_a.as_array().unwrap().len(), 1);
}
