//! Integration tests for `/v1/workflow-runs/:id/save-as-workflow`.

use houston_engine_core::workflows::{
    create_inline_workflow_run, types::InlineRunSpec, update_workflow_run,
    types::WorkflowRunUpdate,
};
use houston_engine_core::workflows::plan::parse_plan;
use houston_engine_server::{build_router, ServerConfig, ServerState};
use std::net::SocketAddr;
use std::sync::Arc;
use tempfile::TempDir;
use tokio::net::TcpListener;

async fn spawn_test_server() -> (SocketAddr, String) {
    let token = format!("wf-token-{}", uuid::Uuid::new_v4());
    let cfg = ServerConfig {
        bind: "127.0.0.1:0".parse().unwrap(),
        token: token.clone(),
        home_dir: std::env::temp_dir(),
        docs_dir: std::env::temp_dir(),
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
    (addr, token)
}

#[tokio::test]
async fn save_as_workflow_route_exists_and_promotes_done_run() {
    let (addr, token) = spawn_test_server().await;
    let agent_dir = TempDir::new().unwrap();
    let agent_path = agent_dir.path().to_string_lossy().to_string();

    let run = create_inline_workflow_run(
        agent_dir.path(),
        InlineRunSpec {
            plan_prompt: "Plan and ship".into(),
            name: Some("Ship feature".into()),
            description: Some("From chat".into()),
        },
    )
    .unwrap();
    let plan = parse_plan(
        r#"{"steps":[{"id":"a","task":"Do step A","depends_on":[],"use_worktree":false}]}"#,
    )
    .unwrap();
    update_workflow_run(
        agent_dir.path(),
        &run.id,
        WorkflowRunUpdate {
            status: Some("done".into()),
            plan: Some(plan),
            ..Default::default()
        },
    )
    .unwrap();

    let url = format!(
        "http://{addr}/v1/workflow-runs/{}/save-as-workflow?agentPath={}",
        run.id,
        urlencoding::encode(&agent_path)
    );
    let res = reqwest::Client::new()
        .post(url)
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();

    assert_eq!(
        res.status(),
        200,
        "save-as-workflow should be registered (got {}) body={}",
        res.status(),
        res.text().await.unwrap_or_default()
    );

    let body: serde_json::Value = res.json().await.unwrap();
    assert_eq!(body["name"], "Ship feature");
    assert!(body["plan"].is_object());
}

#[tokio::test]
async fn save_as_workflow_unknown_route_returns_404_not_plain_axum() {
    let (addr, token) = spawn_test_server().await;
    let res = reqwest::Client::new()
        .post(format!(
            "http://{addr}/v1/workflow-runs/not-a-real-id/save-as-workflow?agentPath={}",
            urlencoding::encode("/tmp/agent")
        ))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), 404);
    let body: serde_json::Value = res.json().await.unwrap();
    assert!(
        body["error"]["code"].as_str().is_some_and(|c| c.eq_ignore_ascii_case("not_found")),
        "expected not_found error body, got {body}"
    );
}
