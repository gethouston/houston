//! Integration tests for the `/v1/agents/portable/*` slice.

use houston_engine_server::{build_router, ServerConfig, ServerState};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;

async fn spawn() -> (SocketAddr, String, tempfile::TempDir) {
    let token = "portabletest".to_string();
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

fn seed_minimal_agent(root: &std::path::Path) {
    std::fs::create_dir_all(root.join(".agents/skills/draft-email")).unwrap();
    std::fs::write(root.join("CLAUDE.md"), "# Job\nHelp out.\n").unwrap();
    std::fs::write(
        root.join(".agents/skills/draft-email/SKILL.md"),
        "---\nname: draft-email\ndescription: Drafts emails\nintegrations: [gmail]\n---\n\n## Procedure\nDraft.\n",
    )
    .unwrap();
    std::fs::create_dir_all(root.join(".houston/routines")).unwrap();
    std::fs::write(
        root.join(".houston/routines/routines.json"),
        serde_json::to_string_pretty(&serde_json::json!([])).unwrap(),
    )
    .unwrap();
    std::fs::create_dir_all(root.join(".houston/learnings")).unwrap();
    std::fs::write(
        root.join(".houston/learnings/learnings.json"),
        serde_json::to_string_pretty(&serde_json::json!([])).unwrap(),
    )
    .unwrap();
    // Things the package must never ship.
    std::fs::create_dir_all(root.join(".houston/sessions/anthropic")).unwrap();
    std::fs::write(
        root.join(".houston/sessions/anthropic/main.sid"),
        "secret-session-id",
    )
    .unwrap();
}

#[tokio::test]
async fn preview_returns_summary_for_seeded_agent() {
    let (addr, tok, docs) = spawn().await;
    let agent = docs.path().join("ws").join("alpha");
    std::fs::create_dir_all(&agent).unwrap();
    seed_minimal_agent(&agent);
    let agent_path = agent.to_string_lossy().to_string();
    let c = reqwest::Client::new();

    let r: serde_json::Value = c
        .get(format!("http://{addr}/v1/agents/portable/preview"))
        .query(&[("agentPath", &agent_path)])
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();

    assert!(r["claudeMd"]["byteCount"].as_u64().unwrap() > 0);
    assert!(
        r["claudeMd"]["excerpt"]
            .as_str()
            .unwrap()
            .contains("Help out")
    );
    let skills = r["skills"].as_array().unwrap();
    assert_eq!(skills.len(), 1);
    assert_eq!(skills[0]["slug"], "draft-email");
    assert_eq!(skills[0]["description"], "Drafts emails");
    assert_eq!(skills[0]["integrations"][0], "gmail");
}

#[tokio::test]
async fn package_returns_zip_bytes_excluding_sessions() {
    let (addr, tok, docs) = spawn().await;
    let agent = docs.path().join("ws").join("beta");
    std::fs::create_dir_all(&agent).unwrap();
    seed_minimal_agent(&agent);
    let agent_path = agent.to_string_lossy().to_string();
    let c = reqwest::Client::new();

    let resp = c
        .post(format!("http://{addr}/v1/agents/portable/package"))
        .query(&[("agentPath", &agent_path)])
        .bearer_auth(&tok)
        .json(&serde_json::json!({
            "selection": {
                "includeClaudeMd": true,
                "includeSkillSlugs": ["draft-email"],
                "includeRoutineIds": [],
                "includeLearningIds": []
            },
            "meta": {
                "agentId": "beta",
                "agentName": "Beta Agent",
                "anonymized": false
            }
        }))
        .send()
        .await
        .unwrap();

    assert!(resp.status().is_success());
    assert_eq!(
        resp.headers()
            .get(reqwest::header::CONTENT_TYPE)
            .unwrap()
            .to_str()
            .unwrap(),
        "application/zip"
    );

    let bytes = resp.bytes().await.unwrap();
    let parsed = houston_agent_portable::parse_package(&bytes).unwrap();
    assert_eq!(parsed.manifest.agent_id, "beta");
    assert_eq!(parsed.manifest.counts.skills, 1);
    assert!(parsed.inventory.skills.iter().any(|s| s.slug == "draft-email"));

    // Confirm at the HTTP layer that no session secret slipped into the body.
    let payload = String::from_utf8_lossy(&bytes);
    assert!(!payload.contains("secret-session-id"));
}

#[tokio::test]
async fn import_round_trip_with_scan() {
    let (addr, tok, docs) = spawn().await;
    let agent = docs.path().join("ws").join("gamma");
    std::fs::create_dir_all(&agent).unwrap();
    seed_minimal_agent(&agent);
    let agent_path = agent.to_string_lossy().to_string();
    let c = reqwest::Client::new();

    // Build a package on the export side.
    let pkg_bytes = c
        .post(format!("http://{addr}/v1/agents/portable/package"))
        .query(&[("agentPath", &agent_path)])
        .bearer_auth(&tok)
        .json(&serde_json::json!({
            "selection": {
                "includeClaudeMd": true,
                "includeSkillSlugs": ["draft-email"],
                "includeRoutineIds": [],
                "includeLearningIds": []
            },
            "meta": { "agentId": "gamma", "agentName": "Gamma", "anonymized": false }
        }))
        .send()
        .await
        .unwrap()
        .bytes()
        .await
        .unwrap();

    // Upload it back through the import preview endpoint.
    let preview: serde_json::Value = c
        .post(format!("http://{addr}/v1/store/imports/preview"))
        .bearer_auth(&tok)
        .header("Content-Type", "application/zip")
        .body(pkg_bytes.clone())
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let package_id = preview["packageId"].as_str().unwrap().to_string();
    assert_eq!(preview["manifest"]["agentId"], "gamma");
    assert_eq!(preview["preview"]["skills"].as_array().unwrap().len(), 1);

    // Threat scan on the cached package.
    let scan: serde_json::Value = c
        .post(format!("http://{addr}/v1/store/imports/scan"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({ "packageId": package_id }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(scan["disclaimer"].as_str().unwrap().contains("Houston"));
    // Seed has no malicious content, so the items list is empty.
    assert!(scan["items"].as_array().unwrap().is_empty());

    // Create a workspace dir to install into.
    std::fs::create_dir_all(docs.path().join("ws-target")).unwrap();

    let installed: serde_json::Value = c
        .post(format!("http://{addr}/v1/store/imports/install"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({
            "packageId": package_id,
            "workspaceName": "ws-target",
            "agentName": "Imported Agent",
            "agentColor": "#aabbcc",
            "selection": {
                "includeClaudeMd": true,
                "includeSkillSlugs": ["draft-email"],
                "includeRoutineIds": [],
                "includeLearningIds": []
            }
        }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();

    let agent_path: String = installed["agentPath"].as_str().unwrap().to_string();
    assert!(std::path::PathBuf::from(&agent_path).join("CLAUDE.md").exists());
    assert!(std::path::PathBuf::from(&agent_path)
        .join(".agents/skills/draft-email/SKILL.md")
        .exists());
    assert_eq!(
        installed["requiredIntegrations"].as_array().unwrap()[0],
        "gmail"
    );
}

#[tokio::test]
async fn import_install_suffixes_on_collision() {
    let (addr, tok, docs) = spawn().await;
    let agent = docs.path().join("ws").join("delta");
    std::fs::create_dir_all(&agent).unwrap();
    seed_minimal_agent(&agent);
    let agent_path = agent.to_string_lossy().to_string();
    let c = reqwest::Client::new();

    let pkg_bytes = c
        .post(format!("http://{addr}/v1/agents/portable/package"))
        .query(&[("agentPath", &agent_path)])
        .bearer_auth(&tok)
        .json(&serde_json::json!({
            "selection": {
                "includeClaudeMd": true,
                "includeSkillSlugs": [],
                "includeRoutineIds": [],
                "includeLearningIds": []
            },
            "meta": { "agentId": "delta", "agentName": "Delta", "anonymized": false }
        }))
        .send()
        .await
        .unwrap()
        .bytes()
        .await
        .unwrap();

    std::fs::create_dir_all(docs.path().join("ws-collide").join("Friend Agent")).unwrap();

    let preview: serde_json::Value = c
        .post(format!("http://{addr}/v1/store/imports/preview"))
        .bearer_auth(&tok)
        .body(pkg_bytes.clone())
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let package_id = preview["packageId"].as_str().unwrap().to_string();

    let installed: serde_json::Value = c
        .post(format!("http://{addr}/v1/store/imports/install"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({
            "packageId": package_id,
            "workspaceName": "ws-collide",
            "agentName": "Friend Agent",
            "selection": {
                "includeClaudeMd": true,
                "includeSkillSlugs": [],
                "includeRoutineIds": [],
                "includeLearningIds": []
            }
        }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(installed["agentName"], "Friend Agent-2");
}

#[tokio::test]
async fn anonymize_redacts_pii_in_learnings() {
    let (addr, tok, docs) = spawn().await;
    let agent = docs.path().join("ws").join("epsilon");
    std::fs::create_dir_all(&agent).unwrap();
    seed_minimal_agent(&agent);
    let agent_path = agent.to_string_lossy().to_string();

    // Add a learning with PII so the anonymize pass has something to do.
    let learnings = serde_json::json!([
        { "id": "l1", "text": "Alice's email is alice@example.com.", "created_at": "2026-05-15T09:00:00Z" }
    ]);
    std::fs::write(
        agent.join(".houston/learnings/learnings.json"),
        serde_json::to_string_pretty(&learnings).unwrap(),
    )
    .unwrap();

    let c = reqwest::Client::new();
    let r: serde_json::Value = c
        .post(format!("http://{addr}/v1/agents/portable/anonymize"))
        .query(&[("agentPath", &agent_path)])
        .bearer_auth(&tok)
        .json(&serde_json::json!({
            "claudeMd": false,
            "skillSlugs": [],
            "routineIds": [],
            "learningIds": ["l1"]
        }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();

    let learnings = r["learnings"].as_array().unwrap();
    assert_eq!(learnings.len(), 1);
    assert_eq!(learnings[0]["id"], "l1");
    assert!(learnings[0]["after"]
        .as_str()
        .unwrap()
        .contains("<email>"));
}

#[tokio::test]
async fn preview_requires_agent_path() {
    let (addr, tok, _docs) = spawn().await;
    let c = reqwest::Client::new();

    let resp = c
        .get(format!("http://{addr}/v1/agents/portable/preview"))
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap();
    assert!(resp.status().is_client_error());
}
