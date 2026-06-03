//! Integration tests for `/v1/conversations` read-only slice.

use houston_engine_server::{build_router, ServerConfig, ServerState};
use std::net::SocketAddr;
use std::path::Path;
use std::sync::Arc;
use tokio::net::TcpListener;

async fn spawn() -> (SocketAddr, String) {
    let token = "convtest".to_string();
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

fn seed_activity(root: &Path, activities: serde_json::Value) {
    let rel = root.join(".houston").join("activity");
    std::fs::create_dir_all(&rel).unwrap();
    std::fs::write(
        rel.join("activity.json"),
        serde_json::to_string_pretty(&activities).unwrap(),
    )
    .unwrap();
}

#[tokio::test]
async fn list_empty_when_agent_has_no_activities() {
    let (addr, tok) = spawn().await;
    let agent = tempfile::TempDir::new().unwrap();
    let c = reqwest::Client::new();
    let body: serde_json::Value = c
        .post(format!("http://{addr}/v1/conversations/list"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({ "agentPath": agent.path().to_string_lossy() }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(body.as_array().unwrap().len(), 0);
}

#[tokio::test]
async fn list_returns_sorted_entries() {
    let (addr, tok) = spawn().await;
    let agent = tempfile::TempDir::new().unwrap();
    seed_activity(
        agent.path(),
        serde_json::json!([
            { "id": "old", "title": "Old",   "description": "",  "status": "done",    "updated_at": "2025-01-01T00:00:00Z" },
            { "id": "new", "title": "Newer", "description": "d", "status": "running", "updated_at": "2026-02-02T00:00:00Z" }
        ]),
    );
    let c = reqwest::Client::new();
    let body: serde_json::Value = c
        .post(format!("http://{addr}/v1/conversations/list"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({ "agentPath": agent.path().to_string_lossy() }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let arr = body.as_array().unwrap();
    assert_eq!(arr.len(), 2);
    assert_eq!(arr[0]["id"], "new");
    assert_eq!(arr[0]["session_key"], "activity-new");
    assert_eq!(arr[0]["type"], "activity");
}

#[tokio::test]
async fn list_returns_activity_card_metadata() {
    let (addr, tok) = spawn().await;
    let agent = tempfile::TempDir::new().unwrap();
    seed_activity(
        agent.path(),
        serde_json::json!([
            { "id": "routine-card", "title": "Digest", "description": "",
              "status": "needs_you", "session_key": "routine-r1",
              "routine_id": "r1", "agent": "research",
              "worktree_path": "/tmp/wt",
              "updated_at": "2026-02-02T00:00:00Z" }
        ]),
    );
    let c = reqwest::Client::new();
    let body: serde_json::Value = c
        .post(format!("http://{addr}/v1/conversations/list"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({ "agentPath": agent.path().to_string_lossy() }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let row = &body.as_array().unwrap()[0];
    assert_eq!(row["session_key"], "routine-r1");
    assert_eq!(row["routine_id"], "r1");
    assert_eq!(row["agent"], "research");
    assert_eq!(row["worktree_path"], "/tmp/wt");
}

#[tokio::test]
async fn list_all_aggregates_across_agents() {
    let (addr, tok) = spawn().await;
    let a = tempfile::TempDir::new().unwrap();
    let b = tempfile::TempDir::new().unwrap();
    seed_activity(
        a.path(),
        serde_json::json!([
            { "id": "x", "title": "X", "description": "", "status": "done",
              "updated_at": "2026-01-01T00:00:00Z" }
        ]),
    );
    seed_activity(
        b.path(),
        serde_json::json!([
            { "id": "y", "title": "Y", "description": "", "status": "done",
              "updated_at": "2026-03-01T00:00:00Z" }
        ]),
    );
    let c = reqwest::Client::new();
    let body: serde_json::Value = c
        .post(format!("http://{addr}/v1/conversations/list-all"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({
            "agentPaths": [
                a.path().to_string_lossy(),
                b.path().to_string_lossy(),
            ]
        }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let arr = body.as_array().unwrap();
    assert_eq!(arr.len(), 2);
    assert_eq!(arr[0]["id"], "y");
}

#[tokio::test]
async fn unauthorized_without_token() {
    let (addr, _) = spawn().await;
    let res = reqwest::Client::new()
        .post(format!("http://{addr}/v1/conversations/list"))
        .json(&serde_json::json!({ "agentPath": "/tmp/nope" }))
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), 401);
}
