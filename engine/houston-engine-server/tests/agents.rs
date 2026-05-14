//! Integration tests for `/v1/agents/*` REST slice — typed CRUD over
//! `.houston/<type>/<type>.json`.

use houston_engine_server::{build_router, ServerConfig, ServerState};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;

/// Spin up an isolated server instance backed by tempdirs. Returns server URL,
/// auth token, and an agent_path that callers can pass via `?agent_path=...`.
async fn spawn_with_agent() -> (SocketAddr, String, String, tempfile::TempDir) {
    let token = "agtoken".to_string();
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
async fn activity_lifecycle_over_http() {
    let (addr, tok, agent_path, _docs) = spawn_with_agent().await;
    let c = reqwest::Client::new();

    // Empty list.
    let list: serde_json::Value = c
        .get(format!("http://{addr}/v1/agents/activities"))
        .query(&[("agent_path", &agent_path)])
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(list.as_array().unwrap().len(), 0);

    // Create.
    let act: serde_json::Value = c
        .post(format!("http://{addr}/v1/agents/activities"))
        .query(&[("agent_path", &agent_path)])
        .bearer_auth(&tok)
        .json(&serde_json::json!({
            "title": "first",
            "description": "the first activity",
            "agent": "execution"
        }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(act["title"], "first");
    // Activities are born `queued`; `sessions::start` promotes to `running`.
    assert_eq!(act["status"], "queued");
    let id = act["id"].as_str().unwrap().to_string();

    // Update. `"completed"` is accepted as a legacy alias for back-compat
    // with on-disk activity.json files written by older builds; the
    // canonical wire form is `"done"`, which is what writes normalise to.
    let updated: serde_json::Value = c
        .patch(format!("http://{addr}/v1/agents/activities/{id}"))
        .query(&[("agent_path", &agent_path)])
        .bearer_auth(&tok)
        .json(&serde_json::json!({ "status": "completed" }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(updated["status"], "done");

    // Update missing → 404. Status must be a valid wire value; invalid
    // strings now fail at serde with 422 before reaching the handler,
    // so this test specifically uses a valid status to exercise the
    // NotFound path inside the route.
    let missing = c
        .patch(format!("http://{addr}/v1/agents/activities/does-not-exist"))
        .query(&[("agent_path", &agent_path)])
        .bearer_auth(&tok)
        .json(&serde_json::json!({ "status": "cancelled" }))
        .send()
        .await
        .unwrap();
    assert_eq!(missing.status(), 404);

    // Delete.
    let del = c
        .delete(format!("http://{addr}/v1/agents/activities/{id}"))
        .query(&[("agent_path", &agent_path)])
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap();
    assert!(del.status().is_success());
}

#[tokio::test]
async fn routine_and_runs_lifecycle_over_http() {
    let (addr, tok, agent_path, _docs) = spawn_with_agent().await;
    let c = reqwest::Client::new();

    let routine: serde_json::Value = c
        .post(format!("http://{addr}/v1/agents/routines"))
        .query(&[("agent_path", &agent_path)])
        .bearer_auth(&tok)
        .json(&serde_json::json!({
            "name": "morning",
            "description": "",
            "prompt": "do the thing",
            "schedule": "0 9 * * *",
            "enabled": true,
            "suppress_when_silent": true
        }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let rid = routine["id"].as_str().unwrap().to_string();

    let run: serde_json::Value = c
        .post(format!("http://{addr}/v1/agents/routine-runs"))
        .query(&[("agent_path", &agent_path)])
        .bearer_auth(&tok)
        .json(&serde_json::json!({ "routine_id": rid }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(run["routine_id"], rid);
    assert_eq!(run["status"], "running");
    let run_id = run["id"].as_str().unwrap().to_string();

    let runs_for: Vec<serde_json::Value> = c
        .get(format!("http://{addr}/v1/agents/routine-runs"))
        .query(&[("agent_path", &agent_path), ("routine_id", &rid)])
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(runs_for.len(), 1);

    let upd: serde_json::Value = c
        .patch(format!("http://{addr}/v1/agents/routine-runs/{run_id}"))
        .query(&[("agent_path", &agent_path)])
        .bearer_auth(&tok)
        .json(&serde_json::json!({ "status": "surfaced" }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(upd["status"], "surfaced");

    let del = c
        .delete(format!("http://{addr}/v1/agents/routines/{rid}"))
        .query(&[("agent_path", &agent_path)])
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap();
    assert!(del.status().is_success());
}

#[tokio::test]
async fn config_round_trip_over_http() {
    let (addr, tok, agent_path, _docs) = spawn_with_agent().await;
    let c = reqwest::Client::new();

    let written: serde_json::Value = c
        .put(format!("http://{addr}/v1/agents/config"))
        .query(&[("agent_path", &agent_path)])
        .bearer_auth(&tok)
        .json(&serde_json::json!({
            "name": "alpha",
            "provider": "anthropic",
            "model": "sonnet",
            "worktreeMode": "always"
        }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(written["provider"], "anthropic");

    let read: serde_json::Value = c
        .get(format!("http://{addr}/v1/agents/config"))
        .query(&[("agent_path", &agent_path)])
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(read["name"], "alpha");
    assert_eq!(read["model"], "sonnet");
    // `extra` round-trips via #[serde(flatten)]
    assert_eq!(read["worktreeMode"], "always");
}

// Conversation listing endpoints live at /v1/conversations/* (covered by
// `conversations.rs` integration tests in this crate).

#[tokio::test]
async fn missing_agent_path_returns_400() {
    let (addr, tok, _agent, _docs) = spawn_with_agent().await;
    let c = reqwest::Client::new();
    let res = c
        .get(format!("http://{addr}/v1/agents/activities"))
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap();
    // Query deserialization fails → axum responds 400.
    assert_eq!(res.status(), 400);
}
