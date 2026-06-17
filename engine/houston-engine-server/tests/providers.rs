//! Integration tests for `/v1/providers`.

use houston_engine_server::{build_router, ServerConfig, ServerState};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;

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
    // Gemini lands as a third provider. Like the anthropic test above,
    // we only assert wire shape, not boolean values (the CLI may or
    // may not be bundled into the test binary's resolver path).
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
    // Must be one of the documented InstallSource variants.
    assert!(matches!(
        body["installSource"].as_str(),
        Some("bundled" | "managed" | "path" | "missing")
    ));
}

#[tokio::test]
async fn status_returns_shape_for_openrouter() {
    // OpenRouter rides the bundled codex binary; assert wire shape only.
    let (addr, tok) = spawn().await;
    let body: serde_json::Value = reqwest::Client::new()
        .get(format!("http://{addr}/v1/providers/openrouter/status"))
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(body["provider"], "openrouter");
    assert_eq!(body["cliName"], "codex");
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
async fn openrouter_credentials_rejects_empty_and_malformed_key() {
    let (addr, tok) = spawn().await;
    for bad in ["", "abc", "sk or v1 with spaces in it here"] {
        let res = reqwest::Client::new()
            .post(format!("http://{addr}/v1/providers/openrouter/credentials"))
            .bearer_auth(&tok)
            .json(&serde_json::json!({ "apiKey": bad }))
            .send()
            .await
            .unwrap();
        assert_eq!(res.status(), 400, "key {bad:?} should be rejected");
    }
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
    // Too short — below the 10-char floor.
    let res = reqwest::Client::new()
        .post(format!("http://{addr}/v1/providers/gemini/credentials"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({ "apiKey": "abc" }))
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), 400);

    // Whitespace in the body.
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
    // We cannot easily redirect `dirs::home_dir()` in process, so this
    // test scopes the write by pointing $HOME at a tempdir. On macOS
    // `dirs::home_dir()` honors $HOME; same on Linux. Windows uses
    // %USERPROFILE% — skip cross-write assertion there.
    if cfg!(target_os = "windows") {
        return;
    }
    let tmp = tempfile::TempDir::new().unwrap();
    // Save + restore HOME so we don't poison sibling tests.
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

    // Restore HOME before any assert so a failure doesn't leak it.
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

// The previous "Houston drives Google OAuth directly" routes
// (`/providers/gemini/oauth/{start,cancel}`) were removed in favor of
// delegating to gemini-cli's own OAuth via the `--acp` JSON-RPC
// `authenticate` method, invoked through the standard
// `/providers/:name/login` endpoint. End-to-end testing of that flow
// requires spawning the bundled gemini binary + completing a real
// Google OAuth browser dance, which doesn't fit a unit-test harness;
// it's verified manually + via the `gemini_login::tests` smoke checks
// on the payload shape.
