//! Integration tests for the per-agent REST slices — typed CRUD over
//! `.houston/<type>/<type>.json`. Activities + config live under `/v1/agents/*`;
//! routines + routine runs live under the canonical `/v1/routines` +
//! `/v1/routine-runs` surface (this file exercises both).

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
    assert_eq!(act["status"], "running");
    let id = act["id"].as_str().unwrap().to_string();

    // Update.
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
    assert_eq!(updated["status"], "completed");

    // Update missing → 404.
    let missing = c
        .patch(format!("http://{addr}/v1/agents/activities/does-not-exist"))
        .query(&[("agent_path", &agent_path)])
        .bearer_auth(&tok)
        .json(&serde_json::json!({ "status": "failed" }))
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

    // Create a routine pinned to an explicit provider + model (HOU-418).
    let routine: serde_json::Value = c
        .post(format!("http://{addr}/v1/routines"))
        .query(&[("agentPath", &agent_path)])
        .bearer_auth(&tok)
        .json(&serde_json::json!({
            "name": "morning",
            "description": "",
            "prompt": "do the thing",
            "schedule": "0 9 * * *",
            "enabled": true,
            "suppress_when_silent": true,
            "provider": "openai",
            "model": "gpt-5.5",
            "effort": "high"
        }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let rid = routine["id"].as_str().unwrap().to_string();
    assert_eq!(routine["provider"], "openai");
    assert_eq!(routine["model"], "gpt-5.5");
    assert_eq!(routine["effort"], "high");

    // Re-point the override to a different provider + model.
    let rebound: serde_json::Value = c
        .patch(format!("http://{addr}/v1/routines/{rid}"))
        .query(&[("agentPath", &agent_path)])
        .bearer_auth(&tok)
        .json(&serde_json::json!({ "provider": "anthropic", "model": "claude-opus-4-8" }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(rebound["provider"], "anthropic");
    assert_eq!(rebound["model"], "claude-opus-4-8");

    // Create a run — the routine id is a path segment on this surface.
    let run: serde_json::Value = c
        .post(format!("http://{addr}/v1/routines/{rid}/runs"))
        .query(&[("agentPath", &agent_path)])
        .bearer_auth(&tok)
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
        .get(format!("http://{addr}/v1/routine-runs"))
        .query(&[("agentPath", &agent_path), ("routineId", &rid)])
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(runs_for.len(), 1);

    let upd: serde_json::Value = c
        .patch(format!("http://{addr}/v1/routine-runs/{run_id}"))
        .query(&[("agentPath", &agent_path)])
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
        .delete(format!("http://{addr}/v1/routines/{rid}"))
        .query(&[("agentPath", &agent_path)])
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
