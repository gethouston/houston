//! Integration tests for `/v1/providers`.

use houston_engine_server::{build_router, ServerConfig, ServerState};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;

static PROVIDER_ENV_TEST_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

async fn spawn() -> (SocketAddr, String) {
    let token = "provider-test".to_string();
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
async fn status_invalid_provider_rejected() {
    // Use a placeholder id we will never register so this test stays
    // honest as new providers (gemini, mistral, ...) come online.
    let (addr, tok) = spawn().await;
    let res = reqwest::Client::new()
        .get(format!(
            "http://{addr}/v1/providers/nonexistent-provider/status"
        ))
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), 400);
}

#[tokio::test]
async fn status_returns_shape_for_known_provider() {
    // CLI may or may not be installed in CI — assert shape only,
    // not the boolean values.
    let (addr, tok) = spawn().await;
    let body: serde_json::Value = reqwest::Client::new()
        .get(format!("http://{addr}/v1/providers/anthropic/status"))
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(body["provider"], "anthropic");
    assert_eq!(body["cliName"], "claude");
    assert!(body["cliInstalled"].is_boolean());
    assert!(matches!(
        body["authState"].as_str(),
        Some("authenticated" | "unauthenticated" | "unknown")
    ));
}

#[tokio::test]
async fn status_returns_shape_for_gemini() {
    let (addr, tok) = spawn().await;
    let body: serde_json::Value = reqwest::Client::new()
        .get(format!("http://{addr}/v1/providers/gemini/status"))
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(body["provider"], "gemini");
    assert_eq!(body["cliName"], "gemini");
    assert!(body["cliInstalled"].is_boolean());
    assert!(matches!(
        body["authState"].as_str(),
        Some("authenticated" | "unauthenticated" | "unknown")
    ));
    assert!(matches!(
        body["installSource"].as_str(),
        Some("bundled" | "managed" | "path" | "missing")
    ));
}

#[tokio::test]
async fn gemini_credentials_rejects_empty_key() {
    let (addr, tok) = spawn().await;
    let res = reqwest::Client::new()
        .post(format!("http://{addr}/v1/providers/gemini/credentials"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({ "apiKey": "" }))
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), 400);
}

#[tokio::test]
async fn gemini_credentials_rejects_malformed_key() {
    let (addr, tok) = spawn().await;
    let res = reqwest::Client::new()
        .post(format!("http://{addr}/v1/providers/gemini/credentials"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({ "apiKey": "abc" }))
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), 400);

    let res = reqwest::Client::new()
        .post(format!("http://{addr}/v1/providers/gemini/credentials"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({ "apiKey": "AIzaTest Key 1234567890" }))
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), 400);
}

#[tokio::test]
async fn gemini_credentials_writes_to_home_dot_env() {
    if cfg!(target_os = "windows") {
        return;
    }
    let _guard = PROVIDER_ENV_TEST_LOCK.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let prior_home = std::env::var_os("HOME");
    std::env::set_var("HOME", tmp.path());

    let (addr, tok) = spawn().await;
    let res = reqwest::Client::new()
        .post(format!("http://{addr}/v1/providers/gemini/credentials"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({ "apiKey": "AIzaTestKey1234567890" }))
        .send()
        .await
        .unwrap();
    let status = res.status();
    let body = res.text().await.unwrap_or_default();

    match prior_home {
        Some(v) => std::env::set_var("HOME", v),
        None => std::env::remove_var("HOME"),
    }

    assert!(status.is_success(), "expected 2xx, got {status} body={body}");
    let env_file = tmp.path().join(".gemini").join(".env");
    let contents = std::fs::read_to_string(&env_file).unwrap_or_else(|e| {
        panic!(
            "expected {} to exist after credentials write: {e}",
            env_file.display()
        )
    });
    assert!(
        contents.contains("GEMINI_API_KEY=AIzaTestKey1234567890"),
        "expected GEMINI_API_KEY line in {contents:?}"
    );
}

#[tokio::test]
async fn openrouter_credentials_rejects_empty_key() {
    let (addr, tok) = spawn().await;
    let res = reqwest::Client::new()
        .post(format!("http://{addr}/v1/providers/openrouter/credentials"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({ "apiKey": "" }))
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), 400);
}

#[tokio::test]
async fn openrouter_credentials_rejects_malformed_key() {
    let (addr, tok) = spawn().await;
    let res = reqwest::Client::new()
        .post(format!("http://{addr}/v1/providers/openrouter/credentials"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({ "apiKey": "short" }))
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), 400);
}

#[tokio::test]
async fn openrouter_credentials_rejects_whitespace_in_key() {
    if cfg!(target_os = "windows") {
        return;
    }
    let _guard = PROVIDER_ENV_TEST_LOCK.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let prior_home = std::env::var_os("HOME");
    let prior_houston = std::env::var_os("HOUSTON_HOME");
    std::env::set_var("HOME", tmp.path());
    std::env::set_var("HOUSTON_HOME", tmp.path());

    let (addr, tok) = spawn().await;
    let res = reqwest::Client::new()
        .post(format!("http://{addr}/v1/providers/openrouter/credentials"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({ "apiKey": "sk-or-v1-test key1234567890" }))
        .send()
        .await
        .unwrap();

    let env_file = tmp.path().join("providers/openrouter/.env");

    match prior_home {
        Some(v) => std::env::set_var("HOME", v),
        None => std::env::remove_var("HOME"),
    }
    match prior_houston {
        Some(v) => std::env::set_var("HOUSTON_HOME", v),
        None => std::env::remove_var("HOUSTON_HOME"),
    }

    assert_eq!(res.status(), 400);
    assert!(!env_file.exists(), "whitespace key must not write credentials");
}

#[tokio::test]
async fn openrouter_credentials_rejects_quoted_key() {
    if cfg!(target_os = "windows") {
        return;
    }
    let _guard = PROVIDER_ENV_TEST_LOCK.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let prior_home = std::env::var_os("HOME");
    let prior_houston = std::env::var_os("HOUSTON_HOME");
    std::env::set_var("HOME", tmp.path());
    std::env::set_var("HOUSTON_HOME", tmp.path());

    let (addr, tok) = spawn().await;
    let res = reqwest::Client::new()
        .post(format!("http://{addr}/v1/providers/openrouter/credentials"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({ "apiKey": "\"sk-or-v1-testkey1234567890\"" }))
        .send()
        .await
        .unwrap();

    let env_file = tmp.path().join("providers/openrouter/.env");

    match prior_home {
        Some(v) => std::env::set_var("HOME", v),
        None => std::env::remove_var("HOME"),
    }
    match prior_houston {
        Some(v) => std::env::set_var("HOUSTON_HOME", v),
        None => std::env::remove_var("HOUSTON_HOME"),
    }

    assert_eq!(res.status(), 400);
    assert!(!env_file.exists(), "quoted key must not write credentials");
}

#[tokio::test]
async fn openrouter_credentials_writes_to_houston_dot_env() {
    if cfg!(target_os = "windows") {
        return;
    }
    let _guard = PROVIDER_ENV_TEST_LOCK.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let prior_home = std::env::var_os("HOME");
    let prior_houston = std::env::var_os("HOUSTON_HOME");
    std::env::set_var("HOME", tmp.path());
    std::env::set_var("HOUSTON_HOME", tmp.path());

    let (addr, tok) = spawn().await;
    let key = "sk-or-v1-testkey1234567890";
    let res = reqwest::Client::new()
        .post(format!("http://{addr}/v1/providers/openrouter/credentials"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({ "apiKey": key }))
        .send()
        .await
        .unwrap();
    let status = res.status();
    let body = res.text().await.unwrap_or_default();

    match prior_home {
        Some(v) => std::env::set_var("HOME", v),
        None => std::env::remove_var("HOME"),
    }
    match prior_houston {
        Some(v) => std::env::set_var("HOUSTON_HOME", v),
        None => std::env::remove_var("HOUSTON_HOME"),
    }

    assert!(status.is_success(), "expected 2xx, got {status} body={body}");
    let env_file = tmp.path().join("providers/openrouter/.env");
    let contents = std::fs::read_to_string(&env_file).unwrap_or_else(|e| {
        panic!(
            "expected {} to exist after credentials write: {e}",
            env_file.display()
        )
    });
    assert!(
        contents.contains(&format!("OPENROUTER_API_KEY={key}")),
        "expected OPENROUTER_API_KEY line in {contents:?}"
    );
}

#[tokio::test]
async fn openrouter_models_route_exists_without_stored_key() {
    if cfg!(target_os = "windows") {
        return;
    }
    let _guard = PROVIDER_ENV_TEST_LOCK.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let prior_home = std::env::var_os("HOME");
    let prior_houston = std::env::var_os("HOUSTON_HOME");
    std::env::set_var("HOME", tmp.path());
    std::env::set_var("HOUSTON_HOME", tmp.path());

    let (addr, tok) = spawn().await;
    let res = reqwest::Client::new()
        .get(format!("http://{addr}/v1/providers/openrouter/models"))
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap();
    let status = res.status();

    match prior_home {
        Some(v) => std::env::set_var("HOME", v),
        None => std::env::remove_var("HOME"),
    }
    match prior_houston {
        Some(v) => std::env::set_var("HOUSTON_HOME", v),
        None => std::env::remove_var("HOUSTON_HOME"),
    }

    assert_eq!(
        status,
        400,
        "missing key should be a client error, not a missing route"
    );
}

#[tokio::test]
async fn openrouter_status_authenticated_after_credentials_write() {
    if cfg!(target_os = "windows") {
        return;
    }
    let _guard = PROVIDER_ENV_TEST_LOCK.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let prior_home = std::env::var_os("HOME");
    let prior_houston = std::env::var_os("HOUSTON_HOME");
    std::env::set_var("HOME", tmp.path());
    std::env::set_var("HOUSTON_HOME", tmp.path());

    let (addr, tok) = spawn().await;
    let c = reqwest::Client::new();
    let key = "sk-or-v1-testkey1234567890";
    let write = c
        .post(format!("http://{addr}/v1/providers/openrouter/credentials"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({ "apiKey": key }))
        .send()
        .await
        .unwrap();
    assert!(write.status().is_success());

    let body: serde_json::Value = c
        .get(format!("http://{addr}/v1/providers/openrouter/status"))
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();

    match prior_home {
        Some(v) => std::env::set_var("HOME", v),
        None => std::env::remove_var("HOME"),
    }
    match prior_houston {
        Some(v) => std::env::set_var("HOUSTON_HOME", v),
        None => std::env::remove_var("HOUSTON_HOME"),
    }

    assert_eq!(body["provider"], "openrouter");
    assert_eq!(body["authState"], "authenticated");
}

#[tokio::test]
async fn openrouter_logout_clears_stored_credentials() {
    if cfg!(target_os = "windows") {
        return;
    }
    let _guard = PROVIDER_ENV_TEST_LOCK.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let prior_home = std::env::var_os("HOME");
    let prior_houston = std::env::var_os("HOUSTON_HOME");
    std::env::set_var("HOME", tmp.path());
    std::env::set_var("HOUSTON_HOME", tmp.path());

    let (addr, tok) = spawn().await;
    let c = reqwest::Client::new();
    let key = "sk-or-v1-testkey1234567890";
    let write = c
        .post(format!("http://{addr}/v1/providers/openrouter/credentials"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({ "apiKey": key }))
        .send()
        .await
        .unwrap();
    assert!(write.status().is_success());

    let logout = c
        .post(format!("http://{addr}/v1/providers/openrouter/logout"))
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap();
    assert!(logout.status().is_success());

    let body: serde_json::Value = c
        .get(format!("http://{addr}/v1/providers/openrouter/status"))
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();

    let env_file = tmp.path().join("providers/openrouter/.env");

    match prior_home {
        Some(v) => std::env::set_var("HOME", v),
        None => std::env::remove_var("HOME"),
    }
    match prior_houston {
        Some(v) => std::env::set_var("HOUSTON_HOME", v),
        None => std::env::remove_var("HOUSTON_HOME"),
    }

    assert_eq!(body["authState"], "unauthenticated");
    assert!(!env_file.exists(), "credential file should be removed on disconnect");
}

#[tokio::test]
async fn openai_credentials_rejects_empty_key() {
    let (addr, tok) = spawn().await;
    let res = reqwest::Client::new()
        .post(format!("http://{addr}/v1/providers/openai/credentials"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({ "apiKey": "" }))
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), 400);
}

#[tokio::test]
async fn openai_credentials_rejects_malformed_key() {
    let (addr, tok) = spawn().await;
    let res = reqwest::Client::new()
        .post(format!("http://{addr}/v1/providers/openai/credentials"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({ "apiKey": "short" }))
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), 400);
}

#[tokio::test]
async fn openai_credentials_writes_to_houston_dot_env() {
    if cfg!(target_os = "windows") {
        return;
    }
    let _guard = PROVIDER_ENV_TEST_LOCK.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let prior_home = std::env::var_os("HOME");
    let prior_houston = std::env::var_os("HOUSTON_HOME");
    std::env::set_var("HOME", tmp.path());
    std::env::set_var("HOUSTON_HOME", tmp.path());

    let (addr, tok) = spawn().await;
    let key = "sk-proj-testkey1234567890";
    let res = reqwest::Client::new()
        .post(format!("http://{addr}/v1/providers/openai/credentials"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({ "apiKey": key }))
        .send()
        .await
        .unwrap();
    let status = res.status();
    let body = res.text().await.unwrap_or_default();

    match prior_home {
        Some(v) => std::env::set_var("HOME", v),
        None => std::env::remove_var("HOME"),
    }
    match prior_houston {
        Some(v) => std::env::set_var("HOUSTON_HOME", v),
        None => std::env::remove_var("HOUSTON_HOME"),
    }

    assert!(status.is_success(), "expected 2xx, got {status} body={body}");
    let env_file = tmp.path().join("providers/openai/.env");
    let contents = std::fs::read_to_string(&env_file).unwrap_or_else(|e| {
        panic!(
            "expected {} to exist after credentials write: {e}",
            env_file.display()
        )
    });
    assert!(
        contents.contains(&format!("OPENAI_API_KEY={key}")),
        "expected OPENAI_API_KEY line in {contents:?}"
    );
}

#[tokio::test]
async fn openai_status_authenticated_after_credentials_write() {
    if cfg!(target_os = "windows") {
        return;
    }
    let _guard = PROVIDER_ENV_TEST_LOCK.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let prior_home = std::env::var_os("HOME");
    let prior_houston = std::env::var_os("HOUSTON_HOME");
    std::env::set_var("HOME", tmp.path());
    std::env::set_var("HOUSTON_HOME", tmp.path());

    let (addr, tok) = spawn().await;
    let c = reqwest::Client::new();
    let key = "sk-proj-testkey1234567890";
    let write = c
        .post(format!("http://{addr}/v1/providers/openai/credentials"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({ "apiKey": key }))
        .send()
        .await
        .unwrap();
    assert!(write.status().is_success());

    let body: serde_json::Value = c
        .get(format!("http://{addr}/v1/providers/openai/status"))
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();

    match prior_home {
        Some(v) => std::env::set_var("HOME", v),
        None => std::env::remove_var("HOME"),
    }
    match prior_houston {
        Some(v) => std::env::set_var("HOUSTON_HOME", v),
        None => std::env::remove_var("HOUSTON_HOME"),
    }

    assert_eq!(body["provider"], "openai");
    assert_eq!(body["authState"], "authenticated");
}

#[tokio::test]
async fn openai_logout_clears_stored_credentials() {
    if cfg!(target_os = "windows") {
        return;
    }
    let _guard = PROVIDER_ENV_TEST_LOCK.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let prior_home = std::env::var_os("HOME");
    let prior_houston = std::env::var_os("HOUSTON_HOME");
    std::env::set_var("HOME", tmp.path());
    std::env::set_var("HOUSTON_HOME", tmp.path());

    let (addr, tok) = spawn().await;
    let c = reqwest::Client::new();
    let key = "sk-proj-testkey1234567890";
    let write = c
        .post(format!("http://{addr}/v1/providers/openai/credentials"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({ "apiKey": key }))
        .send()
        .await
        .unwrap();
    assert!(write.status().is_success());

    let logout = c
        .post(format!("http://{addr}/v1/providers/openai/logout"))
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap();
    assert!(logout.status().is_success());

    let body: serde_json::Value = c
        .get(format!("http://{addr}/v1/providers/openai/status"))
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();

    let env_file = tmp.path().join("providers/openai/.env");

    match prior_home {
        Some(v) => std::env::set_var("HOME", v),
        None => std::env::remove_var("HOME"),
    }
    match prior_houston {
        Some(v) => std::env::set_var("HOUSTON_HOME", v),
        None => std::env::remove_var("HOUSTON_HOME"),
    }

    assert_eq!(body["authState"], "unauthenticated");
    assert!(!env_file.exists(), "credential file should be removed on disconnect");
}

#[tokio::test]
async fn anthropic_credentials_rejects_empty_key() {
    let (addr, tok) = spawn().await;
    let res = reqwest::Client::new()
        .post(format!("http://{addr}/v1/providers/anthropic/credentials"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({ "apiKey": "" }))
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), 400);
}

#[tokio::test]
async fn anthropic_credentials_rejects_malformed_key() {
    let (addr, tok) = spawn().await;
    let res = reqwest::Client::new()
        .post(format!("http://{addr}/v1/providers/anthropic/credentials"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({ "apiKey": "short" }))
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), 400);
}

#[tokio::test]
async fn anthropic_credentials_writes_to_houston_dot_env() {
    if cfg!(target_os = "windows") {
        return;
    }
    let _guard = PROVIDER_ENV_TEST_LOCK.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let prior_home = std::env::var_os("HOME");
    let prior_houston = std::env::var_os("HOUSTON_HOME");
    std::env::set_var("HOME", tmp.path());
    std::env::set_var("HOUSTON_HOME", tmp.path());

    let (addr, tok) = spawn().await;
    let key = "sk-ant-api03-testkey1234567890";
    let res = reqwest::Client::new()
        .post(format!("http://{addr}/v1/providers/anthropic/credentials"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({ "apiKey": key }))
        .send()
        .await
        .unwrap();
    let status = res.status();
    let body = res.text().await.unwrap_or_default();

    match prior_home {
        Some(v) => std::env::set_var("HOME", v),
        None => std::env::remove_var("HOME"),
    }
    match prior_houston {
        Some(v) => std::env::set_var("HOUSTON_HOME", v),
        None => std::env::remove_var("HOUSTON_HOME"),
    }

    assert!(status.is_success(), "expected 2xx, got {status} body={body}");
    let env_file = tmp.path().join("providers/anthropic/.env");
    let contents = std::fs::read_to_string(&env_file).unwrap_or_else(|e| {
        panic!(
            "expected {} to exist after credentials write: {e}",
            env_file.display()
        )
    });
    assert!(
        contents.contains(&format!("ANTHROPIC_API_KEY={key}")),
        "expected ANTHROPIC_API_KEY line in {contents:?}"
    );
}

#[tokio::test]
async fn anthropic_credentials_writes_legacy_path_readable() {
    if cfg!(target_os = "windows") {
        return;
    }
    let _guard = PROVIDER_ENV_TEST_LOCK.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let prior_home = std::env::var_os("HOME");
    let prior_houston = std::env::var_os("HOUSTON_HOME");
    std::env::set_var("HOME", tmp.path());
    std::env::set_var("HOUSTON_HOME", tmp.path());

    let legacy = tmp.path().join(".houston/anthropic/.env");
    std::fs::create_dir_all(legacy.parent().unwrap()).unwrap();
    let key = "sk-ant-api03-testkey1234567890";
    std::fs::write(&legacy, format!("ANTHROPIC_API_KEY={key}\n")).unwrap();

    let (addr, tok) = spawn().await;
    let body: serde_json::Value = reqwest::Client::new()
        .get(format!("http://{addr}/v1/providers/anthropic/status"))
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();

    match prior_home {
        Some(v) => std::env::set_var("HOME", v),
        None => std::env::remove_var("HOME"),
    }
    match prior_houston {
        Some(v) => std::env::set_var("HOUSTON_HOME", v),
        None => std::env::remove_var("HOUSTON_HOME"),
    }

    assert_eq!(body["authState"], "authenticated");
}

#[tokio::test]
async fn anthropic_status_authenticated_after_credentials_write() {
    if cfg!(target_os = "windows") {
        return;
    }
    let _guard = PROVIDER_ENV_TEST_LOCK.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let prior_home = std::env::var_os("HOME");
    let prior_houston = std::env::var_os("HOUSTON_HOME");
    std::env::set_var("HOME", tmp.path());
    std::env::set_var("HOUSTON_HOME", tmp.path());

    let (addr, tok) = spawn().await;
    let c = reqwest::Client::new();
    let key = "sk-ant-api03-testkey1234567890";
    let write = c
        .post(format!("http://{addr}/v1/providers/anthropic/credentials"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({ "apiKey": key }))
        .send()
        .await
        .unwrap();
    assert!(write.status().is_success());

    let body: serde_json::Value = c
        .get(format!("http://{addr}/v1/providers/anthropic/status"))
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();

    match prior_home {
        Some(v) => std::env::set_var("HOME", v),
        None => std::env::remove_var("HOME"),
    }
    match prior_houston {
        Some(v) => std::env::set_var("HOUSTON_HOME", v),
        None => std::env::remove_var("HOUSTON_HOME"),
    }

    assert_eq!(body["provider"], "anthropic");
    assert_eq!(body["authState"], "authenticated");
}

#[tokio::test]
async fn anthropic_logout_clears_stored_api_key() {
    if cfg!(target_os = "windows") {
        return;
    }
    let _guard = PROVIDER_ENV_TEST_LOCK.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let prior_home = std::env::var_os("HOME");
    let prior_houston = std::env::var_os("HOUSTON_HOME");
    std::env::set_var("HOME", tmp.path());
    std::env::set_var("HOUSTON_HOME", tmp.path());

    let (addr, tok) = spawn().await;
    let c = reqwest::Client::new();
    let key = "sk-ant-api03-testkey1234567890";
    let write = c
        .post(format!("http://{addr}/v1/providers/anthropic/credentials"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({ "apiKey": key }))
        .send()
        .await
        .unwrap();
    assert!(write.status().is_success());

    let logout = c
        .post(format!("http://{addr}/v1/providers/anthropic/logout"))
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap();
    let env_file = tmp.path().join("providers/anthropic/.env");
    let legacy_file = tmp.path().join(".houston/anthropic/.env");

    match prior_home {
        Some(v) => std::env::set_var("HOME", v),
        None => std::env::remove_var("HOME"),
    }
    match prior_houston {
        Some(v) => std::env::set_var("HOUSTON_HOME", v),
        None => std::env::remove_var("HOUSTON_HOME"),
    }

    assert!(
        !env_file.exists(),
        "canonical credential file should be removed on disconnect (logout status={})",
        logout.status()
    );
    assert!(
        !legacy_file.exists(),
        "legacy credential file should be removed on disconnect"
    );
}

#[tokio::test]
async fn default_provider_roundtrip_via_generic_preferences() {
    // The default-provider preference rides on `/v1/preferences/:key`
    // (p2-a's slice). We verify the key agreed with `provider` module
    // is reachable through that surface.
    let (addr, tok) = spawn().await;
    let c = reqwest::Client::new();

    let get1: serde_json::Value = c
        .get(format!("http://{addr}/v1/preferences/default_provider"))
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(get1["value"].is_null());

    let put = c
        .put(format!("http://{addr}/v1/preferences/default_provider"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({ "value": "anthropic" }))
        .send()
        .await
        .unwrap();
    assert!(put.status().is_success());

    let get2: serde_json::Value = c
        .get(format!("http://{addr}/v1/preferences/default_provider"))
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(get2["value"], "anthropic");
}

#[tokio::test]
async fn login_accepts_optional_device_auth_query() {
    // The `?deviceAuth=` flag must be optional — the desktop app sends no
    // query at all — and must not shadow provider validation. Both the
    // no-query form (desktop) and the `?deviceAuth=true` form (webapp,
    // mobile) on an unknown provider must surface our structured
    // BAD_REQUEST, which proves the `Query<LoginQuery>` extractor defaulted
    // cleanly instead of rejecting the request before `provider::parse`
    // runs. A real provider would spawn its CLI, which doesn't fit the unit
    // harness; the device-vs-loopback argv choice is unit-tested in
    // `houston_engine_core::provider::tests::select_login_args_*`.
    let (addr, tok) = spawn().await;
    let c = reqwest::Client::new();
    for url in [
        format!("http://{addr}/v1/providers/nonexistent-provider/login"),
        format!("http://{addr}/v1/providers/nonexistent-provider/login?deviceAuth=true"),
    ] {
        let res = c.post(&url).bearer_auth(&tok).send().await.unwrap();
        assert_eq!(res.status(), 400, "url={url}");
        let body: serde_json::Value = res.json().await.unwrap();
        assert_eq!(body["error"]["code"], "BAD_REQUEST", "url={url}");
    }
}

#[tokio::test]
async fn credential_sync_round_trip_openai() {
    let _guard = PROVIDER_ENV_TEST_LOCK.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let prior_home = std::env::var_os("HOME");
    std::env::set_var("HOME", tmp.path());
    let auth_path = tmp.path().join(".codex/auth.json");
    std::fs::create_dir_all(auth_path.parent().unwrap()).unwrap();
    std::fs::write(&auth_path, r#"{"tokens":{"access":"x"}}"#).unwrap();

    let (addr, tok) = spawn().await;
    let client = reqwest::Client::new();
    let base = format!("http://{addr}/v1/providers/openai");

    let session: serde_json::Value = client
        .post(format!("{base}/credential-import/session"))
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let session_id = session["sessionId"].as_str().unwrap();
    let public_key = session["publicKey"].as_str().unwrap();

    let export: serde_json::Value = client
        .post(format!("{base}/credential-export"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({
            "sessionId": session_id,
            "publicKey": public_key,
        }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(export["provider"], "openai");

    std::fs::remove_file(&auth_path).unwrap();

    let import: serde_json::Value = client
        .post(format!("{base}/credential-import"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({
            "sessionId": session_id,
            "ciphertext": export["ciphertext"],
        }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(import["filesWritten"], 1);
    assert!(auth_path.exists());

    match prior_home {
        Some(v) => std::env::set_var("HOME", v),
        None => std::env::remove_var("HOME"),
    }
}

#[tokio::test]
async fn credential_sync_round_trip_openrouter() {
    if cfg!(target_os = "windows") {
        return;
    }
    let _guard = PROVIDER_ENV_TEST_LOCK.lock().unwrap();
    let tmp = tempfile::TempDir::new().unwrap();
    let prior_home = std::env::var_os("HOME");
    let prior_houston = std::env::var_os("HOUSTON_HOME");
    std::env::set_var("HOME", tmp.path());
    std::env::set_var("HOUSTON_HOME", tmp.path());
    let key = "sk-or-v1-testkey1234567890";
    let env_path = tmp.path().join("providers/openrouter/.env");
    std::fs::create_dir_all(env_path.parent().unwrap()).unwrap();
    std::fs::write(&env_path, format!("OPENROUTER_API_KEY={key}\n")).unwrap();

    let (addr, tok) = spawn().await;
    let client = reqwest::Client::new();
    let base = format!("http://{addr}/v1/providers/openrouter");

    let session: serde_json::Value = client
        .post(format!("{base}/credential-import/session"))
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let session_id = session["sessionId"].as_str().unwrap();
    let public_key = session["publicKey"].as_str().unwrap();

    let export: serde_json::Value = client
        .post(format!("{base}/credential-export"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({
            "sessionId": session_id,
            "publicKey": public_key,
        }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(export["provider"], "openrouter");

    std::fs::remove_file(&env_path).unwrap();

    let import: serde_json::Value = client
        .post(format!("{base}/credential-import"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({
            "sessionId": session_id,
            "ciphertext": export["ciphertext"],
        }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(import["filesWritten"], 1);
    assert!(env_path.exists());
    let contents = std::fs::read_to_string(&env_path).unwrap();
    assert!(contents.contains(&format!("OPENROUTER_API_KEY={key}")));

    match prior_home {
        Some(v) => std::env::set_var("HOME", v),
        None => std::env::remove_var("HOME"),
    }
    match prior_houston {
        Some(v) => std::env::set_var("HOUSTON_HOME", v),
        None => std::env::remove_var("HOUSTON_HOME"),
    }
}

// The previous "Houston drives Google OAuth directly" routes
// (`/providers/gemini/oauth/{start,cancel}`) were removed in favor of
// delegating to gemini-cli's own OAuth via the `--acp` JSON-RPC
// `authenticate` method, invoked through the standard
// `/providers/:name/login` endpoint. End-to-end testing of that flow
// requires spawning the bundled gemini binary + completing a real
// Google OAuth browser dance, which doesn't fit a unit-test harness;
// it's verified manually + via the `gemini_login::tests` smoke checks
// on the payload shape.
